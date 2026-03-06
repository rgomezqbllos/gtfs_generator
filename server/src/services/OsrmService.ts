
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { promisify } from 'util';
import { URL } from 'url';

const execAsync = promisify(exec);

// Configuration
const IN_DOCKER = !!process.env.HOST_PROJECT_PATH;
const HOST_PROJECT_PATH = process.env.HOST_PROJECT_PATH || path.resolve(__dirname, '../../../');
const DATA_DIR = IN_DOCKER ? '/data' : path.join(HOST_PROJECT_PATH, 'gtfs_data');
console.log('OSRM SERVICE: Resolved DATA_DIR:', DATA_DIR);

// ... (inside class)


const CONTAINER_PREFIX = process.env.OSRM_CONTAINER_PREFIX || 'gtfs-osrm';
const BASE_PORT = Number(process.env.OSRM_BASE_PORT) || 5000;

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

// Available Regions
const REGIONS: Record<string, RegionInfo> = {
    'bogota': {
        name: 'Bogotá, Colombia',
        url: 'https://download.bbbike.org/osm/bbbike/Bogota/Bogota.osm.pbf',
        mirrors: [
            'https://download.geofabrik.de/south-america/colombia-latest.osm.pbf'
        ]
    },
    'medellin': {
        name: 'Medellín, Colombia',
        url: 'https://download.geofabrik.de/south-america/colombia-latest.osm.pbf',
        mirrors: []
    },
    'cali': {
        name: 'Cali, Colombia',
        url: 'https://download.geofabrik.de/south-america/colombia-latest.osm.pbf',
        mirrors: []
    },
    'curitiba': {
        name: 'Curitiba, Brazil',
        url: 'https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf',
        mirrors: [
            'https://download.geofabrik.de/south-america/brazil-latest.osm.pbf'
        ]
    },
    'buenos-aires': {
        name: 'Buenos Aires, Argentina',
        url: 'https://download.geofabrik.de/south-america/argentina-latest.osm.pbf',
        mirrors: []
    },
    'mexico-city': {
        name: 'Mexico City, Mexico',
        url: 'https://download.geofabrik.de/north-america/mexico-latest.osm.pbf',
        mirrors: []
    },
    'santiago': {
        name: 'Santiago, Chile',
        url: 'https://download.geofabrik.de/south-america/chile-latest.osm.pbf',
        mirrors: []
    },
    'sao-paulo': {
        name: 'São Paulo, Brazil',
        url: 'https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf',
        mirrors: []
    },
    'new-york': {
        name: 'New York, USA',
        url: 'https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf',
        mirrors: []
    },
    'montreal': {
        name: 'Montreal, Canada',
        url: 'https://download.geofabrik.de/north-america/canada/quebec-latest.osm.pbf',
        mirrors: []
    }
};

export interface MapInfo {
    key: string;
    name: string;
    isDownloaded: boolean;
    isActive: boolean;
}

// Current Status State
interface OsrmStatus {
    status: 'idle' | 'downloading' | 'processing' | 'running' | 'error';
    message: string;
    progress?: number;
    activeRegion?: string;
}

let currentStatus: OsrmStatus = {
    status: 'idle',
    message: 'Ready',
    activeRegion: 'unknown'
};

// Tracking variables for cancellation
let activeHttpRequest: http.ClientRequest | null = null;
let activeSetupRegion: string | null = null; // To know which region's setup containers to kill

class OsrmService {

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

