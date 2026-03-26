import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Plus, Trash2, Clock, AlertCircle, ArrowRight, Ruler } from 'lucide-react';
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

// Convert loose input (HHMM, HMM, HHMMSS) to HH:MM:SS. Supports up to 36:00:00
const formatTimeInput = (val: string): string | null => {
    const clean = val.replace(/\D/g, '');
    if (!clean) return null;

    let hh = 0, mm = 0, ss = 0;

    if (clean.length <= 2) {
        hh = parseInt(clean, 10);
    } else if (clean.length === 3) {
        hh = parseInt(clean.substring(0, 1), 10);
        mm = parseInt(clean.substring(1), 10);
    } else if (clean.length === 4) {
        hh = parseInt(clean.substring(0, 2), 10);
        mm = parseInt(clean.substring(2), 10);
    } else if (clean.length >= 5) {
        hh = parseInt(clean.substring(0, 2), 10);
        mm = parseInt(clean.substring(2, 4), 10);
        ss = parseInt(clean.substring(4, 6), 10);
    }

    if (hh > 36) hh = 36;
    if (mm > 59) mm = 59;
    if (ss > 59) ss = 59;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
};

const timeToSeconds = (t: string): number => {
    const parts = t.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
};

const timeDisplay = (t: string): string => t.substring(0, 5);

const TOTAL_DAY_SECONDS = 36 * 3600; // 36h operational day

