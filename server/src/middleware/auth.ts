import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { db } from '../db';

// Keycloak setup
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'gtfs';

const client = jwksClient({
    jwksUri: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err || !key) {
            callback(err || new Error('Unable to find signing key'));
            return;
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

// Attach user and project to the Fastify request interface
declare module 'fastify' {
    interface FastifyRequest {
        user?: jwt.JwtPayload | string;
        projectId?: string;
        isAdmin?: boolean;
        isSuperAdmin?: boolean;
    }
}

export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
        }

        const token = authHeader.split(' ')[1];

        // Provide a wrapper for jwt.verify to use async/await
        const decoded = await new Promise<any>((resolve, reject) => {
            jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
                if (err) return reject(err);
                resolve(decoded);
            });
        });

        request.user = decoded;
        const userId = decoded.sub;
        const username = decoded.preferred_username || '';
        const email = decoded.email || '';

        const mergeDuplicateUser = (existingId: string, incomingId: string) => {
            if (!existingId || existingId === incomingId) return;
            db.transaction(() => {
                const projects = db.prepare('SELECT project_id, role FROM user_projects WHERE user_id = ?').all(existingId) as { project_id: string; role: string }[];
                for (const project of projects) {
                    db.prepare(`
                        INSERT INTO user_projects (user_id, project_id, role)
                        VALUES (?, ?, ?)
                        ON CONFLICT(user_id, project_id) DO UPDATE SET role = excluded.role
                    `).run(incomingId, project.project_id, project.role || 'editor');
                }
                db.prepare('DELETE FROM user_projects WHERE user_id = ?').run(existingId);
                db.prepare('DELETE FROM users WHERE id = ?').run(existingId);
            })();
            request.log.warn(`Merged duplicate user ${existingId} into ${incomingId} for username=${username || 'unknown'}`);
        };

        // Check if user has the global 'admin' role from Keycloak
        const realmRoles = decoded.realm_access?.roles || [];
        const tokenRoles = decoded.roles || [];
        const resourceAccess = decoded.resource_access || {};
        const clientId = decoded.azp || process.env.KEYCLOAK_CLIENT_ID || 'gtfs-client';
        const clientRoles = resourceAccess?.[clientId]?.roles || [];
        const realmMgmtRoles = resourceAccess?.['realm-management']?.roles || [];
        const allRoles = new Set<string>([
            ...realmRoles,
            ...tokenRoles,
            ...clientRoles,
            ...realmMgmtRoles,
        ]);
        const superAdminUsername = process.env.KEYCLOAK_ADMIN || 'superadmin';
        request.isSuperAdmin =
            allRoles.has('admin') ||
            decoded.preferred_username === superAdminUsername;

        // Deduplicate user entries when Keycloak user IDs change (e.g., realm re-import).
        // Prefer username match; fall back to email if username is empty.
        if (username) {
            const existingByUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: string } | undefined;
            if (existingByUsername && existingByUsername.id !== userId) {
                mergeDuplicateUser(existingByUsername.id, userId);
            }
        } else if (email) {
            const existingByEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
            if (existingByEmail && existingByEmail.id !== userId) {
                mergeDuplicateUser(existingByEmail.id, userId);
            }
        }

        // Sync user to local DB
        db.prepare(`
            INSERT INTO users (id, username, email, last_login)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET 
                last_login = CURRENT_TIMESTAMP, 
                username = excluded.username, 
                email = excluded.email
        `).run(userId, username, email);

        // Extract Project ID from headers (client sends this after selecting a project)
        const projectIdHeader = request.headers['x-project-id'];

        // If it's a request to an endpoint that doesn't need a project (like /projects or /admin), allow it
        if (!projectIdHeader) {
            // Check if user is an admin overall via keycloak roles or DB (for now allow empty project just for global reads)
            return;
        }

        const projectId = Array.isArray(projectIdHeader) ? projectIdHeader[0] : projectIdHeader;
        request.projectId = projectId;

        // SuperAdmins always have access to all projects
        if (request.isSuperAdmin) {
            request.isAdmin = true;
            return;
        }

        // Validate that this user has access to this project
        const accessCheck = db.prepare('SELECT role FROM user_projects WHERE user_id = ? AND project_id = ?').get(userId, projectId) as { role: string } | undefined;

        if (!accessCheck) {
            return reply.code(403).send({ error: 'User does not have access to this project' });
        }

        request.isAdmin = accessCheck.role === 'admin';

    } catch (err: any) {
        request.log.warn(`Authentication failed: ${err.message}`);
        return reply.code(401).send({ error: 'Invalid or expired token' });
    }
};
