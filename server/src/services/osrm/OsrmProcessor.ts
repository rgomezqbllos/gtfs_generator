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
    private buildScopedOsrmName(mapId: string, filename: string): string {
        const baseName = sanitizeFileName(filename.replace('.osm.pbf', ''));
        const mapScope = sanitizeFileName(mapId.substring(0, 8));
        return sanitizeFileName(`${mapScope}-${baseName}`);
    }

    private hasCompleteProfileArtifacts(osrmName: string, profile: string): boolean {
        const base = path.join(DATA_DIR, `${osrmName}-${profile}.osrm`);
        const required = ['', '.edges', '.partition', '.cells', '.mldgr'];
        const hasAll = required.every(suffix => fs.existsSync(`${base}${suffix}`));
        if (!hasAll) return false;

        if (this.shouldRebuildForProfileChange(osrmName, profile)) {
            console.log(`Profile ${profile} changed since last build for ${osrmName}. Rebuilding artifacts...`);
            return false;
        }

        return true;
    }

    private shouldRebuildForProfileChange(osrmName: string, profile: string): boolean {
        const profilePath = path.join(HOST_PROJECT_PATH, 'server/scripts/osrm-profiles', `${profile}.lua`);
        const buildTimestampPath = path.join(DATA_DIR, `${osrmName}-${profile}.osrm.timestamp`);

        if (!fs.existsSync(profilePath) || !fs.existsSync(buildTimestampPath)) {
            return false;
        }

        try {
            const profileMtime = fs.statSync(profilePath).mtimeMs;
            const buildMtime = fs.statSync(buildTimestampPath).mtimeMs;
            return profileMtime > buildMtime;
        } catch {
            return false;
        }
    }

    private cleanupProfileArtifacts(profileBaseName: string): void {
        try {
            fs.readdirSync(DATA_DIR).forEach(file => {
                if (file.startsWith(`${profileBaseName}.osrm`)) {
                    fs.unlinkSync(path.join(DATA_DIR, file));
                }
            });
        } catch (error) {
            console.warn(`Could not fully clean old artifacts for ${profileBaseName}:`, error);
        }
    }

    private prepareProfileInputPbf(sourcePath: string, targetPath: string): void {
        if (fs.existsSync(targetPath)) return;

        try {
            fs.linkSync(sourcePath, targetPath);
            console.log(`Created hard link for profile input: ${path.basename(targetPath)}`);
        } catch (error: any) {
            console.warn(`Hard link failed for ${path.basename(targetPath)} (${error?.message || 'unknown error'}). Falling back to file copy.`);
            fs.copyFileSync(sourcePath, targetPath);
        }
    }

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

    downloadSingle(url: string, dest: string, redirectCount = 0): Promise<void> {
        return new Promise((resolve, reject) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects while downloading map file'));
                return;
            }

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
                        res.resume();
                        state.activeHttpRequest = null;
                        const redirectUrl = new URL(res.headers.location, url).toString();
                        this.downloadSingle(redirectUrl, dest, redirectCount + 1).then(resolve).catch(reject);
                        return;
                    }
                }

                if (res.statusCode !== 200) {
                    res.resume();
                    state.activeHttpRequest = null;
                    reject(new Error(`Status ${res.statusCode}`));
                    return;
                }

                const file = fs.createWriteStream(dest);
                const totalLength = parseInt(res.headers['content-length'] || '0', 10);
                let downloaded = 0;

                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (totalLength > 0) {
                        state.currentStatus.progress = Math.round((downloaded / totalLength) * 100);
                    }
                });

                res.pipe(file);
                file.on('error', (err) => {
                    state.activeHttpRequest = null;
                    fs.unlink(dest, () => { });
                    reject(err);
                });
                res.on('error', (err) => {
                    state.activeHttpRequest = null;
                    file.close(() => fs.unlink(dest, () => { }));
                    reject(err);
                });
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
            const regionSafeName = mapId.substring(0, 8);
            const osrmName = this.buildScopedOsrmName(mapId, filename);

            state.currentStatus = { status: 'processing', message: `Iniciando activación de ${filename}...`, activeMapId: mapId, progress: 5 };

            await dockerManager.stopContainersByPattern(`${CONTAINER_PREFIX}-${regionSafeName}`);

            const fallbackDataMount = `${(IN_DOCKER ? `${HOST_PROJECT_PATH}/gtfs_data` : DATA_DIR).replace(/\\/g, '/')}:/data`;
            const volume = await dockerManager.resolveDataVolumeMount(fallbackDataMount);
            const hostProfilesParam = IN_DOCKER
                ? `${HOST_PROJECT_PATH}/server/scripts/osrm-profiles`
                : path.join(HOST_PROJECT_PATH, 'server/scripts/osrm-profiles').replace(/\\/g, '/');
            const profilesVolume = `${hostProfilesParam}:/profiles`;
            console.log(`OSRM setup mounts: data=${volume} profiles=${profilesVolume}`);

            for (const profile of PROFILES) {
                const profileBaseName = `${osrmName}-${profile}`;
                const profilePbfName = `${profileBaseName}.osm.pbf`;
                const profilePbfPath = path.join(DATA_DIR, profilePbfName);
                const hasCompleteArtifacts = this.hasCompleteProfileArtifacts(osrmName, profile);

                if (!hasCompleteArtifacts) {
                    const profileIndex = PROFILES.indexOf(profile);
                    const baseProgress = 10 + profileIndex * 25;

                    this.cleanupProfileArtifacts(profileBaseName);

                    if (!fs.existsSync(profilePbfPath)) {
                        console.log(`Preparing profile input: ${profilePbfName} from ${pbfPath}`);
                        state.currentStatus = { status: 'processing', message: `Preparando archivos para ${profile}...`, activeMapId: mapId, progress: baseProgress };
                        this.prepareProfileInputPbf(pbfPath, profilePbfPath);
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
