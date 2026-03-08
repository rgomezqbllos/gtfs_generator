import db from '../db';
import { randomUUID as uuidv4 } from 'crypto';

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
    private projectId: string;

    constructor(projectId: string) {
        this.projectId = projectId;
    }

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
                days = parseInt(parts[0], 10);
                rest = parts.slice(1).join(':'); 
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

        const deleteSlotsBySegment = db.prepare('DELETE FROM segment_time_slots WHERE segment_id = ? AND project_id = ?');
        const updateSegmentTravelTime = db.prepare('UPDATE segments SET travel_time = ? WHERE segment_id = ? AND project_id = ?');
        const insertSlot = db.prepare(`
            INSERT INTO segment_time_slots (id, segment_id, project_id, start_time, end_time, travel_time)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const tx = db.transaction(() => {
            for (const [segmentId, events] of segmentEvents) {
                if (events.length === 0) continue;

                // Simple average for travel_time
                const avgDuration = Math.round(events.reduce((sum, e) => sum + e.duration, 0) / events.length);
                updateSegmentTravelTime.run(avgDuration, segmentId, this.projectId);

                // Clean existing slots
                deleteSlotsBySegment.run(segmentId, this.projectId);

                // Insert all events as slots
                for (const event of events) {
                    const id = uuidv4();
                    const startTimeStr = this.secondsToTime(event.time);
                    const endTimeStr = this.secondsToTime(event.time + event.duration);
                    insertSlot.run(id, segmentId, this.projectId, startTimeStr, endTimeStr, event.duration);
                }
            }
        });

        tx();
    }

    // --- Processors ---

    processStops(rows: any[]) {
        const insert = db.prepare(`
            INSERT OR REPLACE INTO stops (stop_id, project_id, stop_code, stop_name, stop_lat, stop_lon, node_type, location_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const existingStops = db.prepare('SELECT stop_code, stop_id FROM stops WHERE project_id = ?').all(this.projectId) as { stop_code: string, stop_id: string }[];
        const stopCodeToId = new Map<string, string>();
        existingStops.forEach(s => stopCodeToId.set(s.stop_code, s.stop_id));

        const transaction = db.transaction(() => {
            rows.forEach((row, index) => {
                const code = String(row.stop_code || row.code || row.id || '').trim();
                const name = String(row.stop_name || row.name || row.nome || '').trim();
                const lat = String(row.latitude || row.lat || '').trim();
                const lon = String(row.longitude || row.lon || row.lng || '').trim();
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

                let nodeType = 'commercial';
                let locationType = 0; 

                const typeLower = String(rawType).toLowerCase().trim();
                if (typeLower === 'parking' || typeLower === 'garagem') {
                    nodeType = 'parking';
                } else if (typeLower === 'station' || typeLower === 'estacao' || typeLower === 'estação') {
                    locationType = 1; 
                }

                try {
                    insert.run(
                        stopId,
                        this.projectId,
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
        const routes = new Map<string, any[]>();
        rows.forEach((row, index) => {
            const routeId = String(row.route_id || row.route || '').trim();
            const seq = row.sequence || row.seq;
            const stopRef = String(row.stop_code || row.stop_name || row.stop_id || '').trim();

            if (!routeId || !stopRef || !seq) {
                this.errors.push({ row: index + 2, file: 'routes', message: `Missing required fields for route ${routeId}` });
                return;
            }
            if (!routes.has(routeId)) routes.set(routeId, []);
            routes.get(routeId)!.push(row);
        });

        const insertRoute = db.prepare(`
            INSERT OR REPLACE INTO routes (route_id, project_id, route_short_name, route_long_name, route_type)
            VALUES (?, ?, ?, ?, ?)
        `);

        const insertSegment = db.prepare(`
            INSERT OR IGNORE INTO segments (segment_id, project_id, start_node_id, end_node_id, distance, type, geometry)
            VALUES (?, ?, ?, ?, ?, 'revenue', ?)
        `);

        const stops = db.prepare('SELECT stop_id, stop_code, stop_name, stop_lat, stop_lon FROM stops WHERE project_id = ?').all(this.projectId) as any[];
        const stopMap = new Map<string, any>();
        stops.forEach(s => {
            if (s.stop_code) stopMap.set(s.stop_code, s);
            if (s.stop_name) stopMap.set(s.stop_name, s);
        });

        const transaction = db.transaction(() => {
            for (const [routeId, rawRows] of routes) {
                const routeName = rawRows[0].route_name || rawRows[0].route_long_name || '';
                insertRoute.run(routeId, this.projectId, routeId, routeName, 3); // Default to bus (3)

                const directionGroups = new Map<string, any[]>();
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

                for (const [groupId, groupRows] of directionGroups) {
                    groupRows.sort((a, b) => Number(a.sequence || a.seq) - Number(b.sequence || b.seq));

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

                        const geometry = JSON.stringify({
                            type: 'LineString',
                            coordinates: [[fromStop.stop_lon, fromStop.stop_lat], [toStop.stop_lon, toStop.stop_lat]]
                        });

                        const existing = db.prepare('SELECT segment_id FROM segments WHERE start_node_id = ? AND end_node_id = ? AND project_id = ?').get(fromStop.stop_id, toStop.stop_id, this.projectId) as any;

                        if (!existing) {
                            insertSegment.run(uuidv4(), this.projectId, fromStop.stop_id, toStop.stop_id, dist, geometry);
                        }
                    }
                }
            }
        });
        transaction();
    }

    processAll(stops: any[], routes: any[], itineraries: any[]) {
        this.processStops(stops);

        // 1. Build Route Patterns
        const routePatterns = new Map<string, any[][]>();
        const routesById = new Map<string, any[]>();
        routes.forEach(r => {
            const rid = String(r.route_id || r.route || '').trim();
            if (!rid) return;
            if (!routesById.has(rid)) routesById.set(rid, []);
            routesById.get(rid)!.push(r);
        });

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

        if (routes.length === 0) {
            const templates = db.prepare(`
                SELECT t.route_id, t.direction_id, st.stop_sequence, st.shape_dist_traveled, s.stop_code, s.stop_name
                FROM trips t
                JOIN stop_times st ON t.trip_id = st.trip_id AND t.project_id = st.project_id
                JOIN stops s ON st.stop_id = s.stop_id AND st.project_id = s.project_id
                WHERE t.service_id = 'TEMPLATE' AND t.project_id = ?
                ORDER BY t.route_id, t.direction_id, st.stop_sequence
            `).all(this.projectId) as any[];

            const tempsByRoute = new Map<string, Map<number, any[]>>();
            templates.forEach(row => {
                const rid = String(row.route_id);
                const dir = Number(row.direction_id);
                if (!tempsByRoute.has(rid)) tempsByRoute.set(rid, new Map());
                if (!tempsByRoute.get(rid)!.has(dir)) tempsByRoute.get(rid)!.set(dir, []);
                tempsByRoute.get(rid)!.get(dir)!.push({
                    stop_code: String(row.stop_code),
                    stop_name: String(row.stop_name),
                    accumulate_distance: String(row.shape_dist_traveled),
                    direction_id: String(dir),
                    direction: String(dir),
                    sequence: String(row.stop_sequence)
                });
            });

            for (const [rid, dirMap] of tempsByRoute) {
                const patterns: any[][] = [];
                for (const itemRows of dirMap.values()) {
                    patterns.push(itemRows);
                }
                routePatterns.set(rid, patterns);
            }
        }

        this.processRoutes(routes);

        // Prep Inserts
        const insertTemplateTrip = db.prepare(`
            INSERT OR REPLACE INTO trips (trip_id, project_id, route_id, service_id, shape_id, direction_id) VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insertTemplateStopTime = db.prepare(`
            INSERT OR REPLACE INTO stop_times (trip_id, project_id, arrival_time, departure_time, stop_id, stop_sequence, shape_dist_traveled)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const stopsMap = new Map<string, string>();
        db.prepare('SELECT stop_code, stop_id, stop_name FROM stops WHERE project_id = ?').all(this.projectId).forEach((s: any) => {
            if (s.stop_code) stopsMap.set(s.stop_code, s.stop_id);
            if (s.stop_name) stopsMap.set(s.stop_name, s.stop_id);
        });

        const templateTx = db.transaction(() => {
            for (const [routeId, patterns] of routePatterns) {
                for (const pattern of patterns) {
                    if (pattern.length < 2) continue;
                    const firstRow = pattern[0];
                    const rawDir = String(firstRow.direction || firstRow.direction_id || firstRow.sentido || '0').trim();
                    if (rawDir !== '0' && rawDir !== '1') continue;

                    let dirId = parseInt(rawDir, 10);
                    const tripId = `t_${routeId}_${dirId}`;
                    insertTemplateTrip.run(tripId, this.projectId, routeId, 'TEMPLATE', null, dirId);
                    db.prepare('DELETE FROM stop_times WHERE trip_id = ? AND project_id = ?').run(tripId, this.projectId);

                    pattern.forEach((row, idx) => {
                        const ref = String(row.stop_code || row.stop_name || row.stop_id || '').trim();
                        const stopId = stopsMap.get(ref);
                        if (stopId) {
                            const distKm = this.normalizeKm3(row.accumulate_distance || row.distance || '0');
                            insertTemplateStopTime.run(tripId, this.projectId, '00:00:00', '00:00:00', stopId, idx + 1, distKm);
                        }
                    });
                }
            }
        });
        templateTx();

        // itineraries processing
        const stopCodeToId = new Map<string, string>();
        db.prepare('SELECT stop_code, stop_id, stop_name FROM stops WHERE project_id = ?').all(this.projectId).forEach((s: any) => {
            if (s.stop_code) stopCodeToId.set(s.stop_code, s.stop_id);
            if (s.stop_name) stopCodeToId.set(s.stop_name, s.stop_id);
        });

        const insertTrip = db.prepare(`
            INSERT OR REPLACE INTO trips (trip_id, project_id, route_id, service_id, shape_id, direction_id) VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insertStopTime = db.prepare(`
            INSERT INTO stop_times (trip_id, project_id, arrival_time, departure_time, stop_id, stop_sequence, shape_dist_traveled)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const deleteStopTimes = db.prepare('DELETE FROM stop_times WHERE trip_id = ? AND project_id = ?');

        const revenueSegments = db.prepare(`
            SELECT segment_id, start_node_id, end_node_id
            FROM segments
            WHERE (type = 'revenue' OR type IS NULL) AND project_id = ?
        `).all(this.projectId) as any[];
        const revenueSegmentMap = new Map<string, string>();
        revenueSegments.forEach((seg) => {
            revenueSegmentMap.set(`${seg.start_node_id}-${seg.end_node_id}`, seg.segment_id);
        });

        const segmentEvents = new Map<string, { time: number; duration: number }[]>();

        const getDirectDist = (ref1: string, ref2: string) => {
            const s1 = stopCodeToId.get(ref1);
            const s2 = stopCodeToId.get(ref2);
            if (!s1 || !s2) return 0;
            const stop1 = db.prepare('SELECT stop_lat, stop_lon FROM stops WHERE stop_id=? AND project_id=?').get(s1, this.projectId) as any;
            const stop2 = db.prepare('SELECT stop_lat, stop_lon FROM stops WHERE stop_id=? AND project_id=?').get(s2, this.projectId) as any;
            return this.getDistMeters(stop1.stop_lat, stop1.stop_lon, stop2.stop_lat, stop2.stop_lon);
        }

        const insertOrGetSegment = (fromId: string, toId: string, dist: number, type: 'revenue' | 'empty' = 'empty') => {
            let seg = db.prepare('SELECT segment_id FROM segments WHERE start_node_id=? AND end_node_id=? AND project_id=?').get(fromId, toId, this.projectId) as any;
            if (!seg) {
                const id = uuidv4();
                const f = db.prepare('SELECT stop_lat, stop_lon FROM stops WHERE stop_id=? AND project_id=?').get(fromId, this.projectId) as any;
                const t = db.prepare('SELECT stop_lat, stop_lon FROM stops WHERE stop_id=? AND project_id=?').get(toId, this.projectId) as any;
                const geometry = JSON.stringify({
                    type: 'LineString',
                    coordinates: [[f.stop_lon, f.stop_lat], [t.stop_lon, t.stop_lat]]
                });
                db.prepare('INSERT INTO segments (segment_id, project_id, start_node_id, end_node_id, distance, type, geometry) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    .run(id, this.projectId, fromId, toId, dist, type, geometry);
                return id;
            }
            return seg.segment_id;
        };

        const insertCalendar = db.prepare(`
            INSERT OR REPLACE INTO calendar (service_id, project_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
            VALUES (?, ?, 1, 1, 1, 1, 1, 1, 1, ?, ?)
        `);

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10).replace(/-/g, '');

        const normalizedItineraries = itineraries.map((it, idx) => {
            const normalized: any = {};
            Object.keys(it).forEach((k) => normalized[k.toLowerCase().trim()] = it[k]);
            const serviceId = String(normalized.service_id || normalized.serviceid || '').trim();
            return { rowNumber: idx + 2, data: normalized, serviceId };
        });

        const uniqueServiceIds = Array.from(new Set(normalizedItineraries.filter(r => r.serviceId).map(r => r.serviceId)));
        db.transaction(() => {
            uniqueServiceIds.forEach(id => insertCalendar.run(id, this.projectId, today, nextYear));
        })();

        const tx = db.transaction(() => {
            normalizedItineraries.forEach((itRow) => {
                const it = itRow.data;
                const rowNumber = itRow.rowNumber;
                const serviceId = itRow.serviceId;
                if (!serviceId) return;

                const eventType = (it.event !== undefined) ? String(it.event) : (it.event_type || '');
                const routeId = String(it.route || it.route_id || '').trim();
                const fromRef = it.origin || it.from_stop || it.origen;
                const toRef = it.destiny || it.to_stop || it.destino;
                const startTimeStr = it.start || it.start_time;
                const endTimeStr = it.end || it.end_time;
                const busStr = it.bus || it.block_id || '1';
                const cleanStart = startTimeStr ? startTimeStr.replace(/:/g, '').replace(/\./g, '') : '000000';
                const tripId = it.trip_id || `T_${busStr}_${cleanStart}`;

                if (!tripId || !startTimeStr || !fromRef || !toRef) return;

                if (eventType === '1') {
                    if (!routeId) return;
                    const patterns = routePatterns.get(routeId);
                    if (!patterns) return;

                    let bestPattern: any[] | null = null;
                    let bestStartIdx = -1, bestEndIdx = -1;

                    for (const p of patterns) {
                        const sIdx = p.findIndex(r => {
                            const t = String(fromRef).trim();
                            return (String(r.stop_code).trim() === t) || (String(r.stop_name).trim() === t);
                        });
                        const eIdx = p.findIndex(r => {
                            const t = String(toRef).trim();
                            return (String(r.stop_code).trim() === t) || (String(r.stop_name).trim() === t);
                        });
                        if (sIdx !== -1 && eIdx !== -1 && sIdx < eIdx) {
                            bestPattern = p; bestStartIdx = sIdx; bestEndIdx = eIdx;
                            break;
                        }
                    }

                    if (!bestPattern) return;
                    const subPattern = bestPattern.slice(bestStartIdx, bestEndIdx + 1);
                    const startTimeSec = this.timeToSeconds(startTimeStr);
                    const endTimeSec = endTimeStr ? this.timeToSeconds(endTimeStr) : 0;
                    const durationInSec = endTimeSec ? (endTimeSec - startTimeSec) : (it.duration ? this.timeToSeconds(it.duration) : 0);

                    const segmentLengths: number[] = [];
                    const segmentDists: number[] = [0];
                    let totalDist = 0;
                    for (let i = 0; i < subPattern.length - 1; i++) {
                        let dKm = this.parseNumber(subPattern[i+1].distance || 0);
                        if (dKm <= 0) dKm = this.toKm3(getDirectDist(subPattern[i].stop_code || subPattern[i].stop_name, subPattern[i+1].stop_code || subPattern[i+1].stop_name));
                        segmentLengths.push(dKm);
                        totalDist += dKm;
                        segmentDists.push(totalDist);
                    }

                    const segmentDurations = this.distributeDurationByDistance(segmentLengths, Math.max(0, durationInSec));
                    const segmentOffsets: number[] = [0];
                    for (let i = 0; i < segmentDurations.length; i++) segmentOffsets.push(segmentOffsets[i] + segmentDurations[i]);

                    const rawDir = String(it.direction || it.sentido || '0').trim();
                    const dirId = (rawDir === '1') ? 1 : 0;

                    insertTrip.run(tripId, this.projectId, routeId, serviceId, null, dirId);
                    deleteStopTimes.run(tripId, this.projectId);

                    subPattern.forEach((p, i) => {
                        const stopId = stopCodeToId.get(p.stop_code || p.stop_name);
                        if (!stopId) return;
                        const timeStr = this.secondsToTime(startTimeSec + (segmentOffsets[i] || 0));
                        insertStopTime.run(tripId, this.projectId, timeStr, timeStr, stopId, i + 1, segmentDists[i]);
                    });

                    for (let i = 0; i < subPattern.length - 1; i++) {
                        const fromId = stopCodeToId.get(subPattern[i].stop_code || subPattern[i].stop_name);
                        const toId = stopCodeToId.get(subPattern[i+1].stop_code || subPattern[i+1].stop_name);
                        const segId = revenueSegmentMap.get(`${fromId}-${toId}`);
                        if (segId) {
                            if (!segmentEvents.has(segId)) segmentEvents.set(segId, []);
                            segmentEvents.get(segId)!.push({ time: startTimeSec + (segmentOffsets[i] || 0), duration: segmentDurations[i] });
                        }
                    }
                } else if (eventType === '0') {
                    const fromId = stopCodeToId.get(String(fromRef).trim());
                    const toId = stopCodeToId.get(String(toRef).trim());
                    if (!fromId || !toId) return;

                    const distMeters = getDirectDist(fromRef, toRef);
                    const segId = insertOrGetSegment(fromId, toId, distMeters, 'empty');
                    const startSec = this.timeToSeconds(startTimeStr);
                    const endSec = endTimeStr ? this.timeToSeconds(endTimeStr) : startSec;
                    const duration = endSec - startSec;

                    if (startTimeStr && endTimeStr) {
                         const slotId = uuidv4();
                         db.prepare(`INSERT INTO segment_time_slots (id, segment_id, project_id, start_time, end_time, travel_time) VALUES (?, ?, ?, ?, ?, ?)`)
                            .run(slotId, segId, this.projectId, startTimeStr, endTimeStr, duration);
                    }

                    if (routeId) {
                        const rawDir = String(it.direction || it.sentido || '0').trim();
                        const dirId = (rawDir === '1') ? 1 : 0;
                        insertTrip.run(tripId, this.projectId, routeId, serviceId, null, dirId);
                        deleteStopTimes.run(tripId, this.projectId);
                        insertStopTime.run(tripId, this.projectId, startTimeStr, startTimeStr, fromId, 1, 0);
                        insertStopTime.run(tripId, this.projectId, endTimeStr, endTimeStr, toId, 2, this.toKm3(distMeters));
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
