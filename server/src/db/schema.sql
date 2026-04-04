CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    map_center_lat REAL DEFAULT 4.6097, -- Default Bogota
    map_center_lon REAL DEFAULT -74.0817,
    routing_engine_url TEXT, -- e.g., http://localhost:8002/route
    map_instance_id TEXT, -- Relation to new map_instances table
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(map_instance_id) REFERENCES map_instances(id)
);

CREATE TABLE IF NOT EXISTS map_instances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pbf_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, downloading, processing, ready, error
    base_port INTEGER,
    disk_size INTEGER, -- in bytes
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    email TEXT,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_projects (
    user_id TEXT NOT NULL, -- UUID from Keycloak
    project_id TEXT NOT NULL,
    role TEXT DEFAULT 'editor',
    PRIMARY KEY (user_id, project_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_project_map_preferences (
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    center_lat REAL NOT NULL CHECK(center_lat >= -90 AND center_lat <= 90),
    center_lon REAL NOT NULL CHECK(center_lon >= -180 AND center_lon <= 180),
    zoom REAL NOT NULL CHECK(zoom >= 0 AND zoom <= 22),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, project_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- GTFS Tables (Optimized for Multi-Tenancy)
CREATE TABLE IF NOT EXISTS agency (
    agency_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    agency_name TEXT NOT NULL,
    agency_url TEXT NOT NULL,
    agency_timezone TEXT NOT NULL,
    agency_lang TEXT,
    agency_phone TEXT,
    agency_email TEXT,
    PRIMARY KEY (agency_id, project_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stops (
    stop_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
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
    node_type TEXT, -- 'commercial', 'checkpoint', 'operative', etc.
    PRIMARY KEY (stop_id, project_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS routes (
    route_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
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
    allowed_materials TEXT, -- 'buses', 'trains', etc.
    routing_profile TEXT DEFAULT 'bus_mixed_exclusive', -- Preferred OSRM profile for this route
    PRIMARY KEY (route_id, project_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calendar (
    service_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    monday INTEGER NOT NULL,
    tuesday INTEGER NOT NULL,
    wednesday INTEGER NOT NULL,
    thursday INTEGER NOT NULL,
    friday INTEGER NOT NULL,
    saturday INTEGER NOT NULL,
    sunday INTEGER NOT NULL,
    start_date TEXT NOT NULL, -- YYYYMMDD
    end_date TEXT NOT NULL,    -- YYYYMMDD
    PRIMARY KEY (service_id, project_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trips (
    trip_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    trip_headsign TEXT,
    trip_short_name TEXT,
    direction_id INTEGER,
    block_id TEXT,
    shape_id TEXT,
    wheelchair_accessible INTEGER,
    bikes_allowed INTEGER,
    PRIMARY KEY (trip_id, project_id),
    FOREIGN KEY(route_id, project_id) REFERENCES routes(route_id, project_id) ON DELETE CASCADE,
    FOREIGN KEY(service_id, project_id) REFERENCES calendar(service_id, project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stop_times (
    trip_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    arrival_time TEXT,
    departure_time TEXT,
    stop_id TEXT NOT NULL,
    stop_sequence INTEGER NOT NULL,
    stop_headsign TEXT,
    pickup_type INTEGER,
    drop_off_type INTEGER,
    shape_dist_traveled REAL,
    timepoint INTEGER,
    PRIMARY KEY(trip_id, stop_sequence, project_id),
    FOREIGN KEY(trip_id, project_id) REFERENCES trips(trip_id, project_id) ON DELETE CASCADE,
    FOREIGN KEY(stop_id, project_id) REFERENCES stops(stop_id, project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shapes (
    shape_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    shape_pt_lat REAL NOT NULL,
    shape_pt_lon REAL NOT NULL,
    shape_pt_sequence INTEGER NOT NULL,
    shape_dist_traveled REAL,
    PRIMARY KEY(shape_id, shape_pt_sequence, project_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Custom table for Segments / "Tramos" metadata
CREATE TABLE IF NOT EXISTS segments (
    segment_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    start_node_id TEXT NOT NULL,
    end_node_id TEXT NOT NULL,
    distance REAL,
    travel_time INTEGER, -- seconds
    routing_profile TEXT DEFAULT 'bus_mixed',
    allowed_transport_modes TEXT, -- e.g., "bus,tram"
    custom_attributes TEXT, -- JSON string for other user-defined props
    geometry TEXT, -- GeoJSON LineString
    type TEXT DEFAULT 'revenue', -- 'revenue' or 'empty'
    PRIMARY KEY (segment_id, project_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(start_node_id, project_id) REFERENCES stops(stop_id, project_id),
    FOREIGN KEY(end_node_id, project_id) REFERENCES stops(stop_id, project_id)
);

CREATE TABLE IF NOT EXISTS segment_time_slots (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    start_time TEXT NOT NULL, -- HH:MM:SS
    end_time TEXT NOT NULL,   -- HH:MM:SS
    travel_time INTEGER NOT NULL, -- seconds
    FOREIGN KEY(segment_id, project_id) REFERENCES segments(segment_id, project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS route_parkings (
    route_id TEXT NOT NULL,
    stop_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    PRIMARY KEY(route_id, stop_id, project_id),
    FOREIGN KEY(route_id, project_id) REFERENCES routes(route_id, project_id) ON DELETE CASCADE,
    FOREIGN KEY(stop_id, project_id) REFERENCES stops(stop_id, project_id) ON DELETE CASCADE
);
