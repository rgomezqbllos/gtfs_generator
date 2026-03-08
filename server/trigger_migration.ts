
import { initDB, db } from './src/db/index';

try {
    console.log('Starting manual migration trigger...');
    initDB();
    console.log('Migration completed successfully.');
    
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    console.log('Tables in DB:', tables.map(t => t.name).join(', '));
    
    const projectCols = db.pragma('table_info(projects)') as any[];
    console.log('Project columns:', projectCols.map(c => c.name).join(', '));
} catch (e) {
    console.error('Migration failed:', e);
}
