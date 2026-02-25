
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { StructuredImportService } from './src/services/structuredImportService';

const dbPath = path.resolve(__dirname, 'gtfs.db');
const db = new Database(dbPath);

async function runDebug() {
    console.log('Starting debug patterns import...');

    // 1. Clear relevant tables match FK order
    db.prepare('DELETE FROM stop_times').run();
    db.prepare('DELETE FROM trips').run();
    db.prepare('DELETE FROM segment_time_slots').run();
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM routes').run();

    // 2. Mock Data Loading
    const readCsv = (filePath: string): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            const results: any[] = [];
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    };

    const stops = await readCsv(path.resolve(__dirname, '../test/Paradas.csv'));
    const routes = await readCsv(path.resolve(__dirname, '../test/Rutas.csv'));

    // NO ITINERARIES for this test
    const itineraries: any[] = [];

    // 3. Run Service
    const service = new StructuredImportService();
    // processAll calls processStops -> processRoutes -> processItineraries
    // We want to verify that processRoutes ALONE (called within processAll) creates the trips.
    service.processAll(stops, routes, itineraries);

    const errors = service.getErrors();
    if (errors.length > 0) {
        console.log('Errors:', errors);
    }

    // 4. Verify Template Trips
    const trips = db.prepare(`SELECT trip_id, route_id, direction_id, service_id FROM trips WHERE service_id = 'TEMPLATE'`).all();
    console.log('Template Trips:', trips);

    const stopTimes = db.prepare(`
        SELECT t.trip_id, count(*) as stop_count, min(st.stop_sequence) as min_seq, max(st.stop_sequence) as max_seq
        FROM trips t
        JOIN stop_times st ON t.trip_id = st.trip_id
        WHERE t.service_id = 'TEMPLATE'
        GROUP BY t.trip_id
    `).all();

    console.log('Template Stop Times:', stopTimes);
}

runDebug().catch(console.error);
