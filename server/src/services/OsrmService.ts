import fs from 'fs';
import path from 'path';
import { db } from '../db';
import MapRepository from './MapRepository';
import { DATA_DIR, CONTAINER_PREFIX, PROFILES, MapInfo, OsrmStatus } from './osrm/config';
import { assertValidUUID, sanitizeFileName } from './osrm/security';
import { state } from './osrm/state';
import { dockerManager } from './osrm/DockerManager';
import { osrmProcessor } from './osrm/OsrmProcessor';

console.log('OSRM SERVICE: Resolved DATA_DIR:', DATA_DIR);

// Re-export types so external importers don't need to change
export type { MapInfo, OsrmStatus };

class OsrmService {
    // --- Port helpers ---

    isUsablePort(value?: number | null): value is number {
        return Number.isInteger(value) && Number(value) > 0;
    }

    private isManagedBasePort(value?: number | null): value is number {
        return Number.isInteger(value) && Number(value) >= 5000;
    }

    private getNextAvailablePort(): number {
        const maps = MapRepository.getAll();
        const usedPorts = maps
            .map(m => m.base_port)
            .filter((p): p is number => this.isManagedBasePort(p));
        if (usedPorts.length === 0) return 5010;
        return Math.max(...usedPorts) + 10;
    }

    // --- URL builders (delegates to DockerManager) ---

    buildRoutingUrl(basePort: number): string {
        return dockerManager.buildRoutingUrl(basePort);
    }

    buildInternalRoutingUrl(mapId: string): string {
        return dockerManager.buildInternalRoutingUrl(mapId);
    }

    // --- Accessors ---

    getDataDir(): string {
        return DATA_DIR;
    }

    // --- Status ---

    async getStatus(): Promise<OsrmStatus> {
        if (state.currentStatus.status === 'idle') {
            await dockerManager.checkActiveContainer();
        }
        return state.currentStatus;
    }

    clearError(): OsrmStatus {
        if (state.currentStatus.status === 'error') {
            state.currentStatus = { status: 'idle', message: 'Ready', activeRegion: 'unknown' };
        }
        return state.currentStatus;
    }

    // --- Map listing ---

    async getMaps(): Promise<MapInfo[]> {
        const maps = MapRepository.getAll();
        const runningContainers = await dockerManager.listRunningContainerNames();

        const enrichedMaps = await Promise.all(maps.map(async (map) => {
            let basePort: number | null | undefined = map.base_port;
            if (!this.isUsablePort(basePort) && map.status === 'ready') {
                basePort = await dockerManager.recoverBasePort(map.id);
            }
            return { ...map, base_port: basePort ?? map.base_port ?? undefined };
        }));

        return Promise.all(enrichedMaps.map(async (m) => {
            const regionSafeName = m.id.substring(0, 8);
            const runningProfiles = PROFILES.filter(profile =>
                runningContainers.includes(`${CONTAINER_PREFIX}-${regionSafeName}-${profile}`)
            );
            const healthyProfiles = this.isUsablePort(m.base_port)
                ? await dockerManager.getHealthyProfiles(m.id, m.base_port)
                : [];
            const healthStatus = healthyProfiles.length === 0
                ? 'offline'
                : healthyProfiles.length === PROFILES.length ? 'live' : 'degraded';

            return {
                id: m.id,
                name: m.name,
                status: m.status,
                base_port: m.base_port ?? null,
                disk_size: m.disk_size ?? null,
                running_profiles: runningProfiles,
                healthy_profiles: healthyProfiles,
                total_profiles: PROFILES.length,
                health_status: healthStatus,
                isActive: healthStatus !== 'offline' || state.currentStatus.activeMapId === m.id,
            };
        }));
    }

    /** Alias for backward compatibility */
    async getAvailableRegions(): Promise<MapInfo[]> {
        return this.getMaps();
    }

    // --- Port recovery ---

    async recoverBasePort(mapId: string): Promise<number | null> {
        return dockerManager.recoverBasePort(mapId);
    }

    // --- DB sync ---

    syncProjectsForMap(mapId: string, basePort: number | null): void {
        const routingUrl = basePort ? this.buildRoutingUrl(basePort) : null;
        db.prepare(`
            UPDATE projects SET routing_engine_url = ? WHERE map_instance_id = ?
        `).run(routingUrl, mapId);
    }

    // --- Map lifecycle ---

