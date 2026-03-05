import { FastifyInstance } from 'fastify';
import db, { closeDB, reconnectDB, initDB, getDbPath } from '../db';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { randomUUID as uuidv4 } from 'crypto';
import os from 'os';
import { pipeline } from 'stream/promises';
import KcAdminClient from '@keycloak/keycloak-admin-client';

let kcAdminClient: KcAdminClient | null = null;
async function getKcAdminClient() {
    if (!kcAdminClient) {
        kcAdminClient = new KcAdminClient({
            baseUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
            realmName: 'master'
        });
        await kcAdminClient.auth({
            username: process.env.KEYCLOAK_ADMIN || 'superadmin',
            password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'superadmin',
            grantType: 'password',
            clientId: 'admin-cli'
        });
        kcAdminClient.setConfig({ realmName: 'gtfs' });
    }
    return kcAdminClient;
}

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

    // ==========================================
    // MULTI-TENANT ADMIN ENDPOINTS (PROJECTS & USERS)
    // ==========================================

    // List all projects
    fastify.get('/admin/projects', async (request: any, reply: any) => {
        try {
            if (request.isSuperAdmin) {
                const projects = db.prepare('SELECT * FROM projects').all();
                return projects;
            } else {
                const userId = request.user?.sub;
                const projects = db.prepare(`
                    SELECT p.* FROM projects p
                    JOIN user_projects up ON p.id = up.project_id
                    WHERE up.user_id = ? AND up.role = 'admin'
                `).all(userId);
                return projects;
            }
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to fetch projects' });
        }
    });

    // Create a new project
    fastify.post<{ Body: { name: string, description: string, map_center_lat?: number, map_center_lon?: number, routing_engine_url?: string } }>('/admin/projects', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) {
            return reply.code(403).send({ error: 'Only SuperAdmin can create projects' });
        }
        try {
            const id = uuidv4();
            const p = request.body;
            db.prepare(`
                INSERT INTO projects (id, name, description, map_center_lat, map_center_lon, routing_engine_url)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                id, p.name, p.description || null,
                p.map_center_lat || 4.6097,
                p.map_center_lon || -74.0817,
                p.routing_engine_url || null
            );
            return { id, ...p };
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to create project' });
        }
    });

    // Delete a project
    fastify.delete<{ Params: { id: string } }>('/admin/projects/:id', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) {
            return reply.code(403).send({ error: 'Only SuperAdmin can delete projects' });
        }
        try {
            db.prepare('DELETE FROM projects WHERE id = ?').run(request.params.id);
            return { success: true };
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to delete project' });
        }
    });

    // List users
    fastify.get('/admin/users', async (request: any, reply: any) => {
        try {
            let users: any[];
            if (request.isSuperAdmin) {
                users = db.prepare('SELECT * FROM users').all();
            } else {
                const userId = request.user?.sub;
                users = db.prepare(`
                    SELECT DISTINCT u.* FROM users u
                    JOIN user_projects up ON u.id = up.user_id
                    WHERE up.project_id IN (
                        SELECT project_id FROM user_projects WHERE user_id = ? AND role = 'admin'
                    )
                `).all(userId);
            }
            for (const user of users) {
                user.projects = db.prepare(`
                    SELECT p.id, p.name, up.role 
                    FROM user_projects up
                    JOIN projects p ON p.id = up.project_id
                    WHERE up.user_id = ?
                `).all(user.id);
            }
            return users;
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to fetch users' });
        }
    });

    // Assign user to project
    fastify.post<{ Body: { user_id: string, project_id: string, role?: string } }>('/admin/user-projects', async (request: any, reply: any) => {
        try {
            const { user_id, project_id, role } = request.body;

            // Check TenantAdmin permissions
            if (!request.isSuperAdmin) {
                const viewerId = request.user?.sub;
                const check = db.prepare('SELECT role FROM user_projects WHERE user_id = ? AND project_id = ?').get(viewerId, project_id) as any;
                if (check?.role !== 'admin') {
                    return reply.code(403).send({ error: 'You are not an admin of this project' });
                }
            }

            db.prepare(`
                INSERT INTO user_projects (user_id, project_id, role)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, project_id) DO UPDATE SET role = excluded.role
            `).run(user_id, project_id, role || 'editor');
            return { success: true };
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to assign user to project' });
        }
    });

    // Remove user from project
    fastify.delete<{ Params: { user_id: string, project_id: string } }>('/admin/user-projects/:user_id/:project_id', async (request: any, reply: any) => {
        try {
            // Check TenantAdmin permissions
            if (!request.isSuperAdmin) {
                const viewerId = request.user?.sub;
                const check = db.prepare('SELECT role FROM user_projects WHERE user_id = ? AND project_id = ?').get(viewerId, request.params.project_id) as any;
                if (check?.role !== 'admin') {
                    return reply.code(403).send({ error: 'You are not an admin of this project' });
                }
            }

            db.prepare('DELETE FROM user_projects WHERE user_id = ? AND project_id = ?').run(request.params.user_id, request.params.project_id);
            return { success: true };
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to unassign user' });
        }
    });
    // Create User (Keycloak + Local)
    fastify.post<{ Body: { username: string, email: string, password?: string, firstName?: string, lastName?: string } }>('/admin/users', async (request: any, reply: any) => {
        try {
            const kc = await getKcAdminClient();
            const payload = request.body;

            const kcUser = await kc.users.create({
                username: payload.username,
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
                enabled: true,
                credentials: [{
                    type: 'password',
                    value: payload.password || 'temp123!',
                    temporary: false
                }],
                // Optionally assign them the user role, but for GTFS we just need them to exist
            });

            const userId = kcUser.id;

            db.prepare(`
                INSERT INTO users (id, username, email)
                VALUES (?, ?, ?)
            `).run(userId, payload.username, payload.email);

            return { success: true, id: userId };
        } catch (error: any) {
            console.error('Failed to create user:', error.response?.data || error.message);
            return reply.code(500).send({ error: error.response?.data?.errorMessage || 'Failed to create user' });
        }
    });

    // Update User
    fastify.put<{ Params: { id: string }, Body: { username: string, email: string, firstName?: string, lastName?: string, password?: string } }>('/admin/users/:id', async (request: any, reply: any) => {
        try {
            const id = request.params.id;

            // TenantAdmins can only update users that share at least one project with them where the TenantAdmin is an admin
            if (!request.isSuperAdmin) {
                const viewerId = request.user?.sub;
                const sharedProjects = db.prepare(`
                    SELECT 1 FROM user_projects viewer_up
                    JOIN user_projects target_up ON viewer_up.project_id = target_up.project_id
                    WHERE viewer_up.user_id = ? AND viewer_up.role = 'admin' AND target_up.user_id = ?
                `).get(viewerId, id);

                if (!sharedProjects) {
                    return reply.code(403).send({ error: 'You do not have permission to manage this user' });
                }
            }

            const kc = await getKcAdminClient();
            const payload = request.body;

            await kc.users.update({ id }, {
                username: payload.username,
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
            });

            if (payload.password) {
                // Keycloak reset password API expects credential payload
                await kc.users.resetPassword({
                    id,
                    credential: {
                        type: 'password',
                        value: payload.password,
                        temporary: false
                    }
                });
            }

            db.prepare('UPDATE users SET username = ?, email = ? WHERE id = ?').run(payload.username, payload.email, id);

            return { success: true };
        } catch (error: any) {
            console.error('Failed to update user:', error.response?.data || error.message);
            return reply.code(500).send({ error: error.response?.data?.errorMessage || 'Failed to update user' });
        }
    });

    // Delete User
    fastify.delete<{ Params: { id: string } }>('/admin/users/:id', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) {
            return reply.code(403).send({ error: 'Only SuperAdmin can fully delete users. Remove them from your project instead.' });
        }
        try {
            const kc = await getKcAdminClient();
            const id = request.params.id;

            const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as any;
            if (user?.username === 'admin') {
                return reply.code(400).send({ error: 'Cannot delete the builtin admin account' });
            }

            await kc.users.del({ id });
            db.prepare('DELETE FROM users WHERE id = ?').run(id);

            return { success: true };
        } catch (error: any) {
            console.error('Failed to delete user:', error.response?.data || error.message);
            return reply.code(500).send({ error: error.response?.data?.errorMessage || 'Failed to delete user' });
        }
    });
}
