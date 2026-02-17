import { FastifyInstance } from 'fastify';
import db from '../db';
import { randomUUID } from 'crypto';

interface Trip {
    trip_id: string;
    route_id: string;
    service_id: string;
    trip_headsign: string;
    direction_id: number;
    shape_id: string;
}

interface StopTime {
    trip_id: string;
    stop_id: string;
    stop_sequence: number;
    arrival_time: string;
    departure_time: string;
}

export default async function tripsRoutes(server: FastifyInstance) {

    // GET /routes/:route_id/trips - Fetch all trips + stop_times for a route
    server.get<{ Params: { route_id: string }, Querystring: { direction_id?: number } }>('/routes/:route_id/trips', async (request, reply) => {
        const { route_id } = request.params;
        const { direction_id } = request.query;

        try {
            let sql = 'SELECT * FROM trips WHERE route_id = ?';
            const params: any[] = [route_id];

            if (direction_id !== undefined) {
                sql += ' AND direction_id = ?';
                params.push(direction_id);
            }

            const trips = db.prepare(sql).all(params) as Trip[];

            // For each trip, fetch stop_times
            // Optimization: Fetch all stop_times for these trips in one query
            if (trips.length > 0) {
                const tripIds = trips.map(t => `'${t.trip_id}'`).join(',');
                const stopTimes = db.prepare(`SELECT * FROM stop_times WHERE trip_id IN (${tripIds}) ORDER BY trip_id, stop_sequence`).all() as StopTime[];

                // Attach stop_times to trips
                const tripsWithTimes = trips.map(trip => ({
                    ...trip,
                    stop_times: stopTimes.filter(st => st.trip_id === trip.trip_id)
                }));
                return tripsWithTimes;
            }

            return [];
        } catch (err) {
            server.log.error(err);
            return reply.status(500).send({ error: 'Failed to fetch trips' });
        }
    });

    // POST /routes/:route_id/trips - Create a new trip
    server.post<{ Params: { route_id: string }, Body: Partial<Trip> }>('/routes/:route_id/trips', async (request, reply) => {
        const { route_id } = request.params;
        const { service_id, trip_headsign, direction_id, shape_id, trip_id } = request.body;

        if (!service_id) {
            return reply.status(400).send({ error: 'service_id is required' });
        }

        const newTripId = trip_id || randomUUID();

        try {
            const stmt = db.prepare(`
                INSERT INTO trips (trip_id, route_id, service_id, trip_headsign, direction_id, shape_id)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run(newTripId, route_id, service_id, trip_headsign || '', direction_id || 0, shape_id || null);
            return { message: 'Trip created', trip_id: newTripId };
        } catch (err) {
            server.log.error(err);
            return reply.status(500).send({ error: 'Failed to create trip' });
        }
    });

    // PUT /trips/:trip_id - Update trip details
    server.put<{ Params: { trip_id: string }, Body: Partial<Trip> }>('/trips/:trip_id', async (request, reply) => {
        const { trip_id } = request.params;
        const { service_id, trip_headsign, shape_id } = request.body;

        try {
            const updates = [];
            const params = [];

            if (service_id !== undefined) { updates.push('service_id = ?'); params.push(service_id); }
            if (trip_headsign !== undefined) { updates.push('trip_headsign = ?'); params.push(trip_headsign); }
            if (shape_id !== undefined) { updates.push('shape_id = ?'); params.push(shape_id); }

            if (updates.length === 0) return { message: 'No changes' };

            params.push(trip_id);
            const sql = `UPDATE trips SET ${updates.join(', ')} WHERE trip_id = ?`;

            db.prepare(sql).run(...params);
            return { message: 'Trip updated' };
        } catch (err) {
            server.log.error(err);
            return reply.status(500).send({ error: 'Failed to update trip' });
        }
    });

    // POST /trips/:trip_id/stop_times - Save stop times for a trip
    // This expects a full list of stop times for the trip to replace existing ones, or upsert.
    // For simplicity, we'll delete existing and insert new ones (full replace) for that trip.
    server.post<{ Params: { trip_id: string }, Body: { stop_times: StopTime[] } }>('/trips/:trip_id/stop_times', async (request, reply) => {
        const { trip_id } = request.params;
        const { stop_times } = request.body;

        if (!Array.isArray(stop_times)) {
            return reply.status(400).send({ error: 'stop_times must be an array' });
        }

        const insertStmt = db.prepare(`
            INSERT INTO stop_times (trip_id, stop_id, stop_sequence, arrival_time, departure_time, shape_dist_traveled)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const deleteStmt = db.prepare('DELETE FROM stop_times WHERE trip_id = ?');

        const transaction = db.transaction((times: StopTime[]) => {
            deleteStmt.run(trip_id);
            for (const st of times) {
                insertStmt.run(trip_id, st.stop_id, st.stop_sequence, st.arrival_time, st.departure_time, 0); // TODO: Calculate shape_dist?
            }
        });

        try {
            transaction(stop_times);
            return { message: 'Stop times saved', count: stop_times.length };
        } catch (err) {
            server.log.error(err);
            return reply.status(500).send({ error: 'Failed to save stop times' });
        }
    });

    // DELETE /trips/:trip_id
    server.delete<{ Params: { trip_id: string } }>('/trips/:trip_id', async (request, reply) => {
        const { trip_id } = request.params;
        try {
            db.prepare('DELETE FROM stop_times WHERE trip_id = ?').run(trip_id);
            db.prepare('DELETE FROM trips WHERE trip_id = ?').run(trip_id);
            return { message: 'Trip deleted' };
        } catch (err) {
            server.log.error(err);
            return reply.status(500).send({ error: 'Failed to delete trip' });
        }
    });
}
