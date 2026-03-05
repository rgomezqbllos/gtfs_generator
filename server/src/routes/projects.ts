import { FastifyInstance } from 'fastify';
import db from '../db';

export default async function projectsRoutes(fastify: FastifyInstance) {
    // Get projects the current logged-in user has access to
    fastify.get('/projects/my', async (request: any, reply: any) => {
        try {
            const userId = request.user.sub;

            if (request.isSuperAdmin) {
                const projects = db.prepare(`SELECT *, 'admin' as user_role FROM projects`).all();
                return projects;
            } else {
                const projects = db.prepare(`
                    SELECT p.*, up.role as user_role
                    FROM projects p
                    JOIN user_projects up ON p.id = up.project_id
                    WHERE up.user_id = ?
                `).all(userId);
                return projects;
            }
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to fetch your projects' });
        }
    });

}
