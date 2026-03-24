import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { initDB } from './db';
import stopsRoutes from './routes/stops';
import segmentsRoutes from './routes/segments';
import routesRoutes from './routes/routes';
import adminRoutes from './routes/admin';
import exportRoutes from './routes/export';
import calendarRoutes from './routes/calendar';
import tripsRoutes from './routes/trips';
import agencyRoutes from './routes/agency';
import mapsRoutes from './routes/maps';
import importRoutes from './routes/import';
import projectsRoutes from './routes/projects';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import path from 'path';
import { authenticate } from './middleware/auth';

const server = Fastify({
    logger: true
});

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : true; // Allow all only when ALLOWED_ORIGINS is not set (dev fallback)

server.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Id'],
    exposedHeaders: ['Content-Disposition']
});

server.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1']
});

// Register Multipart for file uploads (1GB limit for maps)
server.register(fastifyMultipart, {
    limits: {
        fileSize: 1024 * 1024 * 1024 // 1GB (1024MB)
    }
});

// Serve static files (Frontend)
const DIST_PATH = path.join(__dirname, '../../client/dist');
console.log('Serving static files from:', DIST_PATH);

// Serve static files (Frontend)
server.register(fastifyStatic, {
    root: DIST_PATH,
    prefix: '/', // optional: default '/'
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
});

// IMPORTANT: Catch-all for SPA (return index.html for non-API routes)
server.setNotFoundHandler(async (request, reply) => {
    if (request.raw.url && request.raw.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'API endpoint not found' });
    }
    return reply.sendFile('index.html');
});

// Protect all /api endpoints
server.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/api')) {
        // Exclude /api/ping or auth-related webhooks if needed
        if (request.url === '/api/ping') return;
        return authenticate(request, reply);
    }
});

server.register(stopsRoutes, { prefix: '/api' });
server.register(segmentsRoutes, { prefix: '/api' });
server.register(routesRoutes, { prefix: '/api' });
server.register(adminRoutes, { prefix: '/api' });
server.register(exportRoutes, { prefix: '/api' });
server.register(calendarRoutes, { prefix: '/api' });
server.register(tripsRoutes, { prefix: '/api' });
server.register(agencyRoutes, { prefix: '/api' });
server.register(mapsRoutes, { prefix: '/api' });
server.register(importRoutes, { prefix: '/api' });
server.register(projectsRoutes, { prefix: '/api' });

// Initialize DB
try {
    initDB();
} catch (err) {
    server.log.error(err);
    process.exit(1);
}

server.get('/ping', async (request, reply) => {
    return { pong: 'it works!' };
});

const start = async () => {
    try {
        const port = Number(process.env.PORT) || 3001;
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`Server running at http://localhost:${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
