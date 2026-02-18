import { FastifyInstance } from 'fastify';
import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import yauzl from 'yauzl';
import csv from 'csv-parser';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { pipeline } from 'stream';

const pump = util.promisify(pipeline);
const TEMP_DIR = path.join(__dirname, '../../uploads');

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// In-memory status storage
const importTasks = new Map<string, {
    status: 'processing' | 'completed' | 'error';
    progress: number;
    message: string;
    details?: any;
}>();

export default async function importRoutes(fastify: FastifyInstance) {

    // 1. SCAN: Upload and Analyze
    fastify.post('/gtfs/scan', async (request, reply) => {
        const parts = request.parts();
        const tempId = uuidv4();
        const filePath = path.join(TEMP_DIR, `${tempId}.zip`);

        try {
            for await (const part of parts) {
                if (part.type === 'file') {
                    await pump(part.file, fs.createWriteStream(filePath));
                }
            }

            // Analyze the file
            const metadata = await scanGtfsMetadata(filePath);
            return reply.send({ tempFileId: tempId, metadata });

        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: 'Scan failed' });
        }
    });

    // 2. EXECUTE: Import with Filters
    fastify.post('/gtfs/execute', async (request, reply) => {
        const { tempFileId, selectedServices, selectedRoutes, selectedPairs } = request.body as {
            tempFileId: string;
            selectedServices: string[];
            selectedRoutes: string[];
            selectedPairs?: string[];
        };

        const filePath = path.join(TEMP_DIR, `${tempFileId}.zip`);
        if (!fs.existsSync(filePath)) {
            return reply.code(404).send({ error: 'Temporary file not found or expired.' });
        }

        const taskId = uuidv4();
        importTasks.set(taskId, {
            status: 'processing',
            progress: 0,
            message: 'Starting filtered import...'
        });

        // Use selectedPairs if available
        let allowedPairs: Set<string> | null = null;
        if (selectedPairs && selectedPairs.length > 0) {
            allowedPairs = new Set(selectedPairs);
        }

        // Start async processing
        processGtfsImport(taskId, filePath, {
            services: new Set(selectedServices),
            routes: new Set(selectedRoutes),
            allowedPairs
        });

        return reply.send({ taskId });
    });

    // Legacy/Direct Import (Keep for backward compatibility if needed, or remove)
    // For now, let's keep the specialized status endpoint
    fastify.get('/gtfs/import/status/:taskId', async (request, reply) => {
        const { taskId } = request.params as { taskId: string };
        const task = importTasks.get(taskId);
        if (!task) {
            return reply.code(404).send({ error: 'Task not found' });
        }
        return reply.send(task);
    });
}

// Helper to Scan
async function scanGtfsMetadata(filePath: string) {
    const services = new Map<string, Set<string>>(); // service_id -> Set<route_id>
    const routes = new Map<string, any>(); // route_id -> { short_name, long_name }

    return new Promise((resolve, reject) => {
        yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
            if (err || !zipfile) return reject(err);

            // We need to read trips.txt and routes.txt
            const entriesToRead = new Set(['trips.txt', 'routes.txt']);
            let pending = 2; // rudimentary countdown

            zipfile.on('entry', (entry) => {
                if (entry.fileName === 'trips.txt') {
                    zipfile.openReadStream(entry, (err, stream) => {
                        if (err) return reject(err);
                        stream!.pipe(csv())
                            .on('data', (data) => {
                                if (!services.has(data.service_id)) {
                                    services.set(data.service_id, new Set());
                                }
                                services.get(data.service_id)!.add(data.route_id);
                            })
                            .on('end', () => {
                                pending--;
                                if (pending === 0) finish();
                                else zipfile.readEntry();
                            });
                    });
                } else if (entry.fileName === 'routes.txt') {
                    zipfile.openReadStream(entry, (err, stream) => {
                        if (err) return reject(err);
                        stream!.pipe(csv())
                            .on('data', (data) => {
                                routes.set(data.route_id, {
                                    short_name: data.route_short_name,
                                    long_name: data.route_long_name
                                });
                            })
                            .on('end', () => {
                                pending--;
                                if (pending === 0) finish();
                                else zipfile.readEntry();
                            });
                    });
                } else {
                    zipfile.readEntry();
                }
            });

            zipfile.on('end', () => {
                // If we reach end but pending > 0, it means files were missing
                if (pending > 0) finish();
            });

            zipfile.readEntry();

            function finish() {
                // Format for frontend
                const result: any[] = [];
                services.forEach((routeIds, serviceId) => {
                    const localRoutes = Array.from(routeIds).map(rid => ({
                        route_id: rid,
                        ...routes.get(rid)
                    })).filter(r => r.short_name || r.long_name); // Only return known routes

                    if (localRoutes.length > 0) {
                        result.push({
                            service_id: serviceId,
                            routes: localRoutes
                        });
                    }
                });
                resolve(result);
            }
        });
    });
}

