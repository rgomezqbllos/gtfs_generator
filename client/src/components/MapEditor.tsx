import * as React from 'react';
import Map, { Marker, type MapLayerMouseEvent, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Stop, Route } from '../types'; // Removed Segment
import { MapPin } from 'lucide-react';
import { clsx } from 'clsx';
import RouteDetailsPanel from './RouteDetailsPanel';
import StopDetails from './StopDetails';
import SegmentDetails from './SegmentDetails';
import { useEditor } from '../context/EditorContext';
import { useTheme } from '../context/ThemeContext';
import MapControls from './UI/MapControls';
import RouteCatalog from './RouteCatalog';
import SettingsPanel from './SettingsPanel';
import FilterPanel, { type FilterState } from './FilterPanel';
import StopCreationModal from './StopCreationModal';
import { useSettings } from '../context/SettingsContext';
import CalendarManager from './CalendarManager';
import TripsManager from './TripsManager';
import EmptySegmentsManager from './EmptySegmentsManager';
import ExternalLoadPanel from './ExternalLoadPanel';
import { SimulationPanel } from './SimulationPanel';

import { API_URL } from '../config';

const MapEditor: React.FC = () => {
    const { mode, setMode, selectedElementId, selectedElementType, selectElement, clearSelection, activePanel, setActivePanel, pickingState } = useEditor();
    const { defaultLocation } = useSettings();

    const { theme } = useTheme();

    const [stops, setStops] = React.useState<Stop[]>([]);
    const [segments, setSegments] = React.useState<any[]>([]); // Changed to any[]

    // Derived state for selection details
    const viewingStop = React.useMemo(() =>
        selectedElementType === 'stop' ? stops.find(s => s.stop_id === selectedElementId) || null : null,
        [selectedElementType, selectedElementId, stops]);

    const viewingSegment = React.useMemo(() =>
        selectedElementType === 'segment' ? segments.find(s => s.segment_id === selectedElementId) || null : null,
        [selectedElementType, selectedElementId, segments]);

    // Segment Creation State - Moved up to avoid ReferenceError
    const [segmentStartNode, setSegmentStartNode] = React.useState<string | null>(null);
    const [cursorLoc, setCursorLoc] = React.useState<{ lat: number; lon: number } | null>(null);
    const [isHovering, setIsHovering] = React.useState(false); // New hover state

    // const [selectedStops, setSelectedStops] = React.useState<string[]>([]); // For future connecting nodes feature
    const [loading, setLoading] = React.useState(false);

    const [viewState, setViewState] = React.useState({
        longitude: defaultLocation.longitude,
        latitude: defaultLocation.latitude,
        zoom: defaultLocation.zoom
    });

    // Dark Mode Map Style (CSS Filter)
    const mapContainerStyle = React.useMemo(() => {
        if (theme === 'dark') {
            return { width: '100%', height: '100%', filter: 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)' };
        }
        return { width: '100%', height: '100%' };
    }, [theme]);

    // Invert markers back so they look normal in dark mode
    const markerStyle = React.useMemo(() => {
        if (theme === 'dark') {
            return { filter: 'invert(100%) hue-rotate(180deg) brightness(105%) contrast(110%)' };
        }
        return {};
    }, [theme]);



    // Filtering State
    const [routesStructure, setRoutesStructure] = React.useState<any[]>([]);
    const [activeFilters, setActiveFilters] = React.useState<FilterState | null>(null);
    const [filteredStops, setFilteredStops] = React.useState<Stop[] | null>(null); // null means no filter
    const [filteredSegments, setFilteredSegments] = React.useState<any[] | null>(null);
    const [filterEmpty, setFilterEmpty] = React.useState(false);

    const fetchRouteStructure = React.useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/routes/structure`);
            const data = await res.json();
            setRoutesStructure(data);
        } catch (err) {
            console.error('Error fetching route structure:', err);
        }
    }, []);

    const applyFilters = React.useCallback((filters: FilterState, allStops: Stop[], allSegments: any[], structure: any[]) => {
        // Check if any filter is active
        const hasRouteFilter = filters.selectedRoutes.length > 0;
        const hasDirFilter = filters.selectedDirections.length > 0;
        const hasSegFilter = filters.selectedSegments.length > 0;
        const hasStopFilter = filters.selectedStops.length > 0;
        const hasAgencyFilter = filters.selectedAgencies.length > 0;

        if (!hasRouteFilter && !hasDirFilter && !hasSegFilter && !hasStopFilter && !hasAgencyFilter) {
            setFilteredStops(null);
            setFilteredSegments(null);
            setFilterEmpty(false);
            return;
        }

        // 1. Gather Valid IDs from Route/Direction Hierarchy
        let validStopIds = new Set<string>();
        let validSegmentIds = new Set<string>();
        let hierarchyApplied = false;

        if (hasRouteFilter || hasDirFilter || hasAgencyFilter) {
            hierarchyApplied = true;
            structure.forEach(route => {
                // Agency Filter
                if (hasAgencyFilter) {
                    const agencyName = route.agency_name || '(No Agency)';
                    if (!filters.selectedAgencies.includes(agencyName)) return;
                }

                // If route filter is on, skip if not selected
                if (hasRouteFilter && !filters.selectedRoutes.includes(route.route_id)) return;

                route.directions.forEach((dir: any) => {
                    // If dir filter is on, skip if not selected
                    if (hasDirFilter && !filters.selectedDirections.includes(dir.direction_id)) return;

                    // Collect IDs
                    dir.stops.forEach((s: any) => validStopIds.add(String(s.stop_id)));
                    dir.segments.forEach((s: any) => validSegmentIds.add(String(s.segment_id)));
                });
            });
        }

        // 2. Filter Lists
        let finalStops = allStops;
        let finalSegments = allSegments;

        // Apply Hierarchy Filter
        if (hierarchyApplied) {
            finalStops = finalStops.filter(s => validStopIds.has(String(s.stop_id)));
            finalSegments = finalSegments.filter(s => validSegmentIds.has(String(s.segment_id)));
        }

        // Apply Explicit Stop Filter (Intersection)
        if (hasStopFilter) {
            finalStops = finalStops.filter(s => filters.selectedStops.includes(String(s.stop_id)));
        }

        // Apply Explicit Segment Filter (Intersection)
        if (hasSegFilter) {
            finalSegments = finalSegments.filter(s => filters.selectedSegments.includes(String(s.segment_id)));
        }

        setFilteredStops(finalStops);
        setFilteredSegments(finalSegments);
        setFilterEmpty(hasRouteFilter || hasDirFilter || hasSegFilter || hasStopFilter || hasAgencyFilter ? (finalStops.length === 0 && finalSegments.length === 0) : false);
    }, []);

    const fetchData = React.useCallback(async () => {
        try {
            const [stopsRes, segmentsRes] = await Promise.all([
                fetch(`${API_URL}/stops`),
                fetch(`${API_URL}/segments`)
            ]);

            const stopsData = await stopsRes.json();
            const segmentsData = await segmentsRes.json();

            setStops(stopsData);
            setSegments(segmentsData);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    }, []);

    // Fetch initial data & structure
    React.useEffect(() => {
        fetchData();
        fetchRouteStructure();
    }, [fetchData, fetchRouteStructure]);

    // React to data or filter changes - Dedicated Effect for Filtering
    React.useEffect(() => {
        if (activeFilters) {
            applyFilters(activeFilters, stops, segments, routesStructure);
        }
    }, [activeFilters, stops, segments, routesStructure, applyFilters]);

    const handleFilterChange = React.useCallback((filters: FilterState) => {
        setActiveFilters(filters);
        // Effect will handle application
    }, []);

    // Determine what to display
    const displayStops = filteredStops !== null ? filteredStops : stops;
    const displaySegments = filteredSegments !== null ? filteredSegments : segments;

    // Path Editing State
    const [activeRoute, setActiveRoute] = React.useState<Route | null>(null);
    const [detailsRoute, setDetailsRoute] = React.useState<Route | null>(null);
    const [pathStops, setPathStops] = React.useState<string[]>([]);
    const [directionId, setDirectionId] = React.useState<0 | 1>(0);

    // Load path when route or direction changes
    React.useEffect(() => {
        if (!activeRoute) {
            setPathStops([]);
            return;
        }

        const fetchPath = async () => {
            setLoading(true);
            try {
                const res = await fetch(`${API_URL}/routes/${activeRoute.route_id}/path?direction_id=${directionId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.ordered_stop_ids && Array.isArray(data.ordered_stop_ids)) {
                        setPathStops(data.ordered_stop_ids);
                    } else {
                        setPathStops([]);
                    }
                }
            } catch (error) {
                console.error('Error fetching path:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPath();
    }, [activeRoute, directionId]);

    // Stop Creation State
    const [isCreatingStop, setIsCreatingStop] = React.useState(false);
    const [newStopCoords, setNewStopCoords] = React.useState<{ lat: number; lon: number } | null>(null);

    const handleStopDragEnd = async (e: { lngLat: { lng: number; lat: number } }, stop: Stop) => {
        const { lng, lat } = e.lngLat;
        // Optimistic update
        const updatedStop = { ...stop, stop_lat: lat, stop_lon: lng };
        setStops(prev => prev.map(s => s.stop_id === stop.stop_id ? updatedStop : s));

        try {
            await fetch(`${API_URL}/stops/${stop.stop_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stop_lat: lat, stop_lon: lng }) // Send only changed fields
            });
            // Refresh data to get updated segments (geometry)
            fetchData();
        } catch (err) {
            console.error('Failed to update stop location:', err);
            fetchData(); // Revert on error
        }
    };

    const handleCreateStopSave = async (data: { stop_name: string; stop_code: string }) => {
        if (!newStopCoords) return;
        try {
            const res = await fetch(`${API_URL}/stops`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    stop_lat: newStopCoords.lat,
                    stop_lon: newStopCoords.lon,
                    node_type: 'regular' // Default
                })
            });

            if (res.ok) {
                const savedStop = await res.json();
                setStops(prev => [...prev, savedStop]);
                setIsCreatingStop(false);
                setNewStopCoords(null);
            } else {
                const errData = await res.json().catch(() => ({}));
                console.error('Stop creation failed:', res.status, errData);
                alert(`Failed to create stop: ${errData.error || res.statusText || 'Unknown error'}`);
            }
        } catch (err) {
            console.error(err);
            alert(`Error creating stop: ${err instanceof Error ? err.message : 'Network/Code Error'}`);
        }
    };


    // Picking Mode Logic
    const handleMapClick = React.useCallback(async (event: MapLayerMouseEvent) => {
        // const { pickingState } = useEditor(); // Get fresh state from hook?
        // Note: pickingState is already in scope from the component body.
        // But if we use useCallback, we must include it in deps.

        // If picking mode is active
        if (pickingState.isActive && pickingState.type === 'segment') {
            const features = event.features || [];
            const segmentFeature = features.find(f => f.layer.id === 'segments-layer');
            if (segmentFeature && segmentFeature.properties) {
                const seg = segmentFeature.properties as any;
                if (seg.segment_id && pickingState.onPick) {
                    pickingState.onPick(seg.segment_id);
                }
            }
            return; // Stop processing
        }

        // Check for Stops Layer Click FIRST (High Priority)
        const features = event.features || [];
        const stopFeature = features.find(f => f.layer.id === 'stops-layer-circle');
        if (stopFeature && stopFeature.properties) {
            const stop = stopFeature.properties as Stop;
            // Must cast properly or ensure properties are correct
            if (stop.stop_id) {
                handleStopClick(stop);
                return;
            }
        }

        // If we are in path edit mode (activeRoute is set)
        if (activeRoute) {
            const segmentFeature = features.find(f => f.layer.id === 'segments-layer');
            if (segmentFeature && segmentFeature.properties) {
                const seg = segmentFeature.properties as any;
                if (!seg.start_node_id || !seg.end_node_id) return;

                const lastStopId = pathStops[pathStops.length - 1];

                // If path is empty, start with this segment
                if (!lastStopId) {
                    setPathStops([seg.start_node_id, seg.end_node_id]);
                    return;
                }

                // If path has stops, try to connect
                if (seg.start_node_id === lastStopId) {
                    setPathStops(prev => [...prev, seg.end_node_id]);
                } else if (seg.end_node_id === lastStopId) {
                    setPathStops(prev => [...prev, seg.start_node_id]);
                }
            }
            return;
        }

        // Check for segment clicks
        if (mode === 'idle') {
            const segmentFeature = features.find(f => f.layer.id === 'segments-layer');

            if (segmentFeature && segmentFeature.properties) {
                const seg = segmentFeature.properties as any;
                // Ensure we have the ID to identify it
                if (seg.segment_id) {
                    selectElement('segment', seg.segment_id);
                    return;
                }
            }

            // If we selected nothing (and didn't hit a stop above), clear selection
            clearSelection();
        }

        if (mode === 'add_stop') {
            const { lngLat } = event;
            setNewStopCoords({ lat: lngLat.lat, lon: lngLat.lng });
            setIsCreatingStop(true);
            // Do NOT immediately create. Open Modal.
        }
    }, [mode, pickingState, activeRoute, pathStops, selectElement, clearSelection, segmentStartNode]);



    const handleMouseMove = React.useCallback((e: MapLayerMouseEvent) => {
        if (segmentStartNode) {
            setCursorLoc({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        }
    }, [segmentStartNode]);

    const rubberBandGeoJSON = React.useMemo(() => {
        if (!segmentStartNode || !cursorLoc) return null;
        const startStop = stops.find(s => s.stop_id === segmentStartNode);
        if (!startStop) return null;

        return {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [startStop.stop_lon, startStop.stop_lat],
                    [cursorLoc.lon, cursorLoc.lat]
                ]
            },
            properties: {}
        } as const;
    }, [segmentStartNode, cursorLoc, stops]);

    const handleStopClick = async (stop: Stop) => {
        // Path Editing Mode
        if (activeRoute) {
            setPathStops(prev => [...prev, stop.stop_id]);
            return;
        }

        // Add Segment Mode (Revenue or Empty)
        if (mode === 'add_segment' || mode === 'add_empty_segment') {
            if (!segmentStartNode) {
                setSegmentStartNode(stop.stop_id);
            } else {
                if (segmentStartNode === stop.stop_id) return; // Prevent self-loop

                // Create the segment
                setLoading(true); // Re-use loading state
                try {
                    const isRevenue = mode === 'add_segment';
                    const res = await fetch(`${API_URL}/segments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            start_node_id: segmentStartNode,
                            end_node_id: stop.stop_id,
                            type: isRevenue ? 'revenue' : 'empty'
                        })
                    });

                    if (res.ok) {
                        const newSegment = await res.json();
                        setSegments(prev => [...prev, newSegment]);
                        setSegmentStartNode(null); // Reset to allow next segment
                        setCursorLoc(null);
                        // Optional: Toast "Segment Created"
                    } else {
                        alert("Failed to create segment");
                    }
                } catch (err) {
                    console.error("Error creating segment:", err);
                    alert("Error creating segment");
                } finally {
                    setLoading(false);
                }
            }
            return;
        }

        // View Mode -> Open Details
        if (mode === 'idle') {
            selectElement('stop', stop.stop_id);
        }
    };

    const savePath = async () => {
        if (!activeRoute || pathStops.length < 2) {
            alert("Select at least 2 stops.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/routes/${activeRoute.route_id}/path`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    direction_id: directionId,
                    ordered_stop_ids: pathStops
                })
            });
            const data = await res.json();
            if (res.ok) {
                alert(`Path saved! ${data.message}`);
                setPathStops([]);
                fetchData();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Network error saving path");
        } finally {
            setLoading(false);
        }
    };

    const cancelPathEdit = () => {
        setActiveRoute(null);
        setPathStops([]);
        setActivePanel('routes'); // Re-open panel
    };

    const handleStopUpdate = (updatedStop: Stop) => {
        setStops(prev => prev.map(s => s.stop_id === updatedStop.stop_id ? updatedStop : s));
    };

    const handleStopDelete = async (stopId: string) => {
        const res = await fetch(`${API_URL}/stops/${stopId}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to delete stop');
        }
        setStops(prev => prev.filter(s => s.stop_id !== stopId));
        fetchData();
        return;
    };

    const handleSegmentDelete = async (segmentId: string) => {
        const res = await fetch(`${API_URL}/segments/${segmentId}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to delete segment');
        }
        setSegments(prev => prev.filter(s => s.segment_id !== segmentId));
        return;
    };

    const handleSegmentUpdate = (updatedSegment: any) => {
        setSegments(prev => prev.map(s => {
            if (s.segment_id === updatedSegment.segment_id) {
                return { ...s, ...updatedSegment };
            }
            return s;
        }));
    };

    const segmentsGeoJSON = React.useMemo(() => {
        return {
            type: 'FeatureCollection',
            features: displaySegments.flatMap(seg => {
                let coordinates: number[][] = [
                    [seg.start_lon!, seg.start_lat!],
                    [seg.end_lon!, seg.end_lat!]
                ];

                if (seg.geometry) {
                    try {
                        const parsed = JSON.parse(seg.geometry);
                        if (parsed.type === 'LineString' && Array.isArray(parsed.coordinates)) {
                            coordinates = parsed.coordinates;
                        }
                    } catch (e) {
                        console.warn('Failed to parse segment geometry', e);
                    }
                }

                return {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates
                    },
                    properties: { ...seg }
                };
            })
        } as const;
    }, [displaySegments]);

    const pathDistance = React.useMemo(() => {
        if (pathStops.length < 2) return 0;
        let dist = 0;
        for (let i = 0; i < pathStops.length - 1; i++) {
            const fromId = pathStops[i];
            const toId = pathStops[i + 1];
            const seg = segments.find(s => s.start_node_id === fromId && s.end_node_id === toId);
            if (seg) {
                dist += (seg.distance || 0);
            }
        }
        return dist;
    }, [pathStops, segments]);

    const draftPathGeoJSON = React.useMemo(() => {
        if (!activeRoute || pathStops.length < 2) return null;

        const allCoordinates: number[][] = [];

        for (let i = 0; i < pathStops.length - 1; i++) {
            const fromId = pathStops[i];
            const toId = pathStops[i + 1];

            const startStop = stops.find(s => s.stop_id === fromId);

            const seg = segments.find(s => s.start_node_id === fromId && s.end_node_id === toId);

            if (seg && seg.geometry) {
                try {
                    const parsed = JSON.parse(seg.geometry);
                    if (parsed.type === 'LineString' && Array.isArray(parsed.coordinates)) {
                        allCoordinates.push(...parsed.coordinates);
                    } else {
                        const endStop = stops.find(s => s.stop_id === toId);
                        if (startStop) allCoordinates.push([startStop.stop_lon, startStop.stop_lat]);
                        if (endStop) allCoordinates.push([endStop.stop_lon, endStop.stop_lat]);
                    }
                } catch (e) {
                    const endStop = stops.find(s => s.stop_id === toId);
                    if (startStop) allCoordinates.push([startStop.stop_lon, startStop.stop_lat]);
                    if (endStop) allCoordinates.push([endStop.stop_lon, endStop.stop_lat]);
                }
            } else {
                const endStop = stops.find(s => s.stop_id === toId);
                if (startStop) allCoordinates.push([startStop.stop_lon, startStop.stop_lat]);
                if (endStop) allCoordinates.push([endStop.stop_lon, endStop.stop_lat]);
            }
        }

        return {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: allCoordinates
            },
            properties: {}
        } as const;
    }, [activeRoute, pathStops, stops, segments]);

    const handleZoomIn = () => {
        setViewState(prev => ({ ...prev, zoom: Math.min(prev.zoom + 1, 22) }));
    };

    const handleZoomOut = () => {
        setViewState(prev => ({ ...prev, zoom: Math.max(prev.zoom - 1, 0) }));
    };

    const handleLocate = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                setViewState(prev => ({
                    ...prev,
                    longitude: pos.coords.longitude,
                    latitude: pos.coords.latitude,
                    zoom: 14
                }));
            }, err => console.error("Geolocation error:", err));
        }
    };



    // Map Bounds State
    const [mapBounds, setMapBounds] = React.useState<{ _ne: { lng: number, lat: number }, _sw: { lng: number, lat: number } } | null>(null);

    const handleMapMove = React.useCallback((evt: any) => {
        setViewState(evt.viewState);
        if (evt.target) {
            setMapBounds(evt.target.getBounds());
        }
    }, []);


    return (
        <div className="w-full h-full relative font-sans"
            onContextMenu={(e) => {
                e.preventDefault();
                setMode('idle');
                setSegmentStartNode(null);
                setCursorLoc(null);
            }}
        >
            {/* Map Controls */}
            <MapControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onLocate={handleLocate}
            />

            <Map
                {...viewState}
                onMove={handleMapMove}
                onMouseMove={handleMouseMove}
                onLoad={(evt) => setMapBounds(evt.target.getBounds())}
                style={mapContainerStyle}
                mapStyle={{
                    version: 8,
                    sources: {
                        'osm': {
                            type: 'raster',
                            tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
                            tileSize: 256,
                            attribution: '&copy; OpenStreetMap Contributors',
                            maxzoom: 19
                        }
                    },
                    layers: [
                        {
                            id: 'osm',
                            type: 'raster',
                            source: 'osm',
                            minzoom: 0,
                            maxzoom: 22
                        }
                    ]
                }}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                onClick={handleMapClick}
                interactiveLayerIds={['segments-layer', 'stops-layer-circle']}
                cursor={mode === 'add_stop' ? 'crosshair' : (pickingState.isActive || isHovering) ? 'pointer' : 'grab'}
            >
                {/* Default NavigationControl Removed */}

                {/* Draft Path Layer */}
                {draftPathGeoJSON && (
                    <Source id="draft-path-source" type="geojson" data={draftPathGeoJSON}>
                        <Layer
                            id="draft-path-layer"
                            type="line"
                            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                            paint={{
                                'line-color': '#d946ef',
                                'line-width': 4,
                                'line-dasharray': [2, 1],
                                'line-opacity': 0.8
                            }}
                        />
                    </Source>
                )}

                {/* Segments Layer */}
                {/* Standard Segments Layer (Solid) */}
                {/* @ts-expect-error - maplibre geojson type conflict */}
                <Source id="segments-source" type="geojson" data={segmentsGeoJSON}>
                    <Layer
                        id="segments-layer-revenue"
                        type="line"
                        filter={['!=', ['get', 'type'], 'empty']}
                        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                        paint={{
                            'line-color': ['case', ['==', ['get', 'segment_id'], viewingSegment?.segment_id || ''], '#ffcc00', '#4a90e2'],
                            'line-width': 4,
                            'line-opacity': 0.8
                        }}
                    />
                    <Layer
                        id="segments-layer-empty"
                        type="line"
                        filter={['==', ['get', 'type'], 'empty']}
                        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                        paint={{
                            'line-color': ['case', ['==', ['get', 'segment_id'], viewingSegment?.segment_id || ''], '#ffcc00', '#64748b'], // Slate 500 for empty
                            'line-width': 3,
                            'line-dasharray': [2, 2],
                            'line-opacity': 0.8
                        }}
                    />
                    {/* Invisible Hit Area for Empty Segments */}
                    <Layer
                        id="segments-layer-hit"
                        type="line"
                        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                        paint={{
                            'line-color': 'transparent',
                            'line-width': 12,
                            'line-opacity': 0
                        }}
                    />
                </Source>

                {/* Rubber Band Line for Segment Creation */}
                {rubberBandGeoJSON && (
                    <Source id="rubber-band-source" type="geojson" data={rubberBandGeoJSON as any}>
                        <Layer
                            id="rubber-band-layer"
                            type="line"
                            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                            paint={{
                                'line-color': mode === 'add_segment' ? '#4a90e2' : '#64748b',
                                'line-width': 3,
                                'line-dasharray': [2, 2],
                                'line-opacity': 0.7
                            }}
                        />
                    </Source>
                )}

                {/* Stops Markers */}
                {/* Stops Layer (WebGL) */}
                {/* Stops Layer (WebGL) */}
                <Source id="stops-source" type="geojson" data={{
                    type: 'FeatureCollection',
                    features: displayStops.map(stop => ({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [stop.stop_lon, stop.stop_lat] },
                        properties: { ...stop }
                    }))
                }}>
                    <Layer
                        id="stops-layer-circle"
                        type="circle"
                        paint={{
                            'circle-radius': [
                                'case',
                                ['==', ['get', 'stop_id'], viewingStop?.stop_id || ''],
                                10,
                                // Larger radius during segment creation for easier clicking
                                (mode === 'add_segment' || mode === 'add_empty_segment') ? 9 : 6
                            ],
                            'circle-color': [
                                'case',
                                ['==', ['get', 'node_type'], 'parking'], '#000000',
                                ['==', ['get', 'stop_id'], viewingStop?.stop_id || ''], '#2563eb', // Blue for selected
                                ['==', ['get', 'stop_id'], segmentStartNode || ''], '#10b981', // Emerald 500 for segment start
                                // Bright Cyan/Turquoise for available stops during segment creation
                                (mode === 'add_segment' || mode === 'add_empty_segment') ? '#06b6d4' : '#dc2626'
                            ],
                            'circle-stroke-width': [
                                'case',
                                ['==', ['get', 'stop_id'], segmentStartNode || ''], 4,
                                (mode === 'add_segment' || mode === 'add_empty_segment') ? 3 : 2
                            ],
                            'circle-stroke-color': '#ffffff'
                        }}
                    />
                    {/* Optional Symbol Layer for Icons if needed, for now Circle is enough for performance */}
                </Source>

                {/* Draggable Marker ONLY for selected Stop */}
                {viewingStop && (
                    <Marker
                        key={viewingStop.stop_id}
                        longitude={viewingStop.stop_lon}
                        latitude={viewingStop.stop_lat}
                        anchor="bottom"
                        draggable={true}
                        onDragEnd={(e) => handleStopDragEnd(e, viewingStop)}
                        style={{ zIndex: 100, ...markerStyle }}
                    >
                        <div className="text-blue-600 scale-125 transition-transform">
                            {viewingStop.node_type === 'parking' ? (
                                <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md border-2 border-white">P</div>
                            ) : (
                                <MapPin size={32} fill="currentColor" />
                            )}
                        </div>
                    </Marker>
                )}
            </Map>

            {/* Side Panels */}
            {viewingStop && (
                <StopDetails
                    stop={viewingStop}
                    onClose={() => clearSelection()}
                    onUpdate={handleStopUpdate}
                    onDelete={handleStopDelete}
                />
            )}

            {viewingSegment && (
                <SegmentDetails
                    segment={viewingSegment}
                    stops={stops}
                    onClose={() => clearSelection()}
                    onDelete={handleSegmentDelete}
                    onUpdate={handleSegmentUpdate}
                />
            )}

            {activePanel === 'routes_catalog' && (
                <RouteCatalog
                    onOpenMap={() => setActivePanel('routes')}
                    onSelectRoute={(r) => {
                        setDetailsRoute(r);
                        setActivePanel('none');
                    }}
                    onDataUpdate={fetchRouteStructure}
                />
            )}

            {activePanel === 'settings' && (
                <SettingsPanel
                    onClose={() => setActivePanel('none')}
                    currentViewState={viewState}
                />
            )}

            {activePanel === 'calendar' && (
                <CalendarManager
                    onClose={() => setActivePanel('none')}
                />
            )}



            {detailsRoute && (
                <RouteDetailsPanel
                    route={detailsRoute}
                    onClose={() => setDetailsRoute(null)}
                    onBack={() => {
                        setDetailsRoute(null);
                        setActivePanel('routes_catalog');
                    }}
                    onOpenTrips={() => setActivePanel('trips')}
                    onOpenCalendar={() => setActivePanel('calendar')}
                    mapBounds={mapBounds}
                />
            )}

            {activePanel === 'trips' && detailsRoute && (
                <TripsManager
                    route={detailsRoute}
                    onClose={() => setActivePanel('none')}
                />
            )}

            {activePanel === 'external_load' && (
                <ExternalLoadPanel
                    onClose={() => setActivePanel('none')}
                    onImportSuccess={async () => {
                        await Promise.all([fetchData(), fetchRouteStructure()]);
                    }}
                />
            )}

            {/* Filter Panel - Integrated Layout */}
            <div className="absolute top-4 left-16 z-20 pointer-events-none flex flex-col items-start gap-4 h-[calc(100vh-2rem)]">
                <div className="pointer-events-auto">
                    <FilterPanel
                        routesStructure={routesStructure}
                        onFilterChange={handleFilterChange}
                        className="max-h-[85vh] shadow-xl border-gray-200"
                    />
                </div>
            </div>

            {activePanel === 'empty_segments' && (
                <EmptySegmentsManager
                    onClose={() => {
                        setActivePanel('none');
                        setMode('idle');
                    }}
                    segments={segments.filter(s => s.type === 'empty')}
                    stops={stops}
                    routesStructure={routesStructure}
                    onRefresh={fetchData}
                />
            )}

            {activePanel === 'simulation' && (
                <SimulationPanel onClose={() => setActivePanel('none')} />
            )}

            {/* Empty State Warning */}
            {filterEmpty && (
                <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 shadow-lg">
                    <strong className="font-bold">No results found!</strong>
                    <span className="block sm:inline"> Try adjusting your filters.</span>
                </div>
            )}

            {/* Path Editor UI Overlay */}
            {activeRoute && (
                <div className="absolute top-4 right-4 w-64 bg-white dark:bg-gray-800 dark:text-gray-100 p-4 rounded shadow-lg z-20">
                    <h3 className="font-bold border-b pb-2 dark:border-gray-700">Editing: {activeRoute.route_short_name}</h3>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                        <span>Direction:</span>
                        <div className="flex bg-gray-100 dark:bg-gray-700 rounded">
                            <button
                                onClick={() => setDirectionId(0)}
                                className={clsx("px-2 py-1 rounded", directionId === 0 ? "bg-blue-600 text-white" : "hover:bg-gray-200 dark:hover:bg-gray-600")}
                            >0</button>
                            <button
                                onClick={() => setDirectionId(1)}
                                className={clsx("px-2 py-1 rounded", directionId === 1 ? "bg-blue-600 text-white" : "hover:bg-gray-200 dark:hover:bg-gray-600")}
                            >1</button>
                        </div>
                    </div>

                    <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                        <p>Stops selected: {pathStops.length}</p>
                        <p>Total Distance: {(pathDistance / 1000).toFixed(2)} km</p>
                        <p className="text-xs italic mt-1">Click nodes on map in order to define path.</p>
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                        <button
                            onClick={savePath}
                            disabled={loading || pathStops.length < 2}
                            className={clsx("bg-green-600 text-white py-1 rounded hover:bg-green-700", (loading || pathStops.length < 2) && "opacity-50 cursor-not-allowed")}
                        >
                            {loading ? 'Saving...' : 'Save Path'}
                        </button>
                        <button
                            onClick={() => setPathStops([])}
                            className="bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                            Clear Selection
                        </button>
                        <button
                            onClick={cancelPathEdit}
                            className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 py-1 rounded hover:bg-red-200"
                        >
                            Cancel / Back
                        </button>
                    </div>
                </div>
            )}

            {/* Add Instruction Toast */}
            {mode === 'add_stop' && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg z-50 flex items-center gap-2 animate-bounce">
                    <MapPin size={16} />
                    <span className="font-bold text-sm">Click map to add stops</span>
                    <span className="text-xs opacity-80">(Right-click to exit)</span>
                </div>
            )}

            {mode === 'add_segment' && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg z-50 flex items-center gap-2 animate-bounce">
                    <MapPin size={16} />
                    <span className="font-bold text-sm">
                        {segmentStartNode ? "Select destination stop" : "Select starting stop"}
                    </span>
                    <span className="text-xs opacity-80">(Right-click to exit)</span>
                </div>
            )}

            <StopCreationModal
                isOpen={isCreatingStop}
                lat={newStopCoords?.lat || 0}
                lon={newStopCoords?.lon || 0}
                onClose={() => {
                    setIsCreatingStop(false);
                    setNewStopCoords(null);
                }}
                onSave={handleCreateStopSave}
            />
        </div>
    );
};

export default MapEditor;
