import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../gtfs.db');
const schemaPath = path.resolve(__dirname, 'schema.sql');

const db = new Database(dbPath, { verbose: console.log });
db.pragma('journal_mode = WAL');

export function initDB() {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    // Migration for new route columns (if they don't exist in old DBs)
    try {
        const columns = db.pragma('table_info(routes)') as { name: string }[];
        const columnNames = columns.map(c => c.name);

        if (!columnNames.includes('route_desc')) {
            db.prepare('ALTER TABLE routes ADD COLUMN route_desc TEXT').run();
            console.log('Migrated: Added route_desc to routes');
        }
        if (!columnNames.includes('route_url')) {
            db.prepare('ALTER TABLE routes ADD COLUMN route_url TEXT').run();
            console.log('Migrated: Added route_url to routes');
        }
        if (!columnNames.includes('route_sort_order')) {
            db.prepare('ALTER TABLE routes ADD COLUMN route_sort_order INTEGER').run();
            console.log('Migrated: Added route_sort_order to routes');
        }
        if (!columnNames.includes('route_text_color')) {
            db.prepare('ALTER TABLE routes ADD COLUMN route_text_color TEXT').run();
            console.log('Migrated: Added route_text_color to routes');
        }

        // Segments Migration
        const segmentColumns = db.pragma('table_info(segments)') as { name: string }[];
        const segmentColumnNames = segmentColumns.map(c => c.name);
        if (!segmentColumnNames.includes('type')) {
            db.prepare("ALTER TABLE segments ADD COLUMN type TEXT DEFAULT 'revenue'").run();
            console.log('Migrated: Added type to segments');
        }
    } catch (err) {
        console.warn('Migration warning:', err);
    }

    console.log('Database initialized');
}

export default db;