function openZip(filePath: string): Promise<yauzl.ZipFile> {
    return new Promise((resolve, reject) => {
        yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
            if (err || !zipfile) return reject(err);
            resolve(zipfile);
        });
    });
}

function readEntryStream(filePath: string, entryFileName: string): Promise<Readable> {
    return new Promise((resolve, reject) => {
        yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
            if (err || !zipfile) return reject(err);
            let found = false;
            zipfile.on('entry', (entry) => {
                if (entry.fileName === entryFileName) {
                    found = true;
                    zipfile.openReadStream(entry, (err, stream) => {
                        if (err) return reject(err);
                        resolve(stream!);
                        stream!.on('end', () => zipfile.close());
                    });
                } else {
                    zipfile.readEntry();
                }
            });
            zipfile.on('end', () => {
                if (!found) {
                    zipfile.close();
                    reject(new Error(`Entry ${entryFileName} not found`));
                }
            });
            zipfile.readEntry();
        });
    });
}

// Get all entries map (Helper)
function getEntries(filePath: string): Promise<Set<string>> {
    return new Promise((resolve, reject) => {
        yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
            if (err || !zipfile) return reject(err);
            const entries = new Set<string>();
            zipfile.on('entry', (entry) => {
                entries.add(entry.fileName);
                zipfile.readEntry();
            });
            zipfile.on('end', () => {
                zipfile.close();
                resolve(entries);
            });
            zipfile.on('error', reject);
            zipfile.readEntry();
        });
    });
}

