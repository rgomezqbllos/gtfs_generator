import { FastifyInstance } from 'fastify';
import db from '../db';
import AdmZip from 'adm-zip';

interface ExportBody {
    agency_ids?: string[];
    service_ids?: string[];
    route_ids?: string[];
}

export default async function exportRoutes(fastify: FastifyInstance) {

    fastify.post('/gtfs/export', async (request, reply) => {
        const { agency_ids, service_ids, route_ids } = request.body as ExportBody || {};
        const zip = new AdmZip();

        // Helper to add table to zip as csv
        const addTableToZip = (fileName: string, rows: any[]) => {
            if (rows.length === 0) return;

            const headers = Object.keys(rows[0]);
            const csvContent = [
                headers.join(','),
                ...rows.map(row => headers.map(h => {
                    const val = row[h];
                    if (val === null || val === undefined) return '';
                    if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
                    return val;
                }).join(','))
            ].join('\n');

            zip.addFile(fileName, Buffer.from(csvContent, 'utf8'));
        };

        try {
            // 1. Filter Agencies
            let agencyQuery = 'SELECT * FROM agency';
            const agencyParams: string[] = [];
            if (agency_ids && agency_ids.length > 0) {
                const ph = agency_ids.map(() => '?').join(',');
                agencyQuery += ` WHERE agency_id IN (${ph})`;
                agencyParams.push(...agency_ids);
            }
            const agencies = db.prepare(agencyQuery).all(...agencyParams) as any[];

            // FIX: Validate Timezones
            agencies.forEach(a => {
                if (a.agency_timezone === 'America/Mexico') a.agency_timezone = 'America/Mexico_City';
            });

            const finalAgencyIds = agencies.map(a => a.agency_id);

            if (finalAgencyIds.length === 0) {
                // No agencies selected/found -> Empty Zip
                const buffer = zip.toBuffer();
                reply.header('Content-Type', 'application/zip');
                reply.header('Content-Disposition', 'attachment; filename="gtfs.zip"');
                return reply.send(buffer);
            }

            // 2. Filter Routes (by Agency AND optional specific route_ids)
            let routesQuery = `SELECT * FROM routes WHERE agency_id IN (${finalAgencyIds.map(() => '?').join(',')})`;
            const routesParams: string[] = [...finalAgencyIds];

            if (route_ids && route_ids.length > 0) {
                const ph = route_ids.map(() => '?').join(',');
                routesQuery += ` AND route_id IN (${ph})`;
                routesParams.push(...route_ids);
            }

            const routes = db.prepare(routesQuery).all(...routesParams) as any[];
            const finalRouteIds = routes.map(r => r.route_id);

            // 3. Filter Calendar (Service IDs)
            let calendarQuery = 'SELECT * FROM calendar';
            const calendarParams: string[] = [];
            if (service_ids && service_ids.length > 0) {
                const ph = service_ids.map(() => '?').join(',');
                calendarQuery += ` WHERE service_id IN (${ph})`;
                calendarParams.push(...service_ids);
            }
            const calendars = db.prepare(calendarQuery).all(...calendarParams) as any[];
            const finalServiceIds = calendars.map(c => c.service_id);

            // 4. Filter Trips (by Routes AND Services)
            let trips: any[] = [];
            if (finalRouteIds.length > 0 && finalServiceIds.length > 0) {
                const routePh = finalRouteIds.map(() => '?').join(',');
                const servicePh = finalServiceIds.map(() => '?').join(',');

                trips = db.prepare(`
                    SELECT * FROM trips 
                    WHERE route_id IN (${routePh}) 
                    AND service_id IN (${servicePh})
                    AND trip_id NOT LIKE 't_%'
                `).all(...finalRouteIds, ...finalServiceIds);
            }

            const finalTripIds = trips.map(t => t.trip_id);

            // 5. Filter Stop Times (by Trips)
            let stopTimes: any[] = [];
            if (finalTripIds.length > 0) {
                const tripPh = finalTripIds.map(() => '?').join(',');
                stopTimes = db.prepare(`SELECT * FROM stop_times WHERE trip_id IN (${tripPh}) ORDER BY trip_id, stop_sequence`).all(...finalTripIds);
            }

            // 6. Filter Stops (by Stop Times)
            let stops: any[] = [];
            const usedStopIds = [...new Set(stopTimes.map(st => st.stop_id))];
            if (usedStopIds.length > 0) {
                const stopPh = usedStopIds.map(() => '?').join(',');
                stops = db.prepare(`SELECT * FROM stops WHERE stop_id IN (${stopPh})`).all(...usedStopIds);
            }
            const stopsMap = new Map(stops.map(s => [s.stop_id, s]));

            // --- FIX: Post-Process Stop Times (Time Wrapping & Distances) ---
            const getDistHelper = (lat1: number, lon1: number, lat2: number, lon2: number) => {
                const R = 6371000; // meters
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            };
            const toKm3 = (meters: number) => Number((meters / 1000).toFixed(3));

            const tripStopTimesMap = new Map<string, any[]>();
            stopTimes.forEach(st => {
                if (!tripStopTimesMap.has(st.trip_id)) tripStopTimesMap.set(st.trip_id, []);
                tripStopTimesMap.get(st.trip_id)?.push(st);
            });

            // Clear original array to rebuild it sorted and fixed
            stopTimes.length = 0;

            tripStopTimesMap.forEach((tripStops, tripId) => {
                tripStops.sort((a, b) => a.stop_sequence - b.stop_sequence);

                let dayOffset = 0;
                let lastDepartureSecs = -1;
                let distTraveled = 0;
                let lastLat = 0;
                let lastLon = 0;
                let previousDistTraveled = -1;

                const parseSeconds = (t: string) => {
                    if (!t) return 0;
                    const [h, m, s] = t.split(':').map(Number);
                    return h * 3600 + m * 60 + s;
                };

                const formatSeconds = (s: number) => {
                    const h = Math.floor(s / 3600);
                    const m = Math.floor((s % 3600) / 60);
                    const sec = Math.floor(s % 60);
                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
                };

                tripStops.forEach((st, idx) => {
                    // 1. Time Wrapping
                    const arrVal = parseSeconds(st.arrival_time);
                    const depVal = parseSeconds(st.departure_time);

                    if (idx > 0 && lastDepartureSecs !== -1) {
                        if ((arrVal + dayOffset) < lastDepartureSecs) {
                            dayOffset += 86400;
                        }
                    }

                    const effectiveArr = arrVal + dayOffset;
                    let effectiveDep = depVal + dayOffset;

                    if (effectiveDep < effectiveArr) {
                        if ((depVal + dayOffset + 86400) >= effectiveArr) {
                            effectiveDep += 86400;
                        }
                    }

                    st.arrival_time = formatSeconds(effectiveArr);
                    st.departure_time = formatSeconds(effectiveDep);
                    lastDepartureSecs = effectiveDep;

                    // 2. Distance Calculation
                    const stopInfo = stopsMap.get(st.stop_id);
                    if (stopInfo) {
                        if (idx === 0) {
                            distTraveled = 0;
                        } else {
                            const d = getDistHelper(lastLat, lastLon, stopInfo.stop_lat, stopInfo.stop_lon);
                            distTraveled += d;
                        }

                        st.shape_dist_traveled = toKm3(distTraveled);

                        // Keep strictly increasing values after 3-decimal rounding.
                        if (st.shape_dist_traveled <= previousDistTraveled) {
                            st.shape_dist_traveled = Number((previousDistTraveled + 0.001).toFixed(3));
                        }

                        previousDistTraveled = st.shape_dist_traveled;
                        lastLat = stopInfo.stop_lat;
                        lastLon = stopInfo.stop_lon;
                    }
                    stopTimes.push(st);
                });
            });

            // 7. Generate Shapes from Segments
            // Fetch all segments for lookup
            const allSegments = db.prepare('SELECT * FROM segments').all() as any[];
            // Create lookup: start_id|end_id -> segment
            const segmentLookup = new Map<string, any>();
            allSegments.forEach(seg => {
                segmentLookup.set(`${seg.start_node_id}|${seg.end_node_id}`, seg);
            });

            const shapes: any[] = [];
            const generatedShapeIds = new Set<string>();
            const shapeCache = new Map<string, string>(); // stopSequenceKey -> shape_id

            // Group stop times by trip
            const tripStopTimes = new Map<string, any[]>();
            stopTimes.forEach(st => {
                if (!tripStopTimes.has(st.trip_id)) tripStopTimes.set(st.trip_id, []);
                tripStopTimes.get(st.trip_id)?.push(st);
            });

            // Process each trip to assign shape_id and generate shapes.txt
            trips.forEach(trip => {
                const tripStops = tripStopTimes.get(trip.trip_id);
                if (!tripStops || tripStops.length < 2) return;

                // Sort by sequence just in case
                tripStops.sort((a, b) => a.stop_sequence - b.stop_sequence);

                // Create a key for this sequence of stops to reuse shapes
                const stopSequenceKey = tripStops.map((st: any) => st.stop_id).join('|');

                let shapeId = shapeCache.get(stopSequenceKey);

                if (!shapeId) {
                    // Generate new shape
                    shapeId = `shp_${trip.route_id}_${trip.direction_id || 0}_${generatedShapeIds.size + 1}`;
                    shapeCache.set(stopSequenceKey, shapeId);
                    generatedShapeIds.add(shapeId);

                    let distTraveled = 0;
                    let seq = 1;

                    // Add first point (start stop)
                    const firstStop = stopsMap.get(tripStops[0].stop_id);
                    if (firstStop) {
                        shapes.push({
                            shape_id: shapeId,
                            shape_pt_lat: firstStop.stop_lat,
                            shape_pt_lon: firstStop.stop_lon,
                            shape_pt_sequence: seq++,
                            shape_dist_traveled: toKm3(distTraveled)
                        });
                    }

                    // Iterate segments
                    for (let i = 0; i < tripStops.length - 1; i++) {
                        const fromId = tripStops[i].stop_id;
                        const toId = tripStops[i + 1].stop_id;
                        const seg = segmentLookup.get(`${fromId}|${toId}`);

                        if (seg && seg.geometry) {
                            try {
                                const geo = JSON.parse(seg.geometry);
                                if (geo.type === 'LineString' && Array.isArray(geo.coordinates)) {
                                    // Process coordinates
                                    // Note: First coord usually matches start stop, last matches end stop
                                    // We skip the very first coord if it matches the previous point to avoid duplicates?
                                    // Or just dump them all? GTFS allows close points.
                                    // Let's refine: The segment includes start and end points.
                                    // We already added the start point of the WHOLE trip (or previous segment end).
                                    // So for each segment, we can skip the first coordinate if it overlaps.

                                    geo.coordinates.forEach((coord: number[], idx: number) => {
                                        // Skip first point if it's strictly equal to previous? 
                                        // Simplest is to just add them, but for distance calc we need to be careful.
                                        // We'll calculate distance step by step.

                                        if (idx === 0 && i === 0) return; // Skip very first point if it was added as stop? 
                                        // Actually segments usually start exactly at the stop. 
                                        // But `shapes` table needs pure geometry points.
                                        // Let's just use the segment geometry points.
                                        // Correction: The "firstStop" added above is likely the same as geo.coordinates[0].
                                        // To be safe and clean, let's remove the "firstStop" explicit add above and just rely on segments?
                                        // BUT what if there is no segment? We should fallback to straight line.
                                    });

                                    // Better approach:
                                    // 1. Point 0 matches FromStop.
                                    // 2. Point N matches ToStop.
                                    // We want all points from index 1 to N (inclusive).
                                    // And for the very first segment, we also want index 0.

                                    // Calculation of distance for points:
                                    // MapLibre coords are [lon, lat].

                                    let prevLon = geo.coordinates[0][0];
                                    let prevLat = geo.coordinates[0][1];

                                    // If this is the very first segment, add the start point
                                    if (i === 0) {
                                        // (We already added firstStop, but let's confirm consistency)
                                        // Let's rely on the explicit First Stop added earlier for seq=1 
                                        // so we skip idx=0 here? 
                                        // Actually, let's reset and do it cleanly loop-based:
                                    }
                                }
                            } catch (e) {
                                // fallback
                            }
                        }
                    }
                }
                trip.shape_id = shapeId;
            });

            // RE-IMPLEMENTATION of Shape Generation Loop for clarity/correctness
            // We need to clear `shapes` and `shapeCache` and restart the loop logic inside the try block
            // to make sure it's correct.

            // Clear what we started above to avoid duplicates/confusion in this unique replace block
            shapes.length = 0;
            generatedShapeIds.clear();
            shapeCache.clear();

            // Helper for distance (Haversine-ish or just simple Euclidean for small diffs? standard is Haversine)
            const getDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
                const R = 6371000; // meters
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            };

            trips.forEach(trip => {
                const tripStops = tripStopTimes.get(trip.trip_id);
                if (!tripStops || tripStops.length < 2) return;

                // Sort by sequence
                tripStops.sort((a, b) => a.stop_sequence - b.stop_sequence);

                // Create Key
                const stopSequenceKey = tripStops.map((st: any) => st.stop_id).join('|');

                let shapeId = shapeCache.get(stopSequenceKey);

                if (!shapeId) {
                    shapeId = `shp_${trip.route_id}_${trip.direction_id || 0}`;
                    // If multiple variants exist for same route/direction but different stops, append variant
                    // But if key differs, we need unique ID. 
                    // Let's suffix with increment if collision, or just use sequence key hash?
                    // Simple approach: shp_route_dir_index
                    shapeId = `shp_${trip.route_id}_${trip.direction_id || 0}_${generatedShapeIds.size + 1}`;

                    shapeCache.set(stopSequenceKey, shapeId);
                    generatedShapeIds.add(shapeId);

                    let distTraveled = 0;
                    let lastLat = 0, lastLon = 0;

                    // STRICT MODE: Generate Shape Points ONLY from Stops
                    // The user explicitly requested shapes to match stop sequences (1:1 count).
                    // We ignore segment geometry and just connect stops with straight lines.

                    tripStops.forEach((st: any, idx: number) => {
                        const stop = stopsMap.get(st.stop_id);
                        if (!stop) return;

                        if (idx > 0) {
                            distTraveled += getDist(lastLat, lastLon, stop.stop_lat, stop.stop_lon);
                        }

                        shapes.push({
                            shape_id: shapeId,
                            shape_pt_lat: Number(stop.stop_lat.toFixed(6)),
                            shape_pt_lon: Number(stop.stop_lon.toFixed(6)),
                            shape_pt_sequence: idx + 1, // 1-based sequence
                            shape_dist_traveled: toKm3(distTraveled)
                        });

                        lastLat = stop.stop_lat;
                        lastLon = stop.stop_lon;
                    });
                }

                // Assign shape_id to trip for trips.txt
                trip.shape_id = shapeId;
            });


            // Add to Zip (Strict 7 files)
            addTableToZip('agency.txt', agencies);
            addTableToZip('stops.txt', stops);
            addTableToZip('routes.txt', routes);
            addTableToZip('trips.txt', trips);
            addTableToZip('stop_times.txt', stopTimes);
            addTableToZip('calendar.txt', calendars);
            addTableToZip('shapes.txt', shapes);

            // NO segments.txt

            const buffer = zip.toBuffer();

            reply.header('Content-Type', 'application/zip');
            reply.header('Content-Disposition', 'attachment; filename="gtfs.zip"');
            reply.send(buffer);
        } catch (err) {
            request.log.error(err);
            reply.code(500).send({ error: 'Failed to generate export' });
        }
    });

    fastify.post('/gtfs/export-travel-times', async (request, reply) => {
        const { agency_ids, service_id, custom_version, route_ids } = request.body as any;

        try {
            if ((!agency_ids || agency_ids.length === 0) && (!route_ids || route_ids.length === 0)) {
                return reply.code(400).send({ error: 'agency_ids or route_ids is required' });
            }

            const formatMins = (seconds: number) => {
                const totalMins = Math.round(seconds / 60);
                const h = Math.floor(totalMins / 60);
                const m = totalMins % 60;
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            };

            let routes: any[] = [];
            if (route_ids && route_ids.length > 0) {
                const rPh = route_ids.map(() => '?').join(',');
                routes = db.prepare(`SELECT * FROM routes WHERE route_id IN (${rPh})`).all(...route_ids) as any[];
            } else if (agency_ids && agency_ids.length > 0) {
                const ph = agency_ids.map(() => '?').join(',');
                routes = db.prepare(`SELECT * FROM routes WHERE agency_id IN (${ph})`).all(...agency_ids) as any[];
            }

            if (routes.length === 0) return reply.send('');

            const allStops = db.prepare('SELECT * FROM stops').all() as any[];
            const stopsMap = new Map(allStops.map((s: any) => [s.stop_id, s]));

            const outputRows: any[] = [];

            for (const route of routes) {
                for (const direction of [0, 1]) {
                    const trip_id = `t_${route.route_id}_${direction}`;
                    let stopTimes = db.prepare('SELECT stop_id FROM stop_times WHERE trip_id = ? ORDER BY stop_sequence ASC').all(trip_id) as any[];

                    if (!stopTimes || stopTimes.length === 0) {
                        const anyTrip = db.prepare('SELECT trip_id FROM trips WHERE route_id = ? AND direction_id = ? LIMIT 1').get(route.route_id, direction) as any;
                        if (anyTrip) {
                            stopTimes = db.prepare('SELECT stop_id FROM stop_times WHERE trip_id = ? ORDER BY stop_sequence ASC').all(anyTrip.trip_id) as any[];
                        }
                    }

                    if (!stopTimes || stopTimes.length < 2) continue;
                    const stopIds = stopTimes.map((st: any) => st.stop_id);

                    const segments: any[] = [];
                    for (let i = 0; i < stopIds.length - 1; i++) {
                        const sId = stopIds[i];
                        const eId = stopIds[i + 1];
                        const seg = db.prepare('SELECT * FROM segments WHERE start_node_id = ? AND end_node_id = ?').get(sId, eId) as any;
                        if (seg) segments.push(seg);
                    }
                    if (segments.length === 0) continue;

                    // Fetch slots
                    const segPh = segments.map((_: any) => '?').join(',');
                    const segIds = segments.map((s: any) => s.segment_id);
                    const slots = db.prepare(`SELECT * FROM segment_time_slots WHERE segment_id IN (${segPh})`).all(...segIds) as any[];

                    const boundaries = new Set<string>(['00:00:00', '36:00:00']);
                    slots.forEach((s: any) => {
                        boundaries.add(s.start_time);
                        boundaries.add(s.end_time);
                    });
                    const sortedBands = Array.from(boundaries).sort();

                    const dayType = service_id || '';
                    const versionStr = custom_version || '';

                    for (let i = 0; i < segments.length; i++) {
                        const seg = segments[i];
                        const sId = stopIds[i];
                        const eId = stopIds[i + 1];

                        const depStop = stopsMap.get(sId);
                        const arrStop = stopsMap.get(eId);
                        if (!depStop || !arrStop) continue;

                        const departureName = `${depStop.stop_code ? depStop.stop_code + '-' : ''}${depStop.stop_name}`;
                        const arrivalName = `${arrStop.stop_code ? arrStop.stop_code + '-' : ''}${arrStop.stop_name}`;

                        let lastTtm = -1;
                        let currentBandStart = '';

                        // Trip records for this segment across time bands
                        for (let j = 0; j < sortedBands.length - 1; j++) {
                            const start = sortedBands[j];
                            const end = sortedBands[j + 1];
                            if (start === end) continue;

                            let tt = seg.travel_time || 0;
                            const activeSlot = slots.find((s: any) => s.segment_id === seg.segment_id && start >= s.start_time && start < s.end_time);
                            if (activeSlot) tt = activeSlot.travel_time;

                            if (lastTtm === -1) {
                                lastTtm = tt;
                                currentBandStart = start;
                            } else if (lastTtm !== tt) {
                                outputRows.push({
                                    Line: route.route_short_name,
                                    Route: `${route.route_short_name}-${direction}`,
                                    Version: versionStr,
                                    DayType: dayType,
                                    Type: 'trip',
                                    Departure: departureName,
                                    Arrival: arrivalName,
                                    Start: currentBandStart,
                                    End: start,
                                    MinTime: formatMins(Math.max(0, lastTtm - 60)),
                                    OptTime: formatMins(lastTtm),
                                    MaxTime: formatMins(lastTtm + 60)
                                });
                                lastTtm = tt;
                                currentBandStart = start;
                            }
                        }

                        if (lastTtm !== -1) {
                            outputRows.push({
                                Line: route.route_short_name,
                                Route: `${route.route_short_name}-${direction}`,
                                Version: versionStr,
                                DayType: dayType,
                                Type: 'trip',
                                Departure: departureName,
                                Arrival: arrivalName,
                                Start: currentBandStart,
                                End: '36:00:00',
                                MinTime: formatMins(Math.max(0, lastTtm - 60)),
                                OptTime: formatMins(lastTtm),
                                MaxTime: formatMins(lastTtm + 60)
                            });
                        }

                        // Stop record for the departure stop of this segment
                        outputRows.push({
                            Line: route.route_short_name,
                            Route: `${route.route_short_name}-${direction}`,
                            Version: versionStr,
                            DayType: dayType,
                            Type: 'stop',
                            Departure: departureName,
                            Arrival: departureName,
                            Start: '00:00:00',
                            End: '36:00:00',
                            MinTime: '00:00',
                            OptTime: '00:00',
                            MaxTime: '00:00'
                        });
                    }

                    // Add one STOP row at the very end for the final arrival stop
                    const finalStopId = stopIds[stopIds.length - 1];
                    const finalStop = stopsMap.get(finalStopId);
                    if (finalStop) {
                        const finalName = `${finalStop.stop_code ? finalStop.stop_code + '-' : ''}${finalStop.stop_name}`;
                        outputRows.push({
                            Line: route.route_short_name,
                            Route: `${route.route_short_name}-${direction}`,
                            Version: versionStr,
                            DayType: dayType,
                            Type: 'stop',
                            Departure: finalName,
                            Arrival: finalName,
                            Start: '00:00:00',
                            End: '36:00:00',
                            MinTime: '00:00',
                            OptTime: '00:00',
                            MaxTime: '00:00'
                        });
                    }
                }
            }

            if (outputRows.length === 0) {
                return reply.send('');
            }

            const headers = ['Line', 'Route', 'Version', 'DayType', 'Type', 'Departure', 'Arrival', 'Start', 'End', 'MinTime', 'OptTime', 'MaxTime'];
            const csvContent = [
                headers.join(';'),
                ...outputRows.map(row => headers.map(h => {
                    const val = row[h as keyof typeof row];
                    if (val === null || val === undefined) return '';
                    if (typeof val === 'string' && val.includes(';')) return `"${val}"`;
                    return val;
                }).join(';'))
            ].join('\n');

            reply.header('Content-Type', 'text/csv; charset=utf-8');
            reply.header('Content-Disposition', 'attachment; filename="trips_times.csv"');
            return reply.send(csvContent);

        } catch (err) {
            request.log.error(err);
            reply.code(500).send({ error: 'Failed to generate travel times export' });
        }
    });
}
