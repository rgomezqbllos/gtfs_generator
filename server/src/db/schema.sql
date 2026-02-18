-- GTFS Tables
CREATE TABLE IF NOT EXISTS agency (
    agency_id TEXT PRIMARY KEY,
    agency_name TEXT NOT NULL,
    agency_url TEXT NOT NULL,
    agency_timezone TEXT NOT NULL,
    agency_lang TEXT,
    agency_phone TEXT,
    agency_email TEXT
);

CREATE TABLE IF NOT EXISTS stops (
    stop_id TEXT PRIMARY KEY,
    stop_code TEXT,
    stop_name TEXT,
    stop_desc TEXT,
    stop_lat REAL,
    stop_lon REAL,
    zone_id TEXT,
    stop_url TEXT,
    location_type INTEGER, -- 0: stop, 1: station, etc.
    parent_station TEXT,
    stop_timezone TEXT,
    wheelchair_boarding INTEGER,
    level_id TEXT,
    platform_code TEXT,
    
    -- Custom fields for "Node" types
    node_type TEXT -- 'commercial', 'checkpoint', 'operative', etc.
);

CREATE TABLE IF NOT EXISTS routes (
    route_id TEXT PRIMARY KEY,
    agency_id TEXT,
    route_short_name TEXT,
    route_long_name TEXT,
    route_desc TEXT,
    route_type INTEGER NOT NULL,
    route_url TEXT,
    route_color TEXT,
    route_text_color TEXT,
    route_sort_order INTEGER,
    
    -- Custom fields
    allowed_materials TEXT -- 'buses', 'trains', etc.
);

CREATE TABLE IF NOT EXISTS trips (
    route_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    trip_id TEXT PRIMARY KEY,
    trip_headsign TEXT,
    trip_short_name TEXT,
    direction_id INTEGER,
    block_id TEXT,
    shape_id TEXT,
    wheelchair_accessible INTEGER,
    bikes_allowed INTEGER,
    FOREIGN KEY(route_id) REFERENCES routes(route_id)
);

CREATE TABLE IF NOT EXISTS stop_times (
    trip_id TEXT NOT NULL,
    arrival_time TEXT,
    departure_time TEXT,
    stop_id TEXT NOT NULL,
    stop_sequence INTEGER NOT NULL,
    stop_headsign TEXT,
    pickup_type INTEGER,
    drop_off_type INTEGER,
    shape_dist_traveled REAL,
    timepoint INTEGER,
    PRIMARY KEY(trip_id, stop_sequence),
    FOREIGN KEY(trip_id) REFERENCES trips(trip_id),
    FOREIGN KEY(stop_id) REFERENCES stops(stop_id)
);

CREATE TABLE IF NOT EXISTS calendar (
    service_id TEXT PRIMARY KEY,
    monday INTEGER NOT NULL,
    tuesday INTEGER NOT NULL,
    wednesday INTEGER NOT NULL,
    thursday INTEGER NOT NULL,
    friday INTEGER NOT NULL,
    saturday INTEGER NOT NULL,
    sunday INTEGER NOT NULL,
    start_date TEXT NOT NULL, -- YYYYMMDD
    end_date TEXT NOT NULL    -- YYYYMMDD
);

CREATE TABLE IF NOT EXISTS shapes (
    shape_id TEXT NOT NULL,
    shape_pt_lat REAL NOT NULL,
    shape_pt_lon REAL NOT NULL,
    shape_pt_sequence INTEGER NOT NULL,
    shape_dist_traveled REAL,
    PRIMARY KEY(shape_id, shape_pt_sequence)
);

-- Custom table for Segments / "Tramos" metadata
-- User wants metadata for segments connecting nodes.
-- A segment can be defined by a start_node and end_node, or associated with a shape.
CREATE TABLE IF NOT EXISTS segments (
    segment_id TEXT PRIMARY KEY,
    start_node_id TEXT NOT NULL,
    end_node_id TEXT NOT NULL,
    distance REAL,
    travel_time INTEGER, -- seconds
    allowed_transport_modes TEXT, -- e.g., "bus,tram"
    custom_attributes TEXT, -- JSON string for other user-defined props
    geometry TEXT, -- GeoJSON LineString if needed, or reference shapes
    type TEXT DEFAULT 'revenue', -- 'revenue' or 'empty'
    FOREIGN KEY(start_node_id) REFERENCES stops(stop_id),
    FOREIGN KEY(end_node_id) REFERENCES stops(stop_id)
);

CREATE TABLE IF NOT EXISTS segment_time_slots (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL,
    start_time TEXT NOT NULL, -- HH:MM:SS
    end_time TEXT NOT NULL,   -- HH:MM:SS
    travel_time INTEGER NOT NULL, -- seconds
    FOREIGN KEY(segment_id) REFERENCES segments(segment_id) ON DELETE CASCADE
);
