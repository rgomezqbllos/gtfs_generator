import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Clock, AlertCircle, ArrowRight } from 'lucide-react';
import { API_URL } from '../config';
import { clsx } from 'clsx';
import type { Segment } from '../types';

interface TimeSlot {
    id: string;
    segment_id: string;
    start_time: string;
    end_time: string;
    travel_time: number; // in seconds
}

interface TimeSlotEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    segment: (Segment & { startName?: string; endName?: string }) | null;
}

// Helper to format loose time input (HHMM, HMM, HHMMSS) to HH:MM:SS
// Supports times up to 36:00:00
const formatTimeInput = (val: string): string | null => {
    // Remove all non-digits
    const clean = val.replace(/\D/g, '');

    // Empty
    if (!clean) return null;

    let hh = 0, mm = 0, ss = 0;

    if (clean.length <= 2) {
        // e.g. "8" -> 08:00:00, "14" -> 14:00:00
        hh = parseInt(clean, 10);
    } else if (clean.length === 3) {
        // e.g. "830" -> 08:30:00
        hh = parseInt(clean.substring(0, 1), 10);
        mm = parseInt(clean.substring(1), 10);
    } else if (clean.length === 4) {
        // e.g. "1430" -> 14:30:00
        hh = parseInt(clean.substring(0, 2), 10);
        mm = parseInt(clean.substring(2), 10);
    } else if (clean.length >= 5) {
        // e.g. "143000" -> 14:30:00
        hh = parseInt(clean.substring(0, 2), 10);
        mm = parseInt(clean.substring(2, 4), 10);
        ss = parseInt(clean.substring(4, 6), 10);
    }

    // Validation Caps
    if (hh > 36) hh = 36;
    if (mm > 59) mm = 59;
    if (ss > 59) ss = 59;

    // Pad
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
};

// Convert HH:MM:SS to seconds
const timeToSeconds = (timeStr: string): number => {
    const [h, m, s] = timeStr.split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};

// Convert seconds to HH:MM:SS
const secondsToTime = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    // Allow > 24h
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
};