    getLocalMaps(): MapInfo[] {
        if (!fs.existsSync(DATA_DIR)) return [];
        const files = fs.readdirSync(DATA_DIR);

        // 1. Identification by defining what "Installed" means
        // We look for .osrm.pbf OR .osrm files.
        const pbfFiles = files.filter(f => f.endsWith('.osm.pbf'));

        const localMaps: MapInfo[] = [];

        // Check defined regions
        Object.entries(REGIONS).forEach(([key, info]) => {
            const filename = path.basename(info.url);
            if (pbfFiles.includes(filename)) {
                localMaps.push({
                    key,
                    name: info.name,
                    isDownloaded: true,
                    isActive: currentStatus.activeRegion === key
                });
            }
        });

        // Check for custom/orphaned files
        pbfFiles.forEach(f => {
            const known = Object.values(REGIONS).some(r => path.basename(r.url) === f);
            if (!known) {
                const name = f.replace('.osm.pbf', '').replace(/-/g, ' ');
                // Use filename as key for custom maps
                localMaps.push({
                    key: f,
                    name: `Custom: ${name}`,
                    isDownloaded: true,
                    isActive: currentStatus.activeRegion === f
                });
            }
        });

        return localMaps;
    }

    getProfiles() {
        return PROFILES;
    }

    getDataDir() {
        return DATA_DIR;
    }

    getAvailableRegions() {
        const localMaps = this.getLocalMaps();
        // localMaps already contains all customized info including downloaded status and active status
        // We just need to merge it with the predefined REGIONS list to show options that are NOT yet downloaded.

        const combined: MapInfo[] = [...localMaps];

        Object.entries(REGIONS).forEach(([key, info]) => {
            // Check if this region is already in localMaps (by checking if key matches or if a custom map with same filename exists)
            const filename = path.basename(info.url);

            // It's already in combined if getLocalMaps identified it by filename match or key match
            const exists = combined.some(m => m.key === key || (m.key.includes(filename)));

            if (!exists) {
                combined.push({
                    key,
                    name: info.name,
                    isDownloaded: false,
                    isActive: false
                });
            }
        });

        return combined.sort((a, b) => a.name.localeCompare(b.name));
    }

    async deleteMap(regionKey: string) {
        let filename: string;

        if (REGIONS[regionKey]) {
            filename = path.basename(REGIONS[regionKey].url);
        } else {
            // Assume regionKey is the filename for custom maps
            filename = regionKey;
        }

        const osrmName = filename.replace('.osm.pbf', '');

        // Stop existing containers for this region (or globally if using generic names)
        currentStatus = { status: 'processing', message: 'Stopping OSRM containers...', activeRegion: regionKey, progress: 100 };
        for (const profile of PROFILES) {
            try {
                await execAsync(`docker rm -f ${CONTAINER_PREFIX}-${profile}`);
            } catch (e) { /* ignore */ }
        }

        // Delete all related files
        if (fs.existsSync(DATA_DIR)) {
            const files = fs.readdirSync(DATA_DIR);
            files.forEach(f => {
                if (f.startsWith(osrmName)) {
                    try {
                        fs.unlinkSync(path.join(DATA_DIR, f));
                    } catch (e) {
                        console.error('Error deleting file', f, e);
                    }
                }
            });
        }

        // Reset active state
        if (currentStatus.activeRegion === regionKey || currentStatus.status === 'processing') {
            currentStatus = { status: 'idle', message: 'No Map Active', activeRegion: 'unknown' };
        }

        return { message: `Map files for ${regionKey} deleted` };
    }

    async downloadMap(regionKey: string, customUrl?: string, customName?: string, force: boolean = false) {
        if (currentStatus.status === 'downloading' || currentStatus.status === 'processing') {
            throw new Error('A process is already running');
        }

        let url: string;
        let filename: string;
        let mirrors: string[] = [];

        if (customUrl) {
            try {
                const u = new URL(customUrl);
                if (!u.pathname.endsWith('.osm.pbf')) {
                    // warning but allow
                }
                url = customUrl;
                filename = path.basename(u.pathname) || 'custom.osm.pbf';
            } catch (e) {
                throw new Error('Invalid URL');
            }
        } else {
            if (!REGIONS[regionKey]) throw new Error('Invalid region key');
            const info = REGIONS[regionKey];
            url = info.url;
            filename = path.basename(url);
            mirrors = info.mirrors;
        }

        const pbfPath = path.join(DATA_DIR, filename);
        const activeKey = customUrl ? filename : regionKey;

        this.runDownloadProcess(activeKey, url, filename, pbfPath, mirrors, force);

        return { message: 'Download process started' };
    }

