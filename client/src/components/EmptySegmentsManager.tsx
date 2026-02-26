import * as React from 'react';
import { useEditor } from '../context/EditorContext';
import { Plus, ArrowRight, Clock, Ruler, GripHorizontal, Download, Wand2, X } from 'lucide-react';
import type { Segment, Stop } from '../types';
import { clsx } from 'clsx';
import { API_URL } from '../config';

interface EmptySegmentsManagerProps {
    onClose: () => void;
    segments: Segment[];
    stops: Stop[];
    routesStructure: any[];
    onRefresh: () => void;
}

const EmptySegmentsManager: React.FC<EmptySegmentsManagerProps> = ({ onClose, segments, stops, routesStructure, onRefresh }) => {
    const { mode, setMode, selectElement } = useEditor();
    const [isAdding, setIsAdding] = React.useState(false);
    const [isGenerating, setIsGenerating] = React.useState(false);

    React.useEffect(() => {
        if (mode === 'idle' && isAdding) {
            setIsAdding(false);
        }
    }, [mode, isAdding]);

    const handleAddClick = () => {
        setMode('add_empty_segment');
        setIsAdding(true);
    };

    const handleSegmentClick = (segment: Segment) => {
        selectElement('segment', segment.segment_id);
    };

    const getStopName = (id: string) => stops.find(s => s.stop_id === id)?.stop_name || id;

    const handleAutoConnect = async () => {
        if (!confirm("This will automatically create empty segments (deadheads) connecting:\n1. Route terminals (A->B, B->A)\n2. Route terminals to associated Parkings (if any)\n\nContinue?")) return;

        setIsGenerating(true);
        try {
            const newSegments: { start: string, end: string }[] = [];

            // 1. Identify required connections from Route Structure
            routesStructure.forEach(route => {
                const parkings = route.parkings || [];

                route.directions.forEach((dir: any) => {
                    if (dir.stops && dir.stops.length >= 2) {
                        const firstStopId = dir.stops[0].stop_id;
                        const lastStopId = dir.stops[dir.stops.length - 1].stop_id;

                        // Standard Return Trip (A->B, B->A)
                        if (firstStopId !== lastStopId) {
                            newSegments.push({ start: firstStopId, end: lastStopId });
                            newSegments.push({ start: lastStopId, end: firstStopId });
                        }

                        // Parking Connections
                        // Connect Start/End to/from each parking
                        parkings.forEach((parkingId: string) => {
                            if (parkingId !== firstStopId) {
                                // Start <-> Parking
                                newSegments.push({ start: firstStopId, end: parkingId });
                                newSegments.push({ start: parkingId, end: firstStopId });
                            }

                            if (parkingId !== lastStopId && firstStopId !== lastStopId) {
                                // End <-> Parking
                                newSegments.push({ start: lastStopId, end: parkingId });
                                newSegments.push({ start: parkingId, end: lastStopId });
                            }
                        });
                    }
                });
            });

            // 2. Filter out existing segments (empty OR revenue)
            const uniqueSegments = new Set<string>();
            const segmentsToCreate: { start: string, end: string }[] = [];

            // Existing signatures (we verify against IDs)
            // Note: We only have access to 'segments' prop which usually contains ALL segments if passed correctly 
            // or filtered. In MapEditor, we passed `segments.filter(s => s.type === 'empty')`.
            // So we might duplicate if a REVENUE segment exists.
            // Ideally we should check against ALL segments, but to be safe and simple, 
            // duplicates of revenue segments as empty segments might be acceptable (different purpose).
            // However, to avoid spam, let's at least check against known empty segments.

            const existingSig = new Set(segments.map(s => `${s.start_node_id}-${s.end_node_id}`));

            newSegments.forEach(pair => {
                const sig = `${pair.start}-${pair.end}`;
                if (existingSig.has(sig)) return;
                if (uniqueSegments.has(sig)) return;
                uniqueSegments.add(sig);
                segmentsToCreate.push(pair);
            });

            if (segmentsToCreate.length === 0) {
                alert(`No new connections needed. Debug: newSegments=${newSegments.length}, unique=${uniqueSegments.size}, existing=${existingSig.size}, totalRoutes=${routesStructure.length}`);
                return;
            }

            // 3. Create them
            let createdCount = 0;
            let failedCount = 0;

            for (const pair of segmentsToCreate) {
                try {
                    const res = await fetch(`${API_URL}/segments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            start_node_id: pair.start,
                            end_node_id: pair.end,
                            type: 'empty'
                        })
                    });

                    if (res.ok) {
                        createdCount++;
                    } else {
                        failedCount++;
                        console.error(`Failed to create segment ${pair.start} -> ${pair.end}`, await res.text());
                    }
                } catch (e) {
                    failedCount++;
                    console.error(`Network error creating segment ${pair.start} -> ${pair.end}`, e);
                }
            }

            onRefresh();
            if (failedCount > 0) {
                alert(`Created ${createdCount} empty segments, but ${failedCount} failed. Check console for details.`);
            } else {
                alert(`Successfully created ${createdCount} empty segments.`);
            }

        } catch (err) {
            console.error(err);
            alert("Failed to generate segments due to an unexpected error.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleExportCSV = () => {
        if (segments.length === 0) return;

        const headers = ['Departure', 'Destination', 'Distance', 'Slot start time', 'Slot end time', 'Time'];
        const rows = segments.map(seg => {
            const timeStr = seg.travel_time
                ? new Date(seg.travel_time * 1000).toISOString().substr(11, 8)
                : '00:00:00';

            const startStop = stops.find(s => s.stop_id === seg.start_node_id);
            const endStop = stops.find(s => s.stop_id === seg.end_node_id);
            const distanceKm = seg.distance ? (seg.distance / 1000).toFixed(3) : '0';

            return [
                startStop?.stop_code || seg.start_node_id,
                endStop?.stop_code || seg.end_node_id,
                distanceKm,
                '00:00',
                '36:00',
                timeStr
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'empty_segments.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="absolute left-20 top-0 h-full w-96 bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col border-r border-gray-200 dark:border-gray-800 animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <GripHorizontal className="text-indigo-500" />
                        Empty Segments
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Manage non-revenue connections
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExportCSV}
                        title="Export CSV"
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-blue-600 transition-colors"
                    >
                        <Download size={20} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        type="button"
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors hover:text-red-500"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col gap-3">
                <button
                    onClick={handleAutoConnect}
                    disabled={isGenerating}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-semibold transition-all shadow-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                >
                    {isGenerating ? (
                        <>Generating...</>
                    ) : (
                        <>
                            <Wand2 size={18} />
                            Auto Connect Routes
                        </>
                    )}
                </button>

                <button
                    onClick={handleAddClick}
                    className={clsx(
                        "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all shadow-lg active:scale-95",
                        mode === 'add_empty_segment'
                            ? "bg-indigo-100 text-indigo-700 border-2 border-indigo-500 animate-pulse"
                            : "bg-[#1337ec] text-white hover:bg-blue-700 shadow-blue-500/30"
                    )}
                >
                    {mode === 'add_empty_segment' ? (
                        <>Select Start & End Stops...</>
                    ) : (
                        <>
                            <Plus size={18} />
                            Add Empty Connection
                        </>
                    )}
                </button>
                {mode === 'add_empty_segment' && (
                    <p className="text-xs text-center mt-1 text-indigo-600 dark:text-indigo-400 font-medium">
                        Click two stops on map to connect
                    </p>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {segments.length === 0 ? (
                    <div className="text-center p-8 text-gray-400">
                        <GripHorizontal size={48} className="mx-auto mb-3 opacity-20" />
                        <p>No empty segments found</p>
                    </div>
                ) : (
                    segments.map(seg => (
                        <div
                            key={seg.segment_id}
                            onClick={() => handleSegmentClick(seg)}
                            className="group p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-indigo-500 dark:hover:border-indigo-500 bg-white dark:bg-gray-800/50 cursor-pointer transition-all hover:shadow-md"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                    <span className="truncate max-w-[120px]" title={getStopName(seg.start_node_id)}>
                                        {getStopName(seg.start_node_id)}
                                    </span>
                                    <ArrowRight size={14} className="text-gray-400" />
                                    <span className="truncate max-w-[120px]" title={getStopName(seg.end_node_id)}>
                                        {getStopName(seg.end_node_id)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                    <Ruler size={12} />
                                    <span>{seg.distance?.toFixed(0)}m</span>
                                </div>
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                    <Clock size={12} />
                                    <span>
                                        {seg.travel_time ? new Date(seg.travel_time * 1000).toISOString().substr(11, 8) : '00:00:00'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default EmptySegmentsManager;
