import { FastifyInstance } from 'fastify';
import db from '../db';

export default async function adminRoutes(fastify: FastifyInstance) {

    // RESET DATABASE
    fastify.post('/admin/reset', async (request, reply) => {
        try {
            const resetTransaction = db.transaction(() => {
                // Delete in order of dependencies
                db.prepare('DELETE FROM stop_times').run();
                db.prepare('DELETE FROM trips').run();
                db.prepare('DELETE FROM shapes').run();
                db.prepare('DELETE FROM segments').run();
                db.prepare('DELETE FROM routes').run();
                db.prepare('DELETE FROM stops').run();
                // Calendar and Agency might be preserved or reset? User said "restore entire database to avoid garbage"
                // Let's clear calendar too. Agency usually is static but let's assume we keep Agency for config? 
                // "arrancar un proyecto desde cero" -> usually keeps agency info but clears operational data.
                db.prepare('DELETE FROM calendar').run();
                // Also clear agencies as users can create them
                db.prepare('DELETE FROM agency').run();
            });

            resetTransaction();
            return { message: 'Database reset successful' };
        } catch (error) {
            console.error('Reset failed', error);
            return reply.code(500).send({ error: 'Failed to reset database' });
        }
    });
}
