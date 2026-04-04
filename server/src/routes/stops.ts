import { FastifyInstance } from 'fastify';
import db from '../db';
import { randomUUID } from 'crypto';
import { fetchRoute } from '../services/routing';
import { resolveProjectRouting } from '../services/ProjectRoutingService';

interface StopBody {
    stop_name: string;
    stop_code?: string;
    stop_lat: number;
    stop_lon: number;
    node_type?: string;
    location_type?: number;
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function isValidLatLon(lat: number, lon: number): boolean {
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export default async function stopsRoutes(fastify: FastifyInstance) {

    // GET all stops
    fastify.get('/stops', async (request: any) => {
        const stmt = db.prepare('SELECT * FROM stops WHERE project_id = ?');
        return stmt.all(request.projectId);
    });

    // GET stop by id
    fastify.get('/stops/:id', async (request: any, reply: any) => {
        const { id } = request.params as { id: string };
        const stmt = db.prepare('SELECT * FROM stops WHERE stop_id = ? AND project_id = ?');
        const stop = stmt.get(id, request.projectId);
        if (!stop) {
            return reply.code(404).send({ error: 'Stop not found' });
        }
        return stop;
    });

    // CREATE stop
    fastify.post('/stops', async (request: any, reply: any) => {
        console.log('Received POST /stops request');
        const body = request.body as StopBody;
        console.log('Body:', body);
        const { stop_name, stop_lat, stop_lon, node_type, location_type } = body;
        let { stop_code } = body;

        if (!stop_name || stop_lat === undefined || stop_lon === undefined) {
            console.error('Missing required fields');
            return reply.code(400).send({ error: 'Missing required fields' });
        }

        const lat = toFiniteNumber(stop_lat);
        const lon = toFiniteNumber(stop_lon);
        if (lat === null || lon === null || !isValidLatLon(lat, lon)) {
            return reply.code(400).send({ error: 'Invalid coordinates. lat must be [-90,90] and lon must be [-180,180]' });
        }

        const stop_id = randomUUID();

        // Auto-generate stop_code if missing
        if (!stop_code || stop_code.trim() === '') {
            stop_code = `STOP_${stop_id.substring(0, 6).toUpperCase()}`;
        }

        try {
            const stmt = db.prepare(`
          INSERT INTO stops (stop_id, project_id, stop_code, stop_name, stop_lat, stop_lon, node_type, location_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

            stmt.run(stop_id, request.projectId, stop_code, stop_name, lat, lon, node_type || 'regular', location_type || 0);

            console.log('Stop created successfully:', stop_id);
            return { stop_id, stop_code, ...body, stop_lat: lat, stop_lon: lon };
        } catch (error) {
            console.error('Error inserting stop:', error);
            return reply.code(500).send({ error: 'Database insert failed' });
        }
    });

    // UPDATE stop
    fastify.put('/stops/:id', async (request: any, reply: any) => {
        const { id } = request.params as { id: string };
        const body = request.body as Partial<StopBody>;

        // Check if exists
        const check = db.prepare('SELECT stop_id, stop_lat, stop_lon FROM stops WHERE stop_id = ? AND project_id = ?').get(id, request.projectId) as { stop_id: string, stop_lat: number, stop_lon: number };
        if (!check) return reply.code(404).send({ error: 'Stop not found in this project' });

        const locationChanged = body.stop_lat !== undefined || body.stop_lon !== undefined;
        const normalizedLat = body.stop_lat !== undefined ? toFiniteNumber(body.stop_lat) : undefined;
        const normalizedLon = body.stop_lon !== undefined ? toFiniteNumber(body.stop_lon) : undefined;
        if (body.stop_lat !== undefined && normalizedLat === null) {
            return reply.code(400).send({ error: 'Invalid stop_lat: must be a finite number' });
        }
        if (body.stop_lon !== undefined && normalizedLon === null) {
            return reply.code(400).send({ error: 'Invalid stop_lon: must be a finite number' });
        }

        if (locationChanged) {
            const candidateLat = normalizedLat ?? check.stop_lat;
            const candidateLon = normalizedLon ?? check.stop_lon;
            if (!isValidLatLon(candidateLat, candidateLon)) {
                return reply.code(400).send({ error: 'Invalid coordinates. lat must be [-90,90] and lon must be [-180,180]' });
            }
        }

        const fields = [];
        const values = [];

        if (body.stop_name !== undefined) { fields.push('stop_name = ?'); values.push(body.stop_name); }
        if (body.stop_code !== undefined) { fields.push('stop_code = ?'); values.push(body.stop_code); }
        if (normalizedLat !== undefined) { fields.push('stop_lat = ?'); values.push(normalizedLat); }
        if (normalizedLon !== undefined) { fields.push('stop_lon = ?'); values.push(normalizedLon); }
        if (body.node_type !== undefined) { fields.push('node_type = ?'); values.push(body.node_type); }
        if (body.location_type !== undefined) { fields.push('location_type = ?'); values.push(body.location_type); }

        if (fields.length === 0) return reply.send({ message: 'No changes' });

        values.push(id, request.projectId);
        const stmt = db.prepare(`UPDATE stops SET ${fields.join(', ')} WHERE stop_id = ? AND project_id = ?`);
        stmt.run(...values);



        // --- Recalculate Segments if location changed ---
        if (locationChanged) {
            const newLat = normalizedLat ?? check.stop_lat;
            const newLon = normalizedLon ?? check.stop_lon;

            // Find all segments connected to this stop
            // We need to fetch the OTHER node's coordinates for each segment to recalculate routing
            const connectedSegments = db.prepare(`
                SELECT s.segment_id, s.start_node_id, s.end_node_id,
                       start.stop_lat as start_lat, start.stop_lon as start_lon,
                       end.stop_lat as end_lat, end.stop_lon as end_lon
                FROM segments s
                JOIN stops start ON s.start_node_id = start.stop_id
                JOIN stops end ON s.end_node_id = end.stop_id
                WHERE (s.start_node_id = ? OR s.end_node_id = ?) AND s.project_id = ?
             `).all(id, id, request.projectId) as any[];

            console.log(`Stop ${id} moved. Recalculating ${connectedSegments.length} segments...`);

            const routing = await resolveProjectRouting(request.projectId);

            for (const seg of connectedSegments) {
                // Determine start and end coordinates based on which node is the current one (it might be start or end or both if it's a loop)
                // Actually, the query joins 'start' and 'end' tables, so we have fresh coordinates for OTHER nodes, but OLD coordinates for THIS node (because we just updated it in DB but maybe the join used the old value if transaction isolation... actually SQLite runs sequentially here typically).
                // Wait, we just ran the UPDATE above. So 'start' and 'end' aliases in the JOIN *should* reflect the new values for this stop ID.
                // Let's verify: SQLite default mode. Yes.
                // However, let's use the explicit newLat/newLon to be safe and clear.

                let startCoords: [number, number] = [seg.start_lon, seg.start_lat];
                let endCoords: [number, number] = [seg.end_lon, seg.end_lat];

                if (seg.start_node_id === id) {
                    startCoords = [newLon, newLat];
                }
                if (seg.end_node_id === id) {
                    endCoords = [newLon, newLat];
                }

                try {
                    if (routing.mapAssigned && !routing.routingUrl) {
                        continue;
                    }
                    const routeData = await fetchRoute(startCoords, endCoords, routing.routingUrl || undefined);
                    if (routeData) {
                        const updateStmt = db.prepare(`
                            UPDATE segments 
                            SET distance = ?, travel_time = ?, geometry = ?
                            WHERE segment_id = ?
                         `);
                        updateStmt.run(routeData.distance, routeData.duration, JSON.stringify(routeData.geometry), seg.segment_id);
                        console.log(`Updated segment ${seg.segment_id}`);
                    }
                } catch (err) {
                    console.error(`Failed to update segment ${seg.segment_id}`, err);
                }
            }
        }

        return { message: 'Stop updated' };
    });

    // DELETE stop
    fastify.delete('/stops/:id', async (request: any, reply: any) => {
        const { id } = request.params as { id: string };

        // Check dependencies
        const segmentsDeps = db.prepare('SELECT count(*) as count FROM segments WHERE (start_node_id = ? OR end_node_id = ?) AND project_id = ?').get(id, id, request.projectId) as { count: number };
        if (segmentsDeps.count > 0) {
            return reply.code(409).send({ error: `Cannot delete stop: used in ${segmentsDeps.count} segments.` });
        }

        const stopTimesDeps = db.prepare('SELECT count(*) as count FROM stop_times st JOIN trips t ON st.trip_id = t.trip_id JOIN routes r ON t.route_id = r.route_id WHERE st.stop_id = ? AND r.project_id = ?').get(id, request.projectId) as { count: number };
        if (stopTimesDeps.count > 0) {
            return reply.code(409).send({ error: `Cannot delete stop: used in ${stopTimesDeps.count} trips (stop_times).` });
        }

        const stmt = db.prepare('DELETE FROM stops WHERE stop_id = ? AND project_id = ?');
        const result = stmt.run(id, request.projectId);

        if (result.changes === 0) {
            return reply.code(404).send({ error: 'Stop not found' });
        }

        return { message: 'Stop deleted' };
    });
}
