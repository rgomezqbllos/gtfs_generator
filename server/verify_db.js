const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, 'gtfs.db');
const db = new Database(dbPath, { fileMustExist: true }); // Ensure we don't create new empty DB

console.log('Connected to DB. Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());

console.log('Stops:', db.prepare('SELECT COUNT(*) as c FROM stops').get().c);
console.log('Routes:', db.prepare('SELECT COUNT(*) as c FROM routes').get().c);
console.log('Segments:', db.prepare('SELECT COUNT(*) as c FROM segments').get().c);
console.log('Trips (Total):', db.prepare('SELECT COUNT(*) as c FROM trips').get().c);
// Revenue vs Deadhead heuristic (Deadhead = exactly 2 stops in this logic)
console.log('Trips (2 stops / likely Deadhead):', db.prepare('SELECT COUNT(*) as c FROM trips WHERE trip_id IN (SELECT trip_id FROM stop_times GROUP BY trip_id HAVING COUNT(*) = 2)').get().c);
console.log('Trips (>2 stops / likely Revenue):', db.prepare('SELECT COUNT(*) as c FROM trips WHERE trip_id IN (SELECT trip_id FROM stop_times GROUP BY trip_id HAVING COUNT(*) > 2)').get().c);
console.log('StopTimes:', db.prepare('SELECT COUNT(*) as c FROM stop_times').get().c);
console.log('Sample Trip:', db.prepare('SELECT * FROM trips LIMIT 1').get());

console.log('Stop Types Distribution:', db.prepare('SELECT node_type, COUNT(*) as c FROM stops GROUP BY node_type').all());
console.log('Garage Stop:', db.prepare("SELECT stop_code, stop_name, node_type FROM stops WHERE stop_name LIKE '%Garagem%' OR node_type='parking'").get());

console.log('Route Sample:', db.prepare('SELECT route_id, route_short_name, route_long_name FROM routes LIMIT 1').get());
