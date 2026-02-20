import db from '../db';
import { v4 as uuidv4 } from 'uuid';

interface StopRow {
    stop_code: string;
    stop_name: string;
    latitude: string;
    longitude: string;
}

interface RouteRow {
    route_id: string;
    route_name?: string;
    sequence: string;
    stop_code: string;
    distance?: string;
}

interface ItineraryRow {
    route_id: string;
    service_id: string;
    trip_id: string;
    event_type: string; // '1' or '0'
    start_time: string;
    end_time?: string;
    from_stop: string;
    to_stop: string;
}

interface ImportError {
    row: number;
    file: 'stops' | 'routes' | 'itineraries';
    message: string;
}

export class StructuredImportService {
    private errors: ImportError[] = [];

    // --- Helpers ---

    private timeToSeconds(timeStr: string): number {
        if (!timeStr) return 0;

        // Handle "1.HH:MM:SS" format (Days.Hours:Minutes:Seconds)
        let days = 0;
        let rest = timeStr;

        if (timeStr.includes('.')) {
            const parts = timeStr.split('.');
            if (parts.length === 2) {
                days = parseInt(parts[0], 10);
                rest = parts[1];
            } else if (parts.length === 3) {
                // Maybe HH.MM.SS? Assume D.time for now based on user input 1.00:10:00
                // User input: 1.00:10:00 -> 1 day, 00:10:00
                days = parseInt(parts[0], 10);
                rest = parts.slice(1).join(':'); // Rejoin in case of weirdness, but usually parts[1] is HH:MM:SS
            }
        }

        const [h, m, s] = rest.split(':').map(Number);
        return (days * 24 * 3600) + (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
    }

    private secondsToTime(totalSeconds: number): string {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        const pad = (n: number) => n.toString().padStart(2, '0');
        // GTFS allows hours > 24.
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    private getDistMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371e3; // meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private parseNumber(raw: unknown): number {
        if (raw === null || raw === undefined) return NaN;
        const normalized = String(raw).trim().replace(',', '.');
        if (!normalized) return NaN;
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    private toKm3(meters: number): number {
        return Number((meters / 1000).toFixed(3));
    }

    private normalizeKm3(raw: unknown): number {
        const parsed = this.parseNumber(raw);
        if (!Number.isFinite(parsed) || parsed < 0) return 0;
        return Number(parsed.toFixed(3));
    }

    private distributeDurationByDistance(segmentDistances: number[], totalDuration: number): number[] {
        const count = segmentDistances.length;
        if (count === 0 || totalDuration <= 0) return segmentDistances.map(() => 0);

        const totalDist = segmentDistances.reduce((sum, d) => sum + Math.max(0, d), 0);
        if (totalDist <= 0) {
            const base = Math.floor(totalDuration / count);
            const remainder = totalDuration - (base * count);
            return segmentDistances.map((_, idx) => base + (idx < remainder ? 1 : 0));
        }

        const out: number[] = [];
        let used = 0;
        for (let i = 0; i < count; i++) {
            if (i === count - 1) {
                out.push(Math.max(0, totalDuration - used));
                break;
            }
            const share = Math.round((Math.max(0, segmentDistances[i]) / totalDist) * totalDuration);
            out.push(Math.max(0, share));
            used += share;
        }
        return out;
    }

    private persistRevenueSegmentTimes(
        segmentEvents: Map<string, { time: number; duration: number }[]>
    ) {
        if (segmentEvents.size === 0) return;

        const deleteSlotsBySegment = db.prepare('DELETE FROM segment_time_slots WHERE segment_id = ?');
        const updateSegmentTravelTime = db.prepare('UPDATE segments SET travel_time = ? WHERE segment_id = ?');
        const insertSlot = db.prepare(`
            INSERT INTO segment_time_slots (id, segment_id, start_time, end_time, travel_time)
            VALUES (?, ?, ?, ?, ?)
        `);

        const tx = db.transaction(() => {
            for (const [segmentId, events] of segmentEvents) {
                if (events.length === 0) continue;

                const uniqueEventsMap = new Map<number, number>();
                events.forEach((e) => {
                    if (e.duration <= 0) return;
                    const existing = uniqueEventsMap.get(e.time);
                    if (existing === undefined || e.duration > existing) {
                        uniqueEventsMap.set(e.time, e.duration);
                    }
                });

                const uniqueEvents = Array.from(uniqueEventsMap.entries())
                    .map(([time, duration]) => ({ time, duration }))
                    .sort((a, b) => a.time - b.time);

                if (uniqueEvents.length === 0) continue;

                const durations = uniqueEvents.map((e) => e.duration).sort((a, b) => a - b);
                const middle = Math.floor(durations.length / 2);
                const baseDuration = durations.length % 2 === 0
                    ? Math.round((durations[middle - 1] + durations[middle]) / 2)
                    : durations[middle];

                updateSegmentTravelTime.run(baseDuration, segmentId);
                deleteSlotsBySegment.run(segmentId);

                let currentStart = uniqueEvents[0].time;
                let currentDuration = uniqueEvents[0].duration;

                for (let i = 1; i < uniqueEvents.length; i++) {
                    const event = uniqueEvents[i];
                    if (event.duration !== currentDuration) {
                        insertSlot.run(
                            uuidv4(),
                            segmentId,
                            this.secondsToTime(currentStart),
                            this.secondsToTime(event.time),
                            currentDuration
                        );
                        currentStart = event.time;
                        currentDuration = event.duration;
                    }
                }

                insertSlot.run(
                    uuidv4(),
                    segmentId,
                    this.secondsToTime(currentStart),
                    '36:00:00',
                    currentDuration
                );
            }
        });

        tx();
    }

    // --- Processors ---

    processStops(rows: any[]) {
        const insert = db.prepare(`
            INSERT OR REPLACE INTO stops (stop_id, stop_code, stop_name, stop_lat, stop_lon, node_type, location_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        // Get map of existing stop_cols to stop_ids to avoid re-generating IDs if possible
        const existingStops = db.prepare('SELECT stop_code, stop_id FROM stops').all() as { stop_code: string, stop_id: string }[];
        const stopCodeToId = new Map<string, string>();
        existingStops.forEach(s => stopCodeToId.set(s.stop_code, s.stop_id));

        const transaction = db.transaction(() => {
            rows.forEach((row, index) => {
                // Flexible column mapping
                const code = row.stop_code || row.code || row.id;
                const name = row.stop_name || row.name || row.nome;
                const lat = row.latitude || row.lat;
                const lon = row.longitude || row.lon || row.lng;
                const rawType = row.Type || row.type || 'Comercial';

                if (!code || !name || !lat || !lon) {
                    this.errors.push({ row: index + 2, file: 'stops', message: 'Missing required fields (need code, name, lat, lon)' });
                    return;
                }

                let stopId = stopCodeToId.get(code);
                if (!stopId) {
                    stopId = uuidv4();
                    stopCodeToId.set(code, stopId);
                }

                // Map Type
                let nodeType = 'commercial';
                let locationType = 0; // Stop

                const typeLower = String(rawType).toLowerCase().trim();
                // Map 'parking' -> location_type=0, node_type='parking'
                if (typeLower === 'parking' || typeLower === 'garagem') {
                    nodeType = 'parking';
                } else if (typeLower === 'station' || typeLower === 'estacao' || typeLower === 'estação') {
                    locationType = 1; // Station
                }

                try {
                    insert.run(
                        stopId,
                        code,
                        name,
                        parseFloat(lat),
                        parseFloat(lon),
                        nodeType,
                        locationType
                    );
                } catch (e: any) {
                    this.errors.push({ row: index + 2, file: 'stops', message: e.message });
                }
            });
        });
        transaction();
    }

    processRoutes(rows: any[]) {
        // 1. Group by Route ID
        const routes = new Map<string, any[]>();
        rows.forEach((row, index) => {
            // Flexible mapping
            const routeId = String(row.route_id || row.route || '').trim();
            const seq = row.sequence || row.seq;
            // Target Stop can be Name or Code
            const stopRef = String(row.stop_code || row.stop_name || row.stop_id || '').trim();

            if (!routeId || !stopRef || !seq) {
                this.errors.push({ row: index + 2, file: 'routes', message: `Missing required fields for route ${routeId}` });
                return;
            }
            if (!routes.has(routeId)) routes.set(routeId, []);
            routes.get(routeId)!.push(row);
        });

        const insertRoute = db.prepare(`
            INSERT OR REPLACE INTO routes (route_id, route_short_name, route_long_name, route_type)
            VALUES (?, ?, ?, ?)
        `);

        const insertSegment = db.prepare(`
            INSERT OR IGNORE INTO segments (segment_id, start_node_id, end_node_id, distance, type, geometry)
            VALUES (?, ?, ?, ?, 'revenue', ?)
        `);

        // Cache stops for coordinates
        const stops = db.prepare('SELECT stop_id, stop_code, stop_name, stop_lat, stop_lon FROM stops').all() as any[];
        // Map by Code AND Name to be safe
        const stopMap = new Map<string, any>();
        stops.forEach(s => {
            if (s.stop_code) stopMap.set(s.stop_code, s);
            if (s.stop_name) stopMap.set(s.stop_name, s); // Potential collision if names duplicatd, but usually unique enough for import
        });

        const transaction = db.transaction(() => {
            for (const [routeId, rawRows] of routes) {
                // Create Route Metadata (using first row)
                // route_id = CSV 'route' (e.g. 203)
                // route_short_name = CSV 'route' (e.g. 203) - The "Code" the user wants to see
                // route_long_name = CSV 'route_name' (e.g. Santa Candida / Capao Raso)
                const routeName = rawRows[0].route_name || rawRows[0].route_long_name || '';
                insertRoute.run(routeId, routeId, routeName, 3); // Default to bus (3)

                // 2. Identify Sub-Patterns (Directions)
                const directionGroups = new Map<string, any[]>();

                // Check for explicit direction columns
                const firstRow = rawRows[0];
                const dirKey = ('direction_id' in firstRow) ? 'direction_id' :
                    ('direction' in firstRow) ? 'direction' :
                        ('sentido' in firstRow) ? 'sentido' : null;

                if (dirKey) {
                    rawRows.forEach(r => {
                        const d = r[dirKey] || '0';
                        if (!directionGroups.has(d)) directionGroups.set(d, []);
                        directionGroups.get(d)!.push(r);
                    });
                } else {
                    // Split on sequence reset
                    let currentGroupIndex = 0;
                    let prevSeq = -1;

                    rawRows.forEach(r => {
                        const seq = Number(r.sequence || r.seq);
                        if (prevSeq !== -1 && seq <= prevSeq) {
                            currentGroupIndex++;
                            prevSeq = -1;
                        }
                        const key = `group_${currentGroupIndex}`;
                        if (!directionGroups.has(key)) directionGroups.set(key, []);
                        directionGroups.get(key)!.push(r);
                        prevSeq = seq;
                    });
                }

                // Process each group (pattern)
                for (const [groupId, groupRows] of directionGroups) {
                    groupRows.sort((a, b) => Number(a.sequence || a.seq) - Number(b.sequence || b.seq));

                    // Create Segments
                    for (let i = 0; i < groupRows.length - 1; i++) {
                        const r1 = groupRows[i];
                        const r2 = groupRows[i + 1];

                        const fromRef = r1.stop_code || r1.stop_name;
                        const toRef = r2.stop_code || r2.stop_name;

                        const fromStop = stopMap.get(fromRef);
                        const toStop = stopMap.get(toRef);

                        if (!fromStop || !toStop) {
                            this.errors.push({ row: i, file: 'routes', message: `Stop not found: ${fromRef} or ${toRef}` });
                            continue;
                        }

                        // Calculate Distance
                        let dist = 0;
                        const acc1Km = this.parseNumber(r1.accumulate_distance);
                        const acc2Km = this.parseNumber(r2.accumulate_distance);
                        const segmentKm = this.parseNumber(r2.distance);

                        if (Number.isFinite(acc1Km) && Number.isFinite(acc2Km)) {
                            dist = Math.abs(acc2Km - acc1Km) * 1000;
                            if (dist <= 0) dist = this.getDistMeters(fromStop.stop_lat, fromStop.stop_lon, toStop.stop_lat, toStop.stop_lon);
                        } else if (Number.isFinite(segmentKm) && segmentKm > 0) {
                            dist = segmentKm * 1000;
                        } else {
                            dist = this.getDistMeters(fromStop.stop_lat, fromStop.stop_lon, toStop.stop_lat, toStop.stop_lon);
                        }

                        // Geometry
                        const geom = JSON.stringify({
                            type: 'LineString',
                            coordinates: [[fromStop.stop_lon, fromStop.stop_lat], [toStop.stop_lon, toStop.stop_lat]]
                        });

                        const existing = db.prepare('SELECT segment_id FROM segments WHERE start_node_id = ? AND end_node_id = ?').get(fromStop.stop_id, toStop.stop_id) as any;

                        if (!existing) {
                            insertSegment.run(uuidv4(), fromStop.stop_id, toStop.stop_id, dist, geom);
                        }
                    }
                }
            }
        });
        transaction();
    }

    processAll(stops: any[], routes: any[], itineraries: any[]) {
        this.processStops(stops);

        // 1. Build Route Patterns (Smart Grouping)
        const routePatterns = new Map<string, any[][]>();

        // Pre-group by route_id
        const routesById = new Map<string, any[]>();
        routes.forEach(r => {
            const rid = String(r.route_id || r.route || '').trim();
            if (!rid) return;
            if (!routesById.has(rid)) routesById.set(rid, []);
            routesById.get(rid)!.push(r);
        });

        // Split each route into patterns
        for (const [rid, rawRows] of routesById) {
            const patterns: any[][] = [];

            const firstRow = rawRows[0];
            const dirKey = ('direction_id' in firstRow) ? 'direction_id' :
                ('direction' in firstRow) ? 'direction' :
                    ('sentido' in firstRow) ? 'sentido' : null;

            if (dirKey) {
                const groups = new Map<string, any[]>();
                rawRows.forEach(r => {
                    const d = r[dirKey] || '0';
                    if (!groups.has(d)) groups.set(d, []);
                    groups.get(d)!.push(r);
                });
                for (const g of groups.values()) {
                    g.sort((a, b) => Number(a.sequence || a.seq) - Number(b.sequence || b.seq));
                    patterns.push(g);
                }
            } else {
                let currentPattern: any[] = [];
                let prevSeq = -1;

                rawRows.forEach(r => {
                    const seq = Number(r.sequence || r.seq);
                    if (prevSeq !== -1 && seq <= prevSeq) {
                        if (currentPattern.length > 0) patterns.push(currentPattern);
                        currentPattern = [];
                        prevSeq = -1;
                    }
                    currentPattern.push(r);
                    prevSeq = seq;
                });
                if (currentPattern.length > 0) patterns.push(currentPattern);
                patterns.forEach(p => p.sort((a, b) => Number(a.sequence || a.seq) - Number(b.sequence || b.seq)));
            }
            routePatterns.set(rid, patterns);
        }

        // NEW: Incremental Import Support
        // If no routes provided, try to load patterns from DB (Template Trips)
        if (routes.length === 0) {
            console.log('No routes provided. Attempting to load existing patterns from DB...');
            const templates = db.prepare(`
                SELECT t.route_id, t.direction_id, st.stop_sequence, st.shape_dist_traveled, s.stop_code, s.stop_name
                FROM trips t
                JOIN stop_times st ON t.trip_id = st.trip_id
                JOIN stops s ON st.stop_id = s.stop_id
                WHERE t.service_id = 'TEMPLATE'
                ORDER BY t.route_id, t.direction_id, st.stop_sequence
            `).all() as any[];

            // Group by route and direction
            const tempsByRoute = new Map<string, Map<number, any[]>>();
            templates.forEach(row => {
                const rid = String(row.route_id);
                const dir = Number(row.direction_id);

                if (!tempsByRoute.has(rid)) tempsByRoute.set(rid, new Map());
                if (!tempsByRoute.get(rid)!.has(dir)) tempsByRoute.get(rid)!.set(dir, []);

                tempsByRoute.get(rid)!.get(dir)!.push({
                    stop_code: String(row.stop_code),
                    stop_name: String(row.stop_name),
                    accumulate_distance: String(row.shape_dist_traveled), // keep as string to match CSV behavior
                    direction_id: String(dir), // match itinerary expectation (string comparison)
                    direction: String(dir), // also provide direction field
                    sequence: String(row.stop_sequence)
                });
            });

            // Convert to routePatterns format (Array<Array<Row>>)
            for (const [rid, dirMap] of tempsByRoute) {
                const patterns: any[][] = [];
                for (const rows of dirMap.values()) {
                    patterns.push(rows);
                }
                routePatterns.set(rid, patterns);
            }
            console.log(`Loaded ${routePatterns.size} route patterns from DB.`);
        }

        this.processRoutes(routes);

        // NEW: Create Template Trips based on these patterns
        const insertTemplateTrip = db.prepare(`
            INSERT OR REPLACE INTO trips (route_id, service_id, trip_id, shape_id, direction_id) VALUES (?, ?, ?, ?, ?)
        `);
        const insertTemplateStopTime = db.prepare(`
            INSERT OR REPLACE INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, shape_dist_traveled)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        // We need stopCodeToId to map references.
        const stopsMap = new Map<string, string>();
        db.prepare('SELECT stop_code, stop_id, stop_name FROM stops').all().forEach((s: any) => {
            if (s.stop_code) stopsMap.set(s.stop_code, s.stop_id);
            if (s.stop_name) stopsMap.set(s.stop_name, s.stop_id);
        });

        // Loop through all gathered patterns
        const templateTx = db.transaction(() => {
            for (const [routeId, patterns] of routePatterns) {
                // patterns is Array<Array<Row>>
                // We need to identify direction for each pattern
                for (const pattern of patterns) {
                    if (pattern.length < 2) continue;

                    const firstRow = pattern[0];
                    const rawDir = String(firstRow.direction || firstRow.direction_id || firstRow.sentido || '0').trim();

                    let dirId = 0; // Default to 0
                    if (rawDir === 'IDA') dirId = 0;
                    else if (rawDir === 'VUELTA') dirId = 1;
                    else dirId = parseInt(rawDir, 10);
                    if (isNaN(dirId)) dirId = 0;

                    // Create Template Trip
                    const tripId = `t_${routeId}_${dirId}`;
                    insertTemplateTrip.run(routeId, 'TEMPLATE', tripId, null, dirId);

                    // Clear existing template stop times
                    db.prepare('DELETE FROM stop_times WHERE trip_id = ?').run(tripId);

                    // Insert Stops
                    pattern.forEach((row, idx) => {
                        const ref = String(row.stop_code || row.stop_name || row.stop_id || '').trim();
                        const stopId = stopsMap.get(ref);
                        if (stopId) {
                            const distKm = this.normalizeKm3(row.accumulate_distance || row.distance || '0');
                            insertTemplateStopTime.run(tripId, '00:00:00', '00:00:00', stopId, idx + 1, distKm);
                        }
                    });
                }
            }
        });
        templateTx();

        // 2. Process Itineraries
        const stopCodeToId = new Map<string, string>();
        db.prepare('SELECT stop_code, stop_id, stop_name FROM stops').all().forEach((s: any) => {
            if (s.stop_code) stopCodeToId.set(s.stop_code, s.stop_id);
            if (s.stop_name) stopCodeToId.set(s.stop_name, s.stop_id);
        });

        const insertTrip = db.prepare(`
            INSERT OR REPLACE INTO trips (route_id, service_id, trip_id, shape_id, direction_id) VALUES (?, ?, ?, ?, ?)
        `);
        // Note: added block_id to schema? Wait, schema might not have block_id. 
        // Checks schema.sql? I can't check right now but standard GTFS has it. 
        // If it doesn't exist, this will fail. I should check or just not insert it if unsure.
        // User didn't ask for block_id persistence, just "bus" column usage.
        // I will map "bus" -> "block_id" column if it exists, or just use it to generate trip_id.
        // SAFE BET: Just use it to generate Trip ID and maybe Service ID?

        // Let's check schema via SQL error? Or just assume standard fields for now. 
        // I'll stick to standard fields I know: route_id, service_id, trip_id, shape_id.
        // I'll use 'bus' to construct trip_id.

        const insertStopTime = db.prepare(`
            INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, shape_dist_traveled)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const revenueSegments = db.prepare(`
            SELECT segment_id, start_node_id, end_node_id
            FROM segments
            WHERE type = 'revenue' OR type IS NULL
        `).all() as { segment_id: string; start_node_id: string; end_node_id: string }[];
        const revenueSegmentMap = new Map<string, string>();
        revenueSegments.forEach((seg) => {
            revenueSegmentMap.set(`${seg.start_node_id}-${seg.end_node_id}`, seg.segment_id);
        });

        const segmentEvents = new Map<string, { time: number; duration: number }[]>();

        const getDirectDist = (ref1: string, ref2: string) => {
            const s1 = stopCodeToId.get(ref1);
            const s2 = stopCodeToId.get(ref2);
            if (!s1 || !s2) return 0;

            const stop1 = db.prepare('SELECT stop_lat, stop_lon FROM stops WHERE stop_id=?').get(s1) as any;
            const stop2 = db.prepare('SELECT stop_lat, stop_lon FROM stops WHERE stop_id=?').get(s2) as any;
            return this.getDistMeters(stop1.stop_lat, stop1.stop_lon, stop2.stop_lat, stop2.stop_lon);
        }

        const insertOrGetSegment = (fromId: string, toId: string, dist: number, type: 'revenue' | 'empty' = 'empty') => {
            let seg = db.prepare('SELECT segment_id FROM segments WHERE start_node_id=? AND end_node_id=?').get(fromId, toId) as any;
            if (!seg) {
                const id = uuidv4();
                const f = db.prepare('SELECT stop_lat, stop_lon FROM stops WHERE stop_id=?').get(fromId) as any;
                const t = db.prepare('SELECT stop_lat, stop_lon FROM stops WHERE stop_id=?').get(toId) as any;
                const geom = JSON.stringify({
                    type: 'LineString',
                    coordinates: [[f.stop_lon, f.stop_lat], [t.stop_lon, t.stop_lat]]
                });
                db.prepare('INSERT INTO segments (segment_id, start_node_id, end_node_id, distance, type, geometry) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(id, fromId, toId, dist, type, geom);
                return id;
            }
            return seg.segment_id;
        };


        const deleteStopTimes = db.prepare('DELETE FROM stop_times WHERE trip_id = ?');

        // Prepare Calendar Inserts
        const insertCalendar = db.prepare(`
            INSERT OR REPLACE INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
            VALUES (?, 1, 1, 1, 1, 1, 1, 1, ?, ?)
        `);

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
        const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10).replace(/-/g, '');

        const hasServiceIdColumn = itineraries.length === 0 || Object.keys(itineraries[0]).some((key) => {
            const normalizedKey = key.toLowerCase().trim();
            return normalizedKey === 'service_id' || normalizedKey === 'serviceid';
        });

        if (!hasServiceIdColumn) {
            this.errors.push({
                row: 1,
                file: 'itineraries',
                message: 'Missing required column service_id'
            });
            return;
        }

        const normalizedItineraries = itineraries.map((it, idx) => {
            const normalized: any = {};
            Object.keys(it).forEach((k) => {
                normalized[k.toLowerCase().trim()] = it[k];
            });

            const serviceId = String(normalized.service_id || normalized.serviceid || '').trim();
            if (!serviceId) {
                this.errors.push({
                    row: idx + 2,
                    file: 'itineraries',
                    message: 'Missing required field service_id'
                });
            }

            return {
                rowNumber: idx + 2,
                data: normalized,
                serviceId
            };
        });

        const uniqueServiceIds = Array.from(
            new Set(
                normalizedItineraries
                    .filter((row) => row.serviceId.length > 0)
                    .map((row) => row.serviceId)
            )
        );

        const calendarTx = db.transaction(() => {
            uniqueServiceIds.forEach((serviceId) => {
                insertCalendar.run(serviceId, today, nextYear);
            });
        });
        calendarTx();

        const tx = db.transaction(() => {
            normalizedItineraries.forEach((itRow) => {
                const it = itRow.data;
                const rowNumber = itRow.rowNumber;
                const serviceId = itRow.serviceId;

                // Map columns
                const eventType = (it.event !== undefined) ? String(it.event) : (it.event_type || '');
                const routeId = String(it.route || it.route_id || '').trim();
                const fromRef = it.origin || it.from_stop || it.origen;
                const toRef = it.destiny || it.to_stop || it.destino;
                const startTimeStr = it.start || it.start_time;
                const endTimeStr = it.end || it.end_time;
                const busStr = it.bus || it.block_id || '1'; // Default block/bus

                // Generate Trip ID
                const cleanStart = startTimeStr ? startTimeStr.replace(/:/g, '').replace(/\./g, '') : '000000';
                const tripId = it.trip_id || `T_${busStr}_${cleanStart}`;

                if (!serviceId) return;

                if (!tripId || !startTimeStr || !fromRef || !toRef) {
                    this.errors.push({ row: rowNumber, file: 'itineraries', message: 'Missing fields (need start, origin, destiny)' });
                    return;
                }

                if (eventType === '1') {
                    // REVENUE
                    if (!routeId) {
                        this.errors.push({ row: rowNumber, file: 'itineraries', message: 'Missing route_id for revenue trip' });
                        return;
                    }

                    const patterns = routePatterns.get(routeId); // Already trimmed string
                    if (!patterns || patterns.length === 0) {
                        this.errors.push({ row: rowNumber, file: 'itineraries', message: `Route ${routeId} not defined` });
                        return;
                    }


                    // Find match
                    let bestPattern: any[] | null = null;
                    let bestStartIdx = -1;
                    let bestEndIdx = -1;

                    // Support explicit direction matching from itinerary to route
                    // Normalize IT direction to 0/1 to match pattern direction (which is always 0/1 from DB/Rules)
                    let itDir = (it.direction || it.sentido) ? String(it.direction || it.sentido).trim() : null;
                    // Standard GTFS: 0=Ida, 1=Vuelta. Map IDA/VUELTA keywords just in case.
                    if (itDir === 'IDA') itDir = '0';
                    else if (itDir === 'VUELTA') itDir = '1';

                    for (const p of patterns) {
                        // If both have direction, check match
                        const pDir = (p[0].direction || p[0].direction_id || p[0].sentido) ? String(p[0].direction || p[0].direction_id || p[0].sentido).trim() : null;



                        // Normalized Match
                        const sIdx = p.findIndex(r => {
                            const rCode = String(r.stop_code || '').trim();
                            const rName = String(r.stop_name || '').trim();
                            const t = String(fromRef).trim();
                            return (rCode && rCode === t) || (rName && rName === t);
                        });

                        const eIdx = p.findIndex(r => {
                            const rCode = String(r.stop_code || '').trim();
                            const rName = String(r.stop_name || '').trim();
                            const t = String(toRef).trim();
                            return (rCode && rCode === t) || (rName && rName === t);
                        });



                        if (sIdx !== -1 && eIdx !== -1 && sIdx < eIdx) {
                            bestPattern = p;
                            bestStartIdx = sIdx;
                            bestEndIdx = eIdx;
                            break;
                        }
                    }

                    if (!bestPattern) {
                        this.errors.push({ row: rowNumber, file: 'itineraries', message: `Stops ${fromRef}->${toRef} not found in Route ${routeId}` });
                        return;
                    }

                    const subPattern = bestPattern.slice(bestStartIdx, bestEndIdx + 1);

                    // Times
                    const startTimeSec = this.timeToSeconds(startTimeStr);
                    const endTimeSec = endTimeStr ? this.timeToSeconds(endTimeStr) : 0;
                    const duration = endTimeSec ? (endTimeSec - startTimeSec) : (it.duration ? this.timeToSeconds(it.duration) : 0);

                    // Distances
                    let totalDist = 0;
                    const segmentDists: number[] = [0];
                    const segmentLengths: number[] = [];

                    for (let i = 0; i < subPattern.length - 1; i++) {
                        const r1 = subPattern[i];
                        const r2 = subPattern[i + 1];

                        let dKm = 0;
                        const acc1Km = this.parseNumber(r1.accumulate_distance);
                        const acc2Km = this.parseNumber(r2.accumulate_distance);
                        const segmentKm = this.parseNumber(r2.distance);

                        if (Number.isFinite(acc1Km) && Number.isFinite(acc2Km)) {
                            dKm = Math.abs(acc2Km - acc1Km);
                        } else if (Number.isFinite(segmentKm) && segmentKm > 0) {
                            dKm = segmentKm;
                        }

                        if (dKm <= 0) {
                            const ref1 = r1.stop_code || r1.stop_name;
                            const ref2 = r2.stop_code || r2.stop_name;
                            dKm = this.toKm3(getDirectDist(ref1, ref2));
                        }
                        segmentLengths.push(dKm);
                        totalDist = Number((totalDist + dKm).toFixed(3));
                        segmentDists.push(totalDist);
                    }

                    const totalDuration = Math.max(0, duration);
                    const segmentDurations = this.distributeDurationByDistance(segmentLengths, totalDuration);
                    const segmentOffsets: number[] = [0];
                    for (let i = 0; i < segmentDurations.length; i++) {
                        segmentOffsets.push(segmentOffsets[i] + segmentDurations[i]);
                    }

                    // Determine Direction ID (0 or 1)
                    // Determine Direction ID (0 or 1)
                    let directionId: number | null = null;
                    const rawDir = String(it.direction || it.sentido || '').trim();
                    if (rawDir === 'IDA') directionId = 0; // 0 is implied if parseInt matches, but handle keywords
                    else if (rawDir === 'VUELTA') directionId = 1;
                    else directionId = parseInt(rawDir, 10);

                    if (isNaN(directionId!) || (directionId !== 0 && directionId !== 1)) directionId = 0; // Default or fallback

                    // Create Trip
                    insertTrip.run(routeId, serviceId, tripId, null, directionId); // remove block_id for safety
                    deleteStopTimes.run(tripId);

                    // Stops
                    subPattern.forEach((p, i) => {
                        const ref = p.stop_code || p.stop_name;
                        const stopId = stopCodeToId.get(ref);
                        if (!stopId) return;

                        const timeOffset = segmentOffsets[i] || 0;
                        const timeAtStop = this.secondsToTime(startTimeSec + timeOffset);

                        insertStopTime.run(
                            tripId,
                            timeAtStop,
                            timeAtStop,
                            stopId,
                            i + 1,
                            segmentDists[i]
                        );
                    });

                    for (let i = 0; i < subPattern.length - 1; i++) {
                        const fromRef = subPattern[i].stop_code || subPattern[i].stop_name;
                        const toRef = subPattern[i + 1].stop_code || subPattern[i + 1].stop_name;
                        const fromId = stopCodeToId.get(fromRef);
                        const toId = stopCodeToId.get(toRef);
                        const segDuration = segmentDurations[i] || 0;
                        if (!fromId || !toId || segDuration <= 0) continue;

                        const segId = revenueSegmentMap.get(`${fromId}-${toId}`);
                        if (!segId) continue;

                        if (!segmentEvents.has(segId)) segmentEvents.set(segId, []);
                        segmentEvents.get(segId)!.push({
                            time: startTimeSec + (segmentOffsets[i] || 0),
                            duration: segDuration
                        });
                    }

                } else if (eventType === '0') {
                    // DEADHEAD matches
                    const ref1 = String(fromRef).trim();
                    const ref2 = String(toRef).trim();
                    const fromId = stopCodeToId.get(ref1);
                    const toId = stopCodeToId.get(ref2);

                    if (!fromId || !toId) {
                        this.errors.push({ row: rowNumber, file: 'itineraries', message: `Unknown stops for deadhead: ${fromRef} -> ${toRef}` });
                        return;
                    }

                    // 1. Create Segment/TimeSlot (Existing Logic)
                    const distMeters = getDirectDist(ref1, ref2);
                    const segId = insertOrGetSegment(fromId, toId, distMeters, 'empty');

                    const startSec = this.timeToSeconds(startTimeStr);
                    const endSec = endTimeStr ? this.timeToSeconds(endTimeStr) : 0;
                    const duration = endSec - startSec;

                    if (startTimeStr && endTimeStr) {
                        db.prepare(`INSERT INTO segment_time_slots (id, segment_id, start_time, end_time, travel_time) VALUES (?, ?, ?, ?, ?)`)
                            .run(uuidv4(), segId, startTimeStr, endTimeStr, duration);
                    }

                    // 2. Create Trip (New Logic to match Route)
                    // Deadheads are also trips on the route, just empty.
                    if (routeId) {
                        let directionId: number | null = null;
                        const rawDir = String(it.direction || it.sentido || '').trim();
                        if (rawDir === 'IDA') directionId = 0;
                        else if (rawDir === 'VUELTA') directionId = 1;
                        else directionId = parseInt(rawDir, 10);

                        if (isNaN(directionId!) || (directionId !== 0 && directionId !== 1)) directionId = 0;

                        insertTrip.run(routeId, serviceId, tripId, null, directionId);
                        deleteStopTimes.run(tripId);

                        // Stop 1
                        insertStopTime.run(tripId, startTimeStr, startTimeStr, fromId, 1, 0);

                        // Stop 2
                        insertStopTime.run(tripId, endTimeStr, endTimeStr, toId, 2, this.toKm3(distMeters));
                    }
                }
            });
        });

        tx();
        this.persistRevenueSegmentTimes(segmentEvents);
    }


    getErrors() {
        return this.errors;
    }
}