const TimeSlotEditorModal: React.FC<TimeSlotEditorModalProps> = ({ isOpen, onClose, segment }) => {
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [loading, setLoading] = useState(false);

    // Form State
    const [startTime, setStartTime] = useState('00:00:00');
    const [endTime, setEndTime] = useState('00:00:00');
    const [travelTimeMinutes, setTravelTimeMinutes] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    // Refs for input focus management
    const startInputRef = useRef<HTMLInputElement>(null);
    const endInputRef = useRef<HTMLInputElement>(null);
    const durInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && segment) {
            fetchSlots();
            // Default duration from segment baseline
            setTravelTimeMinutes(Math.round((segment.travel_time || 0) / 60));
        }
    }, [isOpen, segment]);

    // Auto-Sequence: When slots change (or initial load), update start time to last slot's end time
    useEffect(() => {
        if (slots.length > 0) {
            const lastSlot = slots[slots.length - 1];
            setStartTime(lastSlot.end_time);

            // Auto-calculate end time based on current duration
            const startSec = timeToSeconds(lastSlot.end_time);
            const durationSec = travelTimeMinutes * 60;
            setEndTime(secondsToTime(startSec + durationSec));
        } else {
            // First slot starts at 04:00:00 usually? Or 00:00:00. Let's stick to 00:00:00 default or current 'startTime' state if user edited it.
            // If it's pure init, maybe 04:00:00 is a better GTFS start, but let's leave 00:00:00.
        }
    }, [slots]); // Only run when list changes

    // Logic: If Start updates -> Update End based on Duration
    const handleStartTimeBlur = () => {
        const formatted = formatTimeInput(startTime);
        if (formatted) {
            setStartTime(formatted);
            const startSec = timeToSeconds(formatted);
            const durationSec = travelTimeMinutes * 60;
            setEndTime(secondsToTime(startSec + durationSec));
        }
    };

    // Logic: If End updates -> Update Duration
    const handleEndTimeBlur = () => {
        const formatted = formatTimeInput(endTime);
        if (formatted) {
            setEndTime(formatted);
            const startSec = timeToSeconds(startTime);
            const endSec = timeToSeconds(formatted);

            if (endSec > startSec) {
                const diffMin = Math.round((endSec - startSec) / 60);
                setTravelTimeMinutes(diffMin);
            } else {
                // If end is before start, maybe user meant next day? 
                // For now, let's just warn or let them fix it.
                // Or auto-fix if it's small? No, safer to just invalid.
            }
        }
    };

    // Logic: If Duration updates -> Update End based on Start
    const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value) || 0;
        setTravelTimeMinutes(val);

        const startSec = timeToSeconds(startTime);
        const durationSec = val * 60;
        setEndTime(secondsToTime(startSec + durationSec));
    };


    const fetchSlots = async () => {
        if (!segment) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/segments/${segment.segment_id}/slots`);
            const data = await res.json();
            // Sort by start time
            setSlots(data.sort((a: TimeSlot, b: TimeSlot) => a.start_time.localeCompare(b.start_time)));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddSlot = async () => {
        setError(null);
        if (!segment) return;

        // Final format check
        const finalStart = formatTimeInput(startTime);
        const finalEnd = formatTimeInput(endTime);

        if (!finalStart || !finalEnd) {
            setError("Invalid time format.");
            return;
        }

        const durationSec = travelTimeMinutes * 60;

        // Validation
        if (durationSec <= 0) {
            setError("Duration must be > 0");
            return;
        }

        if (finalStart >= finalEnd) {
            setError("End time must be after Start time");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/segments/${segment.segment_id}/slots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_time: finalStart,
                    end_time: finalEnd,
                    travel_time: durationSec
                })
            });

            if (!res.ok) throw new Error("Failed to create slot");

            const newSlot = await res.json();
            setSlots(prev => [...prev, newSlot].sort((a, b) => a.start_time.localeCompare(b.start_time)));

            // Focus back to Start for rapid entry? Or maybe just keep flow.
            // Since auto-sequence will update Start/End to next slot, user can just keep hitting Enter if they want same duration.

        } catch (err) {
            console.error(err);
            setError("Failed to save slot.");
        }
    };

    const handleDeleteSlot = async (slotId: string) => {
        if (!confirm("Delete this time slot?")) return;
        try {
            await fetch(`${API_URL}/segments/slots/${slotId}`, { method: 'DELETE' });
            setSlots(prev => prev.filter(s => s.id !== slotId));
        } catch (err) {
            console.error(err);
            alert("Failed to delete slot");
        }
    };

    if (!isOpen || !segment) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800 rounded-t-xl">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Clock className="text-blue-600" size={20} />
                            Time Slots Editor
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                            <span className="font-medium text-gray-700 dark:text-gray-300">{segment.startName}</span>
                            <ArrowRight size={14} />
                            <span className="font-medium text-gray-700 dark:text-gray-300">{segment.endName}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">

                    {/* Minimalist Input Row */}
                    <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6 shadow-sm">
                        <div className="flex items-end gap-3">
                            <div className="flex-1">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 mb-1">Start (HHMM)</label>
                                <input
                                    ref={startInputRef}
                                    type="text"
                                    value={startTime}
                                    onChange={e => setStartTime(e.target.value)}
                                    onBlur={handleStartTimeBlur}
                                    placeholder="0600"
                                    className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                                    onKeyDown={e => e.key === 'Enter' && endInputRef.current?.focus()}
                                />
                            </div>

                            <div className="flex items-center pb-3 text-gray-400">
                                <ArrowRight size={16} />
                            </div>

                            <div className="flex-1">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 mb-1">End (HHMM)</label>
                                <input
                                    ref={endInputRef}
                                    type="text"
                                    value={endTime}
                                    onChange={e => setEndTime(e.target.value)}
                                    onBlur={handleEndTimeBlur}
                                    placeholder="0700"
                                    className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                                    onKeyDown={e => e.key === 'Enter' && durInputRef.current?.focus()}
                                />
                            </div>

                            <div className="w-24">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 mb-1">Mins</label>
                                <input
                                    ref={durInputRef}
                                    type="number"
                                    min="1"
                                    value={travelTimeMinutes}
                                    onChange={handleDurationChange}
                                    className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-bold text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                                    onKeyDown={e => e.key === 'Enter' && handleAddSlot()}
                                />
                            </div>

                            <button
                                onClick={handleAddSlot}
                                className="h-[38px] px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                            >
                                <Plus size={18} />
                                <span className="hidden sm:inline">Add</span>
                            </button>
                        </div>

                        {error && (
                            <div className="mt-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 animate-in slide-in-from-top-1">
                                <AlertCircle size={14} /> {error}
                            </div>
                        )}
                    </div>

                    {/* Slots Table/List */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Defined Slots</h4>
                            <span className="text-xs text-gray-400">{slots.length} slots</span>
                        </div>

                        {loading ? (
                            <div className="text-center py-8 text-gray-400 text-sm">Loading slots...</div>
                        ) : slots.length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/50">
                                <p className="text-gray-500 dark:text-gray-400 font-medium">No custom slots yet</p>
                                <p className="text-xs text-gray-400 mt-1">Segments use the default travel time ({Math.round((segment.travel_time || 0) / 60)} min) unless overridden here.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-2">
                                {slots.map((slot, idx) => (
                                    <div key={slot.id} className="group flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg hover:border-blue-200 dark:hover:border-blue-900 transition-all shadow-sm hover:shadow-md">
                                        <div className="flex items-center gap-4">
                                            <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 text-[10px] font-bold flex items-center justify-center">
                                                {idx + 1}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-mono text-sm font-medium text-gray-800 dark:text-gray-200">
                                                    {slot.start_time.substring(0, 5)} <span className="text-gray-400 mx-1">→</span> {slot.end_time.substring(0, 5)}
                                                </span>
                                            </div>
                                            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
                                            <div className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                                {Math.round(slot.travel_time / 60)} min
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleDeleteSlot(slot.id)}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                            title="Delete Slot"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Tip */}
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-[10px] text-gray-400">
                        Tip: You can type times like "0630" for 06:30, or "2500" for 1 AM next day. Max 36 hours.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default TimeSlotEditorModal;
