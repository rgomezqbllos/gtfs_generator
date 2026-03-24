import { FastifyInstance } from 'fastify';
import db from '../db';
import { randomUUID } from 'crypto';
import { fetchRoute, fetchRouteWithWaypoints } from '../services/routing';
import { mapToOsrmProfile, normalizeRoutingProfile, RoutingProfile } from '../constants/routingProfiles';
import { resolveProjectRouting } from '../services/ProjectRoutingService';

interface SegmentBody {
    start_node_id: string;
    end_node_id: string;
    distance?: number;
    travel_time?: number;
    allowed_transport_modes?: string;
    routing_profile?: RoutingProfile;
    custom_attributes?: string;
}

export default async function segmentsRoutes(fastify: FastifyInstance) {

    // GET all segments
    fastify.get('/segments', async (request: any) => {
        const { type } = request.query as { type?: string };
        let query = `
      SELECT s.*, 
             start.stop_name as start_node_name, start.stop_lat as start_lat, start.stop_lon as start_lon,
             end.stop_name as end_node_name, end.stop_lat as end_lat, end.stop_lon as end_lon
      FROM segments s
      JOIN stops start ON s.start_node_id = start.stop_id
      JOIN stops end ON s.end_node_id = end.stop_id
      WHERE s.project_id = ?
    `;
        const params: string[] = [request.projectId];
        if (type) {
            query += ' AND s.type = ?';
            params.push(type);
        }

        const stmt = db.prepare(query);
        return stmt.all(...params);
    });

    // CREATE segment
    fastify.post('/segments', async (request: any, reply: any) => {
        const body = request.body as SegmentBody & { type?: string };
        const { start_node_id, end_node_id, allowed_transport_modes, routing_profile, custom_attributes, type } = body;

        if (!start_node_id || !end_node_id) {
            return reply.code(400).send({ error: 'Start and End nodes are required' });
        }

        // Check if nodes exist
        const checkStmt = db.prepare('SELECT stop_id, stop_lat, stop_lon FROM stops WHERE stop_id IN (?, ?) AND project_id = ?');
        const nodes = checkStmt.all(start_node_id, end_node_id, request.projectId) as { stop_id: string, stop_lat: number, stop_lon: number }[];

        if (nodes.length < 2 && start_node_id !== end_node_id) {
            return reply.code(400).send({ error: 'One or both nodes do not exist' });
        }

        const startNode = nodes.find(n => n.stop_id === start_node_id)!;
        const endNode = nodes.find(n => n.stop_id === end_node_id)!;

        // Calculate Route via OSRM
        let distance = body.distance || 0;
        let travel_time = body.travel_time || 0;
        let geometry = null;
        
        const normalizedProfile = normalizeRoutingProfile(routing_profile);
        const osrmProfile = mapToOsrmProfile(normalizedProfile);
        const routing = await resolveProjectRouting(request.projectId);

        if (routing.mapAssigned && !routing.routingUrl) {
            return reply.code(409).send({
                error: routing.error || 'El proyecto tiene un mapa asignado, pero su motor OSRM no está listo.'
            });
        }

        try {
            const routeData = await fetchRoute(
                [startNode.stop_lon, startNode.stop_lat],
                [endNode.stop_lon, endNode.stop_lat],
                routing.routingUrl || undefined,
                osrmProfile
            );

            if (routeData) {
                distance = routeData.distance;
                travel_time = routeData.duration;
                geometry = JSON.stringify(routeData.geometry);
            } else if (routing.mapAssigned) {
                return reply.code(409).send({
                    error: 'OSRM no pudo calcular una ruta vial para este segmento en el mapa asociado al proyecto.'
                });
            }
        } catch (e) {
            request.log.error(e, 'Failed to fetch route from OSRM');
        }

        // Fallback if geometry is still null (OSRM failed or returned null)
        if (!geometry) {
            console.log('Using straight-line fallback for segment geometry');
            geometry = JSON.stringify({
                type: 'LineString',
                coordinates: [[startNode.stop_lon, startNode.stop_lat], [endNode.stop_lon, endNode.stop_lat]]
            });
            // Calculate straight distance as fallback
            const R = 6371e3;
            const φ1 = startNode.stop_lat * Math.PI / 180;
            const φ2 = endNode.stop_lat * Math.PI / 180;
            const Δφ = (endNode.stop_lat - startNode.stop_lat) * Math.PI / 180;
            const Δλ = (endNode.stop_lon - startNode.stop_lon) * Math.PI / 180;
            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (distance === 0) distance = R * c;
        }


        const segment_id = randomUUID();
        const segmentType = type || 'revenue';

        const stmt = db.prepare(`
          INSERT INTO segments (segment_id, project_id, start_node_id, end_node_id, distance, travel_time, routing_profile, allowed_transport_modes, custom_attributes, geometry, type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            segment_id,
            request.projectId,
            start_node_id,
            end_node_id,
            distance,
            travel_time,
            normalizedProfile,
            allowed_transport_modes || 'bus',
            custom_attributes || '{}',
            geometry,
            segmentType
        );

        return { segment_id, distance, travel_time, geometry, type: segmentType, ...body };
    });

    // REROUTE segment with waypoints
    fastify.put('/segments/:id/reroute', async (request: any, reply: any) => {
        const { id } = request.params as { id: string };
        const { waypoints } = request.body as { waypoints: { lat: number; lng: number }[] };

        const segment = db.prepare(`
            SELECT s.*, start.stop_lat as start_lat, start.stop_lon as start_lon,
                   end_s.stop_lat as end_lat, end_s.stop_lon as end_lon
            FROM segments s
            JOIN stops start ON s.start_node_id = start.stop_id
            JOIN stops end_s ON s.end_node_id = end_s.stop_id
            WHERE s.segment_id = ? AND s.project_id = ?
        `).get(id, request.projectId) as any;

        if (!segment) return reply.code(404).send({ error: 'Segment not found' });

        const normalizedProfile = normalizeRoutingProfile(segment.routing_profile);
        const osrmProfile = mapToOsrmProfile(normalizedProfile);
        const routing = await resolveProjectRouting(request.projectId);

        // Build ordered points: [start, ...waypoints, end] as [lon, lat]
        const allPoints: [number, number][] = [
            [segment.start_lon, segment.start_lat],
            ...(waypoints || []).map((wp): [number, number] => [wp.lng, wp.lat]),
            [segment.end_lon, segment.end_lat]
        ];

        let distance = segment.distance || 0;
        let travel_time = segment.travel_time || 0;
        let geometry = null;

        try {
            const routeData = await fetchRouteWithWaypoints(allPoints, routing.routingUrl || undefined, osrmProfile);
            if (routeData) {
                distance = routeData.distance;
                travel_time = routeData.duration;
                geometry = JSON.stringify(routeData.geometry);
            }
        } catch (e) {
            request.log.error(e, 'Failed to fetch rerouted segment from OSRM');
        }

        if (!geometry) {
            // Straight-line fallback through all waypoints
            geometry = JSON.stringify({
                type: 'LineString',
                coordinates: allPoints
            });
        }

        const waypointsJson = JSON.stringify(waypoints || []);
        db.prepare(`
            UPDATE segments SET geometry = ?, distance = ?, travel_time = ?, waypoints = ?
            WHERE segment_id = ? AND project_id = ?
        `).run(geometry, distance, travel_time, waypointsJson, id, request.projectId);

        return {
            segment_id: id,
            geometry,
            distance,
            travel_time,
            waypoints: waypoints || []
        };
    });

    // UPDATE segment
    fastify.put('/segments/:id', async (request: any, reply: any) => {
        const { id } = request.params as { id: string };
        const body = request.body as Partial<SegmentBody>;

        // Check if exists
        const check = db.prepare('SELECT segment_id FROM segments WHERE segment_id = ? AND project_id = ?').get(id, request.projectId);
        if (!check) return reply.code(404).send({ error: 'Segment not found in project' });

        const fields = [];
        const values = [];

        if (body.distance !== undefined) { fields.push('distance = ?'); values.push(body.distance); }
        if (body.travel_time !== undefined) { fields.push('travel_time = ?'); values.push(body.travel_time); }
        if (body.routing_profile !== undefined) {
            fields.push('routing_profile = ?');
            values.push(normalizeRoutingProfile(body.routing_profile));
        }
        if (body.allowed_transport_modes !== undefined) { fields.push('allowed_transport_modes = ?'); values.push(body.allowed_transport_modes); }
        if (body.custom_attributes !== undefined) { fields.push('custom_attributes = ?'); values.push(body.custom_attributes); }

        if (fields.length === 0) return reply.send({ message: 'No changes' });

        values.push(id, request.projectId);
        const stmt = db.prepare(`UPDATE segments SET ${fields.join(', ')} WHERE segment_id = ? AND project_id = ?`);
        stmt.run(...values);

        return { message: 'Segment updated' };
    });

    // DELETE segment
    fastify.delete('/segments/:id', async (request: any, reply: any) => {
        const { id } = request.params as { id: string };

        const segment = db.prepare('SELECT start_node_id, end_node_id FROM segments WHERE segment_id = ? AND project_id = ?').get(id, request.projectId) as { start_node_id: string, end_node_id: string };

        if (!segment) {
            return reply.code(404).send({ error: 'Segment not found' });
        }

        // Check if this segment (Start -> End) is used in any active trip sequence
        // We look for any stop_time sequence where stop_id = start_node followed immediately by stop_id = end_node for same trip
        // This is complex to check efficiently in SQL without window functions or self join.
        // Simple check: SELECT count(*) FROM stop_times t1 JOIN stop_times t2 ON t1.trip_id = t2.trip_id AND t1.stop_sequence + 1 = t2.stop_sequence WHERE t1.stop_id = ? AND t2.stop_id = ?

        const usageCheck = db.prepare(`
            SELECT count(*) as count 
            FROM stop_times t1 
            JOIN stop_times t2 
            ON t1.trip_id = t2.trip_id 
            AND t1.stop_sequence + 1 = t2.stop_sequence 
            WHERE t1.stop_id = ? AND t2.stop_id = ?
        `).get(segment.start_node_id, segment.end_node_id) as { count: number };

        if (usageCheck.count > 0) {
            return reply.code(409).send({ error: `Cannot delete segment: used in ${usageCheck.count} trip path(s). Delete the Route first.` });
        }

        const stmt = db.prepare('DELETE FROM segments WHERE segment_id = ? AND project_id = ?');
        const result = stmt.run(id, request.projectId);

        return { message: 'Segment deleted' };
    });

    // --- TIME SLOTS ENDPOINTS ---

    // GET slots for a segment
    fastify.get('/segments/:id/slots', async (request, reply) => {
        const { id } = request.params as { id: string };
        const slots = db.prepare('SELECT * FROM segment_time_slots WHERE segment_id = ? ORDER BY start_time').all(id);
        return slots;
    });

    // POST (Create) a slot
    fastify.post('/segments/:id/slots', async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = request.body as { start_time: string; end_time: string; travel_time: number };
        const { start_time, end_time, travel_time } = body;

        if (!start_time || !end_time || travel_time === undefined) {
            return reply.code(400).send({ error: 'Missing required fields' });
        }

        // Validate format HH:MM:SS
        const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
        if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
            return reply.code(400).send({ error: 'Invalid time format. Use HH:MM:SS' });
        }

        const slotId = randomUUID();
        try {
            const stmt = db.prepare(`
                INSERT INTO segment_time_slots (id, segment_id, start_time, end_time, travel_time)
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(slotId, id, start_time, end_time, travel_time);
            return { id: slotId, segment_id: id, ...body };
        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: 'Failed to create slot' });
        }
    });

    // DELETE a slot
    fastify.delete('/segments/slots/:slotId', async (request, reply) => {
        const { slotId } = request.params as { slotId: string };
        const stmt = db.prepare('DELETE FROM segment_time_slots WHERE id = ?');
        const result = stmt.run(slotId);
        if (result.changes === 0) return reply.code(404).send({ error: 'Slot not found' });
        return { message: 'Slot deleted' };
    });
}
