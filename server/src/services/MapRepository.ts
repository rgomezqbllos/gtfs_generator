
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface MapInstance {
    id: string;
    name: string;
    pbf_url: string;
    status: 'pending' | 'downloading' | 'processing' | 'ready' | 'error';
    base_port?: number;
    disk_size?: number;
    last_used_at: string;
    created_at: string;
}

class MapRepository {
    getAll(): MapInstance[] {
        return db.prepare('SELECT * FROM map_instances ORDER BY last_used_at DESC').all() as MapInstance[];
    }

    getById(id: string): MapInstance | undefined {
        return db.prepare('SELECT * FROM map_instances WHERE id = ?').get(id) as MapInstance;
    }

    getByUrl(url: string): MapInstance | undefined {
        return db.prepare('SELECT * FROM map_instances WHERE pbf_url = ?').get(url) as MapInstance;
    }

    create(name: string, pbf_url: string): MapInstance {
        const id = uuidv4();
        db.prepare('INSERT INTO map_instances (id, name, pbf_url) VALUES (?, ?, ?)')
            .run(id, name, pbf_url);
        return this.getById(id)!;
    }

    updateStatus(id: string, status: MapInstance['status'], basePort?: number | null, diskSize?: number | null) {
        const updates = ['status = ?', 'last_used_at = CURRENT_TIMESTAMP'];
        const values: Array<string | number | null> = [status];

        if (basePort !== undefined) {
            updates.push('base_port = ?');
            values.push(basePort);
        }

        if (diskSize !== undefined) {
            updates.push('disk_size = ?');
            values.push(diskSize);
        }

        values.push(id);

        db.prepare(`UPDATE map_instances SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    touch(id: string) {
        db.prepare('UPDATE map_instances SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    }

    delete(id: string) {
        db.prepare('DELETE FROM map_instances WHERE id = ?').run(id);
    }

    // Help with migration/initialization
    async ensurePredefinedRegions() {
        // This will be replaced by a real GSOC/Nominatim search later
        const PREDEFINED = [
            { name: 'Bogotá, Colombia', url: 'https://download.bbbike.org/osm/bbbike/Bogota/Bogota.osm.pbf' },
            { name: 'Medellín, Colombia', url: 'https://download.geofabrik.de/south-america/colombia-latest.osm.pbf' },
            { name: 'Mérida, México', url: 'https://download.geofabrik.de/north-america/mexico-latest.osm.pbf' },
            { name: 'Montevideo, Uruguay', url: 'https://download.geofabrik.de/south-america/uruguay-latest.osm.pbf' },
            { name: 'Curitiba, Brasil', url: 'https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf' }
        ];

        for (const region of PREDEFINED) {
            if (!this.getByUrl(region.url)) {
                this.create(region.name, region.url);
            }
        }
    }
}

export default new MapRepository();