async function processGtfsImport(taskId: string, filePath: string, filters: { services: Set<string>, routes: Set<string>, allowedPairs: Set<string> | null }) {
    const updateStatus = (progress: number, message: string) => {
        const task = importTasks.get(taskId);
        if (task) {
            task.progress = progress;
            task.message = message;
        }
    };

    const fail = (msg: string) => {
        const task = importTasks.get(taskId);
        if (task) {
            task.status = 'error';
            task.message = msg;
        }
    };

    try {
        updateStatus(5, "Scanning ZIP structure...");
        const entries = await getEntries(filePath);

        const required = ['routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt'];
        const missing = required.filter(f => !entries.has(f));
        if (missing.length > 0) {
            fail(`Missing files: ${missing.join(', ')}`);
            return;
        }

        // --- VALIDATION PHASE ---
        updateStatus(10, "Validating Route Structure...");

        // Optimized Flow:
        // 1. Scan trips.txt FIRST to get "Candidate Trips" (matches user selection).
        // 2. Scan stop_times.txt SECOND to:
        //    a) Verify candidates actually have stops (Confirm existence).
        //    b) Collect usedStopIds (for strict filtering).
        //    c) Calculate Valid Route IDs.

        const candidateTrips = new Map<string, string>(); // trip_id -> route_id
        const validRouteIds = new Set<string>();
        const finalValidTrips = new Set<string>();
        const usedStopIds = new Set<string>();

        // 1. Scan Trips
        if (entries.has('trips.txt')) {
            updateStatus(15, "Scanning Trips...");
            const stream = await readEntryStream(filePath, 'trips.txt');
            await new Promise((resolve, reject) => {
                stream.pipe(csv())
                    .on('data', (data) => {
                        let isSelected = false;
                        if (filters.allowedPairs) {
                            // Granular Check
                            const key = `${data.service_id}|${data.route_id}`;
                            if (filters.allowedPairs.has(key)) isSelected = true;
                        } else {
                            // Fallback/Legacy Check
                            if (filters.routes.has(data.route_id) && filters.services.has(data.service_id)) {
                                isSelected = true;
                            }
                        }

                        if (isSelected) {
                            candidateTrips.set(data.trip_id, data.route_id);
                        }
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });
            console.log(`Validation: Found ${candidateTrips.size} candidate trips based on selection.`);
        }

        // 2. Scan Stop Times (The Big File) - ONCE
        if (entries.has('stop_times.txt') && candidateTrips.size > 0) {
            updateStatus(25, "Analyzing Stop Times (This may take a while)...");
            const stream = await readEntryStream(filePath, 'stop_times.txt');
            await new Promise((resolve, reject) => {
                stream.pipe(csv())
                    .on('data', (data) => {
                        // Only process if it belongs to a candidate trip
                        if (candidateTrips.has(data.trip_id)) {
                            // Mark trip as confirmed valid (has stops)
                            finalValidTrips.add(data.trip_id);

                            // Mark route as valid
                            const routeId = candidateTrips.get(data.trip_id);
                            if (routeId) validRouteIds.add(routeId);

                            // Collect used stop
                            if (data.stop_id) usedStopIds.add(data.stop_id);
                        }
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });
        }

        console.log(`Validation: Confirmed ${finalValidTrips.size} valid trips and ${usedStopIds.size} used stops.`);


        // --- IMPORT PHASE ---

        // Agency
        if (entries.has('agency.txt')) {
            updateStatus(20, "Importing Agencies...");
            const insert = db.prepare(`INSERT OR IGNORE INTO agency (agency_id, agency_name, agency_url, agency_timezone, agency_lang, agency_phone, agency_email) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            const stream = await readEntryStream(filePath, 'agency.txt');
            const batch: any[] = [];
            const flush = db.transaction((rows: any[]) => {
                rows.forEach(r => insert.run(
                    r.agency_id || uuidv4(), r.agency_name, r.agency_url, r.agency_timezone, r.agency_lang, r.agency_phone, r.agency_email
                ));
            });
            await processStream(stream, batch, 100, flush);
        }

        // Stops
        if (entries.has('stops.txt')) {
            updateStatus(30, "Importing Stops...");
            const insert = db.prepare(`INSERT OR IGNORE INTO stops (stop_id, stop_code, stop_name, stop_desc, stop_lat, stop_lon, zone_id, stop_url, location_type, parent_station, stop_timezone, wheelchair_boarding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            const stream = await readEntryStream(filePath, 'stops.txt');
            const batch: any[] = [];
            const flush = db.transaction((rows: any[]) => {
                rows.forEach(s => {
                    // Strict User Filter: Only import if used
                    if (usedStopIds.size > 0 && !usedStopIds.has(s.stop_id)) return;

                    insert.run(
                        s.stop_id, s.stop_code, s.stop_name, s.stop_desc, s.stop_lat, s.stop_lon, s.zone_id, s.stop_url, s.location_type || 0, s.parent_station, s.stop_timezone, s.wheelchair_boarding || 0
                    );
                });
            });
            await processStream(stream, batch, 2000, flush);
        }

        // Routes
        const skippedRoutes: string[] = [];
        const ignoredRoutes: string[] = []; // Invalid ones

        if (entries.has('routes.txt')) {
            updateStatus(45, "Importing Routes...");
            const check = db.prepare('SELECT route_id FROM routes WHERE route_id = ?');
            const insert = db.prepare(`INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name, route_desc, route_type, route_url, route_color, route_text_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            const stream = await readEntryStream(filePath, 'routes.txt');

            const rows: any[] = [];
            await new Promise<void>((resolve, reject) => {
                stream.pipe(csv())
                    .on('data', (r) => rows.push(r))
                    .on('end', () => {
                        db.transaction(() => {
                            rows.forEach(r => {
                                // Filter by Selection
                                // Note: We only import routes that have at least one valid trip (validRouteIds).
                                // This assumes we calculated validRouteIds correctly based on the allowedPairs above.
                                if (!filters.routes.has(r.route_id) && !validRouteIds.has(r.route_id)) return;

                                // Actually, filters.routes.has check is too loose if allowedPairs is used.
                                // We should strictly rely on validRouteIds which was built from the accepted trips.
                                if (!validRouteIds.has(r.route_id)) {
                                    // If user didn't even select it in routes set?
                                    // If granular import: validRouteIds matches user intent.
                                    // If ignoredRoutes logic:
                                    // It might be in 'filters.routes' but have no valid trips (e.g. S-R2 where R2 has no trips in S).
                                    // Wait, validRouteIds ONLY contains routes that have trips that passed the filter.

                                    // If the route was in the zip but has no selected trips, we skip it.
                                    // Should we report it as 'ignored'? Only if it was in the user's "selectedRoutes" list?
                                    // For now, let's just skip it silently if it's not in validRouteIds, UNLESS validRouteIds logic excluded it but it was "Selected"?
                                    return;
                                }

                                if (check.get(r.route_id)) {
                                    skippedRoutes.push(`${r.route_short_name || r.route_id} (Duplicate)`);
                                    return;
                                }
                                insert.run(
                                    r.route_id, r.agency_id, r.route_short_name, r.route_long_name, r.route_desc, r.route_type, r.route_url, r.route_color, r.route_text_color
                                );
                            });
                        })();
                        resolve();
                    })
                    .on('error', reject);
            });
        }

        // Calendar
        if (entries.has('calendar.txt')) {
            updateStatus(55, "Importing Calendar...");
            const insert = db.prepare(`INSERT OR REPLACE INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            const stream = await readEntryStream(filePath, 'calendar.txt');
            const batch: any[] = [];
            const flush = db.transaction((rows: any[]) => {
                rows.forEach(c => {
                    // For calendar, we should strictly check services that have valid trips?
                    // Or allowedPairs? Service ID doesn't have Route ID.
                    // But filters.services contains all potential services.
                    // It's safe to import extra calendars if they are not used.
                    // But we can filter by filters.services for optimization.
                    if (filters.services.has(c.service_id)) {
                        insert.run(c.service_id, c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday, c.sunday, c.start_date, c.end_date);
                    }
                });
            });
            await processStream(stream, batch, 500, flush);
        }

        // Trips
        if (entries.has('trips.txt')) {
            updateStatus(65, "Importing Trips...");
            const insert = db.prepare(`INSERT INTO trips (route_id, service_id, trip_id, trip_headsign, trip_short_name, direction_id, block_id, shape_id, wheelchair_accessible, bikes_allowed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            const stream = await readEntryStream(filePath, 'trips.txt');

            const checkTrip = db.prepare('SELECT trip_id FROM trips WHERE trip_id = ?');
            const existingRouteIds = new Set(db.prepare('SELECT route_id FROM routes').all().map((r: any) => r.route_id));

            const batch: any[] = [];
            const flush = db.transaction((rows: any[]) => {
                rows.forEach(t => {
                    // Filter by Selection (Redundant with finalValidTrips ? Yes, but safe)
                    if (!finalValidTrips.has(t.trip_id)) return;

                    // Check if trip exists
                    if (checkTrip.get(t.trip_id)) return;
                    // Check if route exists (FK)
                    if (existingRouteIds.has(t.route_id)) {
                        insert.run(
                            t.route_id, t.service_id, t.trip_id, t.trip_headsign, t.trip_short_name, t.direction_id, t.block_id, t.shape_id, t.wheelchair_accessible, t.bikes_allowed
                        );
                    }
                });
            });
            await processStream(stream, batch, 2000, flush);
        }

        // Stop Times
        if (entries.has('stop_times.txt')) {
            updateStatus(80, "Importing Stop Times...");
            const insert = db.prepare(`INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, pickup_type, drop_off_type, shape_dist_traveled, timepoint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            const stream = await readEntryStream(filePath, 'stop_times.txt');

            const batch: any[] = [];
            const flush = db.transaction((rows: any[]) => {
                rows.forEach(st => {
                    if (finalValidTrips.has(st.trip_id)) {
                        insert.run(
                            st.trip_id, st.arrival_time, st.departure_time, st.stop_id, st.stop_sequence, st.stop_headsign, st.pickup_type, st.drop_off_type, st.shape_dist_traveled, st.timepoint
                        );
                    }
                });
            });
            await processStream(stream, batch, 5000, flush);
        }

        // Shapes
        if (entries.has('shapes.txt')) {
            updateStatus(90, "Importing Shapes...");
            const insert = db.prepare(`INSERT OR REPLACE INTO shapes (shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence, shape_dist_traveled) VALUES (?, ?, ?, ?, ?)`);
            const stream = await readEntryStream(filePath, 'shapes.txt');

            const batch: any[] = [];
            const flush = db.transaction((rows: any[]) => {
                rows.forEach(s => insert.run(
                    s.shape_id, s.shape_pt_lat, s.shape_pt_lon, s.shape_pt_sequence, s.shape_dist_traveled
                ));
            });
            await processStream(stream, batch, 5000, flush);
        }

        // Generate Segments for Visualization
        if (finalValidTrips.size > 0 && entries.has('stop_times.txt')) {
            await generateSegments(taskId, finalValidTrips);
        }

        const completionTask = importTasks.get(taskId);
        if (completionTask) {
            completionTask.status = 'completed';
            completionTask.progress = 100;
            completionTask.message = 'Import completed successfuly.';
            completionTask.details = {
                importedRoutesCount: validRouteIds.size - skippedRoutes.length, // Approx
                skippedRoutesCount: skippedRoutes.length,
                skippedRoutes: skippedRoutes,
                invalidRoutesCount: ignoredRoutes.length,
                invalidRoutes: ignoredRoutes
            };
        }

    } catch (err: any) {
        console.error("Import Error", err);
        fail(`Import failed: ${err.message}`);
    } finally {
        // Cleanup Temp File
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.error("Failed to delete temp file", e);
            }
        }
    }
}

// Helper to generate segments from imported trips
async function generateSegments(taskId: string, tripIds: Set<string>) {
    const updateStatus = (msg: string) => {
        const task = importTasks.get(taskId);
        if (task) task.message = msg;
    };

    updateStatus("Generating Route Segments...");
    console.log(`Generating segments for ${tripIds.size} trips...`);

    const tripIdArray = Array.from(tripIds);
    const chunkSize = 500;
    const processedSegments = new Set<string>(); // "start_id-end_id"

    const insertSegment = db.prepare(`
        INSERT OR IGNORE INTO segments (segment_id, start_node_id, end_node_id, distance, travel_time, geometry)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Haversine formula for distance in meters
    const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371e3; // Radius of the earth in m
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    const getLineStringLength = (coords: number[][]) => {
        let length = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            length += getDistanceFromLatLonInMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
        }
        return length;
    }


    for (let i = 0; i < tripIdArray.length; i += chunkSize) {
        const chunk = tripIdArray.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => '?').join(',');

        // Updated query to fetch stop coordinates
        const rows = db.prepare(`
            SELECT st.trip_id, st.stop_id, st.stop_sequence, st.shape_dist_traveled, 
                   st.arrival_time, st.departure_time, t.shape_id,
                   s.stop_lat, s.stop_lon
            FROM stop_times st
            JOIN trips t ON st.trip_id = t.trip_id
            JOIN stops s ON st.stop_id = s.stop_id
            WHERE st.trip_id IN (${placeholders})
            ORDER BY st.trip_id, st.stop_sequence
        `).all(...chunk) as any[];

        const tripsMap = new Map<string, any[]>();
        rows.forEach(r => {
            if (!tripsMap.has(r.trip_id)) tripsMap.set(r.trip_id, []);
            tripsMap.get(r.trip_id)!.push(r);
        });

        const transaction = db.transaction(() => {
            for (const [tid, stops] of tripsMap) {
                if (stops.length < 2) continue;

                for (let j = 0; j < stops.length - 1; j++) {
                    const from = stops[j];
                    const to = stops[j + 1];
                    const key = `${from.stop_id}-${to.stop_id}`;

                    if (processedSegments.has(key)) continue;
                    processedSegments.add(key);

                    let dist = 0;
                    let travelTime = 0;
                    let geom = null;

                    // Calculate Travel Time
                    if (to.arrival_time && from.departure_time) {
                        const t1 = timeToSeconds(from.departure_time);
                        const t2 = timeToSeconds(to.arrival_time);
                        if (t2 > t1) travelTime = t2 - t1;
                    }

                    // 1. Try shape_dist_traveled
                    if (from.shape_dist_traveled != null && to.shape_dist_traveled != null) {
                        dist = to.shape_dist_traveled - from.shape_dist_traveled;
                    }

                    // 2. Geometry from Shapes
                    if (from.shape_id) {
                        const shapePoints = db.prepare(`
                            SELECT shape_pt_lat, shape_pt_lon
                            FROM shapes
                            WHERE shape_id = ? 
                              AND shape_dist_traveled >= ? 
                              AND shape_dist_traveled <= ?
                            ORDER BY shape_pt_sequence
                         `).all(from.shape_id, from.shape_dist_traveled || 0, to.shape_dist_traveled || 9999999) as any[];

                        if (shapePoints.length > 0) {
                            const coords = shapePoints.map(p => [p.shape_pt_lon, p.shape_pt_lat]);
                            geom = JSON.stringify({
                                type: 'LineString',
                                coordinates: coords
                            });

                            // 3. Fallback Distance from Geometry
                            if (dist <= 0) {
                                dist = getLineStringLength(coords);
                            }
                        }
                    }

                    // 4. Fallback Straight Line Distance
                    if (dist <= 0) {
                        dist = getDistanceFromLatLonInMeters(from.stop_lat, from.stop_lon, to.stop_lat, to.stop_lon);

                        // If no geometry yet, create straight line
                        if (!geom) {
                            geom = JSON.stringify({
                                type: 'LineString',
                                coordinates: [[from.stop_lon, from.stop_lat], [to.stop_lon, to.stop_lat]]
                            });
                        }
                    }

                    insertSegment.run(uuidv4(), from.stop_id, to.stop_id, dist, travelTime, geom);
                }
            }
        });

        transaction();
        updateStatus(`Generating Segments... (${Math.min(100, Math.round((i / tripIdArray.length) * 100))}%)`);
    }
}

function processStream(stream: Readable, batch: any[], batchSize: number, flush: (rows: any[]) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        stream.pipe(csv())
            .on('data', (row) => {
                batch.push(row);
                if (batch.length >= batchSize) {
                    flush(batch);
                    batch.length = 0;
                }
            })
            .on('end', () => {
                if (batch.length > 0) flush(batch);
                resolve();
            })
            .on('error', reject);
    });
}

function timeToSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    const [h, m, s] = timeStr.split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}
