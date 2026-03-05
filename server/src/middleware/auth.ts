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

        // Check if user has the global 'admin' role from Keycloak
        const roles = decoded.realm_access?.roles || decoded.roles || [];
        request.isSuperAdmin = roles.includes('admin');

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

        // Validate that this user has access to this project
        const accessCheck = db.prepare('SELECT role FROM user_projects WHERE user_id = ? AND project_id = ?').get(userId, projectId) as { role: string } | undefined;

        if (!accessCheck) {
            return reply.code(403).send({ error: 'User does not have access to this project' });
        }

        request.projectId = projectId;
        request.isAdmin = accessCheck.role === 'admin';

    } catch (err: any) {
        request.log.warn(`Authentication failed: ${err.message}`);
        return reply.code(401).send({ error: 'Invalid or expired token' });
    }
};
