
import { FastifyInstance } from 'fastify';
import osrmService from '../services/OsrmService';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

export default async function mapsRoutes(fastify: FastifyInstance) {

    fastify.get('/maps', async (request, reply) => {
        try {
            const maps = osrmService.getAvailableRegions();
            return maps;
        } catch (error) {
            console.error(error);
            return reply.code(500).send({ error: 'Failed to list maps' });
        }
    });

    fastify.get('/maps/status', async (request, reply) => {
        return osrmService.getStatus();
    });

    fastify.post('/maps/status/clear', async (request, reply) => {
        return osrmService.clearError();
    });

    fastify.post<{ Body: { region: string; customUrl?: string; customName?: string } }>('/maps/download', async (request, reply) => {
        const { region, customUrl, customName } = request.body;

        // For custom maps, region might be empty or 'custom', but customUrl is required
        if (!region && !customUrl) return reply.code(400).send({ error: 'Region or Custom URL is required' });

        try {
            const result = await osrmService.downloadMap(region, true);
            return result;
        } catch (error) {
            console.error(error);
            return reply.code(500).send({ error: error instanceof Error ? error.message : 'Download failed' });
        }
    });

    fastify.post<{ Body: { region: string } }>('/maps/activate', async (request, reply) => {
        const { region } = request.body;

        if (!region) return reply.code(400).send({ error: 'Region is required' });

        try {
            const result = await osrmService.activateMap(region);
            return result;
        } catch (error) {
            console.error(error);
            return reply.code(500).send({ error: error instanceof Error ? error.message : 'Activation failed' });
        }
    });

    fastify.post('/maps/cancel', async (request, reply) => {
        try {
            const result = await osrmService.cancelProcess();
            return result;
        } catch (error) {
            console.error(error);
            return reply.code(500).send({ error: 'Failed to cancel process' });
        }
    });

    fastify.post('/maps/upload', async (request, reply) => {
        try {
            const data = await request.file();
            if (!data) return reply.code(400).send({ error: 'No file uploaded' });

            if (!data.filename.endsWith('.osm.pbf')) {
                return reply.code(400).send({ error: 'File must end with .osm.pbf' });
            }

            const dataDir = osrmService.getDataDir();
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const destPath = path.join(dataDir, data.filename);

            // Pipe the stream to the file
            await pipeline(data.file, fs.createWriteStream(destPath));

            return { message: 'File uploaded successfully', filename: data.filename };
        } catch (error) {
            console.error('Upload Error:', error);
            return reply.code(500).send({ error: 'Failed to upload map file' });
        }
    });

    fastify.delete<{ Params: { region: string } }>('/maps/:region', async (request, reply) => {
        const { region } = request.params;
        try {
            const result = await osrmService.deleteMap(region);
            return result;
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to delete map' });
        }
    });
}
