import db from './server/src/db';

console.log("Checking tables...");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables:", tables.map((t: any) => t.name));

console.log("Checking stops count...");
const stopsCount = db.prepare("SELECT count(*) as count FROM stops").get() as { count: number };
console.log("Stops:", stopsCount.count);

console.log("Checking segments count...");
const segmentsCount = db.prepare("SELECT count(*) as count FROM segments").get() as { count: number };
console.log("Segments:", segmentsCount.count);

console.log("Checking stops schema...");
const stopsColumns = db.prepare("PRAGMA table_info(stops)").all();
console.log("Stops Columns:", stopsColumns);
