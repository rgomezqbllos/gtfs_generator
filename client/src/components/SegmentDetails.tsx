import * as React from 'react';
import type { Segment, Stop } from '../types';
import { Trash2, ArrowRightLeft, Clock, Ruler } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import Draggable from './UI/Draggable';

interface SegmentDetailsProps {
    segment: Segment;
    stops: Stop[];
    onClose: () => void;
    onDelete: (segmentId: string) => Promise<void>;
    onUpdate: (updatedSegment: Segment) => void;
}

const SegmentDetails: React.FC<SegmentDetailsProps> = ({ segment, stops, onClose, onDelete, onUpdate }) => {
    // Local state for form inputs
    // Distance stored in meters, Time stored in seconds
    // Input for time will be in Minutes for UX
    const [distance, setDistance] = React.useState<number | ''>(segment.distance || 0);
    const [timeMinutes, setTimeMinutes] = React.useState<number | ''>(
        segment.travel_time ? Number((segment.travel_time / 60).toFixed(2)) : 0
    );

    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);

    React.useEffect(() => {
        setDistance(segment.distance || 0);
        setTimeMinutes(segment.travel_time ? Number((segment.travel_time / 60).toFixed(2)) : 0);
    }, [segment]);

    const startStopName = React.useMemo(() =>
        stops.find(s => s.stop_id === segment.start_node_id)?.stop_name || 'Unknown Start',
        [segment.start_node_id, stops]);

    const endStopName = React.useMemo(() =>
        stops.find(s => s.stop_id === segment.end_node_id)?.stop_name || 'Unknown End',
        [segment.end_node_id, stops]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const finalDistance = Number(distance);
            const finalTimeSeconds = Number(timeMinutes) * 60;

            const res = await fetch(`http://localhost:3000/api/segments/${segment.segment_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance: finalDistance,
                    travel_time: finalTimeSeconds,
                    allowed_transport_modes: segment.allowed_transport_modes // Preserve existing
                })
            });

            if (res.ok) {
                const updatedData = {
                    ...segment,
                    distance: finalDistance,
                    travel_time: finalTimeSeconds
                };
                onUpdate(updatedData);
                onClose(); // Close modal on successful save
            } else {
                alert('Failed to update segment');
            }
        } catch (err) {
            console.error(err);
            alert('Network error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClick = () => {
        setConfirmOpen(true);
        setErrorMsg(null);
    };

    const handleConfirmDelete = async () => {
        try {
            await onDelete(segment.segment_id);
            setConfirmOpen(false);
            onClose();
        } catch (err) {
            console.error('Delete failed:', err);
            setErrorMsg((err as Error).message || 'Failed to delete segment');
        }
    };

    return (
        <>
            {/* Modal Container - Centered or Fixed Position */}
            <Draggable className="absolute top-20 right-80 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-40 flex flex-col border border-slate-100 dark:border-gray-700 animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="drag-handle cursor-move p-5 border-b border-slate-100 dark:border-gray-700 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <ArrowRightLeft size={18} />
                        </div>
                        <h3 className="font-bold text-slate-800 dark:text-white">Segment Details</h3>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">

                    {/* Connection Info */}
                    <div className="bg-slate-50 dark:bg-gray-700/50 p-3 rounded-xl border border-slate-100 dark:border-gray-700 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider">
                            <span>Start</span>
                            <span>End</span>
                        </div>
                        <div className="flex items-center justify-between font-medium text-slate-700 dark:text-gray-200 text-sm">
                            <span className="truncate max-w-[45%] text-left" title={startStopName}>
                                {startStopName}
                            </span>
                            <ArrowRightLeft size={14} className="text-slate-400" />
                            <span className="truncate max-w-[45%] text-right" title={endStopName}>
                                {endStopName}
                            </span>
                        </div>
                    </div>

                    {/* Input Group: Distance */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-2">Distance</label>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <Ruler size={16} />
                            </div>
                            <input
                                type="number"
                                step="any"
                                className="w-full pl-10 pr-16 py-3 border border-slate-200 dark:border-gray-700 rounded-xl text-slate-700 dark:text-gray-200 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-medium"
                                value={distance}
                                onChange={e => setDistance(e.target.value === '' ? '' : Number(e.target.value))}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">METERS</span>
                        </div>
                    </div>

                    {/* Input Group: Travel Time */}
                    <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-2">Travel Time</label>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <Clock size={16} />
                            </div>
                            <input
                                type="number"
                                step="any"
                                className="w-full pl-10 pr-16 py-3 border border-slate-200 dark:border-gray-700 rounded-xl text-slate-700 dark:text-gray-200 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-medium"
                                value={timeMinutes}
                                onChange={e => setTimeMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">MIN</span>
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="p-5 border-t border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50 rounded-b-2xl flex items-center gap-3">
                    <button
                        onClick={handleDeleteClick}
                        className="h-11 w-11 flex items-center justify-center rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        title="Delete Segment"
                    >
                        <Trash2 size={18} />
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 h-11 bg-[#1337ec] hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        {isSaving ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>Save Changes</>
                        )}
                    </button>

                    <button
                        onClick={onClose}
                        className="h-11 px-4 flex items-center justify-center rounded-xl border border-transparent text-slate-500 hover:bg-slate-200 dark:hover:bg-gray-700 transition-all"
                    >
                        Cancel
                    </button>
                </div>

            </Draggable>

            <ConfirmModal
                isOpen={confirmOpen}
                title={errorMsg ? "Cannot Delete Segment" : "Delete Segment?"}
                message={errorMsg || "Are you sure you want to delete this segment? Routes using this segment may be affected."}
                onConfirm={handleConfirmDelete}
                onCancel={() => {
                    setConfirmOpen(false);
                    setErrorMsg(null);
                }}
                isError={!!errorMsg}
            />
        </>
    );
};

export default SegmentDetails;
