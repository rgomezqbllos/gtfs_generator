import { FastifyInstance } from 'fastify';
import db, { closeDB, reconnectDB, initDB, getDbPath } from '../db';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { pipeline } from 'stream/promises';

function collectFilesRecursive(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFilesRecursive(fullPath));
            continue;
        }
        if (entry.isFile()) {
            files.push(fullPath);
        }
    }

    return files;
}

export default async function adminRoutes(fastify: FastifyInstance) {

    // GET SETTINGS
    fastify.get('/admin/settings', async (request: any, reply: any) => {
        try {
            const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string, value: string }[];
            const settings: Record<string, any> = {};
            rows.forEach(r => {
                try {
                    settings[r.key] = JSON.parse(r.value);
                } catch (e) {
                    settings[r.key] = r.value;
                }
            });
            return settings;
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to fetch settings' });
        }
    });

    // SAVE SETTING
    fastify.post<{ Body: { key: string, value: any } }>('/admin/settings', async (request: any, reply: any) => {
        const { key, value } = request.body;
        try {
            const valStr = JSON.stringify(value);
            db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, valStr);
            return { success: true };
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to save setting' });
        }
    });

    // BACKUP DATABASE AS ZIP
    fastify.get('/admin/backup', async (request: any, reply: any) => {
        let tempDir: string | null = null;
        try {
            const activeDbPath = getDbPath();
            if (!fs.existsSync(activeDbPath)) {
                return reply.code(404).send({ error: 'Database file not found' });
            }

            // Use SQLite online backup API to generate a consistent snapshot
            // even when the live DB is in WAL mode.
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtfs-backup-'));
            const snapshotPath = path.join(tempDir, 'gtfs.db');
            await db.backup(snapshotPath);

            const zip = new AdmZip();
            zip.addLocalFile(snapshotPath);

            // Optional metadata useful for diagnostics.
            const stats = db.prepare(`
                SELECT
                    (SELECT COUNT(*) FROM stops) AS stops,
                    (SELECT COUNT(*) FROM routes) AS routes,
                    (SELECT COUNT(*) FROM trips) AS trips,
                    (SELECT COUNT(*) FROM segments) AS segments
            `).get() as { stops: number; routes: number; trips: number; segments: number };
            zip.addFile('backup_meta.json', Buffer.from(JSON.stringify({
                createdAt: new Date().toISOString(),
                sourceDbPath: activeDbPath,
                stats
            }, null, 2)));

            const buffer = zip.toBuffer();

            reply.header('Content-Type', 'application/zip');
            reply.header('Content-Disposition', `attachment; filename="gtfs_backup_${new Date().toISOString().split('T')[0]}.zip"`);
            return buffer;
        } catch (error) {
            console.error('Backup failed:', error);
            return reply.code(500).send({ error: 'Failed to create backup' });
        } finally {
            if (tempDir && fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        }
    });

    // RESTORE DATABASE FROM ZIP
    fastify.post('/admin/restore', async (request: any, reply: any) => {
        const data = await request.file();
        if (!data) return reply.code(400).send({ error: 'No file uploaded' });

        const tempPath = path.join(os.tmpdir(), `restore_temp_${uuidv4()}.zip`);
        const extractPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gtfs-restore-'));
        const targetDbPath = getDbPath();
        const targetWalPath = `${targetDbPath}-wal`;
        const targetShmPath = `${targetDbPath}-shm`;

        try {
            // Save upload to temp. Pipeline guarantees write completion.
            await pipeline(data.file, fs.createWriteStream(tempPath));

            // Unzip
            const zip = new AdmZip(tempPath);
            zip.extractAllTo(extractPath, true);

            // Find a .db file recursively (supports zips with nested folders).
            const extractedFiles = collectFilesRecursive(extractPath);
            const dbCandidates = extractedFiles.filter(f => f.toLowerCase().endsWith('.db'));
            if (dbCandidates.length === 0) {
                throw new Error('No .db file found in the zip');
            }

            // Prefer gtfs.db, fallback to first .db found.
            const preferredDb = dbCandidates.find(f => path.basename(f).toLowerCase() === 'gtfs.db');
            const newDbPath = preferredDb || dbCandidates[0];
            const sourceBase = path.basename(newDbPath);
            const sourceWalPath = path.join(path.dirname(newDbPath), `${sourceBase}-wal`);
            const sourceShmPath = path.join(path.dirname(newDbPath), `${sourceBase}-shm`);

            // 1. Close current connection
            closeDB();

            // 2. Replace file
            fs.copyFileSync(newDbPath, targetDbPath);

            // 3. Restore or clean sidecar files.
            // If backup contains WAL/SHM, restore them as well.
            if (fs.existsSync(sourceWalPath)) {
                fs.copyFileSync(sourceWalPath, targetWalPath);
            } else if (fs.existsSync(targetWalPath)) {
                fs.unlinkSync(targetWalPath);
            }

            if (fs.existsSync(sourceShmPath)) {
                fs.copyFileSync(sourceShmPath, targetShmPath);
            } else if (fs.existsSync(targetShmPath)) {
                fs.unlinkSync(targetShmPath);
            }

            // 4. Reconnect
            reconnectDB();
            initDB();

            const stats = db.prepare(`
                SELECT
                    (SELECT COUNT(*) FROM stops) AS stops,
                    (SELECT COUNT(*) FROM routes) AS routes,
                    (SELECT COUNT(*) FROM trips) AS trips,
                    (SELECT COUNT(*) FROM segments) AS segments
            `).get() as { stops: number; routes: number; trips: number; segments: number };

            return { message: 'Database restored successfully', stats };
        } catch (error) {
            console.error('Restore failed:', error);
            // Attempt to restore connection if it was closed
            try { reconnectDB(); } catch (e) { }
            return reply.code(500).send({ error: error instanceof Error ? error.message : 'Restore failed' });
        } finally {
            // Cleanup temp files
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (fs.existsSync(extractPath)) fs.rmSync(extractPath, { recursive: true, force: true });
        }
    });

    // RESET DATABASE
    fastify.post('/admin/reset', async (request: any, reply: any) => {
        try {
            console.log('Starting full database reset...');
            const startTime = Date.now();

            // Perform deletion in a single transaction for atomicity and speed
            db.transaction(() => {
                // Disable foreign keys temporarily for faster bulk deletion
                db.pragma('foreign_keys = OFF');

                // Delete all data from all tables
                const tables = [
                    'settings',
                    'segment_time_slots',
                    'stop_times',
                    'trips',
                    'shapes',
                    'segments',
                    'routes',
                    'stops',
                    'calendar',
                    'agency'
                ];

                for (const table of tables) {
                    try {
                        db.prepare(`DELETE FROM ${table}`).run();
                    } catch (e) {
                        console.warn(`Could not clear table ${table}`, e);
                    }
                }

                // Reset auto-increment sequences (only if the table exists)
                try {
                    db.prepare("DELETE FROM sqlite_sequence").run();
                } catch (e) {
                }

                // Re-enable foreign keys
                db.pragma('foreign_keys = ON');
            })();

            // VACUUM must be run outside of a transaction
            db.pragma('vacuum');

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            return {
                message: 'Database reset successful',
                duration: `${duration}s`
            };
        } catch (error) {
            console.error('Reset failed:', error);
            return reply.code(500).send({ error: 'Failed to reset database' });
        }
    });
}
