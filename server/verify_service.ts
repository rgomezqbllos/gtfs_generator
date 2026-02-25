
import { StructuredImportService } from './src/services/structuredImportService';
import db from './src/db';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

async function verify() {
    console.log('--- Verification Start ---');

    // Clear DB safely
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('DELETE FROM stop_times; DELETE FROM trips; DELETE FROM calendar; DELETE FROM routes; DELETE FROM stops;');
    db.exec('PRAGMA foreign_keys = ON;');

    // Insert prerequisite data
    db.exec("INSERT INTO routes (route_id, route_type) VALUES ('203', 3)");
    db.exec("INSERT INTO stops (stop_id, stop_code, stop_name) VALUES ('S1', 'Garagem', 'Garagem')");
    db.exec("INSERT INTO stops (stop_id, stop_code, stop_name) VALUES ('S2', 'Terminal Santa Cândida', 'Terminal Santa Cândida')");
    db.exec("INSERT INTO stops (stop_id, stop_code, stop_name) VALUES ('S3', 'Terminal Capão Raso', 'Terminal Capão Raso')");

    const itineraries: any[] = [];
    const itineraryPath = path.join(process.cwd(), 'test/Itinerario.csv');

    fs.createReadStream(itineraryPath)
        .pipe(csv())
        .on('data', (data) => itineraries.push(data))
        .on('end', async () => {
            console.log(`Read ${itineraries.length} itinerary rows.`);

            const service = new StructuredImportService();

            // Create template trips in DB to trigger pattern reconstruction
            db.exec("INSERT INTO trips (route_id, service_id, trip_id, direction_id) VALUES ('203', 'TEMPLATE', 'T_203_0', 0)");
            db.exec("INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, shape_dist_traveled) VALUES ('T_203_0', '00:00:00', '00:00:00', 'S2', 1, 0)");
            db.exec("INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, shape_dist_traveled) VALUES ('T_203_0', '01:00:00', '01:00:00', 'S3', 2, 1000)");

            db.exec("INSERT INTO trips (route_id, service_id, trip_id, direction_id) VALUES ('203', 'TEMPLATE', 'T_203_1', 1)");
            db.exec("INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, shape_dist_traveled) VALUES ('T_203_1', '00:00:00', '00:00:00', 'S3', 1, 0)");
            db.exec("INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence, shape_dist_traveled) VALUES ('T_203_1', '01:00:00', '01:00:00', 'S2', 2, 1000)");

            await service.processAll([], [], itineraries);

            const trips = db.prepare('SELECT DISTINCT service_id FROM trips').all();
            const calendars = db.prepare('SELECT * FROM calendar').all();

            console.log('Unique service_ids in trips:', trips);
            console.log('Entries in calendar:', calendars);

            if (calendars.length > 0 && trips.some(t => t.service_id === 'WEEKDAY_CSV')) {
                console.log('SUCCESS: Service ID and Calendar verified.');
            } else {
                console.log('FAILURE: Missing data.');
            }
            process.exit(0);
        });
}

verify();
