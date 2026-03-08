import { FastifyInstance } from 'fastify';
import db from '../db';
import { resolveProjectRouting } from '../services/ProjectRoutingService';

export default async function projectsRoutes(fastify: FastifyInstance) {
    // Get projects the current logged-in user has access to
    fastify.get('/projects/my', async (request: any, reply: any) => {
        try {
            const userId = request.user.sub;

            let projects: any[];

            if (request.isSuperAdmin) {
                projects = db.prepare(`
                    SELECT p.*, 'admin' as user_role, m.name AS map_name, m.status AS map_status
                    FROM projects p
                    LEFT JOIN map_instances m ON m.id = p.map_instance_id
                `).all();
            } else {
                projects = db.prepare(`
                    SELECT p.*, up.role as user_role, m.name AS map_name, m.status AS map_status
                    FROM projects p
                    JOIN user_projects up ON p.id = up.project_id
                    LEFT JOIN map_instances m ON m.id = p.map_instance_id
                    WHERE up.user_id = ?
                `).all(userId);
            }

            return Promise.all(projects.map(async (project) => {
                const routing = await resolveProjectRouting(project.id);
                return {
                    ...project,
                    routing_engine_url: routing.routingUrl,
                    map_status: routing.map?.status || project.map_status || null,
                    map_base_port: routing.map?.base_port || null
                };
            }));
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to fetch your projects' });
        }
    });

}
