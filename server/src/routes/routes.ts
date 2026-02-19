import { FastifyInstance } from 'fastify';
import db from '../db';
import { randomUUID } from 'crypto';
import { fetchRoute } from '../services/routing';

interface RouteBody {
    route_short_name: string;
    route_long_name: string;
    route_type: number;
    route_color?: string;
    route_text_color?: string;
    route_desc?: string;
    route_url?: string;
    route_sort_order?: number;
    allowed_materials?: string; // Custom field
    agency_name?: string;
    agency_id?: string; // Added
    parkings?: string[]; // Added
}

export default async function routesRoutes(fastify: FastifyInstance) {

    // GET all routes
    fastify.get('/routes', async () => {
        const stmt = db.prepare(`
            SELECT r.*, a.agency_name 
            FROM routes r
            LEFT JOIN agency a ON r.agency_id = a.agency_id
        `);
        const routes = stmt.all() as any[];

        // Fetch parkings for each route
        // Could be done with a join/group_concat or individual queries. 
        // For simplicity and array structure, let's fetch all parkings and map them.
        const allParkings = db.prepare('SELECT route_id, stop_id FROM route_parkings').all() as { route_id: string, stop_id: string }[];

        const parkingsMap = new Map<string, string[]>();
        allParkings.forEach(p => {
            if (!parkingsMap.has(p.route_id)) parkingsMap.set(p.route_id, []);
            parkingsMap.get(p.route_id)!.push(p.stop_id);
        });

        return routes.map(r => ({
            ...r,
            parkings: parkingsMap.get(r.route_id) || []
        }));
    });

    // GET route by id
    fastify.get('/routes/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const stmt = db.prepare(`
            SELECT r.*, a.agency_name
            FROM routes r
            LEFT JOIN agency a ON r.agency_id = a.agency_id
            WHERE r.route_id = ?
        `);
        const route = stmt.get(id);
        if (!route) {
            return reply.code(404).send({ error: 'Route not found' });
        }
        return route;
    });

    // GET route structure for filtering - HIGHLY OPTIMIZED
    fastify.get('/routes/structure', async () => {
        try {
            // 1. Fetch Routes (Lightweight)
            const routes = db.prepare(`
                SELECT r.route_id, r.route_short_name, r.route_long_name, r.route_color, a.agency_name 
                FROM routes r
                LEFT JOIN agency a ON r.agency_id = a.agency_id
            `).all() as any[];

            // 2. Fetch Representative Trips ONLY (One per direction per route)
            // We use MIN(trip_id) or similar to pick one. 
            // Ideally we'd pick the "most common" one but for structure visualization, any valid trip works.
            const trips = db.prepare(`
                SELECT route_id, direction_id, trip_id 
                FROM trips 
                GROUP BY route_id, direction_id
            `).all() as any[];

            // Create a set of trip_ids to fetch stop_times for
            const relevantTripIds = trips.map(t => t.trip_id);

            if (relevantTripIds.length === 0) {
                return routes.map(r => ({ ...r, directions: [] }));
            }

            // 3. Fetch StopTimes ONLY for relevant trips
            // SQLite limit on variables is usually 999 or 32000 depending on version. 
            // If we have 400 routes * 2 directions = 800 trips, it fits in `IN (...)`.
            // If it exceeds, we might need a temp table or chunking.
            // For now, let's assume < 900 trips. If more, we can construct the query dynamically or just join?
            // Actually, JOIN is better:
            // SELECT st.* FROM stop_times st JOIN (SELECT trip_id FROM trips GROUP BY route_id, direction_id) t ON st.trip_id = t.trip_id

            const stopTimes = db.prepare(`
                SELECT st.trip_id, st.stop_id, s.stop_name, s.stop_code, st.stop_sequence
                FROM stop_times st
                JOIN stops s ON st.stop_id = s.stop_id
                WHERE st.trip_id IN (
                    SELECT trip_id 
                    FROM trips 
                    GROUP BY route_id, direction_id
                )
                ORDER BY st.trip_id, st.stop_sequence
            `).all() as any[];

            const segments = db.prepare('SELECT segment_id, start_node_id, end_node_id, distance FROM segments').all() as any[];

            // 4. Data Structures for Fast Lookup
            const tripsByRoute = new Map<string, any[]>();
            trips.forEach(t => {
                if (!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []);
                tripsByRoute.get(t.route_id)!.push(t);
            });

            const stopTimesByTrip = new Map<string, any[]>();
            stopTimes.forEach(st => {
                if (!stopTimesByTrip.has(st.trip_id)) stopTimesByTrip.set(st.trip_id, []);
                stopTimesByTrip.get(st.trip_id)!.push(st);
            });

            const segmentMap = new Map<string, any>();
            segments.forEach(seg => {
                segmentMap.set(`${seg.start_node_id}-${seg.end_node_id}`, seg);
            });

            // 5. Fetch Parkings
            const allParkings = db.prepare('SELECT route_id, stop_id FROM route_parkings').all() as { route_id: string, stop_id: string }[];
            const parkingsMap = new Map<string, string[]>();
            allParkings.forEach(p => {
                if (!parkingsMap.has(p.route_id)) parkingsMap.set(p.route_id, []);
                parkingsMap.get(p.route_id)!.push(p.stop_id);
            });

            // 6. Assemble Structure
            const structure = routes.map(route => {
                const routeTrips = tripsByRoute.get(route.route_id) || [];

                const directions = routeTrips.map((repTrip: any) => {
                    const stops = stopTimesByTrip.get(repTrip.trip_id) || [];
                    const routeSegments = [];

                    for (let i = 0; i < stops.length - 1; i++) {
                        const from = stops[i].stop_id;
                        const to = stops[i + 1].stop_id;
                        let seg = segmentMap.get(`${from}-${to}`);
                        if (!seg) seg = segmentMap.get(`${to}-${from}`);
                        if (seg) routeSegments.push(seg);
                    }

                    return {
                        direction_id: repTrip.direction_id,
                        stops: stops.map((s: any) => ({
                            stop_id: s.stop_id,
                            stop_name: s.stop_name,
                            stop_code: s.stop_code
                        })),
                        segments: routeSegments
                    };
                });

                return {
                    ...route,
                    directions,
                    parkings: parkingsMap.get(route.route_id) || []
                };
            });

            return structure;

        } catch (error) {
            console.error('Error fetching structure:', error);
            return [];
        }
    });

    // CREATE route
    fastify.post('/routes', async (request, reply) => {
        const body = request.body as RouteBody;
        const {
            route_short_name, route_long_name, route_type,
            route_color, route_text_color, route_desc, route_url, route_sort_order,
            allowed_materials, agency_name, agency_id
        } = body;

        if (route_type === undefined) {
            return reply.code(400).send({ error: 'route_type is required' });
        }

        const route_id = randomUUID();
        let agency_id_to_use = agency_id || null;

        if (!agency_id_to_use && agency_name) {
            const existingAgency = db.prepare('SELECT agency_id FROM agency WHERE agency_name = ?').get(agency_name) as { agency_id: string };
            if (existingAgency) {
                agency_id_to_use = existingAgency.agency_id;
            } else {
                const newAgencyId = randomUUID();
                db.prepare(`
                    INSERT INTO agency (agency_id, agency_name, agency_url, agency_timezone)
                    VALUES (?, ?, 'http://example.com', 'America/Los_Angeles')
                 `).run(newAgencyId, agency_name);
                agency_id_to_use = newAgencyId;
            }
        }

        const insertTransaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO routes (
                    route_id, route_short_name, route_long_name, route_type, 
                    route_color, route_text_color, route_desc, route_url, route_sort_order,
                    allowed_materials, agency_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                route_id,
                route_short_name || '',
                route_long_name || '',
                route_type,
                route_color || '000000',
                route_text_color || 'FFFFFF',
                route_desc || null,
                route_url || null,
                route_sort_order || null,
                allowed_materials || '',
                agency_id_to_use
            );

            // Save Parkings
            if (body.parkings && Array.isArray(body.parkings)) {
                const insertParking = db.prepare('INSERT INTO route_parkings (route_id, stop_id) VALUES (?, ?)');
                for (const stopId of body.parkings) {
                    insertParking.run(route_id, stopId);
                }
            }
        });

        insertTransaction();

        return { route_id, ...body };
    });

    // UPDATE route
    fastify.put('/routes/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = request.body as RouteBody;
        const {
            route_short_name, route_long_name, route_type,
            route_color, route_text_color, route_desc, route_url, route_sort_order,
            allowed_materials, agency_name, agency_id
        } = body;

        try {
            // 1. Handle Agency
            let agency_id_to_use = agency_id || null;

            if (agency_id_to_use === null && !agency_name) {
                // If neither provided, keep existing? Or allow clearing?
                // Usually existing logic kept it if not provided.
                const currentRoute = db.prepare('SELECT agency_id FROM routes WHERE route_id = ?').get(id) as { agency_id: string };
                if (currentRoute) {
                    agency_id_to_use = currentRoute.agency_id;
                }
            } else if (!agency_id_to_use && agency_name) {
                // Check if agency exists logic matching POST...
                const existingAgency = db.prepare('SELECT agency_id FROM agency WHERE agency_name = ?').get(agency_name) as { agency_id: string };

                if (existingAgency) {
                    agency_id_to_use = existingAgency.agency_id;
                } else {
                    // Create new agency
                    const newAgencyId = randomUUID();
                    // Basic insert for agency
                    db.prepare(`
                        INSERT INTO agency (agency_id, agency_name, agency_url, agency_timezone)
                        VALUES (?, ?, 'http://example.com', 'America/Los_Angeles')
                    `).run(newAgencyId, agency_name);
                    agency_id_to_use = newAgencyId;
                }
            }

            // 2. Update Route Transaction
            const updateTransaction = db.transaction(() => {
                const stmt = db.prepare(`
                    UPDATE routes SET
                        route_short_name = COALESCE(?, route_short_name),
                        route_long_name = COALESCE(?, route_long_name),
                        route_type = COALESCE(?, route_type),
                        route_color = COALESCE(?, route_color),
                        route_text_color = COALESCE(?, route_text_color),
                        route_desc = COALESCE(?, route_desc),
                        route_url = COALESCE(?, route_url),
                        route_sort_order = COALESCE(?, route_sort_order),
                        allowed_materials = COALESCE(?, allowed_materials),
                        agency_id = ?
                    WHERE route_id = ?
                `);

                stmt.run(
                    route_short_name,
                    route_long_name,
                    route_type,
                    route_color,
                    route_text_color,
                    route_desc,
                    route_url,
                    route_sort_order,
                    allowed_materials,
                    agency_id_to_use,
                    id
                );

                // Update Parkings
                // If parkings is explicitly provided (even if empty array), update. 
                // If undefined, maybe keep existing? Assuming provided means full replace.
                if (body.parkings !== undefined) {
                    // Delete existing
                    db.prepare('DELETE FROM route_parkings WHERE route_id = ?').run(id);

                    // Insert new
                    if (Array.isArray(body.parkings)) {
                        const insertParking = db.prepare('INSERT INTO route_parkings (route_id, stop_id) VALUES (?, ?)');
                        for (const stopId of body.parkings) {
                            insertParking.run(id, stopId);
                        }
                    }
                }
            });

            updateTransaction();

            return { message: 'Route updated', route_id: id };

        } catch (error) {
            console.error('Update failed', error);
            return reply.code(500).send({ error: 'Failed to update route' });
        }
    });

    // DELETE route
    fastify.delete('/routes/:id', async (request, reply) => {
        const { id } = request.params as { id: string };

        try {
            // Check if route exists
            const check = db.prepare('SELECT route_id FROM routes WHERE route_id = ?').get(id);
            if (!check) {
                return reply.code(404).send({ error: 'Route not found' });
            }

            // Cascade delete transaction
            const deleteTransaction = db.transaction(() => {
                // 1. Get all trips for this route to clean up sub-tables
                const trips = db.prepare('SELECT trip_id, shape_id FROM trips WHERE route_id = ?').all(id) as { trip_id: string, shape_id: string }[];

                const deleteStopTimes = db.prepare('DELETE FROM stop_times WHERE trip_id = ?');
                const deleteShape = db.prepare('DELETE FROM shapes WHERE shape_id = ?');

                for (const trip of trips) {
                    deleteStopTimes.run(trip.trip_id);
                    if (trip.shape_id) {
                        deleteShape.run(trip.shape_id);
                    }
                }

                db.prepare('DELETE FROM trips WHERE route_id = ?').run(id);
                db.prepare('DELETE FROM routes WHERE route_id = ?').run(id);
            });

            deleteTransaction();
            return { message: 'Route and associated data deleted' };
        } catch (error) {
            console.error('Delete transaction failed:', error);
            // Return 500 with explicit JSON
            return reply.code(500).send({
                error: 'Failed to delete route',
                details: (error as Error).message
            });
        }
    });

    // SAVE Route Path (Sequence of Stops)
    interface PathBody {
        direction_id: number; // 0 or 1
        ordered_stop_ids: string[];
    }

    // GET Route Path (Sequence of Stops)
    fastify.get('/routes/:id/path', async (request, reply) => {
        const { id } = request.params as { id: string };
        const { direction_id } = request.query as { direction_id?: string };

        const dir = direction_id ? parseInt(direction_id) : 0;
        let trip_id = `t_${id}_${dir}`; // Default pattern trip ID

        try {
            // 1. Try to find the specific pattern trip first
            let stopTimes = db.prepare('SELECT stop_id FROM stop_times WHERE trip_id = ? ORDER BY stop_sequence ASC').all(trip_id) as { stop_id: string }[];

            // 2. If no pattern trip found, look for ANY trip in this route/direction
            // This supports imported GTFS data where trip_ids are arbitrary
            if (!stopTimes || stopTimes.length === 0) {
                const anyTrip = db.prepare('SELECT trip_id FROM trips WHERE route_id = ? AND direction_id = ? LIMIT 1').get(id, dir) as { trip_id: string };

                if (anyTrip) {
                    trip_id = anyTrip.trip_id;
                    stopTimes = db.prepare('SELECT stop_id FROM stop_times WHERE trip_id = ? ORDER BY stop_sequence ASC').all(trip_id) as { stop_id: string }[];
                }
            }

            if (!stopTimes || stopTimes.length === 0) {
                return { ordered_stop_ids: [] };
            }

            return { ordered_stop_ids: stopTimes.map(st => st.stop_id) };
        } catch (error) {
            console.error('Error fetching path:', error);
            return reply.code(500).send({ error: 'Failed to fetch path' });
        }
    });

    fastify.post('/routes/:id/path', async (request, reply) => {
        const { id } = request.params as { id: string };
        const { direction_id, ordered_stop_ids } = request.body as PathBody;

        if (direction_id !== 0 && direction_id !== 1) {
            return reply.code(400).send({ error: 'direction_id must be 0 or 1' });
        }
        if (!ordered_stop_ids || ordered_stop_ids.length < 2) {
            return reply.code(400).send({ error: 'ordered_stop_ids must have at least 2 stops' });
        }

        // 1. Create/Update Trip
        const service_id = 'c_1'; // Default service for now
        // ensure calendar exists
        db.prepare(`INSERT OR IGNORE INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
                  VALUES (?, 1, 1, 1, 1, 1, 1, 1, '20240101', '20241231')`).run(service_id);

        const trip_id = `t_${id}_${direction_id}`;

        const upsertTrip = db.prepare(`
          INSERT INTO trips (route_id, service_id, trip_id, trip_headsign, direction_id, shape_id)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(trip_id) DO UPDATE SET 
            trip_headsign=excluded.trip_headsign,
            shape_id=excluded.shape_id
      `);

        const shape_id = `sh_${id}_${direction_id}`;

        upsertTrip.run(id, service_id, trip_id, `Direction ${direction_id}`, direction_id, shape_id);

        // 2. Process Segments and Shapes
        // Delete existing shape points for this shape_id
        db.prepare('DELETE FROM shapes WHERE shape_id = ?').run(shape_id);

        // We will build the shape points list
        let shape_sequence = 1;
        let total_dist = 0;

        // Add first stop as first shape point
        const getStop = db.prepare('SELECT stop_lat, stop_lon FROM stops WHERE stop_id = ?');
        const startStop = getStop.get(ordered_stop_ids[0]) as { stop_lat: number, stop_lon: number };

        if (startStop) {
            db.prepare('INSERT INTO shapes (shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence, shape_dist_traveled) VALUES (?, ?, ?, ?, ?)')
                .run(shape_id, startStop.stop_lat, startStop.stop_lon, shape_sequence++, 0);
        }

        // Clear existing stop_times for this trip
        db.prepare('DELETE FROM stop_times WHERE trip_id = ?').run(trip_id);

        // Insert first stop_time
        const insertStopTime = db.prepare(`
          INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, shape_dist_traveled)
          VALUES (?, '08:00:00', '08:00:00', ?, ?, ?)
      `);
        insertStopTime.run(trip_id, ordered_stop_ids[0], 1, 0);


        // Loop through pairs
        for (let i = 0; i < ordered_stop_ids.length - 1; i++) {
            const fromId = ordered_stop_ids[i];
            const toId = ordered_stop_ids[i + 1];

            // Check/Create Segment
            // Look for segment in either direction
            let segment = db.prepare(`
                SELECT * FROM segments 
                WHERE (start_node_id = ? AND end_node_id = ?)
                   OR (start_node_id = ? AND end_node_id = ?)
            `).get(fromId, toId, toId, fromId) as any;

            let isReverse = false;

            if (segment) {
                // If found, check direction
                if (segment.start_node_id === toId && segment.end_node_id === fromId) {
                    isReverse = true;
                }
            } else {
                // Auto-create segment WITH ROUTING (Default A->B)
                const segId = randomUUID();
                let dist = 0;
                let time = 0;
                let geom = null;

                const fromNode = getStop.get(fromId) as { stop_lat: number, stop_lon: number };
                const toNode = getStop.get(toId) as { stop_lat: number, stop_lon: number };

                try {
                    if (fromNode && toNode) {
                        const routeData = await fetchRoute(
                            [fromNode.stop_lon, fromNode.stop_lat],
                            [toNode.stop_lon, toNode.stop_lat]
                        );
                        if (routeData) {
                            dist = routeData.distance;
                            time = routeData.duration;
                            geom = JSON.stringify(routeData.geometry);
                        }
                    }
                } catch (e) {
                    console.warn('Routing failed during path creation', e);
                }

                if (!geom && fromNode && toNode) {
                    console.log('Using straight-line fallback for path segment');
                    geom = JSON.stringify({
                        type: 'LineString',
                        coordinates: [[fromNode.stop_lon, fromNode.stop_lat], [toNode.stop_lon, toNode.stop_lat]]
                    });
                    // Calculate straight distance as fallback
                    const R = 6371e3;
                    const φ1 = fromNode.stop_lat * Math.PI / 180;
                    const φ2 = toNode.stop_lat * Math.PI / 180;
                    const Δφ = (toNode.stop_lat - fromNode.stop_lat) * Math.PI / 180;
                    const Δλ = (toNode.stop_lon - fromNode.stop_lon) * Math.PI / 180;
                    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                        Math.cos(φ1) * Math.cos(φ2) *
                        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    dist = R * c;
                }

                db.prepare('INSERT INTO segments (segment_id, start_node_id, end_node_id, distance, travel_time, geometry) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(segId, fromId, toId, dist, time, geom);

                segment = { distance: dist, geometry: geom, start_node_id: fromId, end_node_id: toId };
            }

            // Add to shape
            // If segment has geometry (GeoJSON LineString), use its points
            if (segment.geometry) {
                try {
                    const geoJson = typeof segment.geometry === 'string' ? JSON.parse(segment.geometry) : segment.geometry;

                    if (geoJson.type === 'LineString' && Array.isArray(geoJson.coordinates)) {
                        let coords = geoJson.coordinates as number[][];

                        // If using reverse segment, reverse the coordinates
                        if (isReverse) {
                            coords = [...coords].reverse();
                        }

                        // Iterate explicit points and accumulate distance
                        // We need to calculate distance between points to increment shape_dist_traveled correctly
                        for (let k = 0; k < coords.length; k++) {
                            const coord = coords[k]; // [lon, lat]

                            // Calculate distance from previous point to this point
                            let segmentStepDist = 0;
                            if (k > 0) {
                                const prev = coords[k - 1];
                                // Haversine formula approximation for short distances
                                const R = 6371e3; // metres
                                const φ1 = prev[1] * Math.PI / 180; // lat
                                const φ2 = coord[1] * Math.PI / 180;
                                const Δφ = (coord[1] - prev[1]) * Math.PI / 180;
                                const Δλ = (coord[0] - prev[0]) * Math.PI / 180;
                                const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                                    Math.cos(φ1) * Math.cos(φ2) *
                                    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
                                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                                segmentStepDist = R * c;
                            }

                            total_dist += segmentStepDist;

                            db.prepare('INSERT INTO shapes (shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence, shape_dist_traveled) VALUES (?, ?, ?, ?, ?)')
                                .run(shape_id, coord[1], coord[0], shape_sequence++, total_dist);
                        }
                    }
                } catch (e) {
                    console.warn('Error parsing segment geometry', e);
                    // Fallback below
                }
            } else {
                // Fallback: Straight line to next stop
                const toStop = getStop.get(toId) as { stop_lat: number, stop_lon: number };

                // Calculate straight line distance
                const fromStop = getStop.get(fromId) as { stop_lat: number, stop_lon: number };
                let straightDist = 0;
                if (fromStop && toStop) {
                    const R = 6371e3;
                    const φ1 = fromStop.stop_lat * Math.PI / 180;
                    const φ2 = toStop.stop_lat * Math.PI / 180;
                    const Δφ = (toStop.stop_lat - fromStop.stop_lat) * Math.PI / 180;
                    const Δλ = (toStop.stop_lon - fromStop.stop_lon) * Math.PI / 180;
                    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                        Math.cos(φ1) * Math.cos(φ2) *
                        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    straightDist = R * c;
                }

                total_dist += straightDist;

                if (toStop) {
                    db.prepare('INSERT INTO shapes (shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence, shape_dist_traveled) VALUES (?, ?, ?, ?, ?)')
                        .run(shape_id, toStop.stop_lat, toStop.stop_lon, shape_sequence++, total_dist);
                }
            }

            // Insert stop_time
            insertStopTime.run(trip_id, toId, i + 2, total_dist);
        }

        return { message: 'Path saved', trip_id, shape_id, stops_count: ordered_stop_ids.length };
    });
}
