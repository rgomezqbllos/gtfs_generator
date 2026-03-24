import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import MapRepository from '../MapRepository';
import {
    IN_DOCKER,
    HOST_PROJECT_PATH,
    DATA_DIR,
    CONTAINER_PREFIX,
    PROFILES,
} from './config';
import { sanitizeFileName } from './security';
import { state } from './state';
import { dockerManager } from './DockerManager';

export class OsrmProcessor {
    // --- Download ---

    async runDownloadProcess(
        mapId: string,
        url: string,
        filename: string,
        pbfPath: string,
        mirrors: string[],
        force: boolean
    ): Promise<void> {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

            let shouldDownload = true;
            if (!force && fs.existsSync(pbfPath)) {
                const stats = fs.statSync(pbfPath);
                if (stats.size > 10 * 1024 * 1024) {
                    console.log(`File ${filename} exists and seems valid (${(stats.size / 1024 / 1024).toFixed(1)}MB). Skipping download.`);
                    shouldDownload = false;
                } else {
                    console.log(`File ${filename} exists but is too small (${stats.size} bytes). Re-downloading...`);
                    fs.unlinkSync(pbfPath);
                }
            }

            if (shouldDownload) {
                state.currentStatus = { status: 'downloading', message: `Downloading ${filename}...`, activeMapId: mapId, progress: 0 };
                await this.downloadFileWithRetry(url, mirrors || [], pbfPath);
            }

            const diskSize = fs.existsSync(pbfPath) ? fs.statSync(pbfPath).size : undefined;
            MapRepository.updateStatus(mapId, 'pending', undefined, diskSize);
            state.currentStatus = { status: 'idle', message: 'Download complete', activeMapId: undefined };

        } catch (error: any) {
            console.error('Download Failed:', error);
            MapRepository.updateStatus(mapId, 'error');
            state.currentStatus = {
                status: 'error',
                message: `Download failed: ${error.message || 'Check logs'}`,
                activeMapId: undefined,
            };
            throw error;
        }
    }

    async downloadFileWithRetry(url: string, mirrors: string[], dest: string): Promise<void> {
        const allUrls = [url, ...mirrors];
        for (const downloadUrl of allUrls) {
            try {
                await this.downloadSingle(downloadUrl, dest);
                return;
            } catch {
                console.warn(`Download failed from ${downloadUrl}, trying next...`);
            }
        }
        throw new Error('All download mirrors failed.');
    }

    downloadSingle(url: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            const proto = url.startsWith('https') ? https : http;

            const req = proto.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                },
                rejectUnauthorized: process.env.ALLOW_INSECURE_DOWNLOADS !== 'true',
                timeout: 300000,
            }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    if (res.headers.location) {
                        state.activeHttpRequest = null;
                        this.downloadSingle(res.headers.location, dest).then(resolve).catch(reject);
                        return;
                    }
                }

                if (res.statusCode !== 200) {
                    state.activeHttpRequest = null;
                    reject(new Error(`Status ${res.statusCode}`));
                    return;
                }

                const totalLength = parseInt(res.headers['content-length'] || '0', 10);
                let downloaded = 0;

                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (totalLength > 0) {
                        state.currentStatus.progress = Math.round((downloaded / totalLength) * 100);
                    }
                });

                res.pipe(file);
                file.on('finish', () => {
                    file.close(() => resolve());
                    state.activeHttpRequest = null;
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Download timed out due to inactivity'));
            });

            state.activeHttpRequest = req as http.ClientRequest;

            req.on('error', (err: any) => {
                state.activeHttpRequest = null;
                fs.unlink(dest, () => { });
                reject(err?.code === 'ECONNRESET'
                    ? new Error('Download manually cancelled')
                    : err
                );
            });
        });
    }

    // --- Activation ---

    async runActivationProcess(mapId: string, filename: string, pbfPath: string, basePort: number): Promise<void> {
        try {
            const osrmName = sanitizeFileName(filename.replace('.osm.pbf', ''));
            const regionSafeName = mapId.substring(0, 8);

            state.currentStatus = { status: 'processing', message: `Iniciando activación de ${filename}...`, activeMapId: mapId, progress: 5 };

            await dockerManager.stopContainersByPattern(`${CONTAINER_PREFIX}-${regionSafeName}`);

            const hostDataParam = IN_DOCKER ? `${HOST_PROJECT_PATH}/gtfs_data` : DATA_DIR.replace(/\\/g, '/');
            const volume = `${hostDataParam}:/data`;
            const hostProfilesParam = IN_DOCKER
                ? `${HOST_PROJECT_PATH}/server/scripts/osrm-profiles`
                : path.join(HOST_PROJECT_PATH, 'server/scripts/osrm-profiles').replace(/\\/g, '/');
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
                    } catch { /* ignore */ }
                }

                if (!fs.existsSync(profileOsrmPath) || !fs.existsSync(profileEdgesPath)) {
                    const profileIndex = PROFILES.indexOf(profile);
                    const baseProgress = 10 + profileIndex * 25;

                    if (!fs.existsSync(profilePbfPath)) {
                        console.log(`Creating profile copy: ${profilePbfName} from ${pbfPath}`);
                        state.currentStatus = { status: 'processing', message: `Preparando archivos para ${profile}...`, activeMapId: mapId, progress: baseProgress };
                        fs.copyFileSync(pbfPath, profilePbfPath);
                    }

                    state.currentStatus = { status: 'processing', message: `Extracting ${profile} (Esto puede tardar varios minutos)...`, activeMapId: mapId, progress: baseProgress + 5 };
                    state.activeSetupRegion = mapId;

                    const setupName = `osrm-setup-${regionSafeName}-${profile}`;
                    await dockerManager.runExtract(setupName, volume, profilesVolume, profilePbfName, profile);

                    state.currentStatus = { status: 'processing', message: `Optimizing ${profile} (Partition)...`, activeMapId: mapId, progress: baseProgress + 15 };
                    await dockerManager.runPartition(volume, osrmName, profile);

                    state.currentStatus = { status: 'processing', message: `Optimizing ${profile} (Customize)...`, activeMapId: mapId, progress: baseProgress + 20 };
                    await dockerManager.runCustomize(volume, osrmName, profile);

                    state.activeSetupRegion = null;
                }
            }

            for (const profile of PROFILES) {
                const profileIndex = PROFILES.indexOf(profile);
                const port = basePort + profileIndex;
                const containerName = dockerManager.buildContainerName(mapId, profile);

                state.currentStatus = { status: 'processing', message: `Levantando servicio ${profile} en puerto ${port}...`, activeMapId: mapId, progress: 85 + profileIndex * 5 };
                await dockerManager.runOsrmRouted(containerName, port, volume, osrmName, profile);

                state.currentStatus = { status: 'processing', message: `Verificando disponibilidad de ${profile}...`, activeMapId: mapId, progress: 88 + profileIndex * 4 };
                await dockerManager.waitForProfileReady(mapId, basePort, profile);
            }

            state.activeSetupRegion = null;
            state.currentStatus = { status: 'running', message: 'OSRM Ready', activeMapId: mapId, progress: 100 };

        } catch (error: any) {
            console.error('OSRM Setup Failed:', error);
            state.activeSetupRegion = null;
            state.currentStatus = { status: 'error', message: `Setup failed: ${error.message}`, activeMapId: undefined };
            throw error;
        }
    }
}

export const osrmProcessor = new OsrmProcessor();
