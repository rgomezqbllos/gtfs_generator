
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

import { fileURLToPath } from 'url';

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../../osrm-data');
const CONTAINER_NAME = 'gtfs-osrm-server';
const PORT = 5001;

// Mapping of "City/Region" keys to Geofabrik PBF URLs and Mirrors
// Note: OSRM works best with regional extracts. "Bogota" is served by the "Colombia" file.
interface RegionInfo {
    url: string;
    mirrors: string[];
}

const REGIONS: Record<string, RegionInfo> = {
    'bogota': {
        url: 'https://download.geofabrik.de/south-america/colombia-latest.osm.pbf',
        mirrors: [
            'https://download.bbbike.org/osm/bbbike/Bogota/Bogota.osm.pbf',
            'https://osm-internal.download.geofabrik.de/south-america/colombia-latest.osm.pbf'
        ]
    },
    // ... others
};

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
    const regionKey = process.argv[2]?.toLowerCase();

    if (!regionKey || !REGIONS[regionKey]) {
        console.error(`
Usage: npm run osrm:setup <city_key>

Available Cities/Regions:
${Object.keys(REGIONS).map(k => ` - ${k}`).join('\n')}
`);
        process.exit(1);
    }

    const info = REGIONS[regionKey];
    const url = info.url;
    const filename = path.basename(url);
    const pbfPath = path.join(DATA_DIR, filename);
    const osrmName = filename.replace('.osm.pbf', '');
    const osrmPath = path.join(DATA_DIR, `${osrmName}.osrm`);

    console.log(`=== Setting up OSRM for: ${regionKey} ===`);
    console.log(`Target Data: ${filename}`);

    ensureDir(DATA_DIR);

    // 1. Download
    try {
        if (fs.existsSync(pbfPath)) {
            // Check if it's the small error file
            const stats = fs.statSync(pbfPath);
            if (stats.size < 10000) {
                console.log("Existing file is suspicious (too small), deleting and re-downloading.");
                fs.unlinkSync(pbfPath);
                await downloadFileWithRetry(url, info.mirrors || [], pbfPath);
            } else {
                console.log(`File ${pbfPath} already exists and seems valid (${(stats.size / 1024 / 1024).toFixed(2)} MB). Skipping download.`);
            }
        } else {
            await downloadFileWithRetry(url, info.mirrors || [], pbfPath);
        }
    } catch (e) {
        console.error('Download failed:', e);
        console.error('\nPOSSIBLE CAUSE: Your network (WatchGuard/Firewall) is blocking standard Geofabrik downloads.');
        console.error('SOLUTION: Please manually download the .osm.pbf file for your region and place it in the "osrm-data" folder.');
        console.error(`URL: ${url}`);
        process.exit(1);
    }

    // 2. Stop existing container if running
    try {
        console.log('Stopping existing OSRM container...');
        execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
    } catch (e) {
        // ignore if not exists
    }

    // 3. Process Map Data (Extract, Partition, Customize)
    // Only verify if .osrm exists? No, better to re-process to be safe or check specific artifact.
    // For simplicity, we re-process if the main .osrm file doesn't exist or if user forced (not implemented)
    // Actually, OSRM generates multiple files. Let's run the steps.

    console.log('--- Processing Map Data (This uses Docker) ---');

    // Using absolute path for volume mount
    const volume = `${DATA_DIR}:/data`;

    // Extract
    if (!fs.existsSync(osrmPath)) {
        runCommand(`docker run -t -v "${volume}" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/${filename}`);
        runCommand(`docker run -t -v "${volume}" osrm/osrm-backend osrm-partition /data/${osrmName}`);
        runCommand(`docker run -t -v "${volume}" osrm/osrm-backend osrm-customize /data/${osrmName}`);
    } else {
        console.log('OSRM data seems to be already processed. Skipping extraction steps (delete osrm-data folder to force re-process).');
    }

    // 4. Run Server
    console.log('--- Starting OSRM Server ---');
    runCommand(`docker run -d --name ${CONTAINER_NAME} -p ${PORT}:5000 -v "${volume}" osrm/osrm-backend osrm-routed --algorithm mld /data/${osrmName}`);

    console.log(`
✅ OSRM is running for ${regionKey}!
URL: http://localhost:${PORT}

IMPORTANT: Ensure your .env file has:
OSRM_API_URL=http://localhost:${PORT}/route/v1/driving
`);

}

main();
