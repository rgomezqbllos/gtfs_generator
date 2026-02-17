
const Database = require('better-sqlite3');
const db = new Database('gtfs.db');

const tables = ['agency', 'routes', 'trips', 'stop_times', 'stops', 'calendar', 'shapes'];

tables.forEach(table => {
    try {
        const columns = db.pragma(`table_info(${table})`);
        console.log(`\nTable: ${table}`);
        console.log(columns.map(c => c.name).join(', '));
    } catch (e) {
        console.log(`Error reading ${table}:`, e.message);
    }
});
