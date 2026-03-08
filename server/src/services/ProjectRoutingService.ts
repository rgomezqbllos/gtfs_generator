import { db } from '../db';
import MapRepository, { MapInstance } from './MapRepository';
import osrmService from './OsrmService';

interface ProjectRow {
    id: string;
    routing_engine_url: string | null;
    map_instance_id: string | null;
}

export interface ProjectRoutingContext {
    projectId: string;
    routingUrl: string | null;
    mapAssigned: boolean;
    map: MapInstance | null;
    error?: string;
}

function getProjectRow(projectId: string): ProjectRow | undefined {
    return db.prepare(`
        SELECT id, routing_engine_url, map_instance_id
        FROM projects
        WHERE id = ?
    `).get(projectId) as ProjectRow | undefined;
}

export async function resolveProjectRouting(projectId: string): Promise<ProjectRoutingContext> {
    const project = getProjectRow(projectId);
    if (!project) {
        return {
            projectId,
            routingUrl: null,
            mapAssigned: false,
            map: null,
            error: 'Project not found'
        };
    }

    if (!project.map_instance_id) {
        return {
            projectId,
            routingUrl: project.routing_engine_url || null,
            mapAssigned: false,
            map: null
        };
    }

    const map = MapRepository.getById(project.map_instance_id) || null;
    if (!map) {
        return {
            projectId,
            routingUrl: null,
            mapAssigned: true,
            map: null,
            error: 'El mapa asociado al proyecto ya no existe en el Map Hub.'
        };
    }

    let basePort: number | null | undefined = map.base_port;
    if (!basePort || basePort <= 0) {
        basePort = await osrmService.recoverBasePort(map.id);
    }

    if (basePort) {
        const publicRoutingUrl = osrmService.buildRoutingUrl(basePort);
        const runtimeRoutingUrl = process.env.HOST_PROJECT_PATH
            ? osrmService.buildInternalRoutingUrl(map.id)
            : publicRoutingUrl;

        if (project.routing_engine_url !== publicRoutingUrl) {
            db.prepare('UPDATE projects SET routing_engine_url = ? WHERE id = ?').run(publicRoutingUrl, projectId);
        }
        return {
            projectId,
            routingUrl: runtimeRoutingUrl,
            mapAssigned: true,
            map: {
                ...map,
                base_port: basePort ?? undefined
            }
        };
    }

    return {
        projectId,
        routingUrl: project.routing_engine_url || null,
        mapAssigned: true,
        map,
        error: map.status === 'ready'
            ? 'El mapa está marcado como listo pero no tiene un puerto OSRM recuperable.'
            : `El mapa asociado al proyecto está en estado "${map.status}" y aún no puede rutear.`
    };
}
