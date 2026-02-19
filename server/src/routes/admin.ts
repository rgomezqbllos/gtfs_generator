import { FastifyInstance } from 'fastify';
import db from '../db';

export default async function adminRoutes(fastify: FastifyInstance) {

    // RESET DATABASE
    fastify.post('/admin/reset', async (request, reply) => {
        try {
            console.log('Starting full database reset...');
            const startTime = Date.now();

            // Perform deletion in a single transaction for atomicity and speed
            db.transaction(() => {
                // Disable foreign keys temporarily for faster bulk deletion
                db.pragma('foreign_keys = OFF');

                // Delete all data from all tables
                const tables = [
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
                    db.prepare(`DELETE FROM ${table}`).run();
                }

                // Reset auto-increment sequences (only if the table exists)
                // We use try/catch because sqlite_sequence only exists if at least 
                // one table has used AUTOINCREMENT.
                try {
                    db.prepare("DELETE FROM sqlite_sequence").run();
                } catch (e) {
                    // Ignore error if table doesn't exist
                }

                // Re-enable foreign keys
                db.pragma('foreign_keys = ON');
            })();

            // VACUUM must be run outside of a transaction
            // It reclaims unused space and defragments the database file
            console.log('Reclaiming disk space (VACUUM)...');
            db.pragma('vacuum');

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`Database reset completed successfully in ${duration}s`);

            return {
                message: 'Database reset successful',
                duration: `${duration}s`
            };
        } catch (error) {
            console.error('Reset failed:', error);
            return reply.code(500).send({ error: 'Failed to reset database' });
        }
    });
}
