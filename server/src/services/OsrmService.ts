
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { promisify } from 'util';
import { URL } from 'url';
import { db } from '../db';

const execAsync = promisify(exec);

// Configuration
const IN_DOCKER = !!process.env.HOST_PROJECT_PATH;
const HOST_PROJECT_PATH = process.env.HOST_PROJECT_PATH || path.resolve(__dirname, '../../../');
const DATA_DIR = IN_DOCKER ? '/data' : path.join(HOST_PROJECT_PATH, 'gtfs_data');
const OSRM_DOCKER_NETWORK = process.env.OSRM_DOCKER_NETWORK || 'gtfs_generator_default';
console.log('OSRM SERVICE: Resolved DATA_DIR:', DATA_DIR);

// ... (inside class)


const CONTAINER_PREFIX = process.env.OSRM_CONTAINER_PREFIX || 'gtfs-osrm';
const BASE_PORT = Number(process.env.OSRM_BASE_PORT) || 5000;
const OSRM_ROUTED_THREADS = Math.max(Number(process.env.OSRM_ROUTED_THREADS) || 2, 1);

const PROFILES = ['bus_mixed', 'bus_mixed_exclusive', 'bus_trunk'];
const PROFILE_PORTS: Record<string, number> = {
    'bus_mixed': 5001,
    'bus_mixed_exclusive': 5002,
    'bus_trunk': 5003
};

interface RegionInfo {
    name: string;
    url: string;
    mirrors: string[];
}

import MapRepository, { MapInstance } from './MapRepository';

// Available Regions (DEPRECATED: Now using MapRepository)
// const REGIONS = ...

export interface MapInfo {
    id: string;
    name: string;
    status: MapInstance['status'];
    isActive: boolean;
    base_port?: number | null;
    disk_size?: number | null;
    running_profiles?: string[];
    healthy_profiles?: string[];
    total_profiles?: number;
    health_status?: 'live' | 'degraded' | 'offline';
}

// Current Status State
interface OsrmStatus {
    status: 'idle' | 'downloading' | 'processing' | 'running' | 'error';
    message: string;
    progress?: number;
    activeRegion?: string;
    activeMapId?: string;
}

let currentStatus: OsrmStatus = {
    status: 'idle',
    message: 'Ready',
};

// Tracking variables for cancellation
let activeHttpRequest: http.ClientRequest | null = null;
let activeSetupRegion: string | null = null; // To know which region's setup containers to kill

class OsrmService {
    isUsablePort(value?: number | null): value is number {
        return Number.isInteger(value) && Number(value) > 0;
    }

    private isManagedBasePort(value?: number | null): value is number {
        return Number.isInteger(value) && Number(value) >= 5000;
    }

    private getRoutingBaseUrl(): string {
        if (process.env.OSRM_BASE_URL) {
            return process.env.OSRM_BASE_URL;
        }
        return IN_DOCKER ? 'http://host.docker.internal' : 'http://localhost';
    }

    buildRoutingUrl(basePort: number): string {
        return `${this.getRoutingBaseUrl()}:${basePort}/route/v1/driving`;
    }

    buildInternalRoutingUrl(mapId: string): string {
        const regionSafeName = mapId.substring(0, 8);
        return `http://${CONTAINER_PREFIX}-${regionSafeName}-bus_mixed:5000/route/v1/driving`;
    }

    private buildProfileContainerName(mapId: string, profile: string): string {
        return `${CONTAINER_PREFIX}-${mapId.substring(0, 8)}-${profile}`;
    }

    private buildProfileRuntimeUrl(mapId: string, basePort: number, profile: string): string {
        if (IN_DOCKER) {
            return `http://${this.buildProfileContainerName(mapId, profile)}:5000/route/v1/driving`;
        }

        const profileIndex = PROFILES.indexOf(profile);
        return this.buildRoutingUrl(basePort + profileIndex);
    }

