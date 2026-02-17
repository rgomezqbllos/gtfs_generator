import { FastifyInstance } from 'fastify';
import db from '../db';
import { v4 as uuidv4 } from 'uuid';

interface AgencyBody {
    agency_id?: string;
    agency_name: string;
    agency_url: string;
    agency_timezone: string;
    agency_lang?: string;
    agency_phone?: string;
    agency_email?: string;
}

export default async function agencyRoutes(fastify: FastifyInstance) {

    // GET All Agencies
    fastify.get('/agency', async (request, reply) => {
        try {
            const agencies = db.prepare('SELECT * FROM agency').all();
            if (agencies.length === 0) {
                // Return empty array, frontend should handle "Create your first agency"
                return [];
            }
            return agencies;
        } catch (err) {
            console.error(err);
            return reply.code(500).send({ error: 'Failed to fetch agencies' });
        }
    });

    // POST Create Agency
    fastify.post('/agency', async (request, reply) => {
        const body = request.body as AgencyBody;
        const { agency_name, agency_url, agency_timezone, agency_lang, agency_phone, agency_email } = body;

        // Auto-generate ID if not provided (though GTFS usually likes standard IDs, UUID is safe for internal)
        const agency_id = body.agency_id || uuidv4();

        try {
            const stmt = db.prepare(`
                INSERT INTO agency (agency_id, agency_name, agency_url, agency_timezone, agency_lang, agency_phone, agency_email)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(agency_id, agency_name, agency_url, agency_timezone, agency_lang || null, agency_phone || null, agency_email || null);

            return { success: true, agency_id, ...body };
        } catch (err) {
            console.error(err);
            return reply.code(500).send({ error: 'Failed to create agency' });
        }
    });

    // PUT Update Agency
    fastify.put('/agency/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = request.body as AgencyBody;
        const { agency_name, agency_url, agency_timezone, agency_lang, agency_phone, agency_email } = body;

        try {
            const stmt = db.prepare(`
                UPDATE agency 
                SET agency_name = ?, agency_url = ?, agency_timezone = ?, agency_lang = ?, agency_phone = ?, agency_email = ?
                WHERE agency_id = ?
            `);

            const info = stmt.run(agency_name, agency_url, agency_timezone, agency_lang || null, agency_phone || null, agency_email || null, id);

            if (info.changes === 0) {
                return reply.code(404).send({ error: 'Agency not found' });
            }

            return { success: true };
        } catch (err) {
            console.error(err);
            return reply.code(500).send({ error: 'Failed to update agency' });
        }
    });

    // DELETE Agency
    fastify.delete('/agency/:id', async (request, reply) => {
        const { id } = request.params as { id: string };

        try {
            // Check for dependencies (routes)
            const routesCount = db.prepare('SELECT COUNT(*) as count FROM routes WHERE agency_id = ?').get(id) as { count: number };

            if (routesCount.count > 0) {
                return reply.code(400).send({ error: `Cannot delete agency. It is used by ${routesCount.count} routes.` });
            }

            const stmt = db.prepare('DELETE FROM agency WHERE agency_id = ?');
            const info = stmt.run(id);

            if (info.changes === 0) {
                return reply.code(404).send({ error: 'Agency not found' });
            }

            return { success: true };
        } catch (err) {
            console.error(err);
            return reply.code(500).send({ error: 'Failed to delete agency' });
        }
    });
}
