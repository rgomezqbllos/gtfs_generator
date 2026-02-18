import * as React from 'react';
import type { Route, Stop, Segment } from '../types';
import { ArrowLeft, Clock, Ruler, Calendar, Bus, Trash2, Edit2, AlertCircle, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import Draggable from './UI/Draggable';
import { useEditor } from '../context/EditorContext';

import { API_URL } from '../config';
import TimeSlotsManager from './TimeSlotsManager';

interface RouteDetailsPanelProps {
    route: Route;
    onClose: () => void;
    onBack?: () => void; // Optional if opened directly
    onOpenTrips?: () => void;
    onOpenCalendar?: () => void;
    mapBounds?: { _ne: { lng: number, lat: number }, _sw: { lng: number, lat: number } } | null;
}

interface ProcessedSegment {
    segment: Segment;
    startStop: Stop | undefined;
    endStop: Stop | undefined;
    accumulatedDist: number;
    accumulatedTime: number;
}

const RouteDetailsPanel: React.FC<RouteDetailsPanelProps> = ({ route, onClose, onBack, onOpenTrips, onOpenCalendar, mapBounds }) => {
    const { startPicking, cancelPicking } = useEditor();
    const [activeTab, setActiveTab] = React.useState<0 | 1>(0);
    const [pathStops, setPathStops] = React.useState<string[]>([]);
    const [stops, setStops] = React.useState<Stop[]>([]);
    const [allSegments, setAllSegments] = React.useState<Segment[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isEditing, setIsEditing] = React.useState(false);
    const [showTimeSlots, setShowTimeSlots] = React.useState(false); // New State

    // Add Segment State
    const [isAdding, setIsAdding] = React.useState<'prepend' | 'append' | null>(null);

    // Time Management State
    const [targetDuration, setTargetDuration] = React.useState<number | null>(null); // in minutes
    const [targetSpeed, setTargetSpeed] = React.useState<number | null>(null); // in km/h

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

    // Available segments to add based on current context
    const availableSegments = React.useMemo(() => {
        if (!isAdding) return [];

        // Filter out empty segments for route creation
        const revenueSegments = allSegments.filter(s => s.type !== 'empty');

        if (routeSegments.length === 0) {
            // If empty, prioritize segments within map bounds!
            let candidates = revenueSegments;

            if (mapBounds) {
                const { _ne, _sw } = mapBounds;
                candidates = candidates.filter(seg => {
                    const start = stops.find(s => s.stop_id === seg.start_node_id);
                    if (!start) return false;

                    return (
                        start.stop_lat <= _ne.lat &&
                        start.stop_lat >= _sw.lat &&
                        start.stop_lon <= _ne.lng &&
                        start.stop_lon >= _sw.lng
                    );
                });
            }
            // If filtering results in 0, fallback to all (or keep 0 to properly "no segments found in view")
            // Better to show "No segments in view" than all million of them.

            return candidates.map(seg => {
                const start = stops.find(s => s.stop_id === seg.start_node_id);
                const end = stops.find(s => s.stop_id === seg.end_node_id);
                return { ...seg, startName: start?.stop_name, endName: end?.stop_name };
            });
        }

        if (isAdding === 'prepend') {
            const firstStopId = pathStops[0];
            return revenueSegments
                .filter(s => s.end_node_id === firstStopId)
                .map(seg => {
                    const start = stops.find(s => s.stop_id === seg.start_node_id);
                    const end = stops.find(s => s.stop_id === seg.end_node_id);
                    return { ...seg, startName: start?.stop_name, endName: end?.stop_name };
                });
        } else {
            const lastStopId = pathStops[pathStops.length - 1];
            return revenueSegments
                .filter(s => s.start_node_id === lastStopId)
                .map(seg => {
                    const start = stops.find(s => s.stop_id === seg.start_node_id);
                    const end = stops.find(s => s.stop_id === seg.end_node_id);
                    return { ...seg, startName: start?.stop_name, endName: end?.stop_name };
                });
        }
    }, [isAdding, routeSegments, pathStops, allSegments, stops, mapBounds]);

    // Toggle Adding Mode (List vs Map)
    const handleStartAdding = (type: 'prepend' | 'append') => {
        if (isAdding === type) {
            setIsAdding(null);
            cancelPicking();
            return;
        }

        setIsAdding(type);

        // Start Map Picking
        startPicking('segment', (segmentId) => {
            const seg = allSegments.find(s => s.segment_id === segmentId);
            if (!seg) return;

            if (seg.type === 'empty') {
                alert("Cannot add empty segments to a route.");
                return;
            }

            // Validate Continuity
            let isValid = false;
            if (routeSegments.length === 0) {
                isValid = true;
            } else if (type === 'prepend') {
                // Prepend: Segment End must match Path Start
                const firstStopId = pathStops[0];
                if (seg.end_node_id === firstStopId) isValid = true;
            } else {
                // Append: Segment Start must match Path End
                const lastStopId = pathStops[pathStops.length - 1];
                if (seg.start_node_id === lastStopId) isValid = true;
            }

            if (isValid) {
                handleSelectSegment(seg);
                // Picking automatically cancels after selection usually, but we handle logic
            } else {
                alert("Invalid segment: Does not connect to the route endpoint.");
            }
        });
    };

    // Cleanup picking on unmount or close
    React.useEffect(() => {
        return () => cancelPicking();
    }, []);

    const handleSavePath = async (newStopIds: string[], updatedSegments: Segment[] = []) => {
        try {
            // Save Path
            const res = await fetch(`${API_URL}/routes/${route.route_id}/path`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    direction_id: activeTab,
                    ordered_stop_ids: newStopIds
                })
            });

            if (!res.ok) throw new Error("Failed to update path");

            // Save Updated Segments (if any time redistribution happened)
            if (updatedSegments.length > 0) {
                await Promise.all(updatedSegments.map(seg =>
                    fetch(`${API_URL}/segments/${seg.segment_id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ travel_time: seg.travel_time })
                    })
                ));

                // Update local state to reflect changes
                setAllSegments(prev => prev.map(s => {
                    const updated = updatedSegments.find(u => u.segment_id === s.segment_id);
                    return updated ? updated : s;
                }));
            }

            setPathStops(newStopIds);
            setIsAdding(null);
            cancelPicking(); // Stop picking after save

        } catch (e) {
            console.error(e);
            alert("Error saving path");
        }
    }

    const recalculateSegmentTimes = (segments: Segment[], totalTimeSeconds: number) => {
        const totalDist = segments.reduce((sum, s) => sum + (s.distance || 0), 0);
        if (totalDist === 0) return segments;

        let accumulatedTime = 0;
        return segments.map((s, index) => {
            // For the last segment, assign the remaining time to ensure exact total
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

        // Calculate implied speed
        const currentRouteSegments = routeSegments.map(rs => rs.segment);
        const totalDist = currentRouteSegments.reduce((sum, s) => sum + (s.distance || 0), 0);
        if (totalDist > 0) {
            const speedKmh = (totalDist / 1000) / (newTimeMinutes / 60);
            setTargetSpeed(parseFloat(speedKmh.toFixed(1)));
        }

        const updatedSegments = recalculateSegmentTimes(currentRouteSegments, totalTimeSeconds);
        // Optimistically update local state for preview
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
            // Optimistically update local state for preview
            setAllSegments(prev => prev.map(s => {
                const updated = updatedSegments.find(u => u.segment_id === s.segment_id);
                return updated ? updated : s;
            }));
        }
    };

    // Effect: Enforce target duration when segments change (if set)
    // We only enforce this if the user has explicitly set a target duration/speed
    // preventing drift when adding/removing segments.
    React.useEffect(() => {
        if (targetDuration && routeSegments.length > 0) {
            const currentSegments = routeSegments.map(rs => rs.segment);
            const currentTotalTime = currentSegments.reduce((sum, s) => sum + (s.travel_time || 0), 0);

            // Allow for small rounding differences (1 minute)
            if (Math.abs(currentTotalTime - (targetDuration * 60)) > 60) {
                const updated = recalculateSegmentTimes(currentSegments, targetDuration * 60);
                // We need to be careful not to create an infinite loop here.
                // Only update if actual times are different.
                const hasChanges = updated.some((u, i) => u.travel_time !== currentSegments[i].travel_time);

                if (hasChanges) {
                    setAllSegments(prev => prev.map(s => {
                        const up = updated.find(u => u.segment_id === s.segment_id);
                        return up ? up : s;
                    }));
                }
            }
        }
    }, [routeSegments.length, targetDuration]); // Only trigger on length change (add/remove) or target change


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

        // If we have a target duration, we need to redistribute the SAME total time across FEWER segments?
        // OR does the user want the time to decrease? 
        // The requirement says: "si el usuario añade otro segmento por ejemplo, el tiempo ingresado por el usuario se mantendrá"
        // Implicitly, if they remove one, the time should probably also be maintained if they set a fixed time?
        // However, usually removing a segment shortens the route. 
        // Let's assume "Global Time Lock" behavior: If targetDuration is set, we redistribute that time across remaining segments.
        // If it's NOT set, we just let the time drop.

        let segmentsToUpdate: Segment[] = [];
        if (targetDuration) {
            // We need to calculate what the NEW segments would be
            // routeSegments is current state *before* removal. 
            // We need to simulate the removal from allSegments or routeSegments to calculate redistribution.
            const remainingSegments = routeSegments
                .filter((_, i) => i !== index)
                .map(r => r.segment);

            segmentsToUpdate = recalculateSegmentTimes(remainingSegments, targetDuration * 60);
        }

        handleSavePath(newStopIds, segmentsToUpdate);
    };

    const handleSelectSegment = (seg: Segment) => {
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

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const formatDist = (meters: number) => {
        if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
        return `${Math.round(meters)} m`;
    };

    return (
        <Draggable className="absolute top-10 right-10 w-[500px] bg-white dark:bg-gray-900 shadow-2xl rounded-2xl flex flex-col border border-gray-200 dark:border-gray-800 z-40 max-h-[85vh] animate-in slide-in-from-right-10 duration-300">
            {/* Header */}
            <div className="drag-handle cursor-move bg-gray-50 dark:bg-gray-800/80 p-6 rounded-t-2xl border-b border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs" style={{ backgroundColor: `#${route.route_color}` }}>
                            {route.route_short_name}
                        </span>
                        Route Management
                    </h2>
                    <div className="flex gap-2">
                        {onBack && (
                            <button onClick={onBack} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-white dark:hover:bg-gray-700 transition-colors">
                                <ArrowLeft size={20} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-white dark:hover:bg-gray-700 transition-colors">
                            <span className="text-xl font-bold">×</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Route Name</span>
                        <div className="font-medium text-gray-900 dark:text-gray-200 truncate" title={route.route_long_name}>
                            {route.route_long_name}
                        </div>
                    </div>
                    <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Agency</span>
                        <div className="font-medium text-gray-900 dark:text-gray-200">
                            {route.agency_name || 'N/A'}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-gray-200 dark:bg-gray-700/50 rounded-lg">
                    <button
                        onClick={() => { if (!isEditing) { setActiveTab(0); setIsAdding(null); } }}
                        disabled={isEditing}
                        className={clsx(
                            "flex-1 py-2 text-sm font-bold rounded-md transition-all",
                            activeTab === 0
                                ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200",
                            isEditing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        Sentido Ida
                    </button>
                    <button
                        onClick={() => { if (!isEditing) { setActiveTab(1); setIsAdding(null); } }}
                        disabled={isEditing}
                        className={clsx(
                            "flex-1 py-2 text-sm font-bold rounded-md transition-all",
                            activeTab === 1
                                ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200",
                            isEditing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        Sentido Vuelta
                    </button>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex justify-center">
                <button
                    onClick={() => {
                        if (isEditing) {
                            // Cancel / Discard
                            if (confirm('Discard unsaved changes?')) {
                                setIsEditing(false);
                                setIsAdding(null);
                                fetchData(); // Revert to server state
                            }
                        } else {
                            // Start Editing
                            setIsEditing(true);
                            setIsAdding(null);
                        }
                    }}
                    className={clsx(
                        "w-full py-2.5 rounded-xl border-2 border-dashed font-bold text-sm flex items-center justify-center gap-2 transition-all",
                        isEditing
                            ? "border-red-300 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40"
                            : "border-gray-300 dark:border-gray-700 text-gray-500 hover:border-blue-400 hover:text-blue-500"
                    )}
                >
                    {isEditing ? <Trash2 size={16} /> : <Edit2 size={16} />}
                    {isEditing ? 'Discard Changes' : 'Edit Direction / Add Segment'}
                </button>
            </div>

            {/* Segments List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar relative">
                {loading && (
                    <div className="flex flex-col items-center justify-center py-10 opacity-50">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                        <span className="text-xs">Loading path...</span>
                    </div>
                )}

                {/* Prepend Button */}
                {isEditing && !loading && (
                    <div className="mb-4">
                        <button
                            onClick={() => handleStartAdding('prepend')}
                            className={clsx(
                                "w-full py-2 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase transition-colors",
                                isAdding === 'prepend'
                                    ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20"
                                    : "border-gray-200 dark:border-gray-700 text-gray-400 hover:text-blue-500 hover:border-blue-400"
                            )}
                        >
                            <Plus size={14} /> {isAdding === 'prepend' ? 'Select Prepend Segment on Map' : 'Add Segment to Start'}
                        </button>

                        {isAdding === 'prepend' && (
                            <div className="mt-2 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-inner">
                                <h4 className="text-xs font-bold text-gray-500 mb-2">Select Segment to Prepend</h4>
                                {availableSegments.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No compatible segments found ending at {routeSegments[0]?.startStop?.stop_name}</p>
                                ) : (
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        {availableSegments.map((s: any) => (
                                            <button
                                                key={s.segment_id}
                                                onClick={() => handleSelectSegment(s)}
                                                className="w-full text-left p-2 text-xs bg-white dark:bg-gray-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded border border-gray-100 dark:border-gray-800 hover:border-blue-200 transition-colors"
                                            >
                                                <div className="font-bold">{s.startName} → {s.endName}</div>
                                                <div className="text-gray-400">{formatDist(s.distance)} • {formatTime(s.travel_time)}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {!loading && routeSegments.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                        <AlertCircle className="mx-auto text-gray-300 mb-2" size={32} />
                        <p className="text-gray-500 dark:text-gray-400 font-medium">No segments defined</p>
                        {isEditing ? (
                            <div className="mt-4">
                                <p className="text-xs text-gray-400 mb-2">Add the first segment to start the route:</p>
                                <div className="max-h-60 overflow-y-auto space-y-1 text-left">
                                    {availableSegments.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic p-2">No segments found in current map view. Move the map to see segments.</p>
                                    ) : availableSegments.map((s: any) => (
                                        <button
                                            key={s.segment_id}
                                            onClick={() => handleSelectSegment(s)}
                                            className="w-full text-left p-2 text-xs bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded border border-gray-200 dark:border-gray-700 hover:border-blue-200 transition-colors"
                                        >
                                            <div className="font-bold">{s.startName} → {s.endName}</div>
                                            <div className="text-gray-400">{formatDist(s.distance)} • {formatTime(s.travel_time)}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 mt-1">Select "Edit Direction" to add segments.</p>
                        )}
                    </div>
                )}

                <div className="space-y-4">
                    {routeSegments.map((item, index) => {
                        const canDelete = index === 0 || index === routeSegments.length - 1;

                        return (
                            <div key={item.segment.segment_id} className="relative pl-6 pb-2 border-l-2 border-gray-200 dark:border-gray-700 last:border-0 group">
                                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white dark:border-gray-900 bg-blue-600 shadow-sm z-10"></div>

                                <div className="bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                                            Segment {index + 1}: {item.startStop?.stop_name} to {item.endStop?.stop_name}
                                        </h4>
                                        {isEditing && (
                                            <div className="flex gap-1 ml-2">
                                                <button
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                                    title="Modify Segment"
                                                    onClick={() => alert("Modify Segment functionality would open a segment picker here.")}
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => canDelete ? handleRemoveSegment(index) : alert("Cannot delete intermediate segments")}
                                                    className={clsx(
                                                        "p-1.5 rounded transition-colors",
                                                        canDelete
                                                            ? "text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            : "text-gray-200 dark:text-gray-800 cursor-not-allowed"
                                                    )}
                                                    title={canDelete ? "Delete Segment" : "Must preserve continuity"}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                            <Clock size={14} className="text-blue-500" />
                                            <div>
                                                <span className="block opacity-70 text-[10px] uppercase">Accumulated Time</span>
                                                <span className="font-mono font-medium">{formatTime(item.accumulatedTime)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                            <Ruler size={14} className="text-indigo-500" />
                                            <div>
                                                <span className="block opacity-70 text-[10px] uppercase">Accumulated Dist</span>
                                                <span className="font-mono font-medium">{formatDist(item.accumulatedDist)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Append Button */}
                {isEditing && !loading && routeSegments.length > 0 && (
                    <div className="mt-4">
                        <button
                            onClick={() => handleStartAdding('append')}
                            className={clsx(
                                "w-full py-2 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase transition-colors",
                                isAdding === 'append'
                                    ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20"
                                    : "border-gray-200 dark:border-gray-700 text-gray-400 hover:text-blue-500 hover:border-blue-400"
                            )}
                        >
                            <Plus size={14} /> {isAdding === 'append' ? 'Select Append Segment on Map' : 'Add Segment to End'}
                        </button>

                        {isAdding === 'append' && (
                            <div className="mt-2 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-inner">
                                <h4 className="text-xs font-bold text-gray-500 mb-2">Select Segment to Append</h4>
                                {availableSegments.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No compatible segments found starting at {routeSegments[routeSegments.length - 1]?.endStop?.stop_name}</p>
                                ) : (
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        {availableSegments.map((s: any) => (
                                            <button
                                                key={s.segment_id}
                                                onClick={() => handleSelectSegment(s)}
                                                className="w-full text-left p-2 text-xs bg-white dark:bg-gray-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded border border-gray-100 dark:border-gray-800 hover:border-blue-200 transition-colors"
                                            >
                                                <div className="font-bold">{s.startName} → {s.endName}</div>
                                                <div className="text-gray-400">{formatDist(s.distance)} • {formatTime(s.travel_time)}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Summary Footer */}
            {routeSegments.length > 0 && (
                <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                    <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Summary</h5>
                    <div className="flex justify-between items-end">
                        <div>
                            <span className="text-xs text-gray-500">Total Distance</span>
                            <div className="text-lg font-bold text-gray-900 dark:text-white">
                                {formatDist(routeSegments[routeSegments.length - 1].accumulatedDist)}
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-gray-500">Total Travel Time</span>
                            <div className="flex items-center justify-end gap-2">
                                {isEditing ? (
                                    <>
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={targetDuration || Math.round(routeSegments[routeSegments.length - 1].accumulatedTime / 60)}
                                                    onChange={(e) => handleTimeChange(parseInt(e.target.value) || 0)}
                                                    className="w-16 px-1 py-0.5 text-right text-sm font-bold border-b border-gray-300 dark:border-gray-600 bg-transparent focus:outline-none focus:border-blue-500"
                                                />
                                                <span className="text-xs font-medium text-gray-500">min</span>
                                            </div>
                                            <div className="flex items-center gap-1 mt-1">
                                                <span className="text-[10px] text-gray-400">Avg Speed:</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    step="0.1"
                                                    value={targetSpeed || (routeSegments[routeSegments.length - 1].accumulatedDist / 1000 / (routeSegments[routeSegments.length - 1].accumulatedTime / 3600)).toFixed(1)}
                                                    onChange={(e) => handleSpeedChange(parseFloat(e.target.value) || 0)}
                                                    className="w-12 px-1 py-0 text-right text-xs border-b border-gray-200 dark:border-gray-700 bg-transparent focus:outline-none focus:border-blue-500 text-gray-500"
                                                />
                                                <span className="text-[10px] text-gray-400">km/h</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                                        {formatTime(routeSegments[routeSegments.length - 1].accumulatedTime)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Links */}
            <div className="p-4 grid grid-cols-2 gap-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 rounded-b-2xl">
                <button
                    onClick={onOpenTrips}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold uppercase transition-colors"
                >
                    <Bus size={16} />
                    Go to Trips
                </button>
                <button
                    onClick={() => setShowTimeSlots(true)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold uppercase transition-colors"
                >
                    <Clock size={16} />
                    Go to Times
                </button>
                <button
                    onClick={onOpenCalendar}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold uppercase transition-colors col-span-2"
                >
                    <Calendar size={16} />
                    Go to Calendar
                </button>
            </div>

            {showTimeSlots && (
                <TimeSlotsManager
                    route={route}
                    onClose={() => setShowTimeSlots(false)}
                />
            )}

            {isEditing && (
                <div className="absolute bottom-4 left-4 right-4 animate-in slide-in-from-bottom-2 fade-in">
                    <button
                        onClick={async () => {
                            // If we have pending segment updates (from time redistribution), we need to save them.
                            // The easiest way is to trigger a "self-save" of the current segments.

                            const currentSegments = routeSegments.map(r => r.segment);
                            // We verify if any segment needs updating by checking against original state if we had it,
                            // but simpler is to just save all current segments if targetDuration is set.
                            if (targetDuration) {
                                await Promise.all(currentSegments.map(seg =>
                                    fetch(`${API_URL}/segments/${seg.segment_id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ travel_time: seg.travel_time })
                                    })
                                ));
                            }

                            setIsEditing(false);
                            setTargetDuration(null);
                            setTargetSpeed(null);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-all"
                    >
                        Save Changes
                    </button>
                </div>
            )}
        </Draggable>
    );
};

export default RouteDetailsPanel;
