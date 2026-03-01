import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const defaultDbPath = path.resolve(__dirname, '../../gtfs.db');
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath;
const schemaPath = path.resolve(__dirname, 'schema.sql');
type DBInstance = Database.Database;

// Ensure parent folder exists when DB_PATH points outside the repo tree (e.g. Docker volume).
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let dbConnection: DBInstance = new Database(dbPath, { verbose: console.log });
dbConnection.pragma('journal_mode = WAL');

// Stable proxy so imports keep working even if reconnectDB replaces the underlying connection.
const db = new Proxy({} as DBInstance, {
    get(_target, prop: string | symbol) {
        const value = (dbConnection as any)[prop];
        return typeof value === 'function' ? value.bind(dbConnection) : value;
    },
    set(_target, prop: string | symbol, value: unknown) {
        (dbConnection as any)[prop] = value;
        return true;
    }
}) as DBInstance;

export function initDB() {
    const db = dbConnection;
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

        // Stops Migration
        const stopColumns = db.pragma('table_info(stops)') as { name: string }[];
        const stopColumnNames = stopColumns.map(c => c.name);
        if (!stopColumnNames.includes('node_type')) {
            db.prepare('ALTER TABLE stops ADD COLUMN node_type TEXT').run();
            console.log('Migrated: Added node_type to stops');
        }


        // Segments Migration
        const segmentColumns = db.pragma('table_info(segments)') as { name: string }[];
        const segmentColumnNames = segmentColumns.map(c => c.name);
        if (!segmentColumnNames.includes('type')) {
            db.prepare("ALTER TABLE segments ADD COLUMN type TEXT DEFAULT 'revenue'").run();
            console.log('Migrated: Added type to segments');
        }

        // Settings Migration
        db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);
    } catch (err) {
        console.warn('Migration warning:', err);
    }

    console.log('Database initialized');
}

export function closeDB() {
    if (dbConnection.open) {
        dbConnection.close();
    }
}

export function reconnectDB() {
    if (dbConnection.open) {
        dbConnection.close();
    }
    dbConnection = new Database(dbPath, { verbose: console.log });
    dbConnection.pragma('journal_mode = WAL');
}

export function getDbPath() {
    return dbPath;
}

export { db };
export default db;
