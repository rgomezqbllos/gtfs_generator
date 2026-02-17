import db from './server/src/db/index.ts';

console.log("Checking routes table schema...");
const columns = db.prepare("PRAGMA table_info(routes)").all();
console.log("Columns:", columns);

console.log("Checking first route...");
const route = db.prepare("SELECT * FROM routes LIMIT 1").get();
console.log("Route:", route);
