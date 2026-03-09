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

    // Reset (purge) data for the current project in header X-Project-Id
    fastify.post('/projects/reset', async (request: any, reply: any) => {
        const projectId = request.projectId;
        if (!projectId) {
            return reply.code(400).send({ error: 'Project header (X-Project-Id) is required' });
        }

        // Access control: superadmin or member of project
        const isMember = db.prepare('SELECT 1 FROM user_projects WHERE user_id = ? AND project_id = ? LIMIT 1')
            .get(request.user.sub, projectId);
        if (!request.isSuperAdmin && !isMember) {
            return reply.code(403).send({ error: 'User does not have access to this project' });
        }

        try {
            const count = (table: string) => (db.prepare(`SELECT count(*) as c FROM ${table} WHERE project_id = ?`).get(projectId) as any).c as number;

            const countsBefore = {
                stops: count('stops'),
                routes: count('routes'),
                segments: count('segments'),
                trips: count('trips'),
                stop_times: count('stop_times'),
                shapes: count('shapes'),
                calendar: count('calendar'),
                segment_time_slots: count('segment_time_slots'),
                route_parkings: count('route_parkings'),
                agency: count('agency')
            };

            db.transaction(() => {
                db.prepare('DELETE FROM stop_times WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM shapes WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM trips WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM calendar WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM segment_time_slots WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM segments WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM routes WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM route_parkings WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM stops WHERE project_id = ?').run(projectId);
                db.prepare('DELETE FROM agency WHERE project_id = ?').run(projectId);
            })();

            return { message: 'Proyecto purgado', project_id: projectId, removed: countsBefore };
        } catch (error: any) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to reset project data' });
        }
    });

}
