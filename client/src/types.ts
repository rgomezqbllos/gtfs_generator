export interface Stop {
    stop_id: string;
    stop_code: string;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
    node_type?: 'regular' | 'parking' | 'depot';
}

export interface Segment {
    segment_id: string;
    start_node_id: string;
    end_node_id: string;
    distance?: number;
    travel_time?: number;
    speed?: number; // km/h (derived)
    type: 'revenue' | 'empty';
    geometry?: string; // GeoJSON LineString stringified
    slots?: any[]; // For time-dependent travel, added 'any' to avoid circular/missing references if moved
}

export interface Route {
    route_id: string;
    agency_id: string;
    route_short_name: string;
    route_long_name: string;
    route_type: number;
    directions?: any[]; // Simplified
    agency_name?: string; // Enriched
}

// Hack to resolve "SyntaxError: The requested module ... does not provide an export named 'Segment'"
// This ensures that if any file accidentally treats Segment as a value import, it finds something.
export const Segment = {};
export const Stop = {};
export const Route = {};
