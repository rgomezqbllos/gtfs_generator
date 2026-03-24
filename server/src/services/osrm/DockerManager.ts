import { exec } from 'child_process';
import https from 'https';
import http from 'http';
import { promisify } from 'util';
import { URL } from 'url';
import MapRepository from '../MapRepository';
import {
    IN_DOCKER,
    CONTAINER_PREFIX,
    OSRM_DOCKER_NETWORK,
    OSRM_ROUTED_THREADS,
    PROFILES,
} from './config';
import { parseContainerIds } from './security';
import { state } from './state';

const execAsync = promisify(exec);

export class DockerManager {
    // --- URL builders ---

    buildContainerName(mapId: string, profile: string): string {
        return `${CONTAINER_PREFIX}-${mapId.substring(0, 8)}-${profile}`;
    }

    buildRoutingUrl(basePort: number): string {
        const base = process.env.OSRM_BASE_URL
            ?? (IN_DOCKER ? 'http://host.docker.internal' : 'http://localhost');
        return `${base}:${basePort}/route/v1/driving`;
    }

    buildInternalRoutingUrl(mapId: string): string {
        const regionSafeName = mapId.substring(0, 8);
        return `http://${CONTAINER_PREFIX}-${regionSafeName}-bus_mixed:5000/route/v1/driving`;
    }

    buildProfileRuntimeUrl(mapId: string, basePort: number, profile: string): string {
        if (IN_DOCKER) {
            return `http://${this.buildContainerName(mapId, profile)}:5000/route/v1/driving`;
        }
        const profileIndex = PROFILES.indexOf(profile as typeof PROFILES[number]);
        return this.buildRoutingUrl(basePort + profileIndex);
    }

    // --- Health checks ---

    async probeOsrm(url: string): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                const target = new URL(url);
                target.pathname = '/nearest/v1/driving/0,0';
                target.search = '?number=1';

                const client = target.protocol === 'https:' ? https : http;
                const req = client.get(target, { timeout: 3000 }, (res) => {
                    res.resume();
                    resolve((res.statusCode || 500) < 500);
                });

