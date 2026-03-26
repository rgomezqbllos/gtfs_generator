import * as React from 'react';
import type { Route, Stop, Segment } from '../types';
import { ArrowLeft, Clock, Ruler, Calendar, Bus, Trash2, Edit2, AlertCircle, Plus, ChevronRight, Save, X, RotateCcw, Activity, Search, MapPin, Zap, Navigation } from 'lucide-react';
import { clsx } from 'clsx';
import Draggable from './UI/Draggable';
import { useEditor } from '../context/EditorContext';

import { API_URL } from '../config';
import TimeSlotsManager from './TimeSlotsManager';
import TimeSlotEditorModal from './TimeSlotEditorModal';

interface RouteDetailsPanelProps {
    route: Route;
    onClose: () => void;
    onBack?: () => void;
    onOpenTrips?: () => void;
    onOpenCalendar?: () => void;
}

interface ProcessedSegment {
    segment: Segment;
    startStop: Stop | undefined;
    endStop: Stop | undefined;
    accumulatedDist: number;
    accumulatedTime: number;
}

const RouteDetailsPanel: React.FC<RouteDetailsPanelProps> = ({ route, onClose, onBack, onOpenTrips, onOpenCalendar }) => {
    const { startPicking, cancelPicking, pickingState } = useEditor();
    const [activeTab, setActiveTab] = React.useState<0 | 1>(0);
    const [pathStops, setPathStops] = React.useState<string[]>([]);
    const [stops, setStops] = React.useState<Stop[]>([]);
    const [allSegments, setAllSegments] = React.useState<Segment[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isEditing, setIsEditing] = React.useState(false);
    const [showTimeSlots, setShowTimeSlots] = React.useState(false);

    const [isAdding, setIsAdding] = React.useState<'prepend' | 'append' | null>(null);
    const [segmentSearch, setSegmentSearch] = React.useState('');
    const [savingSegment, setSavingSegment] = React.useState(false);
    const [selectedSegmentForSlots, setSelectedSegmentForSlots] = React.useState<(Segment & { startName?: string; endName?: string }) | null>(null);

    const [targetDuration, setTargetDuration] = React.useState<number | null>(null);
    const [targetSpeed, setTargetSpeed] = React.useState<number | null>(null);

    const searchInputRef = React.useRef<HTMLInputElement>(null);

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        try {
            const [pathRes, stopsRes, segmentsRes] = await Promise.all([
                fetch(`${API_URL}/routes/${route.route_id}/path?direction_id=${activeTab}`),
                fetch(`${API_URL}/stops`),
                fetch(`${API_URL}/segments`)
            ]);

            const pathData = await pathRes.json();
            const stopsData = await stopsRes.json();
            const segmentsData = await segmentsRes.json();

            if (pathData.ordered_stop_ids && Array.isArray(pathData.ordered_stop_ids)) {
                setPathStops(pathData.ordered_stop_ids);
            } else {
                setPathStops([]);
            }

            if (Array.isArray(stopsData)) setStops(stopsData);
            if (Array.isArray(segmentsData)) setAllSegments(segmentsData);

        } catch (err) {
            console.error('Failed to fetch route details', err);
        } finally {
            setLoading(false);
        }
    }, [route.route_id, activeTab]);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const routeSegments = React.useMemo(() => {
        if (pathStops.length < 2) return [];

        const processed: ProcessedSegment[] = [];
        let currentDist = 0;
        let currentTime = 0;

        for (let i = 0; i < pathStops.length - 1; i++) {
            const startId = pathStops[i];
            const endId = pathStops[i + 1];

            const seg = allSegments.find(s => s.start_node_id === startId && s.end_node_id === endId);
            const startStop = stops.find(s => s.stop_id === startId);
            const endStop = stops.find(s => s.stop_id === endId);

            if (seg) {
                currentDist += (seg.distance || 0);
                currentTime += (seg.travel_time || 0);

                processed.push({ segment: seg, startStop, endStop, accumulatedDist: currentDist, accumulatedTime: currentTime });
            } else {
                processed.push({
                    segment: { segment_id: `missing-${i}`, start_node_id: startId, end_node_id: endId, distance: 0, travel_time: 0 } as Segment,
                    startStop, endStop, accumulatedDist: currentDist, accumulatedTime: currentTime
                });
            }
        }
        return processed;
    }, [pathStops, allSegments, stops]);

    // Anchor node: the stop that new segments must connect to
    const anchorStopId = React.useMemo(() => {
        if (pathStops.length === 0) return null;
        if (isAdding === 'prepend') return pathStops[0];
        if (isAdding === 'append') return pathStops[pathStops.length - 1];
        return null;
    }, [pathStops, isAdding]);

    const anchorStop = React.useMemo(() => {
        if (!anchorStopId) return null;
        return stops.find(s => s.stop_id === anchorStopId) || null;
    }, [anchorStopId, stops]);

    // Compatible existing segments: revenue segments that connect to the anchor node
    const compatibleSegments = React.useMemo(() => {
        if (!isAdding) return [];

        const searchLower = segmentSearch.toLowerCase().trim();

        // For empty routes: show ALL revenue segments
        if (pathStops.length === 0) {
            return allSegments
                .filter(s => s.type !== 'empty')
                .filter(s => {
                    if (!searchLower) return true;
                    const startName = (s as any).start_node_name || '';
                    const endName = (s as any).end_node_name || '';
                    return startName.toLowerCase().includes(searchLower) ||
                           endName.toLowerCase().includes(searchLower);
                })
                .slice(0, 50);
        }

        if (!anchorStopId) return [];

        return allSegments
            .filter(s => {
                if (s.type === 'empty') return false;
                if (isAdding === 'append') return s.start_node_id === anchorStopId;
                if (isAdding === 'prepend') return s.end_node_id === anchorStopId;
                return false;
            })
            .filter(s => {
                if (!searchLower) return true;
                const startName = (s as any).start_node_name || '';
                const endName = (s as any).end_node_name || '';
                return startName.toLowerCase().includes(searchLower) ||
                       endName.toLowerCase().includes(searchLower);
            });
    }, [isAdding, pathStops, anchorStopId, allSegments, segmentSearch]);

    // Focus search when panel opens
    React.useEffect(() => {
        if (isAdding && searchInputRef.current) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isAdding]);

    const handleStartAdding = (type: 'prepend' | 'append') => {
        if (isAdding === type) {
            setIsAdding(null);
            setSegmentSearch('');
            cancelPicking();
            return;
        }
        setIsAdding(type);
        setSegmentSearch('');
        cancelPicking();
    };

    React.useEffect(() => {
        return () => cancelPicking();
    }, []);

    // Select an existing segment — add it to the route
    const handleSelectSegment = async (seg: Segment) => {
        if (savingSegment) return;
        setSavingSegment(true);

        try {
            let newStopIds = [...pathStops];

            if (routeSegments.length === 0) {
                newStopIds = [seg.start_node_id, seg.end_node_id];
            } else if (isAdding === 'prepend') {
                newStopIds.unshift(seg.start_node_id);
            } else if (isAdding === 'append') {
                newStopIds.push(seg.end_node_id);
            }

            let segmentsToUpdate: Segment[] = [];
            if (targetDuration) {
                const current = routeSegments.map(r => r.segment);
                const combined = isAdding === 'prepend' ? [seg, ...current] : [...current, seg];
                segmentsToUpdate = recalculateSegmentTimes(combined, targetDuration * 60);
            }

            await handleSavePath(newStopIds, segmentsToUpdate);
        } finally {
            setSavingSegment(false);
        }
    };

    // Enable map picking mode for segments (legacy behavior)
    const handlePickSegmentFromMap = () => {
        startPicking('segment', (segmentId) => {
            const seg = allSegments.find(s => s.segment_id === segmentId);
            if (!seg) return;

            if (seg.type === 'empty') {
                alert("No se pueden anadir segmentos vacios a una ruta comercial.");
                return;
            }

            let isValid = false;
            if (routeSegments.length === 0) {
                isValid = true;
            } else if (isAdding === 'prepend') {
                isValid = seg.end_node_id === pathStops[0];
            } else if (isAdding === 'append') {
                isValid = seg.start_node_id === pathStops[pathStops.length - 1];
            }

            if (isValid) {
                handleSelectSegment(seg);
            } else {
                alert("Segmento invalido: no conecta con el nodo actual de la ruta.");
            }
        });
    };

    // Enable map picking mode for stops (creates segment automatically)
    const handlePickStopFromMap = () => {
        startPicking('stop', async (stopId) => {
            const stop = stops.find(s => s.stop_id === stopId);
            if (!stop) return;

            if (savingSegment) return;
            setSavingSegment(true);

            try {
                let newStopIds = [...pathStops];
                if (pathStops.length === 0) {
                    // Can't create a path with just 1 stop — need at least 2
                    alert("Primero selecciona un segmento existente o selecciona dos paradas.");
                    return;
                } else if (isAdding === 'prepend') {
                    newStopIds.unshift(stopId);
                } else if (isAdding === 'append') {
                    newStopIds.push(stopId);
                }
                await handleSavePath(newStopIds);
            } finally {
                setSavingSegment(false);
            }
        });
    };

    const handleSavePath = async (newStopIds: string[], updatedSegments: Segment[] = []) => {
        try {
            const res = await fetch(`${API_URL}/routes/${route.route_id}/path`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    direction_id: activeTab,
                    ordered_stop_ids: newStopIds
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${res.status}`);
            }

            if (updatedSegments.length > 0) {
                await Promise.all(updatedSegments.map(seg =>
                    fetch(`${API_URL}/segments/${seg.segment_id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ travel_time: seg.travel_time })
                    })
                ));

                setAllSegments(prev => prev.map(s => {
                    const updated = updatedSegments.find(u => u.segment_id === s.segment_id);
                    return updated ? updated : s;
                }));
            }

            setPathStops(newStopIds);
            setIsAdding(null);
            setSegmentSearch('');
            cancelPicking();

            // Refetch to get auto-created segments
            setTimeout(() => fetchData(), 300);

        } catch (e: any) {
            console.error(e);
            alert(`Error: ${e.message || 'No se pudo sincronizar el recorrido'}`);
        }
    }

    const recalculateSegmentTimes = (segments: Segment[], totalTimeSeconds: number) => {
        const totalDist = segments.reduce((sum, s) => sum + (s.distance || 0), 0);
        if (totalDist === 0) return segments;

        let accumulatedTime = 0;
        return segments.map((s, index) => {
            if (index === segments.length - 1) {
                return { ...s, travel_time: Math.max(0, totalTimeSeconds - accumulatedTime) };
            }
            const proportion = (s.distance || 0) / totalDist;
            const segmentTime = Math.round(totalTimeSeconds * proportion);
            accumulatedTime += segmentTime;
            return { ...s, travel_time: segmentTime };
        });
    };

    const handleTimeChange = (newTimeMinutes: number) => {
        setTargetDuration(newTimeMinutes);
        const totalTimeSeconds = newTimeMinutes * 60;
        const currentRouteSegments = routeSegments.map(rs => rs.segment);
        const totalDist = currentRouteSegments.reduce((sum, s) => sum + (s.distance || 0), 0);
        if (totalDist > 0) {
            const speedKmh = (totalDist / 1000) / (newTimeMinutes / 60);
            setTargetSpeed(parseFloat(speedKmh.toFixed(1)));
        }
        const updatedSegments = recalculateSegmentTimes(currentRouteSegments, totalTimeSeconds);
        setAllSegments(prev => prev.map(s => {
            const updated = updatedSegments.find(u => u.segment_id === s.segment_id);
            return updated ? updated : s;
        }));
    };

    const handleSpeedChange = (newSpeedKmh: number) => {
        setTargetSpeed(newSpeedKmh);
        const currentRouteSegments = routeSegments.map(rs => rs.segment);
        const totalDist = currentRouteSegments.reduce((sum, s) => sum + (s.distance || 0), 0);
        if (newSpeedKmh > 0 && totalDist > 0) {
            const timeHours = (totalDist / 1000) / newSpeedKmh;
            const timeMinutes = Math.round(timeHours * 60);
            setTargetDuration(timeMinutes);
            const updatedSegments = recalculateSegmentTimes(currentRouteSegments, timeMinutes * 60);
            setAllSegments(prev => prev.map(s => {
                const updated = updatedSegments.find(u => u.segment_id === s.segment_id);
                return updated ? updated : s;
            }));
        }
    };

    React.useEffect(() => {
        if (targetDuration && routeSegments.length > 0) {
            const currentSegments = routeSegments.map(rs => rs.segment);
            const currentTotalTime = currentSegments.reduce((sum, s) => sum + (s.travel_time || 0), 0);
            if (Math.abs(currentTotalTime - (targetDuration * 60)) > 60) {
                const updated = recalculateSegmentTimes(currentSegments, targetDuration * 60);
                const hasChanges = updated.some((u, i) => u.travel_time !== currentSegments[i].travel_time);
                if (hasChanges) {
                    setAllSegments(prev => prev.map(s => {
                        const up = updated.find(u => u.segment_id === s.segment_id);
                        return up ? up : s;
                    }));
                }
            }
        }
    }, [routeSegments.length, targetDuration]);

    const handleRemoveSegment = (index: number) => {
        if (index !== 0 && index !== routeSegments.length - 1) return;

        const newStopIds = [...pathStops];
        if (index === 0) {
            newStopIds.shift();
        } else {
            newStopIds.pop();
        }

        let segmentsToUpdate: Segment[] = [];
        if (targetDuration) {
            const remainingSegments = routeSegments.filter((_, i) => i !== index).map(r => r.segment);
            segmentsToUpdate = recalculateSegmentTimes(remainingSegments, targetDuration * 60);
        }

        handleSavePath(newStopIds, segmentsToUpdate);
    };

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const formatDist = (meters: number) => {
        if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
        return `${Math.round(meters)} m`;
    };

    const getSegmentDisplayName = (seg: Segment) => {
        const startName = (seg as any).start_node_name || stops.find(s => s.stop_id === seg.start_node_id)?.stop_name || seg.start_node_id;
        const endName = (seg as any).end_node_name || stops.find(s => s.stop_id === seg.end_node_id)?.stop_name || seg.end_node_id;
        return { startName, endName };
    };

    // Render segment picker panel
    const renderAddPanel = () => {
        if (!isAdding) return null;

        const isFirstSegment = pathStops.length === 0;
        const isMapPicking = pickingState.isActive;

        return (
            <div className="mx-2 mb-4 bg-white dark:bg-slate-800/60 border-2 border-primary/30 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                {/* Header */}
                <div className="px-5 py-4 bg-primary/5 dark:bg-primary/10 border-b border-primary/10">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-primary/10 rounded-lg">
                                <Navigation size={14} className="text-primary" />
                            </div>
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                                {isFirstSegment ? 'Seleccionar Primer Segmento' : isAdding === 'append' ? 'Anexar Segmento' : 'Anteponer Segmento'}
                            </h4>
                        </div>
                        <button
                            onClick={() => { setIsAdding(null); setSegmentSearch(''); cancelPicking(); }}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {anchorStop && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <MapPin size={10} className="text-primary" />
                            <span>
                                {isAdding === 'append' ? 'Continuando desde' : 'Conectando antes de'}:
                                <strong className="text-slate-700 dark:text-slate-300 ml-1">{anchorStop.stop_name}</strong>
                            </span>
                        </div>
                    )}
                </div>

                {/* Search + Map Pick buttons */}
                <div className="px-4 pt-3 pb-2 flex gap-2">
                    <div className="flex-1 relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={segmentSearch}
                            onChange={e => setSegmentSearch(e.target.value)}
                            placeholder="Buscar segmento por nombre de parada..."
                            className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                        />
                    </div>
                    <button
                        onClick={isMapPicking ? () => cancelPicking() : handlePickSegmentFromMap}
                        className={clsx(
                            "px-2.5 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all whitespace-nowrap",
                            isMapPicking
                                ? "bg-primary text-white shadow-lg shadow-primary/30 animate-pulse"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary border border-slate-200 dark:border-slate-600"
                        )}
                        title="Seleccionar segmento en el mapa"
                    >
                        <Ruler size={11} />
                        Seg
                    </button>
                    <button
                        onClick={isMapPicking ? () => cancelPicking() : handlePickStopFromMap}
                        className={clsx(
                            "px-2.5 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all whitespace-nowrap",
                            pickingState.isActive && pickingState.type === 'stop'
                                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 animate-pulse"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-600 border border-slate-200 dark:border-slate-600"
                        )}
                        title="Seleccionar parada en el mapa (auto-crea segmento)"
                    >
                        <MapPin size={11} />
                        Stop
                    </button>
                </div>

                {/* Segment list */}
                <div className="px-4 pb-3">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Zap size={9} className="text-amber-500" />
                        {isFirstSegment ? 'Todos los segmentos' : 'Segmentos compatibles'} ({compatibleSegments.length})
                    </div>
                    <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                        {compatibleSegments.length === 0 && (
                            <div className="py-6 text-center">
                                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full inline-block mb-3">
                                    <AlertCircle size={20} className="text-slate-300" />
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium mb-2">
                                    {segmentSearch
                                        ? 'Sin resultados para esta busqueda'
                                        : isFirstSegment
                                            ? 'No hay segmentos creados en el proyecto'
                                            : 'No hay segmentos que conecten con esta parada'}
                                </p>
                                {!isFirstSegment && !segmentSearch && (
                                    <p className="text-[9px] text-slate-400">
                                        Usa el boton <strong>Stop</strong> para seleccionar una parada en el mapa y crear el segmento automaticamente via OSRM.
                                    </p>
                                )}
                            </div>
                        )}
                        {compatibleSegments.map(seg => {
                            const { startName, endName } = getSegmentDisplayName(seg);
                            return (
                                <button
                                    key={seg.segment_id}
                                    onClick={() => handleSelectSegment(seg)}
                                    disabled={savingSegment}
                                    className={clsx(
                                        "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left group",
                                        savingSegment
                                            ? "opacity-50 cursor-wait"
                                            : "hover:bg-primary/5 dark:hover:bg-primary/10 hover:border-primary/30",
                                        "bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50"
                                    )}
                                >
                                    <div className="p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg group-hover:bg-primary/10 transition-colors">
                                        <Zap size={12} className="text-amber-500 group-hover:text-primary transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                            {startName} <span className="text-slate-300 dark:text-slate-600">&rarr;</span> {endName}
                                        </div>
                                        <div className="text-[9px] text-slate-400 flex items-center gap-3 mt-0.5">
                                            <span className="flex items-center gap-1"><Ruler size={8} /> {formatDist(seg.distance || 0)}</span>
                                            <span className="flex items-center gap-1"><Clock size={8} /> {formatTime(seg.travel_time || 0)}</span>
                                            {seg.routing_profile && (
                                                <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[7px] uppercase font-bold">{seg.routing_profile}</span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight size={12} className="text-slate-300 group-hover:text-primary transition-colors" />
                                </button>
                            );
                        })}
                    </div>
                </div>

                {savingSegment && (
                    <div className="px-4 pb-3">
                        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg">
                            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Sincronizando recorrido...</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const lastSeg = routeSegments.length > 0 ? routeSegments[routeSegments.length - 1] : null;

    return (
        <Draggable className="absolute top-4 right-4 w-[420px] glass-panel shadow-2xl rounded-2xl flex flex-col border border-white/10 dark:border-slate-700/50 z-40 max-h-[92vh] animate-in slide-in-from-right-6 duration-300 pointer-events-auto overflow-hidden">
            {/* Compact Header */}
            <div className="drag-handle cursor-move px-4 pt-4 pb-3 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-center gap-3 mb-3">
                    <div
                        className="w-9 h-9 rounded-xl shadow-sm border border-white/30 dark:border-slate-700 flex items-center justify-center font-bold text-sm shrink-0"
                        style={{ backgroundColor: `#${route.route_color}`, color: `#${route.route_text_color}` }}
                    >
                        {route.route_short_name}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">
                            {route.route_long_name}
                        </h2>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400">
                            <span>{route.agency_name || 'Sin agencia'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {onBack && (
                            <button onClick={onBack} className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                                <ArrowLeft size={16} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Tabs + Edit toggle in one row */}
                <div className="flex items-center gap-2">
                    <div className="flex flex-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
                        <button
                            onClick={() => { if (!isEditing) { setActiveTab(0); setIsAdding(null); setSegmentSearch(''); } }}
                            disabled={isEditing}
                            className={clsx(
                                "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                activeTab === 0
                                    ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300",
                                isEditing && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            Ida
                        </button>
                        <button
                            onClick={() => { if (!isEditing) { setActiveTab(1); setIsAdding(null); setSegmentSearch(''); } }}
                            disabled={isEditing}
                            className={clsx(
                                "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                activeTab === 1
                                    ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300",
                                isEditing && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            Vuelta
                        </button>
                    </div>
                    <button
                        onClick={() => {
                            if (isEditing) {
                                if (confirm('Descartar cambios?')) {
                                    setIsEditing(false); setIsAdding(null); setSegmentSearch(''); cancelPicking(); fetchData();
                                }
                            } else {
                                setIsEditing(true); setIsAdding(null);
                            }
                        }}
                        className={clsx(
                            "p-2 rounded-xl transition-all",
                            isEditing
                                ? "bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100"
                                : "bg-primary/10 text-primary hover:bg-primary/20"
                        )}
                    >
                        {isEditing ? <RotateCcw size={14} /> : <Edit2 size={14} />}
                    </button>
                    {isEditing && (
                        <button
                            onClick={() => { setIsEditing(false); setIsAdding(null); setSegmentSearch(''); cancelPicking(); }}
                            className="p-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
                        >
                            <Save size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Segments List */}
            <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar relative">
                {loading && (
                    <div className="flex items-center justify-center py-12 text-slate-400">
                        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-primary rounded-full animate-spin" />
                    </div>
                )}

                {/* Prepend Area */}
                {isEditing && !loading && (
                    <div className="mb-3">
                        {isAdding === 'prepend' ? (
                            renderAddPanel()
                        ) : (
                            <button
                                onClick={() => handleStartAdding('prepend')}
                                className="w-full py-2.5 border border-dashed rounded-xl flex items-center justify-center gap-2 transition-all text-[10px] font-bold uppercase tracking-wider border-slate-200 dark:border-slate-700 text-slate-400 hover:border-primary hover:text-primary hover:bg-primary/5"
                            >
                                <Plus size={12} />
                                {pathStops.length === 0 ? 'Primer segmento' : 'Anteponer'}
                            </button>
                        )}
                    </div>
                )}

                {!loading && routeSegments.length === 0 && !isEditing && (
                    <div className="flex flex-col items-center py-10 text-center px-6">
                        <AlertCircle size={28} className="text-slate-300 dark:text-slate-600 mb-3" strokeWidth={1.5} />
                        <p className="text-xs text-slate-500 font-medium">Sin segmentos. Usa el editor para construir el recorrido.</p>
                    </div>
                )}

                {/* Segment Timeline */}
                <div className="space-y-1 relative">
                    {routeSegments.length > 1 && (
                        <div className="absolute left-[11px] top-4 bottom-4 w-px bg-gradient-to-b from-primary/40 via-slate-300 to-primary/40 dark:via-slate-700 pointer-events-none" />
                    )}

                    {routeSegments.map((item, index) => {
                        const canDelete = index === 0 || index === routeSegments.length - 1;

                        return (
                            <div key={item.segment.segment_id} className="relative pl-7 group">
                                {/* Step indicator */}
                                <div className="absolute left-0 top-3 w-[22px] flex justify-center z-10">
                                    <div className="w-[22px] h-[22px] rounded-md bg-white dark:bg-slate-800 border-2 border-primary/60 flex items-center justify-center text-[9px] font-bold text-primary font-mono">
                                        {index + 1}
                                    </div>
                                </div>

                                <div
                                    onClick={() => {
                                        if (!isEditing) {
                                            setSelectedSegmentForSlots({
                                                ...item.segment,
                                                startName: item.startStop?.stop_name,
                                                endName: item.endStop?.stop_name
                                            });
                                        }
                                    }}
                                    className={clsx(
                                        "rounded-xl px-3 py-2.5 border transition-all",
                                        !isEditing
                                            ? "cursor-pointer border-transparent hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-primary/10"
                                            : "border-slate-100 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/30"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                {item.startStop?.stop_name || '?'} <span className="text-slate-300 dark:text-slate-600 mx-0.5">&rarr;</span> {item.endStop?.stop_name || '?'}
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5 text-[9px] text-slate-400">
                                                <span className="flex items-center gap-0.5 font-mono">
                                                    <Ruler size={8} /> {formatDist(item.segment.distance || 0)}
                                                </span>
                                                <span className="flex items-center gap-0.5 font-mono">
                                                    <Clock size={8} /> {formatTime(item.segment.travel_time || 0)}
                                                </span>
                                                {!isEditing && (
                                                    <span className="text-primary/60 flex items-center gap-0.5">
                                                        <Clock size={7} /> Franjas
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {isEditing && canDelete && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRemoveSegment(index); }}
                                                className="p-1 text-slate-300 hover:text-red-500 rounded transition-all shrink-0"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                        {!isEditing && <ChevronRight size={12} className="text-slate-300 shrink-0" />}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Append Area */}
                {isEditing && !loading && pathStops.length > 0 && (
                    <div className="mt-3">
                        {isAdding === 'append' ? (
                            renderAddPanel()
                        ) : (
                            <button
                                onClick={() => handleStartAdding('append')}
                                className="w-full py-2.5 border border-dashed rounded-xl flex items-center justify-center gap-2 transition-all text-[10px] font-bold uppercase tracking-wider border-slate-200 dark:border-slate-700 text-slate-400 hover:border-primary hover:text-primary hover:bg-primary/5"
                            >
                                <Plus size={12} />
                                Anexar
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Compact Metrics + Actions Footer */}
            {lastSeg && (
                <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200/50 dark:border-slate-700/50">
                    <div className="flex items-center justify-between mb-2.5">
                        {isEditing ? (
                            <>
                                <div className="flex items-center gap-2">
                                    <Ruler size={11} className="text-slate-400" />
                                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{formatDist(lastSeg.accumulatedDist)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock size={11} className="text-primary" />
                                    <input
                                        type="number"
                                        min="1"
                                        value={targetDuration || Math.round(lastSeg.accumulatedTime / 60)}
                                        onChange={(e) => handleTimeChange(parseInt(e.target.value) || 0)}
                                        className="w-14 px-1.5 py-0.5 text-right text-xs font-bold text-primary bg-primary/5 border border-primary/20 rounded-md focus:outline-none focus:border-primary"
                                    />
                                    <span className="text-[9px] font-bold text-primary">min</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Activity size={10} className="text-slate-400" />
                                    <input
                                        type="number"
                                        min="1"
                                        step="0.1"
                                        value={targetSpeed || (lastSeg.accumulatedDist / 1000 / (lastSeg.accumulatedTime / 3600)).toFixed(1)}
                                        onChange={(e) => handleSpeedChange(parseFloat(e.target.value) || 0)}
                                        className="w-12 px-1.5 py-0.5 text-right text-xs font-bold text-slate-600 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-primary"
                                    />
                                    <span className="text-[9px] text-slate-400">km/h</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-1.5">
                                    <Ruler size={11} className="text-slate-400" />
                                    <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">{formatDist(lastSeg.accumulatedDist)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Clock size={11} className="text-primary" />
                                    <span className="font-mono text-sm font-bold text-primary">{formatTime(lastSeg.accumulatedTime)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Activity size={10} className="text-slate-400" />
                                    <span className="font-mono text-xs text-slate-500">
                                        {lastSeg.accumulatedTime > 0 ? (lastSeg.accumulatedDist / 1000 / (lastSeg.accumulatedTime / 3600)).toFixed(1) : '0'} km/h
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Action bar */}
            <div className="px-3 py-2.5 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200/50 dark:border-slate-700/50">
                <button
                    onClick={onOpenTrips}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-primary hover:bg-primary/5 transition-all"
                >
                    <Bus size={13} /> Viajes
                </button>
                <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
                <button
                    onClick={() => setShowTimeSlots(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-primary hover:bg-primary/5 transition-all"
                >
                    <Clock size={13} /> Horarios
                </button>
                <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
                <button
                    onClick={onOpenCalendar}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-primary hover:bg-primary/5 transition-all"
                >
                    <Calendar size={13} /> Calendario
                </button>
            </div>

            {showTimeSlots && (
                <TimeSlotsManager
                    route={route}
                    onClose={() => setShowTimeSlots(false)}
                />
            )}

            <TimeSlotEditorModal
                isOpen={!!selectedSegmentForSlots}
                onClose={() => setSelectedSegmentForSlots(null)}
                segment={selectedSegmentForSlots}
            />
        </Draggable>
    );
};

export default RouteDetailsPanel;
