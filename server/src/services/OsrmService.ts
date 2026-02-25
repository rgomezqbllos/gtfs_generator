
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { promisify } from 'util';
import { URL } from 'url';

const execAsync = promisify(exec);

// Configuration
const DATA_DIR = path.resolve(__dirname, '../../../osrm-data');
console.log('OSRM SERVICE: Resolved DATA_DIR:', DATA_DIR);

// ... (inside class)


const CONTAINER_NAME = process.env.OSRM_CONTAINER_NAME || 'gtfs-osrm-server';
const PORT = Number(process.env.OSRM_PORT) || 5001;

interface RegionInfo {
    name: string;
    url: string;
    mirrors: string[];
}

// Available Regions
const REGIONS: Record<string, RegionInfo> = {
    'bogota': {
        name: 'Bogotá, Colombia',
        url: 'https://download.geofabrik.de/south-america/colombia-latest.osm.pbf',
        mirrors: [
            'https://download.bbbike.org/osm/bbbike/Bogota/Bogota.osm.pbf',
            'https://osm-internal.download.geofabrik.de/south-america/colombia-latest.osm.pbf'
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

        // Delete all related files
        if (fs.existsSync(DATA_DIR)) {
            const files = fs.readdirSync(DATA_DIR);
            let deletedCount = 0;
            files.forEach(f => {
                if (f.startsWith(osrmName)) {
                    try {
                        fs.unlinkSync(path.join(DATA_DIR, f));
                        deletedCount++;
                    } catch (e) {
                        console.error('Error deleting file', f, e);
                    }
                }
            });
            // if (deletedCount === 0) throw new Error('No files found to delete');
        }

        // Reset active state if we deleted the active map
        if (currentStatus.activeRegion === regionKey) {
            currentStatus.activeRegion = 'unknown';
            if (currentStatus.status !== 'downloading' && currentStatus.status !== 'processing') {
                currentStatus.status = 'idle';
                currentStatus.message = 'No Map Active';
            }
        }

        return { message: `Map files for ${regionKey} deleted` };
    }

    async downloadAndSetup(regionKey: string, customUrl?: string, customName?: string, force: boolean = false) {
        if (currentStatus.status === 'downloading' || currentStatus.status === 'processing') {
            throw new Error('A process is already running');
        }

        let url: string;
        let name: string;
        let filename: string;
        let mirrors: string[] = [];

        if (customUrl) {
            // Custom Mode
            try {
                const u = new URL(customUrl);
                if (!u.pathname.endsWith('.osm.pbf')) {
                    // warning but allow
                }
                url = customUrl;
                name = customName || 'Custom Map';
                filename = path.basename(u.pathname) || 'custom.osm.pbf';
            } catch (e) {
                throw new Error('Invalid URL');
            }
        } else {
            // Region Mode
            if (!REGIONS[regionKey]) throw new Error('Invalid region key');
            const info = REGIONS[regionKey];
            url = info.url;
            name = info.name;
            filename = path.basename(url);
            mirrors = info.mirrors;
        }

        const pbfPath = path.join(DATA_DIR, filename);
        // Update active region tracking
        const activeKey = customUrl ? filename : regionKey;

        this.runSetupProcess(activeKey, url, filename, pbfPath, mirrors, force);

        return { message: 'Setup process started' };
    }

    // --- Private Process Logic ---

    private async runSetupProcess(regionKey: string, url: string, filename: string, pbfPath: string, mirrors: string[], force: boolean) {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

            // 1. Download
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

            // 2. Stop existing container
            currentStatus = { status: 'processing', message: 'Stopping existing OSRM container...', activeRegion: regionKey, progress: 100 };
            try {
                await execAsync(`docker rm -f ${CONTAINER_NAME}`);
            } catch (e) { /* ignore */ }

            // 3. Process Data
            const osrmName = filename.replace('.osm.pbf', '');
            const osrmPath = path.join(DATA_DIR, `${osrmName}.osrm`);
            const edgesPath = path.join(DATA_DIR, `${osrmName}.osrm.edges`);
            const volume = `${DATA_DIR.replace(/\\/g, '/')}:/data`;
            const scriptDir = path.resolve(__dirname, '../../scripts');
            const profilesVolume = `${path.join(scriptDir, 'osrm-profiles').replace(/\\/g, '/')}:/profiles`;

            // Detect and clean corrupt data
            if (fs.existsSync(osrmPath) && !fs.existsSync(edgesPath)) {
                console.log("Found base .osrm file but missing index files (.edges). Data is corrupt. Re-extracting...");
                currentStatus = { status: 'processing', message: 'Cleaning corrupt map data...', activeRegion: regionKey };
                try {
                    fs.readdirSync(DATA_DIR).forEach(file => {
                        if (file.startsWith(osrmName) && file !== filename) {
                            fs.unlinkSync(path.join(DATA_DIR, file));
                        }
                    });
                } catch (e) {
                    console.warn("Could not delete some corrupt files.", e);
                }
            }

            // Setup OSRM if not already extracted
            if (!fs.existsSync(osrmPath) || !fs.existsSync(edgesPath)) {
                currentStatus = { status: 'processing', message: 'Extracting map data (this may take a while)...', activeRegion: regionKey };
                await execAsync(`docker run -t -v "${volume}" -v "${profilesVolume}" osrm/osrm-backend osrm-extract -p /profiles/bus.lua /data/${filename}`);

                currentStatus = { status: 'processing', message: 'Partitioning map data...', activeRegion: regionKey };
                await execAsync(`docker run -t -v "${volume}" osrm/osrm-backend osrm-partition /data/${osrmName}`);

                currentStatus = { status: 'processing', message: 'Customizing map data...', activeRegion: regionKey };
                await execAsync(`docker run -t -v "${volume}" osrm/osrm-backend osrm-customize /data/${osrmName}`);
            }

            // 4. Start Server
            currentStatus = { status: 'processing', message: 'Starting OSRM Server...', activeRegion: regionKey };
            await execAsync(`docker run -d --restart always --name ${CONTAINER_NAME} -p ${PORT}:5000 -v "${volume}" osrm/osrm-backend osrm-routed --algorithm mld /data/${osrmName}`);

            currentStatus = { status: 'running', message: 'OSRM Ready', activeRegion: regionKey, progress: 100 };

        } catch (error) {
            console.error('OSRM Setup Failed:', error);
            currentStatus = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error', activeRegion: regionKey };
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

            const req = proto.get(url, { headers: { 'User-Agent': 'GTFS-Generator/1.0' }, rejectUnauthorized: false }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    if (res.headers.location) {
                        this.downloadSingle(res.headers.location, dest).then(resolve).catch(reject);
                        return;
                    }
                }

                if (res.statusCode !== 200) {
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
                });
            });

            req.on('error', (err) => {
                fs.unlink(dest, () => { });
                reject(err);
            });
        });
    }

    private async checkActiveContainer() {
        try {
            const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Status}}"`);
            if (stdout.trim().startsWith('Up')) {
                // It is running
                if (currentStatus.status === 'idle') {
                    currentStatus.status = 'running';
                    currentStatus.message = 'OSRM Container Running';
                }
            } else {
                if (currentStatus.status !== 'downloading' && currentStatus.status !== 'processing') {
                    currentStatus.status = 'idle';
                    currentStatus.message = 'OSRM Not Running';
                }
            }
        } catch (e) {
            currentStatus.status = 'error';
            currentStatus.message = 'Docker not available';
        }
    }
}

export default new OsrmService();
