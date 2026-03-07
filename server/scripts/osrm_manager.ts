
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDist = __dirname.includes('dist');
const IN_DOCKER = !!process.env.HOST_PROJECT_PATH;
const HOST_PROJECT_PATH = process.env.HOST_PROJECT_PATH || path.resolve(__dirname, isDist ? '../../../' : '../../');
const DATA_DIR = IN_DOCKER ? '/data' : path.join(HOST_PROJECT_PATH, 'gtfs_data');
const CONTAINER_NAME = 'gtfs-osrm-server';
const PORT = 5001;

// Mapping of "City/Region" keys to Geofabrik PBF URLs and Mirrors
// Note: OSRM works best with regional extracts. "Bogota" is served by the "Colombia" file.
interface RegionInfo {
    url: string;
    mirrors: string[];
}

// We removed the hardcoded REGIONS dictionary to make this fully parametric.
// Usage: tsx osrm_manager.ts <city_key> <port> <url>

// Fallback: If Geofabrik is blocked, we might need manual download or a different source.
// Since Geofabrik is the standard, blocking it is problematic.
// Let's try http instead of https, sometimes firewalls engage on SNI?
// Or try a different provider like bbbike? (creates custom extracts, complex to automate via single URL)

// Let's improve the download function to check for "small files" which indicate HTML errors.


async function downloadFileWithRetry(url: string, mirrors: string[], dest: string): Promise<void> {
    const allUrls = [url, ...mirrors];
    let lastError = null;

    // Helper to download a single URL, following redirects
    const downloadSingle = (downloadUrl: string, redirectCount = 0): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            console.log(`Downloading ${downloadUrl} ...`);
            const file = fs.createWriteStream(dest);
            const options = {
                rejectUnauthorized: false,
                headers: { 'User-Agent': 'GTFS-Generator-Setup/1.0' }
            };

            const proto = downloadUrl.startsWith('https') ? https : http;

            proto.get(downloadUrl, options, (response: any) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const newLoc = response.headers.location;
                    console.log(`Redirecting to: ${newLoc}`);
                    // Handle relative redirect if necessary, though unlikely for these CDN types
                    let nextUrl = newLoc;
                    if (!nextUrl.startsWith('http')) {
                        const u = new URL(downloadUrl);
                        nextUrl = `${u.protocol}//${u.host}${newLoc}`;
                    }

                    downloadSingle(nextUrl, redirectCount + 1).then(resolve).catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Status code ${response.statusCode}`));
                    return;
                }

                response.pipe(file);
                file.on('finish', () => {
                    file.close(() => {
                        const stats = fs.statSync(dest);
                        if (stats.size < 10000) {
                            const content = fs.readFileSync(dest, 'utf8');
                            fs.unlinkSync(dest);
                            reject(new Error(`File too small (${stats.size} bytes). Likely HTML error. Content: ${content.substring(0, 50)}...`));
                        } else {
                            console.log(`Download complete. Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                            resolve();
                        }
                    });
                });
            }).on('error', (err: any) => {
                fs.unlink(dest, () => { });
                reject(err);
            });
        });
    };

    for (const downloadUrl of allUrls) {
        try {
            console.log(`Attempting download from: ${downloadUrl}`);
            await downloadSingle(downloadUrl);
            return; // Success
        } catch (e) {
            console.warn(`Failed to download from ${downloadUrl}: ${e instanceof Error ? e.message : e}`);
            lastError = e;

            // Try http fallback
            if (downloadUrl.startsWith('https')) {
                const httpUrl = downloadUrl.replace('https://', 'http://');
                try {
                    console.log(`Retrying with HTTP: ${httpUrl}`);
                    await downloadSingle(httpUrl);
                    return; // Success
                } catch (e2) {
                    console.warn(`HTTP fallback also failed: ${e2}`);
                }
            }
        }
    }

    throw new Error(`All download attempts failed. Last error: ${lastError}`);
}


function runCommand(cmd: string) {
    console.log(`Running: ${cmd}`);
    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
        console.error(`Command failed: ${cmd}`);
        process.exit(1);
    }
}

// --- Main ---


