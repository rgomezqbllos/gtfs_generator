export interface Stop {
    stop_id: string;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
    node_type?: string; // 'commercial', 'checkpoint', 'operative', etc.
    location_type?: number;
    stop_code?: string;
    stop_desc?: string;
}

export type StopInput = Omit<Stop, 'stop_id'>;

export interface Segment {
    segment_id: string;
    start_node_id: string;
    end_node_id: string;
    distance?: number;
    travel_time?: number;
    allowed_transport_modes?: string;
    custom_attributes?: string;
    // Join fields
    start_lat?: number;
    start_lon?: number;
    end_lat?: number;
    end_lon?: number;
    start_node_name?: string;
    end_node_name?: string;
    geometry?: string; // GeoJSON LineString stringified
    type?: 'revenue' | 'empty';
}

export interface Route {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    route_type: number;
    agency_id: string;
    agency_name?: string; // For display
    route_color: string;
    route_text_color: string;
    route_desc?: string;
    route_url?: string;
    route_sort_order?: number;
    allowed_materials?: string;
}
