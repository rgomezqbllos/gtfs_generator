import { FastifyInstance } from 'fastify';
import db, { closeDB, reconnectDB, initDB, getDbPath } from '../db';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { randomUUID as uuidv4 } from 'crypto';
import os from 'os';
import { pipeline } from 'stream/promises';
import KcAdminClient from '@keycloak/keycloak-admin-client';
import OsrmService from '../services/OsrmService';
import { resolveProjectRouting } from '../services/ProjectRoutingService';
import { sanitizeFileName } from '../services/osrm/security';

let kcAdminClient: KcAdminClient | null = null;
async function getKcAdminClient() {
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
    const keycloakAdminClientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'gtfs-admin';
    const keycloakAdminClientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || 'gtfs-admin-secret-key-do-not-share';

    if (!kcAdminClient) {
        kcAdminClient = new KcAdminClient({
            baseUrl: keycloakUrl,
            realmName: 'gtfs'
        });
    }

    // Re-authenticate on every use to avoid stale/expired admin tokens.
    try {
        await kcAdminClient.auth({
            clientId: keycloakAdminClientId,
            clientSecret: keycloakAdminClientSecret,
            grantType: 'client_credentials'
        });
    } catch (err) {
        kcAdminClient = null; // Reset so next call retries auth
        throw err;
    }

    return kcAdminClient;
}

/**
 * Extract a human-readable error message from Keycloak admin client errors.
 * v26+ uses fetch internally (not axios), so error shapes differ:
 *   - v26+: error.responseData?.errorMessage, error.response?.status
 *   - legacy: error.response?.data?.errorMessage, error.response?.status
 */
function extractKcError(error: any): { status: number; message: string } {
    // v26+ fetch-based error shape
    const status =
        error?.response?.status ||
        error?.status ||
        error?.responseData?.statusCode ||
        0;

    const message =
        // v26+ keycloak-admin-client (fetch-based)
        error?.responseData?.errorMessage ||
        error?.responseData?.error_description ||
        error?.responseData?.error ||
        // Legacy (axios-based)
        error?.response?.data?.errorMessage ||
        error?.response?.data?.error_description ||
        error?.response?.data?.error ||
        // Generic
        error?.message ||
        'Unknown Keycloak error';

    return { status, message };
}

function getKeycloakConfig() {
    return {
        keycloakUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
        realm: process.env.KEYCLOAK_REALM || 'gtfs',
        clientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'gtfs-admin',
        clientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || 'gtfs-admin-secret-key-do-not-share',
    };
}

async function getServiceAccountToken() {
    const { keycloakUrl, realm, clientId, clientSecret } = getKeycloakConfig();
    const tokenRes = await fetch(
        `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
            }),
        }
    );

    if (!tokenRes.ok) {
        const body = await tokenRes.text();
        throw new Error(`Keycloak auth failed (${tokenRes.status}): ${body}. Verifica que el client '${clientId}' exista en el realm '${realm}' con Service Account habilitado y el secret sea correcto.`);
    }

    const json = (await tokenRes.json()) as { access_token?: string };
    if (!json.access_token) throw new Error('Keycloak auth failed: access_token no recibido');
    return json.access_token;
}

async function getMasterAdminToken() {
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
    const username = process.env.KEYCLOAK_ADMIN;
    const password = process.env.KEYCLOAK_ADMIN_PASSWORD;

    if (!username || !password) {
        throw new Error('Faltan KEYCLOAK_ADMIN y/o KEYCLOAK_ADMIN_PASSWORD para autocorregir permisos del Service Account');
    }

    const tokenRes = await fetch(
        `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'password',
                client_id: 'admin-cli',
                username,
                password,
            }),
        }
    );

    if (!tokenRes.ok) {
        const body = await tokenRes.text();
        throw new Error(`No se pudo autenticar con admin-cli en master realm (${tokenRes.status}): ${body}`);
    }

    const json = (await tokenRes.json()) as { access_token?: string };
    if (!json.access_token) throw new Error('No se recibió token admin para autocorrección de permisos');
    return json.access_token;
}