    private async getHealthyProfiles(mapId: string, basePort: number): Promise<string[]> {
        const checks = await Promise.all(PROFILES.map(async (profile) => ({
            profile,
            healthy: await this.probeOsrm(this.buildProfileRuntimeUrl(mapId, basePort, profile))
        })));

        return checks.filter(check => check.healthy).map(check => check.profile);
    }

    private async probeOsrm(url: string): Promise<boolean> {
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

                req.on('timeout', () => {
                    req.destroy();
                    resolve(false);
                });

                req.on('error', () => resolve(false));
            } catch (error) {
                resolve(false);
            }
        });
    }

    private async waitForProfileReady(mapId: string, basePort: number, profile: string, timeoutMs: number = 600000) {
        const startedAt = Date.now();
        const targetUrl = this.buildProfileRuntimeUrl(mapId, basePort, profile);

        while (Date.now() - startedAt < timeoutMs) {
            const ready = await this.probeOsrm(targetUrl);
            if (ready) {
                return;
            }

            currentStatus = {
                status: 'processing',
                message: `Esperando que ${profile} quede operativo...`,
                activeMapId: mapId,
                progress: 92
            };
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        throw new Error(`OSRM profile ${profile} did not become ready in time`);
    }

    async getStatus() {
        // optimistically check if container is running to update 'idle' state
        if (currentStatus.status === 'idle') {
            await this.checkActiveContainer();
        }
        return currentStatus;
    }

    clearError() {
        if (currentStatus.status === 'error') {
            currentStatus = { status: 'idle', message: 'Ready', activeRegion: 'unknown' };
        }
        return currentStatus;
    }

    async getMaps(): Promise<MapInfo[]> {
        const maps = MapRepository.getAll();
        let runningContainers: string[] = [];
        try {
            const { stdout } = await execAsync(`docker ps --format "{{.Names}}" --filter "name=${CONTAINER_PREFIX}"`);
            runningContainers = stdout.split('\n').map(n => n.trim()).filter(Boolean);
        } catch (e) {
            // Docker might be unreachable or returning an error
        }

        const enrichedMaps = await Promise.all(maps.map(async (map) => {
            let basePort: number | null | undefined = map.base_port;
            if (!this.isUsablePort(basePort) && map.status === 'ready') {
                basePort = await this.recoverBasePort(map.id);
            }

            return {
                ...map,
                base_port: basePort ?? map.base_port ?? undefined
            };
        }));

        return await Promise.all(enrichedMaps.map(async (m) => {
            const regionSafeName = m.id.substring(0, 8);
            const runningProfiles = PROFILES.filter(profile =>
                runningContainers.includes(`${CONTAINER_PREFIX}-${regionSafeName}-${profile}`)
            );
            const healthyProfiles = this.isUsablePort(m.base_port)
                ? await this.getHealthyProfiles(m.id, m.base_port)
                : [];
            const healthStatus = healthyProfiles.length === 0
                ? 'offline'
                : healthyProfiles.length === PROFILES.length
                    ? 'live'
                    : 'degraded';
            
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
                // Active if at least one profile is healthy OR if it's the target of a current download/process
                isActive: healthStatus !== 'offline' || currentStatus.activeMapId === m.id
            };
        }));
    }

    /** Alias for backward compatibility */
    async getAvailableRegions(): Promise<MapInfo[]> {
        return this.getMaps();
    }

    /** Expose data directory for upload handling */
    getDataDir(): string {
        return DATA_DIR;
    }

    private getNextAvailablePort(): number {
        const maps = MapRepository.getAll();
        const usedPorts = maps
            .map(m => m.base_port)
            .filter((p): p is number => this.isManagedBasePort(p));
        if (usedPorts.length === 0) return 5010; // Start at 5010 to avoid conflicts with default 5000 range
        return Math.max(...usedPorts) + 10; // Jump by 10 to leave space for profiles
    }

    async recoverBasePort(mapId: string): Promise<number | null> {
        const containerName = `${CONTAINER_PREFIX}-${mapId.substring(0, 8)}-bus_mixed`;

        try {
            const { stdout } = await execAsync(`docker port ${containerName} 5000/tcp`);
            const hostPort = stdout
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map(line => {
                    const match = line.match(/:(\d+)$/);
                    return match ? Number(match[1]) : null;
                })
                .find((value): value is number => this.isUsablePort(value));

            if (hostPort) {
                const map = MapRepository.getById(mapId);
                MapRepository.updateStatus(mapId, map?.status || 'ready', hostPort);
                return hostPort;
            }
        } catch (error) {
            // Docker may not be reachable or the container may not exist yet.
        }

        return null;
    }

    syncProjectsForMap(mapId: string, basePort: number | null) {
        const routingUrl = basePort ? this.buildRoutingUrl(basePort) : null;
        db.prepare(`
            UPDATE projects
            SET routing_engine_url = ?
            WHERE map_instance_id = ?
        `).run(routingUrl, mapId);
    }

    async deleteMap(mapId: string) {
        const map = MapRepository.getById(mapId);
        if (!map) throw new Error('Map not found');

        const osrmName = path.basename(map.pbf_url).replace('.osm.pbf', '');

        // Stop existing containers for this map
        currentStatus = { status: 'processing', message: `Stopping OSRM containers for ${map.name}...`, activeMapId: mapId, progress: 100 };
        try {
            const containerPattern = `${CONTAINER_PREFIX}-${mapId.substring(0, 8)}`;
            const { stdout: containerIds } = await execAsync(`docker ps -aq --filter "name=${containerPattern}"`);
            if (containerIds.trim()) {
                await execAsync(`docker rm -f ${containerIds.trim().split('\n').join(' ')}`);
            }
        } catch (e) { /* ignore */ }

        // Delete all related files
        if (fs.existsSync(DATA_DIR)) {
            const files = fs.readdirSync(DATA_DIR);
            files.forEach(f => {
                if (f.startsWith(osrmName) || f.includes(mapId.substring(0, 8))) {
                    try {
                        fs.unlinkSync(path.join(DATA_DIR, f));
                    } catch (e) {
                        console.error('Error deleting file', f, e);
                    }
                }
            });
        }

        db.prepare(`
            UPDATE projects
            SET map_instance_id = NULL, routing_engine_url = NULL
            WHERE map_instance_id = ?
        `).run(mapId);

        MapRepository.delete(mapId);

        // Reset active state
        if (currentStatus.activeMapId === mapId) {
            currentStatus = { status: 'idle', message: 'No Map Active' };
        }

        return { message: `Map ${map.name} deleted` };
    }

    async downloadMap(mapId: string, force: boolean = false) {
        if (currentStatus.status === 'downloading' || currentStatus.status === 'processing') {
            throw new Error('A process is already running');
        }

        const map = MapRepository.getById(mapId);
        if (!map) throw new Error('Map not found');

        const filename = path.basename(new URL(map.pbf_url).pathname) || `${mapId.substring(0, 8)}.osm.pbf`;
        const pbfPath = path.join(DATA_DIR, filename);

        MapRepository.updateStatus(mapId, 'downloading');
        await this.runDownloadProcess(mapId, map.pbf_url, filename, pbfPath, [], force);

        return { message: 'Download process completed', filename };
    }

    async activateMap(mapId: string) {
        if (currentStatus.status === 'downloading' || currentStatus.status === 'processing') {
            throw new Error('A process is already running');
        }

        const map = MapRepository.getById(mapId);
        if (!map) throw new Error('Map not found');

        const filename = path.basename(new URL(map.pbf_url).pathname);
        const pbfPath = path.join(DATA_DIR, filename);

        if (!fs.existsSync(pbfPath)) {
            throw new Error(`Map file not found for ${map.name}. Please download it first.`);
        }

        MapRepository.updateStatus(mapId, 'processing');
        
        // Assign port if not exists
        let basePort = map.base_port;
        if (!this.isManagedBasePort(basePort)) {
            basePort = this.getNextAvailablePort();
        }

        try {
            await this.runActivationProcess(mapId, filename, pbfPath, basePort);
        } catch (error) {
            MapRepository.updateStatus(mapId, 'error', basePort, map.disk_size);
            throw error;
        }

        const diskSize = fs.existsSync(pbfPath) ? fs.statSync(pbfPath).size : map.disk_size;
        MapRepository.updateStatus(mapId, 'ready', basePort, diskSize);
        this.syncProjectsForMap(mapId, basePort);
        return { message: 'Activation process completed', mapId };
    }

    // --- Private Process Logic ---

    private async runDownloadProcess(mapId: string, url: string, filename: string, pbfPath: string, mirrors: string[], force: boolean) {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

            let shouldDownload = true;
            if (!force && fs.existsSync(pbfPath)) {
                const stats = fs.statSync(pbfPath);
                if (stats.size > 10 * 1024 * 1024) { 
                    console.log(`File ${filename} exists and seems valid (${(stats.size/1024/1024).toFixed(1)}MB). Skipping download.`);
                    shouldDownload = false;
                } else {
                    console.log(`File ${filename} exists but is too small (${stats.size} bytes). Re-downloading...`);
                    fs.unlinkSync(pbfPath);
                }
            }

            if (shouldDownload) {
                currentStatus = { status: 'downloading', message: `Downloading ${filename}...`, activeMapId: mapId, progress: 0 };
                await this.downloadFileWithRetry(url, mirrors || [], pbfPath);
            }

            const diskSize = fs.existsSync(pbfPath) ? fs.statSync(pbfPath).size : undefined;
            MapRepository.updateStatus(mapId, 'pending', undefined, diskSize);
            currentStatus = { status: 'idle', message: `Download complete`, activeMapId: undefined };

        } catch (error: any) {
            console.error('Download Failed:', error);
            MapRepository.updateStatus(mapId, 'error');
            currentStatus = { 
                status: 'error', 
                message: `Download failed: ${error.message || 'Check logs'}`, 
                activeMapId: undefined // Unset activeMapId on error to stop 'Live' badge
            };
            throw error;
        }
    }

    private async runActivationProcess(mapId: string, filename: string, pbfPath: string, basePort: number) {
        try {
            const osrmName = filename.replace('.osm.pbf', '');
            const regionSafeName = mapId.substring(0, 8);
            
            currentStatus = { status: 'processing', message: `Iniciando activación de ${filename}...`, activeMapId: mapId, progress: 5 };
            try {
                const containerPattern = `${CONTAINER_PREFIX}-${regionSafeName}`;
                const { stdout: containerIds } = await execAsync(`docker ps -aq --filter "name=${containerPattern}"`);
                if (containerIds.trim()) {
                    await execAsync(`docker rm -f ${containerIds.trim().split('\n').join(' ')}`);
                }
            } catch (e) { /* ignore */ }

            const hostDataParam = IN_DOCKER ? `${HOST_PROJECT_PATH}/gtfs_data` : DATA_DIR.replace(/\\/g, '/');
            const volume = `${hostDataParam}:/data`;

            const hostProfilesParam = IN_DOCKER ? `${HOST_PROJECT_PATH}/server/scripts/osrm-profiles` : path.join(HOST_PROJECT_PATH, 'server/scripts/osrm-profiles').replace(/\\/g, '/');
            const profilesVolume = `${hostProfilesParam}:/profiles`;

            for (const profile of PROFILES) {
                const profilePbfName = `${osrmName}-${profile}.osm.pbf`;
                const profilePbfPath = path.join(DATA_DIR, profilePbfName);
                const profileOsrmPath = path.join(DATA_DIR, `${osrmName}-${profile}.osrm`);
                const profileEdgesPath = path.join(DATA_DIR, `${osrmName}-${profile}.osrm.edges`);

                if (fs.existsSync(profileOsrmPath) && !fs.existsSync(profileEdgesPath)) {
                    console.log(`Found base .osrm file for ${profile} but missing index files. Cleaning...`);
                    try {
                        fs.readdirSync(DATA_DIR).forEach(file => {
                            if (file.startsWith(`${osrmName}-${profile}`)) {
                                fs.unlinkSync(path.join(DATA_DIR, file));
                            }
                        });
                    } catch (e) { /* ignore */ }
                }

                if (!fs.existsSync(profileOsrmPath) || !fs.existsSync(profileEdgesPath)) {
                    const profileIndex = PROFILES.indexOf(profile);
                    const baseProgress = 10 + (profileIndex * 25); // 10%, 35%, 60%...

                    if (!fs.existsSync(profilePbfPath)) {
                        console.log(`Creating profile copy: ${profilePbfName} from ${pbfPath}`);
                        currentStatus = { status: 'processing', message: `Preparando archivos para ${profile}...`, activeMapId: mapId, progress: baseProgress };
                        fs.copyFileSync(pbfPath, profilePbfPath);
                    }

                    currentStatus = { status: 'processing', message: `Extracting ${profile} (Esto puede tardar varios minutos)...`, activeMapId: mapId, progress: baseProgress + 5 };
                    activeSetupRegion = mapId;
                    
                    const setupName = `osrm-setup-${regionSafeName}-${profile}`;
                    try { await execAsync(`docker rm -f ${setupName}`); } catch(e) {}
                    await execAsync(`docker run --name ${setupName} --platform linux/amd64 -v "${volume}" -v "${profilesVolume}" osrm/osrm-backend osrm-extract -p /profiles/${profile}.lua /data/${profilePbfName}`);

                    currentStatus = { status: 'processing', message: `Optimizing ${profile} (Partition)...`, activeMapId: mapId, progress: baseProgress + 15 };
                    await execAsync(`docker run --rm --platform linux/amd64 -v "${volume}" osrm/osrm-backend osrm-partition /data/${osrmName}-${profile}`);

                    currentStatus = { status: 'processing', message: `Optimizing ${profile} (Customize)...`, activeMapId: mapId, progress: baseProgress + 20 };
                    await execAsync(`docker run --rm --platform linux/amd64 -v "${volume}" osrm/osrm-backend osrm-customize /data/${osrmName}-${profile}`);
                    
                    activeSetupRegion = null;
                }
            }

            // 4. Start Servers
            for (const profile of PROFILES) {
                const profileIndex = PROFILES.indexOf(profile);
                const port = basePort + profileIndex;
                
                const containerName = `${CONTAINER_PREFIX}-${regionSafeName}-${profile}`;
                currentStatus = { status: 'processing', message: `Levantando servicio ${profile} en puerto ${port}...`, activeMapId: mapId, progress: 85 + (profileIndex * 5) };
                
                await execAsync(`docker run --platform linux/amd64 -d --restart unless-stopped --network ${OSRM_DOCKER_NETWORK} --name ${containerName} -p ${port}:5000 -v "${volume}" osrm/osrm-backend osrm-routed --algorithm mld --mmap --threads ${OSRM_ROUTED_THREADS} /data/${osrmName}-${profile}`);
                currentStatus = {
                    status: 'processing',
                    message: `Verificando disponibilidad de ${profile}...`,
                    activeMapId: mapId,
                    progress: 88 + (profileIndex * 4)
                };
                await this.waitForProfileReady(mapId, basePort, profile);
            }

            activeSetupRegion = null;
            currentStatus = { status: 'running', message: `OSRM Ready`, activeMapId: mapId, progress: 100 };

        } catch (error: any) {
            console.error('OSRM Setup Failed:', error);
            activeSetupRegion = null;
            currentStatus = { 
                status: 'error', 
                message: `Setup failed: ${error.message}`, 
                activeMapId: undefined 
            };
            throw error;
        }
    }

    private async downloadFileWithRetry(url: string, mirrors: string[], dest: string): Promise<void> {
        const allUrls = [url, ...mirrors];

        for (const downloadUrl of allUrls) {
            try {
                await this.downloadSingle(downloadUrl, dest);
                return;
            } catch (e) {
                console.warn(`Download failed from ${downloadUrl}, trying next...`);
            }
        }
        throw new Error('All download mirrors failed.');
    }

    private downloadSingle(url: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            const proto = url.startsWith('https') ? https : http;

            const req = proto.get(url, { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*'
                }, 
                rejectUnauthorized: false,
                timeout: 300000 // 5 minutes timeout for large files
            }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    if (res.headers.location) {
                        activeHttpRequest = null;
                        this.downloadSingle(res.headers.location, dest).then(resolve).catch(reject);
                        return;
                    }
                }

                if (res.statusCode !== 200) {
                    activeHttpRequest = null;
                    reject(new Error(`Status ${res.statusCode}`));
                    return;
                }

                // Progress tracking
                const totalLength = parseInt(res.headers['content-length'] || '0', 10);
                let downloaded = 0;

                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (totalLength > 0) {
                        const percent = Math.round((downloaded / totalLength) * 100);
                        currentStatus.progress = percent;
                    }
                });

                res.pipe(file);
                file.on('finish', () => {
                    file.close(() => resolve());
                    activeHttpRequest = null;
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Download timed out due to inactivity'));
            });

            activeHttpRequest = req as http.ClientRequest;

            req.on('error', (err: any) => {
                activeHttpRequest = null;
                fs.unlink(dest, () => { });
                if (err?.code === 'ECONNRESET') {
                     reject(new Error('Download manually cancelled'));
                } else {
                     reject(err);
                }
            });
        });
    }

    private async checkActiveContainer() {
        try {
            // Check if at least one of our bus profiles is running
            const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_PREFIX}" --format "{{.Names}}"`);
            if (stdout.trim()) {
                if (currentStatus.status === 'idle') {
                    currentStatus.status = 'running';
                    currentStatus.message = 'OSRM Instances Active';
                }
            } else {
                if (currentStatus.status === 'running') {
                    currentStatus.status = 'idle';
                    currentStatus.message = 'OSRM Not Running';
                    currentStatus.activeMapId = undefined;
                }
            }
        } catch (e) {
            // Docker might be down or no containers exist
        }
    }

    async cancelProcess() {
        if (currentStatus.status !== 'downloading' && currentStatus.status !== 'processing') {
            return { message: 'No active process to cancel' };
        }

        // 1. Cancel active HTTP Download
        if (activeHttpRequest) {
            console.log('Cancelling active HTTP download request...');
            activeHttpRequest.destroy(new Error('Download manually cancelled'));
            activeHttpRequest = null;
        }

        // 2. Cancel active Docker Setup processes
        if (activeSetupRegion || currentStatus.status === 'processing') {
            console.log('Cancelling active Docker setup containers...');
            
            // Try to kill any container starting with osrm-setup
            try {
                const { stdout } = await execAsync(`docker ps -aq --filter "name=osrm-setup"`);
                if (stdout.trim()) {
                    await execAsync(`docker rm -f ${stdout.trim().split('\n').join(' ')}`);
                }
            } catch (e) {}
            
            activeSetupRegion = null;
            throw new Error('Activation manually cancelled');
        }

        currentStatus = { status: 'idle', message: 'Process cancelled' };
        return { message: 'Process successfully cancelled' };
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

                if (basePort) {
                    osrmService.syncProjectsForMap(map.id, basePort);
                }
            }
        }
    } catch (e) {
        console.error('Failed to cleanup stale map states:', e);
    }
})();

export default osrmService;
