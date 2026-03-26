import * as React from 'react';
import type { Route, Stop, Segment } from '../types';
import { ArrowLeft, Clock, Ruler, Calendar, Bus, Trash2, Edit2, AlertCircle, Plus, ChevronRight, Save, X, RotateCcw, Activity, Search, MapPin, Zap, Navigation } from 'lucide-react';
import { clsx } from 'clsx';
import Draggable from './UI/Draggable';
import { useEditor } from '../context/EditorContext';

import { API_URL } from '../config';
import TimeSlotsManager from './TimeSlotsManager';

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
    const [stopSearch, setStopSearch] = React.useState('');
    const [savingSegment, setSavingSegment] = React.useState(false);

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

                processed.push({
                    segment: seg,
                    startStop,
                    endStop,
                    accumulatedDist: currentDist,
                    accumulatedTime: currentTime
                });
            } else {
                processed.push({
                    segment: {
                        segment_id: `missing-${i}`,
                        start_node_id: startId,
                        end_node_id: endId,
                        distance: 0,
                        travel_time: 0
                    } as Segment,
                    startStop,
                    endStop,
                    accumulatedDist: currentDist,
                    accumulatedTime: currentTime
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

    // Compatible existing segments (already created, connect to anchor)
    const compatibleSegments = React.useMemo(() => {
        if (!anchorStopId || !isAdding) return [];
        return allSegments.filter(s => {
            if (s.type === 'empty') return false;
            if (isAdding === 'append') return s.start_node_id === anchorStopId;
            if (isAdding === 'prepend') return s.end_node_id === anchorStopId;
            return false;
        });
    }, [anchorStopId, isAdding, allSegments]);

    // Stops already used in this path (to exclude from suggestions)
    const usedStopIds = React.useMemo(() => new Set(pathStops), [pathStops]);

    // Calculate distance between two stops (Haversine)
    const calcDistance = React.useCallback((a: Stop, b: Stop): number => {
        const R = 6371000;
        const dLat = (b.stop_lat - a.stop_lat) * Math.PI / 180;
        const dLon = (b.stop_lon - a.stop_lon) * Math.PI / 180;
        const sinLat = Math.sin(dLat / 2);
        const sinLon = Math.sin(dLon / 2);
        const h = sinLat * sinLat + Math.cos(a.stop_lat * Math.PI / 180) * Math.cos(b.stop_lat * Math.PI / 180) * sinLon * sinLon;
        return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }, []);

    // Available stops for next connection, sorted by proximity
    const availableStops = React.useMemo(() => {
        if (!isAdding) return [];

        const searchLower = stopSearch.toLowerCase().trim();

        // For empty routes, show all stops
        if (pathStops.length === 0) {
            return stops
                .filter(s => {
                    if (!searchLower) return true;
                    return s.stop_name?.toLowerCase().includes(searchLower) ||
                           s.stop_code?.toLowerCase().includes(searchLower) ||
                           s.stop_id?.toLowerCase().includes(searchLower);
                })
                .slice(0, 30);
        }

        if (!anchorStop) return [];

        // Filter stops: exclude used ones, filter by search, sort by distance to anchor
        return stops
            .filter(s => !usedStopIds.has(s.stop_id))
            .filter(s => {
                if (!searchLower) return true;
                return s.stop_name?.toLowerCase().includes(searchLower) ||
                       s.stop_code?.toLowerCase().includes(searchLower) ||
                       s.stop_id?.toLowerCase().includes(searchLower);
            })
            .map(s => ({ ...s, _dist: calcDistance(anchorStop, s) }))
            .sort((a, b) => a._dist - b._dist)
            .slice(0, 30);
    }, [isAdding, pathStops, anchorStop, stops, usedStopIds, stopSearch, calcDistance]);

    // Focus search when panel opens
    React.useEffect(() => {
        if (isAdding && searchInputRef.current) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isAdding]);

    const handleStartAdding = (type: 'prepend' | 'append') => {
        if (isAdding === type) {
            setIsAdding(null);
            setStopSearch('');
            cancelPicking();
            return;
        }
        setIsAdding(type);
        setStopSearch('');
        cancelPicking();
    };

    React.useEffect(() => {
        return () => cancelPicking();
    }, []);

    // Select a stop to add — backend auto-creates segment via OSRM
    const handleSelectStop = async (stop: Stop) => {
        if (savingSegment) return;
        setSavingSegment(true);

        try {
            let newStopIds = [...pathStops];
            if (pathStops.length === 0) {
                // First stop selected — need a second one to form a segment
                // For now, just set this as the starting point
                newStopIds = [stop.stop_id];
                setPathStops(newStopIds);
                setSavingSegment(false);
                return;
            } else if (isAdding === 'prepend') {
                newStopIds.unshift(stop.stop_id);
            } else if (isAdding === 'append') {
                newStopIds.push(stop.stop_id);
            }

            await handleSavePath(newStopIds);
            setStopSearch('');
        } catch (e) {
            console.error(e);
        } finally {
            setSavingSegment(false);
        }
    };

    // Select an existing segment directly
    const handleSelectExistingSegment = (seg: Segment) => {
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

        handleSavePath(newStopIds, segmentsToUpdate);
    };

    // Enable map picking mode for stops
    const handlePickFromMap = () => {
        startPicking('stop', (stopId) => {
            const stop = stops.find(s => s.stop_id === stopId);
            if (stop) handleSelectStop(stop);
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

            if (!res.ok) throw new Error("Error al guardar el trayecto");

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
            setStopSearch('');
            cancelPicking();

            // Refetch to get the auto-created segments
            setTimeout(() => fetchData(), 300);

        } catch (e) {
            console.error(e);
            alert("Error al sincronizar recorrido");
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

            return {
                ...s,
                travel_time: segmentTime
            };
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
        if (index !== 0 && index !== routeSegments.length - 1) {
            return;
        }

        const newStopIds = [...pathStops];
        if (index === 0) {
            newStopIds.shift();
        } else {
            newStopIds.pop();
        }

        let segmentsToUpdate: Segment[] = [];
        if (targetDuration) {
            const remainingSegments = routeSegments
                .filter((_, i) => i !== index)
                .map(r => r.segment);

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

    // Render the stop/segment picker inline panel
    const renderAddPanel = () => {
        if (!isAdding) return null;

        const isFirstSegment = pathStops.length === 0;
        const anchor = anchorStop;
        const isMapPicking = pickingState.isActive && pickingState.type === 'stop';

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
                                {isFirstSegment ? 'Seleccionar Parada de Inicio' : isAdding === 'append' ? 'Siguiente Parada' : 'Parada Anterior'}
                            </h4>
                        </div>
                        <button
                            onClick={() => { setIsAdding(null); setStopSearch(''); cancelPicking(); }}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {anchor && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <MapPin size={10} className="text-primary" />
                            <span>Conectando desde: <strong className="text-slate-700 dark:text-slate-300">{anchor.stop_name}</strong></span>
                        </div>
                    )}
                </div>

                {/* Search + Map Pick */}
                <div className="px-4 pt-3 pb-2 flex gap-2">
                    <div className="flex-1 relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={stopSearch}
                            onChange={e => setStopSearch(e.target.value)}
                            placeholder="Buscar parada por nombre o codigo..."
                            className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                        />
                    </div>
                    <button
                        onClick={isMapPicking ? () => cancelPicking() : handlePickFromMap}
                        className={clsx(
                            "px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all whitespace-nowrap",
                            isMapPicking
                                ? "bg-primary text-white shadow-lg shadow-primary/30 animate-pulse"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary border border-slate-200 dark:border-slate-600"
                        )}
                    >
                        <MapPin size={12} />
                        {isMapPicking ? 'Eligiendo...' : 'Mapa'}
                    </button>
                </div>

                {/* Existing compatible segments (quick-add) */}
                {compatibleSegments.length > 0 && !stopSearch && (
                    <div className="px-4 pb-2">
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Zap size={9} className="text-amber-500" />
                            Segmentos existentes ({compatibleSegments.length})
                        </div>
                        <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                            {compatibleSegments.slice(0, 5).map(seg => {
                                const targetStop = stops.find(s =>
                                    s.stop_id === (isAdding === 'append' ? seg.end_node_id : seg.start_node_id)
                                );
                                return (
                                    <button
                                        key={seg.segment_id}
                                        onClick={() => handleSelectExistingSegment(seg)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-all text-left group"
                                    >
                                        <div className="p-1 bg-amber-100 dark:bg-amber-900/30 rounded-md">
                                            <Zap size={10} className="text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                {targetStop?.stop_name || seg.end_node_id}
                                            </div>
                                            <div className="text-[9px] text-slate-400">
                                                {formatDist(seg.distance || 0)} &middot; {formatTime(seg.travel_time || 0)}
                                            </div>
                                        </div>
                                        <ChevronRight size={12} className="text-slate-300 group-hover:text-primary transition-colors" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Stop list */}
                <div className="px-4 pb-3">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <MapPin size={9} className="text-primary" />
                        {isFirstSegment ? 'Paradas disponibles' : 'Paradas cercanas'} ({availableStops.length})
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                        {availableStops.length === 0 && (
                            <div className="py-6 text-center">
                                <p className="text-[10px] text-slate-400 font-medium">
                                    {stopSearch ? 'Sin resultados para esta busqueda' : 'No hay paradas registradas en el proyecto'}
                                </p>
                            </div>
                        )}
                        {availableStops.map((stop: any) => (
                            <button
                                key={stop.stop_id}
                                onClick={() => handleSelectStop(stop)}
                                disabled={savingSegment}
                                className={clsx(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left group",
                                    savingSegment
                                        ? "opacity-50 cursor-wait"
                                        : "hover:bg-primary/5 dark:hover:bg-primary/10 hover:border-primary/30",
                                    "bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50"
                                )}
                            >
                                <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg group-hover:bg-primary/10 transition-colors">
                                    <MapPin size={12} className="text-slate-400 group-hover:text-primary transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                        {stop.stop_name || stop.stop_id}
                                    </div>
                                    <div className="text-[9px] text-slate-400 flex items-center gap-2">
                                        {stop.stop_code && <span>{stop.stop_code}</span>}
                                        {stop._dist !== undefined && stop._dist > 0 && (
                                            <span>{formatDist(stop._dist)}</span>
                                        )}
                                        {stop.node_type && stop.node_type !== 'regular' && (
                                            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[8px] uppercase font-bold">{stop.node_type}</span>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight size={12} className="text-slate-300 group-hover:text-primary transition-colors" />
                            </button>
                        ))}
                    </div>
                </div>

                {savingSegment && (
                    <div className="px-4 pb-3">
                        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg">
                            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Generando segmento via OSRM...</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <Draggable className="absolute top-10 right-10 w-[520px] glass-panel shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] rounded-3xl flex flex-col border border-white/20 dark:border-slate-800 z-40 max-h-[90vh] animate-in slide-in-from-right-10 duration-500 ease-out-expo pointer-events-auto overflow-hidden">
            {/* Header Area */}
            <div className="drag-handle cursor-move bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md p-8 border-b utilitarian-border">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                             <div
                                className="w-12 h-12 rounded-2xl shadow-lg border-2 border-white dark:border-slate-800 flex items-center justify-center font-display font-black text-lg transition-transform hover:scale-110"
                                style={{ backgroundColor: `#${route.route_color}`, color: `#${route.route_text_color}` }}
                             >
                                {route.route_short_name}
                             </div>
                             <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-900 p-1 rounded-full border utilitarian-border">
                                <Activity size={10} className="text-primary" />
                             </div>
                        </div>
                        <div>
                            <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-1">
                                Detalle de Ruta
                            </h2>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Operational Insights</p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {onBack && (
                            <button onClick={onBack} className="p-2.5 text-slate-400 hover:text-primary rounded-xl hover:bg-white dark:hover:bg-slate-800 border-none transition-all">
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-red-500 rounded-xl hover:bg-white dark:hover:bg-slate-800 transition-all">
                            <X size={20} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8">
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 underline decoration-primary/40 underline-offset-4">Servicio Comercial</span>
                        <div className="font-bold text-slate-900 dark:text-gray-100 text-[15px] leading-tight" title={route.route_long_name}>
                            {route.route_long_name}
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 underline decoration-primary/40 underline-offset-4">Agencia Operativa</span>
                        <div className="font-bold text-slate-900 dark:text-gray-100 text-[15px]">
                            {route.agency_name || 'Sin Asignar'}
                        </div>
                    </div>
                </div>

                {/* Refined Tabs */}
                <div className="flex p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-[18px] border utilitarian-border">
                    <button
                        onClick={() => { if (!isEditing) { setActiveTab(0); setIsAdding(null); setStopSearch(''); } }}
                        disabled={isEditing}
                        className={clsx(
                            "flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-[12px] transition-all",
                            activeTab === 0
                                ? "bg-white dark:bg-slate-700 text-primary shadow-sm ring-1 ring-slate-200 dark:ring-slate-600"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200",
                            isEditing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        Trayecto Ida
                    </button>
                    <button
                        onClick={() => { if (!isEditing) { setActiveTab(1); setIsAdding(null); setStopSearch(''); } }}
                        disabled={isEditing}
                        className={clsx(
                            "flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-[12px] transition-all",
                            activeTab === 1
                                ? "bg-white dark:bg-slate-700 text-primary shadow-sm ring-1 ring-slate-200 dark:ring-slate-600"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200",
                            isEditing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        Trayecto Vuelta
                    </button>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="px-8 py-4 bg-white/30 dark:bg-slate-900/30 border-b utilitarian-border flex gap-4">
                <button
                    onClick={() => {
                        if (isEditing) {
                            if (confirm('Descartar cambios no sincronizados?')) {
                                setIsEditing(false);
                                setIsAdding(null);
                                setStopSearch('');
                                cancelPicking();
                                fetchData();
                            }
                        } else {
                            setIsEditing(true);
                            setIsAdding(null);
                        }
                    }}
                    className={clsx(
                        "flex-1 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                        isEditing
                            ? "bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-900/40 hover:bg-red-100"
                            : "bg-primary text-white shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95"
                    )}
                >
                    {isEditing ? <RotateCcw size={16} /> : <Edit2 size={16} />}
                    {isEditing ? 'Cancelar Edicion' : 'Editar Segmentos / Anadir'}
                </button>

                {isEditing && (
                     <button
                        onClick={() => { setIsEditing(false); setIsAdding(null); setStopSearch(''); cancelPicking(); }}
                        className="px-6 py-3 rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                        <Save size={16} />
                        Guardar
                    </button>
                )}
            </div>

            {/* Segments List */}
            <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar relative bg-white/20">
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20 animate-pulse text-slate-400">
                        <div className="w-10 h-10 rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-primary animate-spin mb-4" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Compilando Red Cartografica...</span>
                    </div>
                )}

                {/* Prepend Area */}
                {isEditing && !loading && (
                    <div className="mb-6">
                        {isAdding === 'prepend' ? (
                            renderAddPanel()
                        ) : (
                            <button
                                onClick={() => handleStartAdding('prepend')}
                                className="w-full py-4 border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center gap-1 transition-all border-slate-200 dark:border-slate-800 text-slate-400 hover:border-primary hover:text-primary hover:bg-primary/5"
                            >
                                <Plus size={18} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">
                                    {pathStops.length === 0 ? 'Seleccionar Parada de Inicio' : 'Anteponer Segmento'}
                                </span>
                            </button>
                        )}
                    </div>
                )}

                {!loading && routeSegments.length === 0 && !isEditing && (
                    <div className="flex flex-col items-center justify-center py-20 text-center px-10">
                        <div className="p-6 bg-slate-100 dark:bg-slate-800 rounded-full mb-6 text-slate-300">
                             <AlertCircle size={48} strokeWidth={1.5} />
                        </div>
                        <h3 className="font-display font-bold text-slate-900 dark:text-white mb-2">Ruta sin segmentos vinculados</h3>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">Haz click en "Editar Segmentos" para construir el recorrido seleccionando paradas.</p>
                    </div>
                )}

                <div className="space-y-4 relative">
                    {/* Visual Connector Line */}
                    {routeSegments.length > 1 && (
                        <div className="absolute left-[19px] top-6 bottom-6 w-[2px] bg-gradient-to-b from-primary via-slate-200 to-primary dark:via-slate-800 pointer-events-none opacity-30" />
                    )}

                    {routeSegments.map((item, index) => {
                        const canDelete = index === 0 || index === routeSegments.length - 1;

                        return (
                            <div key={item.segment.segment_id} className="relative pl-10 group animate-in fade-in slide-in-from-left-4" style={{ animationDelay: `${index * 50}ms` }}>
                                <div className="absolute left-0 top-[18px] w-10 flex justify-center z-10">
                                     <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border-2 border-primary shadow-lg flex items-center justify-center font-mono text-[10px] font-bold text-primary">
                                        {index + 1}
                                     </div>
                                </div>

                                <div className="bg-white dark:bg-slate-800/40 border utilitarian-border rounded-2xl p-5 hover:bg-slate-50/50 dark:hover:bg-primary/5 transition-all group/card">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Segmento Vial</span>
                                                <ChevronRight size={10} className="text-slate-300" />
                                            </div>
                                            <h4 className="font-bold text-slate-900 dark:text-slate-200 text-sm leading-tight">
                                                {item.startStop?.stop_name} <span className="text-slate-300 dark:text-slate-600 font-medium px-1">&rarr;</span> {item.endStop?.stop_name}
                                            </h4>
                                        </div>
                                        {isEditing && (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => canDelete ? handleRemoveSegment(index) : alert("No se pueden eliminar segmentos intermedios para mantener la continuidad.")}
                                                    className={clsx(
                                                        "p-2 rounded-lg transition-all",
                                                        canDelete
                                                            ? "text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            : "text-slate-100 dark:text-slate-800 cursor-not-allowed"
                                                    )}
                                                    title={canDelete ? "Eliminar" : "Bloqueado: Requerido para continuidad"}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-lg bg-primary/5 text-primary">
                                                <Clock size={12} strokeWidth={2.5} />
                                            </div>
                                            <div>
                                                <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Acumulado</span>
                                                <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">{formatTime(item.accumulatedTime)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-lg bg-indigo-500/5 text-indigo-500">
                                                <Ruler size={12} strokeWidth={2.5} />
                                            </div>
                                            <div>
                                                <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Recorrido</span>
                                                <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">{formatDist(item.accumulatedDist)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Append Area */}
                {isEditing && !loading && pathStops.length > 0 && (
                    <div className="mt-6">
                        {isAdding === 'append' ? (
                            renderAddPanel()
                        ) : (
                            <button
                                onClick={() => handleStartAdding('append')}
                                className="w-full py-4 border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center gap-1 transition-all border-slate-200 dark:border-slate-800 text-slate-400 hover:border-primary hover:text-primary hover:bg-primary/5"
                            >
                                <Plus size={18} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Anexar al Final</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Metrics Summary Footer */}
            {routeSegments.length > 0 && (
                <div className="p-8 bg-slate-100/50 dark:bg-slate-900/50 backdrop-blur-md border-t utilitarian-border">
                    <div className="flex items-center justify-between gap-6">
                        <div className="flex-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">Metrica consolidada</span>
                            <div className="flex items-center gap-8">
                                <div>
                                    <div className="text-2xl font-display font-black text-slate-900 dark:text-white leading-none mb-1">
                                        {formatDist(routeSegments[routeSegments.length - 1].accumulatedDist)}
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Longitud de Recorrido</span>
                                </div>
                                <div className="text-right flex-1">
                                    {isEditing ? (
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex items-center gap-3">
                                                <div className="relative group">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={targetDuration || Math.round(routeSegments[routeSegments.length - 1].accumulatedTime / 60)}
                                                        onChange={(e) => handleTimeChange(parseInt(e.target.value) || 0)}
                                                        className="w-20 px-3 py-1 text-right text-lg font-black text-primary border-b-2 border-primary/20 bg-transparent focus:outline-none focus:border-primary transition-all rounded-t-lg"
                                                    />
                                                    <div className="absolute top-1/2 -right-6 -translate-y-1/2 text-[10px] font-black text-primary">MIN</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                <Activity size={10} className="mr-1" /> Vel:
                                                <input
                                                    type="number"
                                                    min="1"
                                                    step="0.1"
                                                    value={targetSpeed || (routeSegments[routeSegments.length - 1].accumulatedDist / 1000 / (routeSegments[routeSegments.length - 1].accumulatedTime / 3600)).toFixed(1)}
                                                    onChange={(e) => handleSpeedChange(parseFloat(e.target.value) || 0)}
                                                    className="w-10 text-center font-black text-primary bg-transparent focus:outline-none border-b border-transparent focus:border-primary"
                                                />
                                                km/h
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="text-2xl font-display font-black text-primary leading-none mb-1">
                                                {formatTime(routeSegments[routeSegments.length - 1].accumulatedTime)}
                                            </div>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Tiempo de Viaje Estimado</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Global Links */}
            <div className="p-4 grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-900 border-t utilitarian-border">
                <button
                    onClick={onOpenTrips}
                    className="flex flex-col items-center justify-center gap-2 py-3 bg-white dark:bg-slate-800 rounded-2xl border utilitarian-border hover:border-primary/50 transition-all group"
                >
                    <div className="shrink-0 p-2 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all">
                        <Bus size={14} strokeWidth={2.5} />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-primary transition-all">Viajes</span>
                </button>
                <button
                    onClick={() => setShowTimeSlots(true)}
                    className="flex flex-col items-center justify-center gap-2 py-3 bg-white dark:bg-slate-800 rounded-2xl border utilitarian-border hover:border-primary/50 transition-all group"
                >
                    <div className="shrink-0 p-2 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all">
                        <Clock size={14} strokeWidth={2.5} />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-primary transition-all">Horarios</span>
                </button>
                <button
                    onClick={onOpenCalendar}
                    className="flex flex-col items-center justify-center gap-2 py-3 bg-white dark:bg-slate-800 rounded-2xl border utilitarian-border hover:border-primary/50 transition-all group"
                >
                    <div className="shrink-0 p-2 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all">
                        <Calendar size={14} strokeWidth={2.5} />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-primary transition-all">Calendario</span>
                </button>
            </div>

            {showTimeSlots && (
                <TimeSlotsManager
                    route={route}
                    onClose={() => setShowTimeSlots(false)}
                />
            )}
        </Draggable>
    );
};

export default RouteDetailsPanel;
