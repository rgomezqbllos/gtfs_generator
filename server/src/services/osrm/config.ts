import path from 'path';

// Runtime environment
export const IN_DOCKER = !!process.env.HOST_PROJECT_PATH;
export const HOST_PROJECT_PATH = process.env.HOST_PROJECT_PATH || path.resolve(__dirname, '../../../../');
export const DATA_DIR = IN_DOCKER ? '/data' : path.join(HOST_PROJECT_PATH, 'gtfs_data');
export const OSRM_DOCKER_NETWORK = process.env.OSRM_DOCKER_NETWORK || 'gtfs_generator_default';

// Container settings
export const CONTAINER_PREFIX = process.env.OSRM_CONTAINER_PREFIX || 'gtfs-osrm';
export const BASE_PORT = Number(process.env.OSRM_BASE_PORT) || 5000;
export const OSRM_ROUTED_THREADS = Math.max(Number(process.env.OSRM_ROUTED_THREADS) || 2, 1);

// OSRM profiles
export const PROFILES = ['bus_mixed', 'bus_mixed_exclusive', 'bus_trunk'] as const;
export const PROFILE_PORTS: Record<string, number> = {
    bus_mixed: 5001,
    bus_mixed_exclusive: 5002,
    bus_trunk: 5003,
};

// Shared types
import { MapInstance } from '../MapRepository';

export interface MapInfo {
    id: string;
    name: string;
    status: MapInstance['status'];
    isActive: boolean;
    is_local?: boolean;
    base_port?: number | null;
    disk_size?: number | null;
    running_profiles?: string[];
    healthy_profiles?: string[];
    total_profiles?: number;
    health_status?: 'live' | 'degraded' | 'offline';
}

export interface OsrmStatus {
    status: 'idle' | 'downloading' | 'processing' | 'running' | 'error';
    message: string;
    progress?: number;
    activeRegion?: string;
    activeMapId?: string;
}