    async activateMap(regionKey: string) {
        if (currentStatus.status === 'downloading' || currentStatus.status === 'processing') {
            throw new Error('A process is already running');
        }

        let filename: string;

        if (REGIONS[regionKey]) {
            filename = path.basename(REGIONS[regionKey].url);
        } else {
            // Assume regionKey is the filename for custom maps
            filename = regionKey;
        }

        const pbfPath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(pbfPath)) {
            throw new Error(`Map file not found: ${filename}`);
        }

        this.runActivationProcess(regionKey, filename, pbfPath).catch(console.error);
        return { message: 'Activation process started' };
    }

    // --- Private Process Logic ---

    private async runDownloadProcess(regionKey: string, url: string, filename: string, pbfPath: string, mirrors: string[], force: boolean) {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

            let shouldDownload = true;
            if (!force && fs.existsSync(pbfPath)) {
                const stats = fs.statSync(pbfPath);
                if (stats.size > 1000000) { // arbitrary > 1MB
                    console.log(`File ${filename} exists (${(stats.size / 1024 / 1024).toFixed(1)}MB). Skipping download.`);
                    shouldDownload = false;
                }
            }

            if (shouldDownload) {
                currentStatus = { status: 'downloading', message: `Downloading ${filename}...`, activeRegion: regionKey, progress: 0 };
                await this.downloadFileWithRetry(url, mirrors || [], pbfPath);
            }

            // After download finishes, return to idle. Activation is a separate step now.
            currentStatus = { status: 'idle', message: `Download complete: ${filename}`, activeRegion: currentStatus.activeRegion };

        } catch (error: any) {
            console.error('Download Failed:', error);
            if (error?.message === 'Download manually cancelled') {
                currentStatus = { status: 'idle', message: 'Download cancelled', activeRegion: 'unknown' };
            } else {
                currentStatus = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error', activeRegion: regionKey };
            }
        }
    }

    private async runActivationProcess(regionKey: string, filename: string, pbfPath: string) {
        try {
            // 2. Stop existing containers
            // 2. Stop ALL existing OSRM containers (wildcard)
            currentStatus = { status: 'processing', message: 'Cleaning up OSRM environment...', activeRegion: regionKey, progress: 100 };
            try {
                // Kill both servers and setup containers with a single command
                await execAsync(`docker rm -f $(docker ps -aq --filter "name=${CONTAINER_PREFIX}")`);
            } catch (e) { /* ignore if no containers found */ }

            // 3. Process Data for each profile
            const osrmName = filename.replace('.osm.pbf', '');

            const hostDataParam = IN_DOCKER ? `${HOST_PROJECT_PATH}/gtfs_data` : DATA_DIR.replace(/\\/g, '/');
            const volume = `${hostDataParam}:/data`;

            const hostProfilesParam = IN_DOCKER ? `${HOST_PROJECT_PATH}/server/scripts/osrm-profiles` : path.join(HOST_PROJECT_PATH, 'server/scripts/osrm-profiles').replace(/\\/g, '/');
            const profilesVolume = `${hostProfilesParam}:/profiles`;

            for (const profile of PROFILES) {
                const profilePbfName = `${osrmName}-${profile}.osm.pbf`;
                const profilePbfPath = path.join(DATA_DIR, profilePbfName);
                const profileOsrmPath = path.join(DATA_DIR, `${osrmName}-${profile}.osrm`);
                const profileEdgesPath = path.join(DATA_DIR, `${osrmName}-${profile}.osrm.edges`);

                // Detect and clean corrupt data for this profile
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

                // Setup OSRM if not already extracted for this profile
                if (!fs.existsSync(profileOsrmPath) || !fs.existsSync(profileEdgesPath)) {
                    // Create a profile-specific copy of the PBF to ensure predictable output filenames
                    if (!fs.existsSync(profilePbfPath)) {
                        console.log(`Creating profile copy: ${profilePbfName}`);
                        fs.copyFileSync(pbfPath, profilePbfPath);
                    }

                    currentStatus = { status: 'processing', message: `Extracting ${profile} map data...`, activeRegion: regionKey };
                    activeSetupRegion = regionKey;
                    
                    try { await execAsync(`docker rm -f gtfs-osrm-setup-${profile}`); } catch(e) {}
                    await execAsync(`docker run --name gtfs-osrm-setup-${profile} --platform linux/amd64 -t -v "${volume}" -v "${profilesVolume}" osrm/osrm-backend osrm-extract -p /profiles/${profile}.lua /data/${profilePbfName}`);

                    currentStatus = { status: 'processing', message: `Partitioning ${profile} map data...`, activeRegion: regionKey };
                    try { await execAsync(`docker rm -f gtfs-osrm-setup-${profile}`); } catch(e) {}
                    await execAsync(`docker run --name gtfs-osrm-setup-${profile} --platform linux/amd64 -t -v "${volume}" osrm/osrm-backend osrm-partition /data/${osrmName}-${profile}`);

                    currentStatus = { status: 'processing', message: `Customizing ${profile} map data...`, activeRegion: regionKey };
                    try { await execAsync(`docker rm -f gtfs-osrm-setup-${profile}`); } catch(e) {}
                    await execAsync(`docker run --name gtfs-osrm-setup-${profile} --platform linux/amd64 -t -v "${volume}" osrm/osrm-backend osrm-customize /data/${osrmName}-${profile}`);
                    
                    try { await execAsync(`docker rm -f gtfs-osrm-setup-${profile}`); } catch(e) {}
                    activeSetupRegion = null;

                    // Optional: Remove temporary profile PBF to save space
                    // try { fs.unlinkSync(profilePbfPath); } catch(e) {}
                }
            }

            // 4. Start Servers
            for (const profile of PROFILES) {
                const port = PROFILE_PORTS[profile];
                currentStatus = { status: 'processing', message: `Starting OSRM ${profile} Server...`, activeRegion: regionKey };
                await execAsync(`docker run --platform linux/amd64 -d --restart always --name ${CONTAINER_PREFIX}-${profile} -p ${port}:5000 -v "${volume}" osrm/osrm-backend osrm-routed --algorithm mld /data/${osrmName}-${profile}`);
            }

            activeSetupRegion = null;
            currentStatus = { status: 'running', message: 'OSRM Ready (Multi-Modal)', activeRegion: regionKey, progress: 100 };

        } catch (error: any) {
            console.error('OSRM Setup Failed:', error);
            activeSetupRegion = null;
            if (error?.message === 'Activation manually cancelled') {
                currentStatus = { status: 'idle', message: 'Activation cancelled', activeRegion: 'unknown' };
            } else {
                currentStatus = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error', activeRegion: regionKey };
            }
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
                headers: { 'User-Agent': 'GTFS-Generator/1.0' }, 
                rejectUnauthorized: false,
                timeout: 60000 // 60 seconds connection timeout
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
            const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_PREFIX}-bus_mixed" --format "{{.Status}}"`);
            if (stdout.trim().toLowerCase().includes('up')) {
                if (currentStatus.status === 'idle') {
                    currentStatus.status = 'running';
                    currentStatus.message = 'OSRM Ready (Multi-Modal)';
                }
            } else {
                if (currentStatus.status === 'running') {
                    currentStatus.status = 'idle';
                    currentStatus.message = 'OSRM Not Running';
                    currentStatus.activeRegion = 'unknown';
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
            for (const profile of PROFILES) {
                try { await execAsync(`docker rm -f gtfs-osrm-setup-${profile}`); } catch(e) {}
            }
            activeSetupRegion = null;
            // Throwing an artificial error state ensures the activation loop breaks
            throw new Error('Activation manually cancelled');
        }

        currentStatus = { status: 'idle', message: 'Process cancelled', activeRegion: 'unknown' };
        return { message: 'Process successfully cancelled' };
    }
}

export default new OsrmService();
