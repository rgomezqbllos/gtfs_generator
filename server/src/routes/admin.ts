import { FastifyInstance } from 'fastify';
import db, { closeDB, reconnectDB, initDB } from '../db';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

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
        try {
            const dbPath = path.resolve(__dirname, '../../gtfs.db');
            if (!fs.existsSync(dbPath)) {
                return reply.code(404).send({ error: 'Database file not found' });
            }

            const zip = new AdmZip();
            // We add the file to the zip. 
            // Better-sqlite3 might have data in WAL, but usually reading the main file is enough if we checkpoint.
            db.pragma('wal_checkpoint(FULL)');

            zip.addLocalFile(dbPath);
            const buffer = zip.toBuffer();

            reply.header('Content-Type', 'application/zip');
            reply.header('Content-Disposition', `attachment; filename="gtfs_backup_${new Date().toISOString().split('T')[0]}.zip"`);
            return buffer;
        } catch (error) {
            console.error('Backup failed:', error);
            return reply.code(500).send({ error: 'Failed to create backup' });
        }
    });

    // RESTORE DATABASE FROM ZIP
    fastify.post('/admin/restore', async (request: any, reply: any) => {
        const data = await request.file();
        if (!data) return reply.code(400).send({ error: 'No file uploaded' });

        const tempPath = path.join(__dirname, `../../restore_temp_${uuidv4()}.zip`);
        const extractPath = path.join(__dirname, '../../restore_extract');

        try {
            // Save upload to temp
            const pump = fs.createWriteStream(tempPath);
            await new Promise((resolve, reject) => {
                data.file.pipe(pump);
                data.file.on('end', resolve);
                data.file.on('error', reject);
            });

            // Unzip
            const zip = new AdmZip(tempPath);
            if (!fs.existsSync(extractPath)) fs.mkdirSync(extractPath);
            zip.extractAllTo(extractPath, true);

            // Find gtfs.db in extracted files
            const extractedFiles = fs.readdirSync(extractPath);
            const dbFile = extractedFiles.find(f => f.endsWith('.db'));
            if (!dbFile) {
                throw new Error('No .db file found in the zip');
            }

            const newDbPath = path.join(extractPath, dbFile);
            const targetDbPath = path.resolve(__dirname, '../../gtfs.db');

            // 1. Close current connection
            closeDB();

            // 2. Replace file
            fs.copyFileSync(newDbPath, targetDbPath);

            // 3. Clean up WAL/SHM if they exist (they might be incompatible with the new main file)
            if (fs.existsSync(`${targetDbPath}-wal`)) fs.unlinkSync(`${targetDbPath}-wal`);
            if (fs.existsSync(`${targetDbPath}-shm`)) fs.unlinkSync(`${targetDbPath}-shm`);

            // 4. Reconnect
            reconnectDB();
            initDB();

            return { message: 'Database restored successfully' };
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
