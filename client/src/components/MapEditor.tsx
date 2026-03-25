import * as React from 'react';
import Map, { Marker, type MapLayerMouseEvent, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Stop, Route, RoutingProfile } from '../types';
import { MapPin, GitBranch, ChevronRight, Activity, CheckCircle } from 'lucide-react';
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
import MapContextMenu from './UI/MapContextMenu';
import { useSettings } from '../context/SettingsContext';
import CalendarManager from './CalendarManager';
import TripsManager from './TripsManager';
import EmptySegmentsManager from './EmptySegmentsManager';
import ExternalLoadPanel from './ExternalLoadPanel';
import { SimulationPanel } from './SimulationPanel';
import StopsCatalog from './StopsCatalog';
import SegmentsCatalog from './SegmentsCatalog';
import { AdminPanel } from './AdminPanel';
import { useAuth } from '../context/AuthContext';

import { API_URL } from '../config';
import { defaultRoutingProfile, routingProfileMetadata, routingProfiles } from '../constants/routingProfiles';

interface ConnectionModalProps {
    isOpen: boolean;
    onSelect: (profile: RoutingProfile) => void;
    onCancel: () => void;
    suggestedProfile?: RoutingProfile;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({ isOpen, onSelect, onCancel, suggestedProfile }) => {
    if (!isOpen) return null;

    const options = routingProfiles.map(profile => ({
        id: profile,
        name: routingProfileMetadata[profile].label,
        desc: routingProfileMetadata[profile].description,
        color: routingProfileMetadata[profile].color
    }));

    return (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-[0_0_50px_rgba(0,0,0,0.3)] w-full max-w-md border utilitarian-border overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-8 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50">
                    <h3 className="text-base font-display font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1 flex items-center gap-3">
                         <div className="p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20">
                            <GitBranch size={20} strokeWidth={2.5} />
                         </div>
                         Definir Perfil de Red
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Suministro de Capa Operativa</p>
                </div>

                <div className="p-8 space-y-4">
                    <div className="space-y-3">
                        {options.map(opt => {
                            const isSuggested = opt.id === suggestedProfile;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => onSelect(opt.id)}
                                    className={clsx(
                                        "w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-all group relative overflow-hidden active:scale-[0.98]",
                                        isSuggested
                                            ? "border-primary/40 bg-primary/5 shadow-md shadow-primary/10"
                                            : "utilitarian-border hover:border-primary/50 hover:bg-primary/5"
                                    )}
                                >
                                    <div className="absolute top-0 left-0 w-1.5 h-full transition-all group-hover:w-2"
                                         style={{ backgroundColor: opt.color }} />

                                    <div className="flex-1 pl-1">
                                        <div className="flex items-center gap-2">
                                            <div className="font-display font-black text-[13px] text-slate-900 dark:text-white uppercase tracking-tight">{opt.name}</div>
                                            {isSuggested && (
                                                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: opt.color }}>
                                                    Ruta
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{opt.desc}</div>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-300 group-hover:text-primary transition-transform group-hover:translate-x-1" />
                                </button>
                            );
                        })}
                    </div>

