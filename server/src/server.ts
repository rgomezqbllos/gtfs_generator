import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
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
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import path from 'path';

const server = Fastify({
    logger: true
});

server.register(cors, {
    origin: '*', // Allow all origins for dev
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition']
});

// Register Multipart for file uploads (50MB limit)
server.register(fastifyMultipart, {
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    }
});

// Serve static files (Frontend)
const DIST_PATH = path.join(__dirname, '../../client/dist');
console.log('Serving static files from:', DIST_PATH);

// Serve static files (Frontend)
server.register(fastifyStatic, {
    root: DIST_PATH,
    prefix: '/', // optional: default '/'
});

// IMPORTANT: Catch-all for SPA (return index.html for non-API routes)
server.setNotFoundHandler(async (request, reply) => {
    if (request.raw.url && request.raw.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'API endpoint not found' });
    }
    return reply.sendFile('index.html');
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