function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function main() {
    const regionKey = (process.argv[2] || process.env.OSRM_CITY || '').toLowerCase();
    const customPort = process.argv[3] ? parseInt(process.argv[3]) : null;
    const customUrl = process.argv[4];

    if (!regionKey || !customPort || !customUrl) {
        console.error(`
Usage: npm run osrm:setup <city_key> <port> <url>

Example: npm run osrm:setup merida 5012 "https://download.geofabrik.de/north-america/mexico-latest.osm.pbf"
`);
        process.exit(1);
    }

    const url = customUrl;
    const filename = `${regionKey}.osm.pbf`; // Using region key for filename to avoid collisions
    const pbfPath = path.join(DATA_DIR, filename);
    const osrmName = filename.replace('.osm.pbf', '');
    const osrmPath = path.join(DATA_DIR, `${osrmName}.osrm`);
    
    // Use unique container name to allow multiple cities
    const targetPort = customPort || PORT;
    const specificContainerName = `${CONTAINER_NAME}-${regionKey}-${targetPort}`;

    console.log(`=== Setting up OSRM for: ${regionKey} ===`);
    console.log(`Target Data: ${filename}`);
    console.log(`Target Port: ${targetPort}`);
    console.log(`Container Name: ${specificContainerName}`);

    ensureDir(DATA_DIR);

    // 1. Download
    try {
        if (fs.existsSync(pbfPath)) {
            // Check if it's the small error file
            const stats = fs.statSync(pbfPath);
            if (stats.size < 10000) {
                console.log("Existing file is suspicious (too small), deleting and re-downloading.");
                fs.unlinkSync(pbfPath);
                await downloadFileWithRetry(url, [], pbfPath);
            } else {
                console.log(`File ${pbfPath} already exists and seems valid (${(stats.size / 1024 / 1024).toFixed(2)} MB). Skipping download.`);
            }
        } else {
            await downloadFileWithRetry(url, [], pbfPath);
        }
    } catch (e) {
        console.error('Download failed:', e);
        console.error('\nPOSSIBLE CAUSE: Your network (WatchGuard/Firewall) is blocking standard Geofabrik downloads.');
        console.error('SOLUTION: Please manually download the .osm.pbf file and place it in the "osrm-data" folder.');
        console.error(`URL: ${url}`);
        process.exit(1);
    }

    // 2. Stop existing container if running (only the one for this city/port)
    try {
        console.log(`Stopping existing container ${specificContainerName} if it exists...`);
        execSync(`docker rm -f ${specificContainerName}`, { stdio: 'ignore' });
    } catch (e) {
        // ignore if not exists
    }

    // 3. Process Map Data (Extract, Partition, Customize)
    console.log('--- Processing Map Data (This uses Docker) ---');

    const hostDataParam = IN_DOCKER ? `${HOST_PROJECT_PATH}/gtfs_data` : DATA_DIR;
    const volume = `${hostDataParam}:/data`;

    const hostProfilesParam = IN_DOCKER ? `${HOST_PROJECT_PATH}/server/scripts/osrm-profiles` : path.join(__dirname, 'osrm-profiles');
    const profilesVolume = `${hostProfilesParam}:/profiles`;
    const edgesPath = path.join(DATA_DIR, `${osrmName}.osrm.edges`);

    if (fs.existsSync(osrmPath) && !fs.existsSync(edgesPath)) {
        console.log("Found base .osrm file but missing index files (.edges). Data is corrupt. Re-extracting...");
        try {
            fs.readdirSync(DATA_DIR).forEach(file => {
                if (file.startsWith(osrmName) && file !== filename) {
                    fs.unlinkSync(path.join(DATA_DIR, file));
                }
            });
        } catch (e) {
            console.warn("Could not delete some corrupt files. They might be overwritten.", e);
        }
    }

    // Extract
    if (!fs.existsSync(osrmPath) || !fs.existsSync(edgesPath)) {
        runCommand(`docker run -t -v "${volume}" -v "${profilesVolume}" osrm/osrm-backend osrm-extract -p /profiles/bus.lua /data/${filename}`);
        runCommand(`docker run -t -v "${volume}" osrm/osrm-backend osrm-partition /data/${osrmName}`);
        runCommand(`docker run -t -v "${volume}" osrm/osrm-backend osrm-customize /data/${osrmName}`);
    } else {
        console.log('OSRM data seems to be already processed. Skipping extraction steps.');
    }

    // 4. Run Server
    console.log(`--- Starting OSRM Server on Port ${targetPort} ---`);
    runCommand(`docker run -d --name ${specificContainerName} -p ${targetPort}:5000 -v "${volume}" osrm/osrm-backend osrm-routed --algorithm mld /data/${osrmName}`);

    console.log(`
✅ OSRM is running for ${regionKey}!
URL: http://localhost:${targetPort}

IMPORTANT: Set your project's routing_engine_url to:
http://localhost:${targetPort}/route/v1/driving
`);

}

main();