async function ensureAdminClientManageUsersRole() {
    const { keycloakUrl, realm, clientId } = getKeycloakConfig();
    const adminToken = await getMasterAdminToken();

    const clientSearchRes = await fetch(
        `${keycloakUrl}/admin/realms/${realm}/clients?clientId=${encodeURIComponent(clientId)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!clientSearchRes.ok) {
        const body = await clientSearchRes.text();
        throw new Error(`No se pudo consultar el client '${clientId}' (${clientSearchRes.status}): ${body}`);
    }

    const clients = (await clientSearchRes.json()) as any[];
    const targetClient = clients[0];
    if (!targetClient?.id) throw new Error(`No existe el client '${clientId}' en el realm '${realm}'`);

    const saRes = await fetch(
        `${keycloakUrl}/admin/realms/${realm}/clients/${targetClient.id}/service-account-user`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!saRes.ok) {
        const body = await saRes.text();
        throw new Error(`No se pudo obtener el service account de '${clientId}' (${saRes.status}): ${body}`);
    }
    const serviceAccountUser = (await saRes.json()) as { id?: string };
    if (!serviceAccountUser.id) throw new Error(`No se encontró service account user para '${clientId}'`);

    const rmRes = await fetch(
        `${keycloakUrl}/admin/realms/${realm}/clients?clientId=realm-management`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!rmRes.ok) {
        const body = await rmRes.text();
        throw new Error(`No se pudo consultar realm-management (${rmRes.status}): ${body}`);
    }
    const rmClients = (await rmRes.json()) as any[];
    const realmManagement = rmClients[0];
    if (!realmManagement?.id) throw new Error(`No se encontró client 'realm-management' en realm '${realm}'`);

    const roleNames = ['manage-users', 'view-users'];
    const rolesToAssign: any[] = [];
    for (const roleName of roleNames) {
        const roleRes = await fetch(
            `${keycloakUrl}/admin/realms/${realm}/clients/${realmManagement.id}/roles/${roleName}`,
            { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        if (!roleRes.ok) {
            const body = await roleRes.text();
            throw new Error(`No se pudo leer rol '${roleName}' de realm-management (${roleRes.status}): ${body}`);
        }
        rolesToAssign.push(await roleRes.json());
    }

    const assignRes = await fetch(
        `${keycloakUrl}/admin/realms/${realm}/users/${serviceAccountUser.id}/role-mappings/clients/${realmManagement.id}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify(rolesToAssign),
        }
    );
    if (!assignRes.ok) {
        const body = await assignRes.text();
        throw new Error(`No se pudo asignar roles al service account '${clientId}' (${assignRes.status}): ${body}`);
    }
}

/**
 * Fallback: create a Keycloak user via direct REST API call.
 * Used when @keycloak/keycloak-admin-client fails (e.g., permission issues).
 */
