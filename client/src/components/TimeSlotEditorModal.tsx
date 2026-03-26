import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Plus, Trash2, Clock, AlertCircle, ArrowRight, Ruler, Check, ChevronRight } from 'lucide-react';
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

const formatTimeInput = (val: string): string | null => {
    const clean = val.replace(/\D/g, '');
    if (!clean) return null;

    let hh = 0, mm = 0;

    if (clean.length <= 2) {
        hh = parseInt(clean, 10);
    } else if (clean.length === 3) {
        hh = parseInt(clean.substring(0, 1), 10);
        mm = parseInt(clean.substring(1), 10);
    } else if (clean.length >= 4) {
        hh = parseInt(clean.substring(0, 2), 10);
        mm = parseInt(clean.substring(2, 4), 10);
    }

    if (hh > 36) hh = 36;
    if (mm > 59) mm = 59;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hh)}:${pad(mm)}:00`;
};

const timeToSeconds = (t: string): number => {
    const parts = t.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
};

const timeDisplay = (t: string): string => t.substring(0, 5);

const TOTAL_DAY_SECONDS = 36 * 3600;

const TimeSlotEditorModal: React.FC<TimeSlotEditorModalProps> = ({ isOpen, onClose, segment }) => {
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [loading, setLoading] = useState(false);

    const [endTime, setEndTime] = useState('');
    const [travelTimeMinutes, setTravelTimeMinutes] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    const endInputRef = useRef<HTMLInputElement>(null);
    const durInputRef = useRef<HTMLInputElement>(null);

    // Computed next start time
    const nextStartTime = useMemo(() => {
        if (slots.length === 0) return '00:00:00';
        const sorted = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
        return sorted[sorted.length - 1].end_time;
    }, [slots]);

    const isComplete = useMemo(() => {
        return timeToSeconds(nextStartTime) >= TOTAL_DAY_SECONDS;
    }, [nextStartTime]);

    useEffect(() => {
        if (isOpen && segment) {
            fetchSlots();
            setTravelTimeMinutes(Math.round((segment.travel_time || 0) / 60));
            setEndTime('');
            setError(null);
        }
    }, [isOpen, segment]);

    useEffect(() => {
        setEndTime('');
        setError(null);
    }, [slots]);

    const coverage = useMemo(() => {
        if (slots.length === 0) return { percent: 0, covered: 0 };
        const sorted = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
        let coveredSeconds = 0;
        sorted.forEach(s => {
            coveredSeconds += timeToSeconds(s.end_time) - timeToSeconds(s.start_time);
        });
        return {
            percent: Math.min(100, Math.round((coveredSeconds / TOTAL_DAY_SECONDS) * 100)),
            covered: coveredSeconds
        };
    }, [slots]);

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
            return ns < se && ne > ss;
        });
    };

    const handleAddSlot = async () => {
        setError(null);
        if (!segment) return;

        const finalStart = nextStartTime;
        const finalEnd = formatTimeInput(endTime);

        if (!finalEnd) {
            setError('Ingresa la hora fin (ej: 0700, 2200, 3600)');
            return;
        }

        if (timeToSeconds(finalStart) >= timeToSeconds(finalEnd)) {
            setError(`La hora fin debe ser posterior a ${timeDisplay(finalStart)}`);
            return;
        }

        if (timeToSeconds(finalEnd) > TOTAL_DAY_SECONDS) {
            setError('La hora fin no puede superar las 36:00');
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
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] border border-slate-200/50 dark:border-slate-700/50"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-xl">
                                <Clock size={18} className="text-primary" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">Franjas Horarias</h3>
                                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                    {segment.startName} <ArrowRight size={10} className="text-slate-400" /> {segment.endName}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg text-[11px] text-slate-500 font-medium">
                            <Ruler size={10} /> {distKm} km
                        </span>
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-lg text-[11px] text-primary font-bold">
                            <Clock size={10} /> Base: {baseTravelMin} min
                        </span>
                        {slots.length > 0 && (
                            <span className={clsx(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold",
                                coverage.percent >= 100
                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                                    : "bg-amber-100 dark:bg-amber-900/30 text-amber-600"
                            )}>
                                {coverage.percent >= 100 ? <Check size={10} /> : <AlertCircle size={10} />}
                                {coverage.percent}%
                            </span>
                        )}
                    </div>
                </div>

                {/* Coverage bar */}
                {slots.length > 0 && (
                    <div className="px-6 py-2 bg-slate-50/80 dark:bg-slate-900/40">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cobertura del dia operativo (00:00 - 36:00)</span>
                        </div>
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden relative">
                            {slots.map((slot) => {
                                const startPct = (timeToSeconds(slot.start_time) / TOTAL_DAY_SECONDS) * 100;
                                const widthPct = ((timeToSeconds(slot.end_time) - timeToSeconds(slot.start_time)) / TOTAL_DAY_SECONDS) * 100;
                                return (
                                    <div
                                        key={slot.id}
                                        className="absolute h-full bg-primary/60 rounded-sm"
                                        style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                                    />
                                );
                            })}
                            {/* Hour marks */}
                            {[6, 12, 18, 24, 30].map(h => (
                                <div key={h} className="absolute h-full w-px bg-slate-300/50 dark:bg-slate-600/50" style={{ left: `${(h / 36) * 100}%` }} />
                            ))}
                        </div>
                        <div className="flex justify-between mt-0.5 text-[8px] text-slate-400 font-mono">
                            <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span><span>30</span><span>36</span>
                        </div>
                    </div>
                )}

                {/* Add slot form */}
                {!isComplete && (
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-1 mb-3">
                            <Plus size={12} className="text-primary" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nueva franja</span>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Start - readonly, auto-sequenced */}
                            <div className="flex-1 min-w-0">
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Desde</label>
                                <div className="w-full px-3 py-2.5 text-sm font-mono text-center rounded-lg bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 select-none">
                                    {timeDisplay(nextStartTime)}
                                </div>
                            </div>

                            <ArrowRight size={16} className="text-slate-300 mt-5 shrink-0" />

                            {/* End - editable */}
                            <div className="flex-1 min-w-0">
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hasta</label>
                                <input
                                    ref={endInputRef}
                                    type="text"
                                    value={endTime}
                                    onChange={e => setEndTime(e.target.value)}
                                    onBlur={() => {
                                        const f = formatTimeInput(endTime);
                                        if (f) setEndTime(timeDisplay(f));
                                    }}
                                    placeholder="HH:MM"
                                    className="w-full px-3 py-2.5 text-sm font-mono text-center bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-slate-800 dark:text-white transition-all"
                                    onKeyDown={e => e.key === 'Enter' && durInputRef.current?.focus()}
                                    autoFocus
                                />
                            </div>

                            {/* Duration */}
                            <div className="w-20 shrink-0">
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Minutos</label>
                                <input
                                    ref={durInputRef}
                                    type="number"
                                    min="1"
                                    value={travelTimeMinutes || ''}
                                    onChange={e => setTravelTimeMinutes(parseInt(e.target.value) || 0)}
                                    className="w-full px-3 py-2.5 text-sm font-bold font-mono text-center bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-primary transition-all"
                                    onKeyDown={e => e.key === 'Enter' && handleAddSlot()}
                                />
                            </div>

                            {/* Add button */}
                            <button
                                onClick={handleAddSlot}
                                className="mt-5 p-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg transition-all shrink-0 shadow-sm hover:shadow-md"
                            >
                                <Plus size={16} />
                            </button>
                        </div>

                        {error && (
                            <div className="mt-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg text-[11px] text-red-600 dark:text-red-400 flex items-center gap-2">
                                <AlertCircle size={13} className="shrink-0" /> {error}
                            </div>
                        )}
                    </div>
                )}

                {/* Complete indicator */}
                {isComplete && (
                    <div className="px-6 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/30">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <Check size={16} />
                            <span className="text-sm font-bold">Cobertura completa</span>
                            <span className="text-xs text-emerald-500 ml-auto">00:00 - 36:00 cubierto</span>
                        </div>
                    </div>
                )}

                {/* Slots list */}
                <div className="flex-1 overflow-y-auto px-6 py-3 custom-scrollbar">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Franjas definidas</span>
                        <span className="text-[11px] font-mono text-slate-400">{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
                        </div>
                    ) : slots.length === 0 ? (
                        <div className="py-10 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                            <Clock size={24} className="mx-auto text-slate-300 mb-3" />
                            <p className="text-sm text-slate-400 font-medium">Sin franjas definidas</p>
                            <p className="text-xs text-slate-400 mt-1 max-w-[280px] mx-auto">
                                Se usa el tiempo base (<strong>{baseTravelMin} min</strong>) para todo el dia.
                                Agrega franjas para tiempos diferenciados por hora.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {slots.map((slot, idx) => (
                                <div
                                    key={slot.id}
                                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                                >
                                    <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 flex items-center gap-2 min-w-0">
                                        <span className="font-mono text-sm font-medium text-slate-700 dark:text-slate-200">
                                            {timeDisplay(slot.start_time)}
                                        </span>
                                        <ChevronRight size={12} className="text-slate-300 shrink-0" />
                                        <span className="font-mono text-sm font-medium text-slate-700 dark:text-slate-200">
                                            {timeDisplay(slot.end_time)}
                                        </span>
                                    </div>
                                    <span className="text-sm font-bold text-primary bg-primary/5 dark:bg-primary/10 px-2.5 py-1 rounded-lg shrink-0 font-mono">
                                        {Math.round(slot.travel_time / 60)} min
                                    </span>
                                    <button
                                        onClick={() => handleDeleteSlot(slot.id)}
                                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer with close button */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 rounded-b-2xl flex items-center justify-between">
                    <p className="text-[10px] text-slate-400">
                        Formato: HH:MM (ej: 07:00, 22:00, 36:00)
                    </p>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-xl transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                    >
                        <Check size={14} />
                        Listo
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TimeSlotEditorModal;
