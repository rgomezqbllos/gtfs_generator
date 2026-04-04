import { FastifyInstance } from 'fastify';
import db from '../db';

interface MapPreferenceBody {
    center_lat: number;
    center_lon: number;
    zoom: number;
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export default async function mapPreferencesRoutes(fastify: FastifyInstance) {
    fastify.get('/map-preference', async (request: any, reply: any) => {
        const userId = request.user?.sub;
        const projectId = request.projectId;

        if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
        if (!projectId) return reply.code(400).send({ error: 'Project header (X-Project-Id) is required' });

        const pref = db.prepare(`
            SELECT center_lat, center_lon, zoom, updated_at
            FROM user_project_map_preferences
            WHERE user_id = ? AND project_id = ?
        `).get(userId, projectId) as any;

        return { preference: pref || null };
    });

    fastify.put<{ Body: MapPreferenceBody }>('/map-preference', async (request: any, reply: any) => {
        const userId = request.user?.sub;
        const projectId = request.projectId;

        if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
        if (!projectId) return reply.code(400).send({ error: 'Project header (X-Project-Id) is required' });

        const body = request.body || {};
        const centerLat = toFiniteNumber(body.center_lat);
        const centerLon = toFiniteNumber(body.center_lon);
        const zoom = toFiniteNumber(body.zoom);

        if (
            centerLat === null ||
            centerLon === null ||
            zoom === null ||
            centerLat < -90 || centerLat > 90 ||
            centerLon < -180 || centerLon > 180 ||
            zoom < 0 || zoom > 22
        ) {
            return reply.code(400).send({ error: 'Invalid map preference payload' });
        }

        db.prepare(`
            INSERT INTO user_project_map_preferences
                (user_id, project_id, center_lat, center_lon, zoom)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, project_id)
            DO UPDATE SET
                center_lat = excluded.center_lat,
                center_lon = excluded.center_lon,
                zoom = excluded.zoom,
                updated_at = CURRENT_TIMESTAMP
        `).run(userId, projectId, centerLat, centerLon, zoom);

        return {
            success: true,
            preference: {
                center_lat: centerLat,
                center_lon: centerLon,
                zoom,
            },
        };
    });
}