async function createKeycloakUserDirect(payload: {
    username: string;
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
}, hasRetriedPermissionFix = false): Promise<{ id: string }> {
    const { keycloakUrl, realm, clientId } = getKeycloakConfig();
    const access_token = await getServiceAccountToken();

    // 2. Create user
    const userPayload: any = {
        username: payload.username,
        email: payload.email,
        firstName: payload.firstName || '',
        lastName: payload.lastName || '',
        enabled: true,
        credentials: [{
            type: 'password',
            value: payload.password || 'temp123!',
            temporary: false,
        }],
    };

    const createRes = await fetch(
        `${keycloakUrl}/admin/realms/${realm}/users`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${access_token}`,
            },
            body: JSON.stringify(userPayload),
        }
    );

    if (createRes.status === 409) {
        // User already exists — find by username
        const searchRes = await fetch(
            `${keycloakUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(payload.username)}&exact=true`,
            { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (searchRes.ok) {
            const users = (await searchRes.json()) as any[];
            if (users.length > 0) return { id: users[0].id };
        }
        // Fallback: search by email
        const searchByEmail = await fetch(
            `${keycloakUrl}/admin/realms/${realm}/users?email=${encodeURIComponent(payload.email)}&exact=true`,
            { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (searchByEmail.ok) {
            const users = (await searchByEmail.json()) as any[];
            if (users.length > 0) return { id: users[0].id };
        }
        throw new Error('El usuario ya existe en Keycloak pero no se pudo localizar');
    }

    if (createRes.status === 403) {
        if (!hasRetriedPermissionFix) {
            await ensureAdminClientManageUsersRole();
            return createKeycloakUserDirect(payload, true);
        }
        throw new Error(
            `Keycloak rechazó la creación del usuario (403 Forbidden). ` +
            `El Service Account del client '${clientId}' necesita el rol 'manage-users' de 'realm-management'. ` +
            `Ve a Keycloak Admin → Clients → ${clientId} → Service Account Roles → Assign role → realm-management → manage-users.`
        );
    }

    if (!createRes.ok) {
        const body = await createRes.text();
        let detail = body;
        try { detail = JSON.parse(body)?.errorMessage || body; } catch {}
        throw new Error(`Error al crear usuario en Keycloak (${createRes.status}): ${detail}`);
    }

    // Extract user ID from Location header
    const location = createRes.headers.get('Location') || '';
    const userId = location.split('/').pop();
    if (!userId) {
        // Fallback: search by username
        const searchRes = await fetch(
            `${keycloakUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(payload.username)}&exact=true`,
            { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (searchRes.ok) {
            const users = (await searchRes.json()) as any[];
            if (users.length > 0) return { id: users[0].id };
        }
        throw new Error('Usuario creado pero no se pudo obtener su ID');
    }

    return { id: userId };
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

function allocateUploadedPbfName(dataDir: string, originalName: string): { filename: string; fullPath: string } {
    const safeName = sanitizeFileName(path.basename(originalName));
    if (!safeName.toLowerCase().endsWith('.osm.pbf')) {
        throw new Error('El archivo debe terminar en .osm.pbf');
    }

    const ext = '.osm.pbf';
    const base = safeName.slice(0, -ext.length);
    let candidate = safeName;
    let counter = 1;
    while (fs.existsSync(path.join(dataDir, candidate))) {
        candidate = `${base}-${counter}${ext}`;
        counter += 1;
    }

    return { filename: candidate, fullPath: path.join(dataDir, candidate) };
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

    // Proxy to fetch Geofabrik Index avoiding CORS issues
    fastify.get('/admin/geofabrik', async (request: any, reply: any) => {
        try {
            const fetch = (await import('node-fetch')).default;
            const res = await fetch('https://download.geofabrik.de/index-v1.json');
            const data = await res.json();
            return data;
        } catch (error) {
            console.error('Failed to proxy geofabrik list:', error);
            return reply.code(500).send({ error: 'Failed to fetch geofabrik list' });
        }
    });

    // ==========================================
    // MULTI-TENANT ADMIN ENDPOINTS (PROJECTS & USERS)
    // ==========================================

    // List all projects
    fastify.get('/admin/projects', async (request: any, reply: any) => {
        try {
            let rawProjects: any[];
            if (request.isSuperAdmin) {
                rawProjects = db.prepare(`
                    SELECT p.*, m.name AS map_name, m.status AS map_status
                    FROM projects p
                    LEFT JOIN map_instances m ON m.id = p.map_instance_id
                `).all();
            } else {
                const userId = request.user?.sub;
                rawProjects = db.prepare(`
                    SELECT p.*, m.name AS map_name, m.status AS map_status
                    FROM projects p
                    JOIN user_projects up ON p.id = up.project_id
                    LEFT JOIN map_instances m ON m.id = p.map_instance_id
                    WHERE up.user_id = ? AND up.role = 'admin'
                `).all(userId);
            }

            return Promise.all(rawProjects.map(async (project) => {
                const routing = await resolveProjectRouting(project.id);
                return {
                    ...project,
                    routing_engine_url: routing.routingUrl,
                    map_status: routing.map?.status || project.map_status || null,
                    map_base_port: routing.map?.base_port || null
                };
            }));
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to fetch projects' });
        }
    });

    // Create a new project
    fastify.post<{ Body: { name: string, description: string, map_center_lat?: number, map_center_lon?: number, routing_engine_url?: string, region_id?: string, region_url?: string, map_instance_id?: string } }>('/admin/projects', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) {
            return reply.code(403).send({ error: 'Only SuperAdmin can create projects' });
        }
        try {
            const id = uuidv4();
            const p = request.body;

            let routing_engine_url = p.routing_engine_url || null;

            let port = 5000;

            if (p.region_url && !routing_engine_url) {
                // Autogenerate OSRM port and URL
                const maxPortReq = db.prepare(`SELECT routing_engine_url FROM projects WHERE routing_engine_url IS NOT NULL`).all() as any[];
                let highestPort = 5000;
                for (const row of maxPortReq) {
                    if (!row.routing_engine_url) continue;
                    const match = row.routing_engine_url.match(/:(\d+)\//);
                    if (match) {
                        const portFound = parseInt(match[1]);
                        if (portFound > highestPort) highestPort = portFound;
                    }
                }
                // Use a gap to account for multi-profile ports (mixed, exclusive, trunk)
                port = highestPort + 10;
                routing_engine_url = OsrmService.buildRoutingUrl(port);
            }

            const extractNumber = (val: any, isLat: boolean): number | null => {
                if (typeof val === 'number') return val;
                if (Array.isArray(val)) {
                    if (typeof val[0] === 'number') {
                        return isLat ? (typeof val[1] === 'number' ? val[1] : val[0]) : val[0];
                    }
                    return extractNumber(val[0], isLat);
                }
                return null;
            };

            const payload = {
                id,
                name: p.name,
                description: p.description || null,
                map_center_lat: extractNumber(p.map_center_lat, true),
                map_center_lon: extractNumber(p.map_center_lon, false),
                routing_engine_url,
                map_instance_id: p.map_instance_id || null
            };

            db.prepare(`
                INSERT INTO projects (id, name, description, map_center_lat, map_center_lon, routing_engine_url, map_instance_id)
                VALUES (@id, @name, @description, @map_center_lat, @map_center_lon, @routing_engine_url, @map_instance_id)
            `).run(payload);

            const routing = await resolveProjectRouting(id);
            return {
                id,
                ...p,
                routing_engine_url: routing.routingUrl,
                map_status: routing.map?.status || null,
                map_base_port: routing.map?.base_port || null
            };
        } catch (error) {
            console.error('Failed to create project:', error);
            return reply.code(500).send({ error: 'Failed to create project' });
        }
    });

    // Delete a project
    fastify.delete<{ Params: { id: string } }>('/admin/projects/:id', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) {
            return reply.code(403).send({ error: 'Only SuperAdmin can delete projects' });
        }
        try {
            const projectId = request.params.id;
            db.transaction(() => {
                // Child tables that reference project_id
                db.prepare('DELETE FROM stop_times WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM shapes WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM trips WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM calendar WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM segment_time_slots WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM segments WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM routes WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM route_parkings WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM stops WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM user_projects WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
            })();
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
    // Create User (Keycloak + Local) — SuperAdmin only, can create admin or operations users
    fastify.post<{ Body: { username: string, email: string, password?: string, firstName?: string, lastName?: string, role?: string } }>('/admin/users', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Solo SuperAdmin puede crear usuarios' });

        const payload = request.body;
        if (!payload.username?.trim() || !payload.email?.trim()) {
            return reply.code(400).send({ error: 'Username y email son obligatorios' });
        }

        const userRole = payload.role === 'admin' ? 'admin' : 'operations';
        let userId: string;

        // Strategy 1: Try via keycloak-admin-client library
        try {
            const kc = await getKcAdminClient();
            try {
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
                });
                userId = kcUser.id;
            } catch (kcError: any) {
                const { status, message } = extractKcError(kcError);

                // User already exists — find and sync
                if (status === 409 || message?.toLowerCase().includes('exists')) {
                    console.log('User already exists in Keycloak, attempting to find and sync...');
                    const byUsername = await kc.users.find({ username: payload.username, exact: true });
                    if (byUsername.length > 0) {
                        userId = byUsername[0].id!;
                    } else {
                        const byEmail = await kc.users.find({ email: payload.email });
                        if (byEmail.length > 0) {
                            userId = byEmail[0].id!;
                        } else {
                            throw new Error('El usuario ya existe en Keycloak pero no se pudo localizar');
                        }
                    }
                } else if (status === 403) {
                    // Permission issue — fall through to direct REST API
                    throw kcError;
                } else {
                    throw new Error(message);
                }
            }

            // Assign realm role 'admin' if creating an admin user
            if (userRole === 'admin') {
                try {
                    const realmRoles = await kc.roles.find();
                    const adminRole = realmRoles.find((r: any) => r.name === 'admin');
                    if (adminRole) {
                        await kc.users.addRealmRoleMappings({
                            id: userId!,
                            roles: [{ id: adminRole.id!, name: 'admin' }],
                        });
                    }
                } catch (roleError: any) {
                    console.warn('Failed to assign admin role via library:', roleError.message);
                }
            }
        } catch (libraryError: any) {
            // Strategy 2: Fallback to direct Keycloak REST API
            const { status: kcStatus } = extractKcError(libraryError);
            console.warn(`keycloak-admin-client failed (status=${kcStatus}): ${libraryError.message}. Falling back to direct REST API...`);

            try {
                const result = await createKeycloakUserDirect(payload);
                userId = result.id;

                // Assign admin role via direct REST API if needed
                if (userRole === 'admin') {
                    try {
                        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
                        const realm = process.env.KEYCLOAK_REALM || 'gtfs';
                        const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'gtfs-admin';
                        const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || 'gtfs-admin-secret-key-do-not-share';

                        const tokenRes = await fetch(`${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
                        });
                        if (tokenRes.ok) {
                            const { access_token } = (await tokenRes.json()) as { access_token: string };
                            // Find admin role
                            const rolesRes = await fetch(`${keycloakUrl}/admin/realms/${realm}/roles`, {
                                headers: { Authorization: `Bearer ${access_token}` },
                            });
                            if (rolesRes.ok) {
                                const roles = (await rolesRes.json()) as any[];
                                const adminRole = roles.find((r: any) => r.name === 'admin');
                                if (adminRole) {
                                    await fetch(`${keycloakUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
                                        body: JSON.stringify([{ id: adminRole.id, name: 'admin' }]),
                                    });
                                }
                            }
                        }
                    } catch (roleError: any) {
                        console.warn('Failed to assign admin role via REST API:', roleError.message);
                    }
                }
            } catch (directError: any) {
                console.error('Direct Keycloak REST API also failed:', directError.message);
                return reply.code(500).send({ error: directError.message });
            }
        }

        // Save to local DB
        db.prepare(`
            INSERT INTO users (id, username, email)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                email = excluded.email
        `).run(userId!, payload.username, payload.email);

        return { success: true, id: userId!, role: userRole, message: `Usuario ${userRole} creado correctamente` };
    });

    // Maintenance: Sync Users from Keycloak
    fastify.post('/admin/maintenance/sync-auth', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });

        try {
            const kc = await getKcAdminClient();
            const kcUsers = await kc.users.find({ max: 500, first: 0 });

            console.log(`Syncing ${kcUsers.length} users from Keycloak to local DB...`);

            const stmt = db.prepare(`
                INSERT INTO users (id, username, email)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    username = excluded.username,
                    email = excluded.email
            `);

            const transaction = db.transaction((users) => {
                for (const u of users) {
                    stmt.run(u.id, u.username, u.email || '');
                }
            });

            transaction(kcUsers);

            return {
                success: true,
                count: kcUsers.length,
                message: `Se han sincronizado ${kcUsers.length} usuarios desde Keycloak.`
            };
        } catch (error: any) {
            console.error('Sync failed:', error);
            return reply.code(500).send({ error: 'Fallo al sincronizar usuarios' });
        }
    });

    // Get orphaned users (in DB but not in Keycloak)
    fastify.get('/admin/maintenance/orphaned-users', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });

        try {
            const kc = await getKcAdminClient();
            const kcUsers = await kc.users.find({ max: 500, first: 0 });
            const kcUserIds = new Set(kcUsers.map(u => u.id));

            // Find users in DB but not in Keycloak
            const dbUsers = db.prepare('SELECT id, username, email FROM users').all() as any[];
            const orphaned = dbUsers.filter(u => !kcUserIds.has(u.id));

            return {
                success: true,
                totalInDb: dbUsers.length,
                totalInKeycloak: kcUsers.length,
                orphanedCount: orphaned.length,
                orphaned: orphaned
            };
        } catch (error: any) {
            console.error('Check orphaned failed:', error);
            return reply.code(500).send({ error: 'Fallo al verificar usuarios huérfanos' });
        }
    });

    // Clean up orphaned users
    fastify.post('/admin/maintenance/cleanup-orphaned', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });

        try {
            const kc = await getKcAdminClient();
            const kcUsers = await kc.users.find({ max: 500, first: 0 });
            const kcUserIds = new Set(kcUsers.map(u => u.id));

            // Find orphaned users
            const dbUsers = db.prepare('SELECT id, username FROM users').all() as any[];
            const orphaned = dbUsers.filter(u => !kcUserIds.has(u.id));

            if (orphaned.length === 0) {
                return {
                    success: true,
                    cleaned: 0,
                    message: 'No hay usuarios huérfanos para limpiar'
                };
            }

            // Delete orphaned users in transaction
            const deletedUsers: string[] = [];
            db.transaction(() => {
                for (const user of orphaned) {
                    db.prepare('DELETE FROM user_projects WHERE user_id = ?').run(user.id);
                    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
                    deletedUsers.push(`${user.username} (${user.id})`);
                }
            })();

            console.log(`Cleaned up ${orphaned.length} orphaned users:`, deletedUsers);

            return {
                success: true,
                cleaned: orphaned.length,
                deletedUsers: deletedUsers,
                message: `Se eliminaron ${orphaned.length} usuarios huérfanos (en BD pero no en Keycloak)`
            };
        } catch (error: any) {
            console.error('Cleanup failed:', error);
            return reply.code(500).send({ error: 'Fallo al limpiar usuarios huérfanos' });
        }
    });

    // Update User
    fastify.put<{ Params: { id: string }, Body: { username: string, email: string, firstName?: string, lastName?: string, password?: string } }>('/admin/users/:id', async (request: any, reply: any) => {
        try {
            const id = request.params.id;
            const payload = request.body;

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(payload.email)) {
                return reply.code(400).send({ error: 'Email inválido' });
            }

            // TenantAdmins can only update users that share at least one project with them where the TenantAdmin is an admin
            if (!request.isSuperAdmin) {
                const viewerId = request.user?.sub;
                const sharedProjects = db.prepare(`
                    SELECT 1 FROM user_projects viewer_up
                    JOIN user_projects target_up ON viewer_up.project_id = target_up.project_id
                    WHERE viewer_up.user_id = ? AND viewer_up.role = 'admin' AND target_up.user_id = ?
                `).get(viewerId, id);

                if (!sharedProjects) {
                    return reply.code(403).send({ error: 'No tienes permisos para actualizar este usuario' });
                }
            }

            const kc = await getKcAdminClient();

            await kc.users.update({ id }, {
                username: payload.username,
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
            });

            if (payload.password) {
                // Validate password strength
                if (payload.password.length < 8) {
                    return reply.code(400).send({ error: 'La contraseña debe tener al menos 8 caracteres' });
                }
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

            return { success: true, message: 'Usuario actualizado correctamente' };
        } catch (error: any) {
            const { status: kcStatus, message: kcMsg } = extractKcError(error);
            console.error('Failed to update user:', kcMsg);

            if (kcStatus === 409 || kcMsg?.toLowerCase().includes('conflict')) {
                return reply.code(409).send({ error: 'Este email o username ya está en uso' });
            }
            if (kcMsg?.toLowerCase().includes('duplicate')) {
                return reply.code(409).send({ error: 'Este nombre de usuario ya existe' });
            }

            return reply.code(500).send({ error: kcMsg || 'Error al actualizar usuario' });
        }
    });

    // Delete User
    fastify.delete<{ Params: { id: string } }>('/admin/users/:id', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) {
            return reply.code(403).send({ error: 'Solo SuperAdmin puede eliminar usuarios. Usa "Remover de Proyecto" para gestionar acceso.' });
        }
        try {
            const kc = await getKcAdminClient();
            const id = request.params.id;

            const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as any;
            if (!user) {
                return reply.code(404).send({ error: 'Usuario no encontrado' });
            }

            if (user?.username === 'superadmin') {
                return reply.code(400).send({ error: 'La cuenta superadmin no puede ser eliminada' });
            }

            // Delete in transaction for consistency
            db.transaction(() => {
                // Remove user from all projects first
                db.prepare('DELETE FROM user_projects WHERE user_id = ?').run(id);
                // Then delete the user
                db.prepare('DELETE FROM users WHERE id = ?').run(id);
            })();

            await kc.users.del({ id });

            return { success: true, message: `Usuario ${user.username} eliminado correctamente` };
        } catch (error: any) {
            const { status: kcStatus, message: kcMsg } = extractKcError(error);
            console.error('Failed to delete user:', kcMsg);

            if (kcMsg?.includes('not found') || kcStatus === 404) {
                return reply.code(404).send({ error: 'Usuario no encontrado en Keycloak' });
            }

            return reply.code(500).send({ error: kcMsg || 'Error al eliminar usuario' });
        }
    });

    // ==========================================
    // MAP HUB ENDPOINTS
    // ==========================================

    fastify.get('/admin/maps', async () => {
        return OsrmService.getMaps();
    });

    fastify.post<{ Body: { name: string, url: string } }>('/admin/maps', async (request, reply) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });
        const MapRepository = (await import('../services/MapRepository')).default;
        const map = MapRepository.create(request.body.name, request.body.url);
        return map;
    });

    fastify.post('/admin/maps/upload', async (request: any, reply: any) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });

        let tempPath: string | null = null;
        let uploadStream: NodeJS.ReadableStream | null = null;
        try {
            const data = await request.file();
            if (!data) return reply.code(400).send({ error: 'No file uploaded' });
            uploadStream = data.file;

            const dataDir = OsrmService.getDataDir();
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const { filename, fullPath } = allocateUploadedPbfName(dataDir, data.filename);
            tempPath = `${fullPath}.uploading-${Date.now()}`;

            await pipeline(data.file, fs.createWriteStream(tempPath));

            const uploadedStats = fs.statSync(tempPath);
            if (uploadedStats.size <= 0) {
                throw new Error('Uploaded file is empty');
            }

            fs.renameSync(tempPath, fullPath);
            tempPath = null;

            const requestedName = typeof data.fields?.name?.value === 'string'
                ? data.fields.name.value.trim()
                : undefined;

            const map = OsrmService.registerUploadedMap(requestedName, filename);
            return { message: 'Map uploaded successfully', filename, map };
        } catch (error: any) {
            if (tempPath && fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
            }
            if (uploadStream) {
                try { uploadStream.resume(); } catch { /* ignore */ }
            }
            console.error('Admin map upload failed:', error);
            const message = error?.message || 'Failed to upload map file';
            const isValidation = typeof message === 'string' && (
                message.includes('.osm.pbf')
                || message.includes('empty')
                || message.includes('No file uploaded')
            );
            return reply.code(isValidation ? 400 : 500).send({ error: message });
        }
    });

    fastify.post<{ Params: { id: string } }>('/admin/maps/:id/download', async (request, reply) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });
        OsrmService.downloadMap(request.params.id).catch(e => console.error(e));
        return { message: 'Download started' };
    });

    fastify.post<{ Params: { id: string } }>('/admin/maps/:id/activate', async (request, reply) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });
        OsrmService.activateMap(request.params.id).catch(e => console.error(e));
        return { message: 'Activation started' };
    });

    fastify.delete<{ Params: { id: string } }>('/admin/maps/:id', async (request, reply) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });
        return OsrmService.deleteMap(request.params.id);
    });

    fastify.get('/admin/osrm/status', async () => {
        return OsrmService.getStatus();
    });

    fastify.post('/admin/osrm/cancel', async (request, reply) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });
        return OsrmService.cancelProcess();
    });

    fastify.post('/admin/osrm/cleanup', async (request, reply) => {
        if (!request.isSuperAdmin) return reply.code(403).send({ error: 'Forbidden' });
        return OsrmService.cleanupOrphanContainers();
    });

    // Initialize Predefined Regions
    (async () => {
        const MapRepository = (await import('../services/MapRepository')).default;
        await MapRepository.ensurePredefinedRegions();
    })().catch(e => console.error('Failed to init maps', e));
}
