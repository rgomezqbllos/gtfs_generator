
import { FastifyInstance } from 'fastify';
import osrmService from '../services/OsrmService';

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
            const result = await osrmService.downloadAndSetup(region, customUrl, customName, true);
            return result;
        } catch (error) {
            console.error(error);
            return reply.code(500).send({ error: error instanceof Error ? error.message : 'Download skipped' });
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