                req.on('timeout', () => { req.destroy(); resolve(false); });
                req.on('error', () => resolve(false));
            } catch {
                resolve(false);
            }
        });
    }

    async waitForProfileReady(mapId: string, basePort: number, profile: string, timeoutMs = 600000): Promise<void> {
        const startedAt = Date.now();
        const targetUrl = this.buildProfileRuntimeUrl(mapId, basePort, profile);

        while (Date.now() - startedAt < timeoutMs) {
            if (await this.probeOsrm(targetUrl)) return;
            state.currentStatus = {
                status: 'processing',
                message: `Esperando que ${profile} quede operativo...`,
                activeMapId: mapId,
                progress: 92,
            };
            await new Promise(r => setTimeout(r, 2000));
        }

        throw new Error(`OSRM profile ${profile} did not become ready in time`);
    }

    async getHealthyProfiles(mapId: string, basePort: number): Promise<string[]> {
        const checks = await Promise.all(PROFILES.map(async (profile) => ({
            profile,
            healthy: await this.probeOsrm(this.buildProfileRuntimeUrl(mapId, basePort, profile)),
        })));
        return checks.filter(c => c.healthy).map(c => c.profile);
    }

    // --- Container lifecycle ---

    async listRunningContainerNames(): Promise<string[]> {
        try {
            const { stdout } = await execAsync(`docker ps --format "{{.Names}}" --filter "name=${CONTAINER_PREFIX}"`);
            return stdout.split('\n').map(n => n.trim()).filter(Boolean);
        } catch {
            return [];
        }
    }

    async stopContainersByPattern(pattern: string): Promise<void> {
        try {
            const { stdout } = await execAsync(`docker ps -aq --filter "name=${pattern}"`);
            const safeIds = parseContainerIds(stdout);
            if (safeIds.length > 0) {
                await execAsync(`docker rm -f ${safeIds.join(' ')}`);
            }
        } catch { /* ignore */ }
    }

    async recoverBasePort(mapId: string): Promise<number | null> {
        const containerName = this.buildContainerName(mapId, 'bus_mixed');
        try {
            const { stdout } = await execAsync(`docker port ${containerName} 5000/tcp`);
            const hostPort = stdout
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean)
                .map(l => { const m = l.match(/:(\d+)$/); return m ? Number(m[1]) : null; })
                .find((v): v is number => Number.isInteger(v) && Number(v) > 0) ?? null;

            if (hostPort) {
                const map = MapRepository.getById(mapId);
                MapRepository.updateStatus(mapId, map?.status || 'ready', hostPort);
            }
            return hostPort;
        } catch {
            return null;
        }
    }

    async checkActiveContainer(): Promise<void> {
        try {
            const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_PREFIX}" --format "{{.Names}}"`);
            if (stdout.trim()) {
                if (state.currentStatus.status === 'idle') {
                    state.currentStatus.status = 'running';
                    state.currentStatus.message = 'OSRM Instances Active';
                }
            } else {
                if (state.currentStatus.status === 'running') {
                    state.currentStatus.status = 'idle';
                    state.currentStatus.message = 'OSRM Not Running';
                    state.currentStatus.activeMapId = undefined;
                }
            }
        } catch { /* Docker might be down */ }
    }

    async cleanupOrphanContainers(readyMapIds: string[]): Promise<{ cleanedCount: number; message: string }> {
        const { stdout } = await execAsync(
            `docker ps -a --filter "name=${CONTAINER_PREFIX}" --filter "name=osrm-setup" --format "{{.ID}}|{{.Names}}"`
        );
        const lines = stdout.trim().split('\n').filter(Boolean);

        const toKill: string[] = [];
        for (const line of lines) {
            const [id, name] = line.split('|');
            if (name.startsWith('osrm-setup-')) {
                const regionInName = name.replace('osrm-setup-', '').split('-')[0];
                if (state.activeSetupRegion?.substring(0, 8) !== regionInName) toKill.push(id);
                continue;
            }
            if (name.startsWith(`${CONTAINER_PREFIX}-`)) {
                const regionInName = name.replace(`${CONTAINER_PREFIX}-`, '').split('-')[0];
                if (!readyMapIds.includes(regionInName)) toKill.push(id);
            }
        }

        const safeToKill = toKill.filter(id => /^[a-zA-Z0-9][a-zA-Z0-9_\-]*$/.test(id));
        if (safeToKill.length > 0) {
            console.log(`Cleaning up ${safeToKill.length} orphan OSRM containers:`, safeToKill);
            await execAsync(`docker rm -f ${safeToKill.join(' ')}`);
        }

        return {
            cleanedCount: safeToKill.length,
            message: safeToKill.length > 0
                ? `Se han limpiado ${safeToKill.length} contenedores huérfanos.`
                : 'No se encontraron contenedores huérfanos que limpiar.',
        };
    }

    async cancelDockerSetup(): Promise<void> {
        try {
            const { stdout } = await execAsync(`docker ps -aq --filter "name=osrm-setup"`);
            const safeIds = parseContainerIds(stdout);
            if (safeIds.length > 0) {
                await execAsync(`docker rm -f ${safeIds.join(' ')}`);
            }
        } catch { /* ignore */ }
    }

    // --- Container runners (used by OsrmProcessor) ---

    async runExtract(setupName: string, volume: string, profilesVolume: string, profilePbfName: string, profile: string): Promise<void> {
        try { await execAsync(`docker rm -f ${setupName}`); } catch { /* ignore */ }
        await execAsync(
            `docker run --name ${setupName} --platform linux/amd64 -v "${volume}" -v "${profilesVolume}" osrm/osrm-backend osrm-extract -p /profiles/${profile}.lua /data/${profilePbfName}`
        );
    }

    async runPartition(volume: string, osrmName: string, profile: string): Promise<void> {
        await execAsync(
            `docker run --rm --platform linux/amd64 -v "${volume}" osrm/osrm-backend osrm-partition /data/${osrmName}-${profile}`
        );
    }

    async runCustomize(volume: string, osrmName: string, profile: string): Promise<void> {
        await execAsync(
            `docker run --rm --platform linux/amd64 -v "${volume}" osrm/osrm-backend osrm-customize /data/${osrmName}-${profile}`
        );
    }

    async runOsrmRouted(containerName: string, port: number, volume: string, osrmName: string, profile: string): Promise<void> {
        await execAsync(
            `docker run --platform linux/amd64 -d --restart unless-stopped --network ${OSRM_DOCKER_NETWORK} --name ${containerName} -p ${port}:5000 -v "${volume}" osrm/osrm-backend osrm-routed --algorithm mld --mmap --threads ${OSRM_ROUTED_THREADS} /data/${osrmName}-${profile}`
        );
    }
}

export const dockerManager = new DockerManager();
