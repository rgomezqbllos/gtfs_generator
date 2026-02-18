import React, { useState, useEffect } from 'react';
import { X, Clock, ArrowRight, MoreHorizontal, Bus } from 'lucide-react';
import { API_URL } from '../config';
import type { Route, Segment, Stop } from '../types';
import TimeSlotEditorModal from './TimeSlotEditorModal';
import { clsx } from 'clsx';

interface TimeSlotsManagerProps {
    route: Route;
    onClose: () => void;
}

const TimeSlotsManager: React.FC<TimeSlotsManagerProps> = ({ route, onClose }) => {
    const [direction, setDirection] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [segments, setSegments] = useState<(Segment & { startName?: string, endName?: string, slots?: any[] })[]>([]);
    const [stops, setStops] = useState<Stop[]>([]);

    const [selectedSegment, setSelectedSegment] = useState<(Segment & { startName?: string, endName?: string }) | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    useEffect(() => {
        fetchData();
    }, [route.route_id, direction, isEditorOpen]); // Refetch when editor closes to update visuals

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Path order
            const pathRes = await fetch(`${API_URL}/routes/${route.route_id}/path?direction_id=${direction}`);
            const pathData = await pathRes.json();
            const stopIds: string[] = pathData.ordered_stop_ids || [];

            if (stopIds.length < 2) {
                setSegments([]);
                return;
            }

            // 2. Fetch all stops to resolve names
            const stopsRes = await fetch(`${API_URL}/stops`);
            const allStops: Stop[] = await stopsRes.json();
            setStops(allStops);

            // 3. Fetch all segments
            const segmentsRes = await fetch(`${API_URL}/segments`);
            const allSegments: Segment[] = await segmentsRes.json();

            // 4. Build ordered segments list
            const orderedSegments: (Segment & { startName?: string, endName?: string, slots?: any[] })[] = [];

            for (let i = 0; i < stopIds.length - 1; i++) {
                const startId = stopIds[i];
                const endId = stopIds[i + 1];
                const seg = allSegments.find(s => s.start_node_id === startId && s.end_node_id === endId);

                if (seg) {
                    // Fetch slots for this segment (n+1 but okay for this view)
                    let slots = [];
                    try {
                        const slotsRes = await fetch(`${API_URL}/segments/${seg.segment_id}/slots`);
                        slots = await slotsRes.json();
                    } catch (e) { }

                    const startStop = allStops.find(s => s.stop_id === startId);
                    const endStop = allStops.find(s => s.stop_id === endId);

                    orderedSegments.push({
                        ...seg,
                        startName: startStop?.stop_name || startId,
                        endName: endStop?.stop_name || endId,
                        slots: Array.isArray(slots) ? slots : []
                    });
                }
            }
            setSegments(orderedSegments);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const renderTimeline = () => {
        return (
            <div className="relative pl-8 border-l-2 border-gray-200 dark:border-gray-700 ml-4 space-y-8 py-4">
                {segments.map((seg, idx) => {
                    const hasSlots = seg.slots && seg.slots.length > 0;
                    return (
                        <div key={seg.segment_id} className="relative group">
                            {/* Dot for Start Stop */}
                            <div className="absolute -left-[41px] top-0 flex items-center">
                                <div className="w-6 h-6 rounded-full bg-white border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center z-10 text-[10px] font-bold text-gray-500">
                                    {idx + 1}
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-2 opacity-100">
                                    <div>
                                        <div className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200">
                                            <span>{seg.startName}</span>
                                            <ArrowRight size={14} className="text-gray-400" />
                                            <span>{seg.endName}</span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                            <span className="flex items-center gap-1"><Clock size={12} /> Base: {Math.round((seg.travel_time || 0) / 60)} min</span>
                                            <span className="flex items-center gap-1"><Bus size={12} /> {Math.round(seg.distance || 0)}m</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedSegment(seg); setIsEditorOpen(true); }}
                                        className={clsx(
                                            "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1",
                                            hasSlots
                                                ? "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300"
                                                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                                        )}
                                    >
                                        <Clock size={14} />
                                        {hasSlots ? `${seg.slots?.length} Slots` : 'Add Slots'}
                                    </button>
                                </div>

                                {/* Preview Slots */}
                                {hasSlots && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {seg.slots!.slice(0, 3).map((slot: any) => (
                                            <span key={slot.id} className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded font-mono">
                                                {slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)} ({Math.round(slot.travel_time / 60)}m)
                                            </span>
                                        ))}
                                        {seg.slots!.length > 3 && (
                                            <span className="text-[10px] text-gray-400 flex items-center">+{seg.slots!.length - 3} more</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center bg-gray-50 dark:bg-gray-800 transition-colors">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <X size={24} className="text-gray-600 dark:text-gray-300" />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Clock className="text-blue-600" />
                            Segment Time Manager
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage time slots for variable travel times.</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setDirection(0)}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                direction === 0 ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-600 dark:text-gray-400"
                            )}
                        >
                            Outbound (0)
                        </button>
                        <button
                            onClick={() => setDirection(1)}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                direction === 1 ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-600 dark:text-blue-300"
                            )}
                        >
                            Inbound (1)
                        </button>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto bg-gray-50/50 dark:bg-gray-900/50 p-6 custom-scrollbar">
                {loading ? (
                    <div className="flex justify-center items-center h-64 text-gray-400">Loading segments...</div>
                ) : segments.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">No segments found for this route/direction.</div>
                ) : (
                    renderTimeline()
                )}
            </div>

            {/* Editor Modal */}
            {selectedSegment && (
                <TimeSlotEditorModal
                    isOpen={isEditorOpen}
                    onClose={() => { setIsEditorOpen(false); setSelectedSegment(null); }}
                    segment={selectedSegment}
                />
            )}
        </div>
    );
};

export default TimeSlotsManager;