                    <div className="pt-4 flex justify-center">
                        <button
                            onClick={onCancel}
                            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
                        >
                            Cancelar Suministro
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const MapEditor: React.FC = () => {
    const { mode, setMode, selectedElementId, selectedElementType, selectElement, clearSelection, activePanel, setActivePanel, pickingState } = useEditor();
    const { defaultLocation } = useSettings();
    const { activeProject } = useAuth();

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
    const [pendingSegmentEndNode, setPendingSegmentEndNode] = React.useState<string | null>(null);
    const [isConnectionModalOpen, setIsConnectionModalOpen] = React.useState(false);
    const [cursorLoc, setCursorLoc] = React.useState<{ lat: number; lon: number } | null>(null);
    const [isHovering, setIsHovering] = React.useState(false); // New hover state

    // const [selectedStops, setSelectedStops] = React.useState<string[]>([]); // For future connecting nodes feature
    const [loading, setLoading] = React.useState(false);

    const [viewState, setViewState] = React.useState({
        longitude: activeProject?.map_center_lon || defaultLocation.longitude,
        latitude: activeProject?.map_center_lat || defaultLocation.latitude,
        zoom: defaultLocation.zoom
    });

    React.useEffect(() => {
        if (activeProject) {
            setViewState(prev => ({
                ...prev,
                longitude: activeProject.map_center_lon,
                latitude: activeProject.map_center_lat
            }));
        }
    }, [activeProject]);

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
        if (!activeProject) {
            setRoutesStructure([]);
            return;
        }

        try {
            const res = await fetch(`${API_URL}/routes/structure`);
            const data = await res.json();
            if (!res.ok) {
                console.error('Error fetching route structure:', data);
                setRoutesStructure([]);
                return;
            }
            if (!Array.isArray(data)) {
                console.error('Invalid /routes/structure payload. Expected array:', data);
                setRoutesStructure([]);
                return;
            }
            setRoutesStructure(data);
        } catch (err) {
            console.error('Error fetching route structure:', err);
            setRoutesStructure([]);
        }
    }, [activeProject]);

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
        if (!activeProject) {
            setStops([]);
            setSegments([]);
            return;
        }

        try {
            const [stopsRes, segmentsRes] = await Promise.all([
                fetch(`${API_URL}/stops`),
                fetch(`${API_URL}/segments`)
            ]);

            const [stopsData, segmentsData] = await Promise.all([
                stopsRes.json(),
                segmentsRes.json()
            ]);

            if (!stopsRes.ok) {
                console.error('Error response from /stops:', stopsData);
            }
            if (!segmentsRes.ok) {
                console.error('Error response from /segments:', segmentsData);
            }

            setStops(Array.isArray(stopsData) ? stopsData : []);
            setSegments(Array.isArray(segmentsData) ? segmentsData : []);
        } catch (error) {
            console.error('Error fetching data:', error);
            setStops([]);
            setSegments([]);
        }
    }, [activeProject]);

    // Fetch initial data & structure when active project is ready
    React.useEffect(() => {
        fetchData();
        fetchRouteStructure();
    }, [fetchData, fetchRouteStructure, activeProject]);

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
    const displayStops = React.useMemo(() => {
        const rawStops = filteredStops !== null ? filteredStops : stops;
        return Array.isArray(rawStops) ? rawStops : [];
    }, [filteredStops, stops]);

    const displaySegments = React.useMemo(() => {
        const rawSegments = filteredSegments !== null ? filteredSegments : segments;
        return Array.isArray(rawSegments) ? rawSegments : [];
    }, [filteredSegments, segments]);

    // Path Editing State
    const [activeRoute, setActiveRoute] = React.useState<Route | null>(null);
    const [detailsRoute, setDetailsRoute] = React.useState<Route | null>(null);
    const [pathStops, setPathStops] = React.useState<string[]>([]);
    const [directionId, setDirectionId] = React.useState<0 | 1>(0);
    const [pathRoutingProfile, setPathRoutingProfile] = React.useState<RoutingProfile>(defaultRoutingProfile);

    React.useEffect(() => {
        setPathRoutingProfile((activeRoute?.routing_profile as RoutingProfile | undefined) ?? defaultRoutingProfile);
    }, [activeRoute]);

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
    const [pendingNodeType, setPendingNodeType] = React.useState<Stop['node_type']>('regular');

    // Context Menu State
    const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; lat: number; lon: number } | null>(null);

    // Waypoint editing state (virtual nodes for selected segment)
    const [activeWaypoints, setActiveWaypoints] = React.useState<{ lat: number; lng: number }[]>([]);
    const [isRerouting, setIsRerouting] = React.useState(false);

    // Sync waypoints with selected segment
    React.useEffect(() => {
        if (viewingSegment) {
            const raw = viewingSegment.waypoints;
            let wps: { lat: number; lng: number }[] = [];
            if (raw) {
                if (typeof raw === 'string') {
                    try { wps = JSON.parse(raw); } catch {}
                } else if (Array.isArray(raw)) {
                    wps = raw;
                }
            }
            setActiveWaypoints(wps);
        } else {
            setActiveWaypoints([]);
        }
    }, [viewingSegment?.segment_id]);

    const rerouteSegment = React.useCallback(async (segmentId: string, waypoints: { lat: number; lng: number }[]) => {
        setIsRerouting(true);
        try {
            const res = await fetch(`${API_URL}/segments/${segmentId}/reroute`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ waypoints })
            });
            if (res.ok) {
                const data = await res.json();
                setSegments(prev => prev.map(s => s.segment_id === segmentId ? {
                    ...s,
                    geometry: data.geometry,
                    distance: data.distance,
                    travel_time: data.travel_time,
                    waypoints: data.waypoints
                } : s));
            }
        } catch (e) {
            console.error('Reroute failed:', e);
        } finally {
            setIsRerouting(false);
        }
    }, []);

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

    const handleCreateStopSave = async (data: { stop_name: string; stop_code: string; node_type: Stop['node_type'] }) => {
        if (!newStopCoords) return;
        try {
            const res = await fetch(`${API_URL}/stops`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stop_name: data.stop_name,
                    stop_code: data.stop_code,
                    stop_lat: newStopCoords.lat,
                    stop_lon: newStopCoords.lon,
                    node_type: data.node_type || 'regular'
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


    // GeoJSON for the selected segment (interactive hit area for waypoint creation)
    const selectedSegmentGeoJSON = React.useMemo(() => {
        if (!viewingSegment) return null;
        let coordinates: number[][] = [];
        if (viewingSegment.geometry) {
            try {
                const parsed = JSON.parse(viewingSegment.geometry);
                if (parsed.type === 'LineString' && Array.isArray(parsed.coordinates)) {
                    coordinates = parsed.coordinates;
                }
            } catch {}
        }
        if (coordinates.length === 0) {
            const seg = viewingSegment as any;
            if (seg.start_lon != null && seg.start_lat != null && seg.end_lon != null && seg.end_lat != null) {
                coordinates = [[seg.start_lon, seg.start_lat], [seg.end_lon, seg.end_lat]];
            }
        }
        if (coordinates.length < 2) return null;
        return {
            type: 'Feature' as const,
            geometry: { type: 'LineString' as const, coordinates },
            properties: { segment_id: viewingSegment.segment_id }
        };
    }, [viewingSegment?.segment_id, viewingSegment?.geometry]);

    const insertWaypointAtClick = React.useCallback((clickLat: number, clickLng: number) => {
        if (!viewingSegment || !selectedSegmentGeoJSON) return;
        const geomCoords = selectedSegmentGeoJSON.geometry.coordinates;

        let closestGeomIdx = 0;
        let minDist = Infinity;
        geomCoords.forEach(([lon, lat], i) => {
            const d = (lon - clickLng) ** 2 + (lat - clickLat) ** 2;
            if (d < minDist) { minDist = d; closestGeomIdx = i; }
        });

        const waypointGeomIndices = activeWaypoints.map(wp => {
            let min = Infinity;
            let idx = 0;
            geomCoords.forEach(([lon, lat], i) => {
                const d = (lon - wp.lng) ** 2 + (lat - wp.lat) ** 2;
                if (d < min) { min = d; idx = i; }
            });
            return idx;
        });

        const insertIdx = waypointGeomIndices.filter(idx => idx <= closestGeomIdx).length;
        const newWaypoints = [...activeWaypoints];
        newWaypoints.splice(insertIdx, 0, { lat: clickLat, lng: clickLng });
        setActiveWaypoints(newWaypoints);
        rerouteSegment(viewingSegment.segment_id, newWaypoints);
    }, [viewingSegment, selectedSegmentGeoJSON, activeWaypoints, rerouteSegment]);

    // Picking Mode Logic
    const handleMapClick = React.useCallback(async (event: MapLayerMouseEvent) => {
        // const { pickingState } = useEditor(); // Get fresh state from hook?
        // Note: pickingState is already in scope from the component body.
        // But if we use useCallback, we must include it in deps.

        const SEGMENT_LAYER_IDS = ['segments-layer-revenue', 'segments-layer-empty', 'segments-layer-hit'];

        // If picking mode is active
        if (pickingState.isActive && pickingState.type === 'segment') {
            const features = event.features || [];
            const segmentFeature = features.find(f => SEGMENT_LAYER_IDS.includes(f.layer.id));
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
            const segmentFeature = features.find(f => SEGMENT_LAYER_IDS.includes(f.layer.id));
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
            // If a segment is selected and user clicks on it → insert waypoint
            if (viewingSegment) {
                const selectedHit = features.find(f => f.layer.id === 'selected-segment-hit');
                if (selectedHit) {
                    insertWaypointAtClick(event.lngLat.lat, event.lngLat.lng);
                    return;
                }
            }

            const segmentFeature = features.find(f => SEGMENT_LAYER_IDS.includes(f.layer.id));

            if (segmentFeature && segmentFeature.properties) {
                const seg = segmentFeature.properties as any;
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
            setPendingNodeType('regular');
            setNewStopCoords({ lat: lngLat.lat, lon: lngLat.lng });
            setIsCreatingStop(true);
        }
    }, [mode, pickingState, activeRoute, pathStops, selectElement, clearSelection, segmentStartNode, viewingSegment, insertWaypointAtClick]);



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
                // First click: Set the start node and wait for the second click
                setSegmentStartNode(stop.stop_id);
                return;
            } else {
                // Second click: We have a start node, now set the end node and prompt for profile
                setPendingSegmentEndNode(stop.stop_id);
                setIsConnectionModalOpen(true);
                return;
            }
        }

        // View Mode -> Open Details
        if (mode === 'idle') {
            selectElement('stop', stop.stop_id);
        }
    };

    const handleConnectionSelect = async (profile: RoutingProfile) => {
        if (!segmentStartNode || !pendingSegmentEndNode) return;

        setLoading(true);
        try {
            const isRevenue = mode === 'add_segment';
            const res = await fetch(`${API_URL}/segments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_node_id: segmentStartNode,
                    end_node_id: pendingSegmentEndNode,
                    type: isRevenue ? 'revenue' : 'empty',
                    routing_profile: profile
                })
            });

            if (res.ok) {
                const newSegment = await res.json();
                setSegments(prev => [...prev, newSegment]);
                setSegmentStartNode(null);
                setPendingSegmentEndNode(null);
                setCursorLoc(null);
                setIsConnectionModalOpen(false);
            } else {
                const errorData = await res.json().catch(() => null);
                alert(errorData?.error || "Failed to create segment");
            }
        } catch (err) {
            console.error("Error creating segment:", err);
            alert("Error creating segment");
        } finally {
            setLoading(false);
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
                    ordered_stop_ids: pathStops,
                    routing_profile: pathRoutingProfile
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

                const geoRoutingProfile = seg.routing_profile || defaultRoutingProfile;
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates
                    },
                    properties: { ...seg, routing_profile: geoRoutingProfile }
                };
            })
        } as const;
    }, [displaySegments]);

    const stopsGeoJSON = React.useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: displayStops.map(stop => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [Number(stop.stop_lon), Number(stop.stop_lat)] },
            properties: { ...stop }
        }))
    }), [displayStops]);

    const segmentColorExpression = React.useMemo(() => {
        const expr: any[] = ['case'];
        if (viewingSegment?.segment_id) {
            expr.push(['==', ['get', 'segment_id'], viewingSegment.segment_id], '#ffcc00');
        }

        routingProfiles.forEach(profile => {
            expr.push(['==', ['get', 'routing_profile'], profile], routingProfileMetadata[profile].color);
        });

        expr.push('#4a90e2');
        return expr;
    }, [viewingSegment?.segment_id]);

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


    const handleMapMove = React.useCallback((evt: any) => {
        setViewState(evt.viewState);
    }, []);

    const handleSearch = (coords: { lat: number; lon: number }) => {
        setViewState(prev => ({
            ...prev,
            latitude: coords.lat,
            longitude: coords.lon,
            zoom: 14,
            transitionDuration: 1000
        }));
    };

    const handleMapContextMenu = React.useCallback((e: any) => {
        e.preventDefault();
        // If in segment mode, cancel it
        if (mode === 'add_segment' || mode === 'add_empty_segment') {
            setMode('idle');
            setSegmentStartNode(null);
            setCursorLoc(null);
            return;
        }
        const { lngLat, point } = e;
        if (!lngLat) return;
        setContextMenu({
            x: point.x,
            y: point.y,
            lat: lngLat.lat,
            lon: lngLat.lng
        });
    }, [mode]);

    const handleContextMenuCreateNode = React.useCallback((type: Stop['node_type']) => {
        if (!contextMenu) return;
        setPendingNodeType(type);
        setNewStopCoords({ lat: contextMenu.lat, lon: contextMenu.lon });
        setIsCreatingStop(true);
        setContextMenu(null);
    }, [contextMenu]);

    const handleContextMenuStartSegment = React.useCallback(() => {
        setMode('add_segment');
        setContextMenu(null);
    }, []);

    return (
        <div className="w-full h-full relative font-sans"
            onContextMenu={(e) => e.preventDefault()}
        >
            <ConnectionModal
                isOpen={isConnectionModalOpen}
                onSelect={handleConnectionSelect}
                onCancel={() => {
                    setIsConnectionModalOpen(false);
                    setPendingSegmentEndNode(null);
                }}
                suggestedProfile={activeRoute?.routing_profile as RoutingProfile | undefined}
            />
            {/* Map Controls */}
            <MapControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onLocate={handleLocate}
                onSearch={handleSearch}
                projectLocation={activeProject ? {
                    lat: activeProject.map_center_lat,
                    lon: activeProject.map_center_lon,
                    name: activeProject.name
                } : null}
            />

            <Map
                {...viewState}
                onMove={handleMapMove}
                onMouseMove={handleMouseMove}
                onLoad={() => {}}
                style={mapContainerStyle}
                mapStyle={{
                    version: 8,
                    sources: {
                        'osm': {
                            type: 'raster',
                            tiles: [
                            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                        ],
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
                onContextMenu={handleMapContextMenu}
                interactiveLayerIds={['segments-layer-revenue', 'segments-layer-empty', 'segments-layer-hit', 'selected-segment-hit', 'stops-layer-circle']}
                cursor={mode === 'add_stop' ? 'crosshair' : (mode === 'add_segment' || mode === 'add_empty_segment') ? 'crosshair' : (pickingState.isActive || isHovering) ? 'pointer' : 'grab'}
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
                            'line-color': segmentColorExpression as any,
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

                {/* Selected Segment Highlight + Interactive Hit Area for Waypoint Creation */}
                {selectedSegmentGeoJSON && (
                    <Source id="selected-segment-source" type="geojson" data={selectedSegmentGeoJSON as any}>
                        <Layer
                            id="selected-segment-highlight"
                            type="line"
                            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                            paint={{ 'line-color': '#f59e0b', 'line-width': 8, 'line-opacity': 0.35 }}
                        />
                        <Layer
                            id="selected-segment-hit"
                            type="line"
                            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                            paint={{ 'line-color': 'transparent', 'line-width': 24, 'line-opacity': 0 }}
                        />
                    </Source>
                )}

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
                <Source id="stops-source" type="geojson" data={stopsGeoJSON}>
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

                {/* Waypoint Markers for Selected Segment */}
                {viewingSegment && activeWaypoints.map((wp, idx) => (
                    <Marker
                        key={`wp-${viewingSegment.segment_id}-${idx}`}
                        longitude={wp.lng}
                        latitude={wp.lat}
                        anchor="center"
                        draggable={true}
                        onDragEnd={(e) => {
                            const newWaypoints = [...activeWaypoints];
                            newWaypoints[idx] = { lat: e.lngLat.lat, lng: e.lngLat.lng };
                            setActiveWaypoints(newWaypoints);
                            rerouteSegment(viewingSegment.segment_id, newWaypoints);
                        }}
                        style={{ zIndex: 90, ...markerStyle }}
                    >
                        <div
                            title={`Nodo virtual ${idx + 1} · Clic derecho para eliminar`}
                            className="w-4 h-4 bg-amber-400 border-2 border-white rounded-full shadow-lg cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newWaypoints = activeWaypoints.filter((_, i) => i !== idx);
                                setActiveWaypoints(newWaypoints);
                                rerouteSegment(viewingSegment.segment_id, newWaypoints);
                            }}
                        />
                    </Marker>
                ))}
            </Map>

            {/* Context Menu */}
            {contextMenu && (
                <MapContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    lat={contextMenu.lat}
                    lon={contextMenu.lon}
                    onCreateNode={handleContextMenuCreateNode}
                    onStartSegment={handleContextMenuStartSegment}
                    onClose={() => setContextMenu(null)}
                />
            )}

            {/* Stop Creation Panel */}
            {isCreatingStop && newStopCoords && (
                <StopCreationModal
                    isOpen={isCreatingStop}
                    lat={newStopCoords.lat}
                    lon={newStopCoords.lon}
                    initialNodeType={pendingNodeType}
                    onClose={() => {
                        setIsCreatingStop(false);
                        setNewStopCoords(null);
                        setMode('idle');
                    }}
                    onSave={handleCreateStopSave}
                />
            )}

            {/* Side Panels */}
            {
                viewingStop && (
                    <StopDetails
                        stop={viewingStop}
                        onClose={() => clearSelection()}
                        onUpdate={handleStopUpdate}
                        onDelete={handleStopDelete}
                    />
                )
            }

            {
                viewingSegment && (
                    <SegmentDetails
                        segment={viewingSegment}
                        stops={stops}
                        onClose={() => clearSelection()}
                        onDelete={handleSegmentDelete}
                        onUpdate={handleSegmentUpdate}
                        onClearWaypoints={() => {
                            setActiveWaypoints([]);
                            rerouteSegment(viewingSegment.segment_id, []);
                        }}
                    />
                )
            }

            {
                activePanel === 'routes_catalog' && (
                    <RouteCatalog
                        onOpenMap={() => setActivePanel('routes')}
                        onSelectRoute={(r) => {
                            setDetailsRoute(r);
                            setActivePanel('none');
                        }}
                        onDataUpdate={fetchRouteStructure}
                    />
                )
            }

            {
                activePanel === 'stops_catalog' && (
                    <StopsCatalog
                        onClose={() => setActivePanel('none')}
                        onUpdateStop={handleStopClick}
                        onAddOnMap={() => {
                            setActivePanel('none');
                            setMode('add_stop');
                        }}
                        onDataChange={() => {
                            fetchData();
                            fetchRouteStructure();
                        }}
                    />
                )
            }

            {
                activePanel === 'segments_catalog' && (
                    <SegmentsCatalog
                        onClose={() => setActivePanel('none')}
                        stops={stops}
                        onAddOnMap={() => {
                            setActivePanel('none');
                            setMode('add_segment');
                        }}
                        onDataChange={() => {
                            fetchData();
                            fetchRouteStructure();
                        }}
                    />
                )
            }

            {
                activePanel === 'admin_panel' && (
                    <div className="absolute inset-0 z-50 flex">
                        <AdminPanel />
                        <button
                            onClick={() => setActivePanel('none')}
                            className="absolute top-4 right-4 bg-red-600 hover:bg-red-500 text-white rounded p-2"
                        >
                            Cerrar Panel
                        </button>
                    </div>
                )
            }

            {
                activePanel === 'settings' && (
                    <SettingsPanel
                        onClose={() => setActivePanel('none')}
                        currentViewState={viewState}
                    />
                )
            }

            {
                activePanel === 'calendar' && (
                    <CalendarManager
                        onClose={() => setActivePanel('none')}
                    />
                )
            }



            {
                detailsRoute && (
                    <RouteDetailsPanel
                        route={detailsRoute}
                        onClose={() => setDetailsRoute(null)}
                        onBack={() => {
                            setDetailsRoute(null);
                            setActivePanel('routes_catalog');
                        }}
                        onOpenTrips={() => setActivePanel('trips')}
                        onOpenCalendar={() => setActivePanel('calendar')}
                    />
                )
            }

            {
                activePanel === 'trips' && detailsRoute && (
                    <TripsManager
                        route={detailsRoute}
                        onClose={() => setActivePanel('none')}
                    />
                )
            }

            {
                activePanel === 'external_load' && (
                    <ExternalLoadPanel
                        onClose={() => setActivePanel('none')}
                        onImportSuccess={async () => {
                            await Promise.all([fetchData(), fetchRouteStructure()]);
                        }}
                    />
                )
            }

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

            {
                activePanel === 'empty_segments' && (
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
                )
            }

            {
                activePanel === 'simulation' && (
                    <SimulationPanel onClose={() => setActivePanel('none')} />
                )
            }

            {/* Empty State Warning */}
            {
                filterEmpty && (
                    <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 shadow-lg">
                        <strong className="font-bold">No results found!</strong>
                        <span className="block sm:inline"> Try adjusting your filters.</span>
                    </div>
                )
            }

            {/* Path Editor UI Overlay */}
            {
                activeRoute && (
                    <div className="absolute top-4 right-4 w-72 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl p-8 rounded-[32px] border utilitarian-border shadow-2xl z-[60] flex flex-col gap-6 animate-in slide-in-from-right-12 duration-500 ease-out-expo">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Activity size={16} className="text-primary animate-pulse" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Constructor de Red</h3>
                            </div>
                            <h4 className="text-base font-display font-black text-slate-900 dark:text-white leading-tight uppercase tracking-tight">
                                {activeRoute.route_short_name}
                            </h4>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-slate-100/50 dark:bg-slate-800/50 p-1.5 rounded-2xl border utilitarian-border">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-3">Sentido</span>
                                <div className="flex gap-1">
                                    {[0, 1].map(id => (
                                        <button
                                            key={id}
                                            onClick={() => setDirectionId(id as 0 | 1)}
                                            className={clsx(
                                                "px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all",
                                                directionId === id 
                                                    ? "bg-white dark:bg-slate-700 text-primary shadow-sm ring-1 ring-slate-200 dark:ring-slate-600" 
                                                    : "text-slate-400 hover:text-slate-600"
                                            )}
                                        >
                                            {id}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-2xl border utilitarian-border text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Nodos</p>
                                    <p className="text-[15px] font-display font-black text-slate-900 dark:text-white leading-none">{pathStops.length}</p>
                                </div>
                                <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-2xl border utilitarian-border text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Red (KM)</p>
                                    <p className="text-[15px] font-display font-black text-slate-900 dark:text-white leading-none">{(pathDistance / 1000).toFixed(2)}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Perfil Cartográfico</label>
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                    {routingProfiles.map(profile => {
                                        const meta = routingProfileMetadata[profile];
                                        const isActive = profile === pathRoutingProfile;
                                        return (
                                            <button
                                                key={profile}
                                                onClick={() => setPathRoutingProfile(profile)}
                                                className={clsx(
                                                    'w-full rounded-2xl border p-4 text-left transition-all flex flex-col gap-1 relative overflow-hidden group',
                                                    isActive
                                                        ? 'bg-white dark:bg-slate-800 border-primary shadow-lg shadow-primary/10'
                                                        : 'bg-transparent border-transparent hover:bg-white/50 dark:hover:bg-slate-800/30'
                                                )}
                                            >
                                                {isActive && <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: meta.color }} />}
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                                                    <span className={clsx("text-[11px] font-black uppercase tracking-tight", isActive ? "text-slate-900 dark:text-white" : "text-slate-500")}>
                                                        {meta.label}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pt-2">
                            <button
                                onClick={savePath}
                                disabled={loading || pathStops.length < 2}
                                className="w-full py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-30 transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={14} strokeWidth={2.5} /> Sincronizar Ruta
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPathStops([])}
                                    className="flex-1 py-3 bg-white dark:bg-slate-800 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-xl border utilitarian-border hover:bg-slate-50 transition-all"
                                >
                                    Reiniciar
                                </button>
                                <button
                                    onClick={cancelPathEdit}
                                    className="flex-1 py-3 bg-red-500/10 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Add Instruction Toast */}
            {
                mode === 'add_stop' && (
                    <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl px-6 py-3 rounded-full border utilitarian-border shadow-2xl z-50 flex items-center gap-4 animate-in slide-in-from-top-4 duration-500 ease-out-expo ring-4 ring-primary/10">
                        <div className="p-2 bg-primary text-white rounded-full animate-pulse shadow-lg shadow-primary/20">
                            <MapPin size={16} strokeWidth={2.5} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-900 dark:text-white">Modo: Alta de Nodo</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic">Clic en mapa para posicionar • Esc para salir</span>
                        </div>
                    </div>
                )
            }

            {
                mode === 'add_segment' && (
                    <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl px-6 py-3 rounded-full border utilitarian-border shadow-2xl z-50 flex items-center gap-4 animate-in slide-in-from-top-4 duration-500 ease-out-expo ring-4 ring-indigo-500/10">
                         <div className="p-2 bg-indigo-600 text-white rounded-full animate-bounce shadow-lg shadow-indigo-500/20">
                            <GitBranch size={16} strokeWidth={2.5} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-900 dark:text-white">Modo: Vector de Red</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic">
                                {segmentStartNode ? "Definir nodo destino" : "Seleccionar nodo origen"}
                            </span>
                        </div>
                    </div>
                )
            }

            {/* Segment Waypoint Mode Hint */}
            {viewingSegment && mode === 'idle' && !activeWaypoints.length && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="bg-amber-500/90 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow-xl backdrop-blur-sm flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        Click sobre el trazado para añadir nodos virtuales · Arrastrar para modificar
                    </div>
                </div>
            )}

            {/* Rerouting Indicator */}
            {isRerouting && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="bg-slate-900/90 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow-xl backdrop-blur-sm flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Recalculando ruta...
                    </div>
                </div>
            )}

            {/* Mode Cursor Tooltip */}
            {(mode === 'add_stop' || mode === 'add_segment' || mode === 'add_empty_segment') && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow-xl backdrop-blur-sm border border-white/10 dark:border-slate-900/10 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        {mode === 'add_stop' && 'Click en el mapa para crear parada · Clic derecho para cancelar'}
                        {(mode === 'add_segment' || mode === 'add_empty_segment') && !segmentStartNode && 'Click en parada de origen · Clic derecho para cancelar'}
                        {(mode === 'add_segment' || mode === 'add_empty_segment') && segmentStartNode && 'Click en parada de destino · Clic derecho para cancelar'}
                    </div>
                </div>
            )}

        </div>
    );
};

export default MapEditor;