    async deleteMap(mapId: string): Promise<{ message: string }> {
        assertValidUUID(mapId);
        const map = MapRepository.getById(mapId);
        if (!map) throw new Error('Map not found');

        const osrmName = sanitizeFileName(path.basename(map.pbf_url).replace('.osm.pbf', ''));

        state.currentStatus = { status: 'processing', message: `Stopping OSRM containers for ${map.name}...`, activeMapId: mapId, progress: 100 };
        await dockerManager.stopContainersByPattern(`${CONTAINER_PREFIX}-${mapId.substring(0, 8)}`);

        if (fs.existsSync(DATA_DIR)) {
            fs.readdirSync(DATA_DIR).forEach(f => {
                if (f.startsWith(osrmName) || f.includes(mapId.substring(0, 8))) {
                    try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch (e) {
                        console.error('Error deleting file', f, e);
                    }
                }
            });
        }

        db.prepare(`
            UPDATE projects SET map_instance_id = NULL, routing_engine_url = NULL WHERE map_instance_id = ?
        `).run(mapId);
        MapRepository.delete(mapId);

        if (state.currentStatus.activeMapId === mapId) {
            state.currentStatus = { status: 'idle', message: 'No Map Active' };
        }

        return { message: `Map ${map.name} deleted` };
    }

    async downloadMap(mapId: string, force = false): Promise<{ message: string; filename: string }> {
        assertValidUUID(mapId);
        if (state.currentStatus.status === 'downloading' || state.currentStatus.status === 'processing') {
            throw new Error('A process is already running');
        }

        const map = MapRepository.getById(mapId);
        if (!map) throw new Error('Map not found');

        const filename = sanitizeFileName(
            path.basename(new URL(map.pbf_url).pathname) || `${mapId.substring(0, 8)}.osm.pbf`
        );
        const pbfPath = path.join(DATA_DIR, filename);

        MapRepository.updateStatus(mapId, 'downloading');
        await osrmProcessor.runDownloadProcess(mapId, map.pbf_url, filename, pbfPath, [], force);

        return { message: 'Download process completed', filename };
    }

    async activateMap(mapId: string): Promise<{ message: string; mapId: string }> {
        assertValidUUID(mapId);
        if (state.currentStatus.status === 'downloading' || state.currentStatus.status === 'processing') {
            throw new Error('A process is already running');
        }

        const map = MapRepository.getById(mapId);
        if (!map) throw new Error('Map not found');

        const filename = sanitizeFileName(path.basename(new URL(map.pbf_url).pathname));
        const pbfPath = path.join(DATA_DIR, filename);

        if (!fs.existsSync(pbfPath)) {
            throw new Error(`Map file not found for ${map.name}. Please download it first.`);
        }

        MapRepository.updateStatus(mapId, 'processing');

        let basePort = map.base_port;
        if (!this.isManagedBasePort(basePort)) {
            basePort = this.getNextAvailablePort();
        }

        try {
            await osrmProcessor.runActivationProcess(mapId, filename, pbfPath, basePort);
        } catch (error) {
            MapRepository.updateStatus(mapId, 'error', basePort, map.disk_size);
            throw error;
        }

        const diskSize = fs.existsSync(pbfPath) ? fs.statSync(pbfPath).size : map.disk_size;
        MapRepository.updateStatus(mapId, 'ready', basePort, diskSize);
        this.syncProjectsForMap(mapId, basePort);
        return { message: 'Activation process completed', mapId };
    }

    // --- Process control ---

    async cancelProcess(): Promise<{ message: string }> {
        if (state.currentStatus.status !== 'downloading' && state.currentStatus.status !== 'processing') {
            return { message: 'No active process to cancel' };
        }

        if (state.activeHttpRequest) {
            console.log('Cancelling active HTTP download request...');
            state.activeHttpRequest.destroy(new Error('Download manually cancelled'));
            state.activeHttpRequest = null;
        }

        if (state.activeSetupRegion || state.currentStatus.status === 'processing') {
            console.log('Cancelling active Docker setup containers...');
            await dockerManager.cancelDockerSetup();
            state.activeSetupRegion = null;
            throw new Error('Activation manually cancelled');
        }

        state.currentStatus = { status: 'idle', message: 'Process cancelled' };
        return { message: 'Process successfully cancelled' };
    }

    async cleanupOrphanContainers(): Promise<{ success: boolean; cleanedCount: number; message: string }> {
        const maps = MapRepository.getAll();
        const readyMapIds = maps.filter(m => m.status === 'ready').map(m => m.id.substring(0, 8));
        try {
            const result = await dockerManager.cleanupOrphanContainers(readyMapIds);
            return { success: true, ...result };
        } catch (error: any) {
            console.error('Cleanup Failed:', error);
            throw new Error(`Error en la limpieza: ${error.message}`);
        }
    }
}

const osrmService = new OsrmService();

// Cleanup stale states from database on startup
(async () => {
    try {
        const maps = MapRepository.getAll();
        for (const map of maps) {
            if (map.status === 'downloading' || map.status === 'processing') {
                console.log(`Resetting stale status for map: ${map.name} (${map.status} -> error)`);
                MapRepository.updateStatus(map.id, 'error', map.base_port, map.disk_size);
            }
            if (map.status === 'ready') {
                const basePort = osrmService.isUsablePort(map.base_port)
                    ? map.base_port
                    : await osrmService.recoverBasePort(map.id);
                if (basePort) osrmService.syncProjectsForMap(map.id, basePort);
            }
        }
    } catch (e) {
        console.error('Failed to cleanup stale map states:', e);
    }
})();

export default osrmService;