const TimeSlotEditorModal: React.FC<TimeSlotEditorModalProps> = ({ isOpen, onClose, segment }) => {
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [loading, setLoading] = useState(false);

    const [startTime, setStartTime] = useState('00:00:00');
    const [endTime, setEndTime] = useState('');
    const [travelTimeMinutes, setTravelTimeMinutes] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    const endInputRef = useRef<HTMLInputElement>(null);
    const durInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && segment) {
            fetchSlots();
            setTravelTimeMinutes(Math.round((segment.travel_time || 0) / 60));
            setStartTime('00:00:00');
            setEndTime('');
            setError(null);
        }
    }, [isOpen, segment]);

    // Auto-sequence: next slot starts where last one ended
    useEffect(() => {
        if (slots.length > 0) {
            const lastSlot = slots[slots.length - 1];
            setStartTime(lastSlot.end_time);
            setEndTime('');
        } else {
            setStartTime('00:00:00');
            setEndTime('');
        }
        setError(null);
    }, [slots]);

    // Coverage calculation
    const coverage = useMemo(() => {
        if (slots.length === 0) return { percent: 0, gaps: [], covered: 0 };

        let coveredSeconds = 0;
        const gaps: { start: string; end: string }[] = [];
        const sorted = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));

        sorted.forEach(s => {
            coveredSeconds += timeToSeconds(s.end_time) - timeToSeconds(s.start_time);
        });

        // Find gaps
        let cursor = 0; // seconds from 00:00
        for (const s of sorted) {
            const slotStart = timeToSeconds(s.start_time);
            if (slotStart > cursor) {
                gaps.push({
                    start: formatTimeInput(Math.floor(cursor / 3600).toString().padStart(2, '0') + (Math.floor((cursor % 3600) / 60)).toString().padStart(2, '0')) || '00:00:00',
                    end: s.start_time
                });
            }
            cursor = Math.max(cursor, timeToSeconds(s.end_time));
        }

        return {
            percent: Math.min(100, Math.round((coveredSeconds / TOTAL_DAY_SECONDS) * 100)),
            gaps,
            covered: coveredSeconds
        };
    }, [slots]);

    const handleStartTimeBlur = () => {
        const formatted = formatTimeInput(startTime);
        if (formatted) setStartTime(formatted);
    };

    const handleEndTimeBlur = () => {
        const formatted = formatTimeInput(endTime);
        if (formatted) setEndTime(formatted);
    };

    const fetchSlots = async () => {
        if (!segment) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/segments/${segment.segment_id}/slots`);
            const data = await res.json();
            setSlots(data.sort((a: TimeSlot, b: TimeSlot) => a.start_time.localeCompare(b.start_time)));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const checkOverlap = (newStart: string, newEnd: string): boolean => {
        const ns = timeToSeconds(newStart);
        const ne = timeToSeconds(newEnd);

        return slots.some(slot => {
            const ss = timeToSeconds(slot.start_time);
            const se = timeToSeconds(slot.end_time);
            return ns < se && ne > ss; // overlaps if new starts before existing ends AND new ends after existing starts
        });
    };

    const handleAddSlot = async () => {
        setError(null);
        if (!segment) return;

        const finalStart = formatTimeInput(startTime);
        const finalEnd = formatTimeInput(endTime);

        if (!finalStart || !finalEnd) {
            setError('Formato de hora invalido. Usa HHMM (ej: 0700, 2200)');
            return;
        }

        if (finalStart >= finalEnd) {
            setError('La hora fin debe ser posterior a la hora inicio');
            return;
        }

        const durationSec = travelTimeMinutes * 60;
        if (durationSec <= 0) {
            setError('La duracion debe ser mayor a 0 minutos');
            return;
        }

        if (checkOverlap(finalStart, finalEnd)) {
            setError('Esta franja se solapa con una existente');
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

            if (!res.ok) throw new Error('Failed to create slot');

            const newSlot = await res.json();
            setSlots(prev => [...prev, newSlot].sort((a, b) => a.start_time.localeCompare(b.start_time)));

            // Focus end time for next slot (start auto-sequences)
            setTimeout(() => endInputRef.current?.focus(), 100);
        } catch (err) {
            console.error(err);
            setError('Error al guardar la franja');
        }
    };

    const handleDeleteSlot = async (slotId: string) => {
        try {
            await fetch(`${API_URL}/segments/slots/${slotId}`, { method: 'DELETE' });
            setSlots(prev => prev.filter(s => s.id !== slotId));
        } catch (err) {
            console.error(err);
        }
    };

    if (!isOpen || !segment) return null;

    const baseTravelMin = Math.round((segment.travel_time || 0) / 60);
    const distKm = ((segment.distance || 0) / 1000).toFixed(2);

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] border border-slate-200/50 dark:border-slate-700/50"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-primary/10 rounded-xl">
                                <Clock size={16} className="text-primary" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Franjas Horarias</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    {segment.startName} <span className="mx-1">&rarr;</span> {segment.endName}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Segment info chips */}
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-md">
                            <Ruler size={9} /> {distKm} km
                        </span>
                        <span className="flex items-center gap-1 px-2 py-1 bg-primary/5 dark:bg-primary/10 rounded-md text-primary font-bold">
                            <Clock size={9} /> Base: {baseTravelMin} min
                        </span>
                        {slots.length > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-md text-emerald-600 font-bold">
                                {coverage.percent}% cubierto
                            </span>
                        )}
                    </div>
                </div>

                {/* Coverage bar */}
                {slots.length > 0 && (
                    <div className="px-5 py-2 bg-slate-50/50 dark:bg-slate-900/30">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cobertura 0h - 36h</span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                            {slots.map((slot, i) => {
                                const startPct = (timeToSeconds(slot.start_time) / TOTAL_DAY_SECONDS) * 100;
                                const widthPct = ((timeToSeconds(slot.end_time) - timeToSeconds(slot.start_time)) / TOTAL_DAY_SECONDS) * 100;
                                return (
                                    <div
                                        key={slot.id}
                                        className="h-full bg-primary/70 rounded-full"
                                        style={{ marginLeft: i === 0 ? `${startPct}%` : undefined, width: `${widthPct}%` }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Input form */}
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Inicio</label>
                            <input
                                type="text"
                                value={startTime.substring(0, 5)}
                                onChange={e => setStartTime(e.target.value)}
                                onBlur={handleStartTimeBlur}
                                placeholder="00:00"
                                className={clsx(
                                    "w-full px-2.5 py-2 text-sm font-mono text-center rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-primary/30",
                                    slots.length > 0
                                        ? "bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-500"
                                        : "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white"
                                )}
                                onKeyDown={e => e.key === 'Enter' && endInputRef.current?.focus()}
                            />
                        </div>

                        <ArrowRight size={14} className="text-slate-300 mb-3 shrink-0" />

                        <div className="flex-1">
                            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fin</label>
                            <input
                                ref={endInputRef}
                                type="text"
                                value={endTime ? endTime.substring(0, 5) : ''}
                                onChange={e => setEndTime(e.target.value)}
                                onBlur={handleEndTimeBlur}
                                placeholder="HH:MM"
                                className="w-full px-2.5 py-2 text-sm font-mono text-center bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-slate-800 dark:text-white transition-all"
                                onKeyDown={e => e.key === 'Enter' && durInputRef.current?.focus()}
                            />
                        </div>

                        <div className="w-16">
                            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Min</label>
                            <input
                                ref={durInputRef}
                                type="number"
                                min="1"
                                value={travelTimeMinutes || ''}
                                onChange={e => setTravelTimeMinutes(parseInt(e.target.value) || 0)}
                                className="w-full px-2 py-2 text-sm font-bold text-center bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-primary transition-all"
                                onKeyDown={e => e.key === 'Enter' && handleAddSlot()}
                            />
                        </div>

                        <button
                            onClick={handleAddSlot}
                            className="px-3 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1 shrink-0"
                        >
                            <Plus size={14} />
                        </button>
                    </div>

                    {error && (
                        <div className="mt-2.5 text-[11px] text-red-500 flex items-center gap-1.5">
                            <AlertCircle size={12} /> {error}
                        </div>
                    )}

                    {slots.length > 0 && (
                        <p className="mt-2 text-[10px] text-slate-400">
                            Siguiente franja comienza en <span className="font-mono font-bold text-primary">{timeDisplay(startTime)}</span>
                        </p>
                    )}
                </div>

                {/* Slots list */}
                <div className="flex-1 overflow-y-auto px-5 py-3 custom-scrollbar">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Franjas definidas</span>
                        <span className="text-[10px] text-slate-400">{slots.length}</span>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-5 h-5 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
                        </div>
                    ) : slots.length === 0 ? (
                        <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                            <Clock size={20} className="mx-auto text-slate-300 mb-2" />
                            <p className="text-xs text-slate-400 font-medium">Sin franjas definidas</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                                Se usa el tiempo base ({baseTravelMin} min) para todo el dia
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {slots.map((slot, idx) => (
                                <div
                                    key={slot.id}
                                    className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-all"
                                >
                                    <div className="w-5 h-5 rounded-md bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 flex items-center gap-2 min-w-0">
                                        <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                                            {timeDisplay(slot.start_time)}
                                        </span>
                                        <ArrowRight size={10} className="text-slate-300 shrink-0" />
                                        <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                                            {timeDisplay(slot.end_time)}
                                        </span>
                                    </div>
                                    <span className="text-xs font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-md shrink-0">
                                        {Math.round(slot.travel_time / 60)} min
                                    </span>
                                    <button
                                        onClick={() => handleDeleteSlot(slot.id)}
                                        className="p-1 text-slate-300 hover:text-red-500 rounded transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 rounded-b-2xl">
                    <p className="text-[9px] text-slate-400 text-center">
                        Formato: HHMM (ej: 0630 = 06:30, 2500 = 01:00 dia siguiente). Maximo 36:00.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default TimeSlotEditorModal;
