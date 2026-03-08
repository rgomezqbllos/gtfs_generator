import React, { useState } from 'react';
import { X, Plus, Trash2, Wand2, Activity, Clock, Database, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { formatTimeInput } from '../utils/TimeUtils';

interface AutoTripsModalProps {
    isOpen: boolean;
    onClose: () => void;
    serviceId: string;
    totalTravelTime: number;
    onGenerate: (config: AutoTripsConfig) => void;
}

export interface AutoTripsRange {
    start_time: string;
    end_time: string;
    value: number;
}

export interface AutoTripsConfig {
    mode: 'interval' | 'buses';
    ranges: AutoTripsRange[];
    trips: string[];
}

interface TimeRange {
    id: string;
    start_time: string;
    end_time: string;
    value: number;
}

const AutoTripsModal: React.FC<AutoTripsModalProps> = ({
    isOpen,
    onClose,
    serviceId,
    totalTravelTime,
    onGenerate
}) => {
    const [mode, setMode] = useState<'interval' | 'buses'>('interval');
    const [ranges, setRanges] = useState<TimeRange[]>([
        { id: '1', start_time: '06:00:00', end_time: '09:00:00', value: 15 }
    ]);

    if (!isOpen) return null;

    const addRange = () => {
        let newStartTime = '06:00:00';
        let newEndTime = '08:00:00';
        if (ranges.length > 0) {
            const lastRange = ranges[ranges.length - 1];
            newStartTime = lastRange.end_time;
            const timeParts = lastRange.end_time.split(':');
            let h = parseInt(timeParts[0] || '0', 10);
            const m = timeParts[1] || '00';
            const s = timeParts[2] || '00';
            h += 2;
            newEndTime = `${h.toString().padStart(2, '0')}:${m}:${s}`;
        }
        setRanges([
            ...ranges,
            {
                id: Math.random().toString(36).slice(2, 11),
                start_time: newStartTime,
                end_time: newEndTime,
                value: mode === 'interval' ? 15 : 2
            }
        ]);
    };

    const removeRange = (id: string) => {
        setRanges(ranges.filter(r => r.id !== id));
    };

    const updateRange = (id: string, field: keyof TimeRange, val: string | number) => {
        setRanges(ranges.map(r => r.id === id ? { ...r, [field]: val } : r));
    };

    const generateTimes = () => {
        const normalizedRanges = ranges
            .map((range) => ({
                start_time: formatTimeInput(range.start_time),
                end_time: formatTimeInput(range.end_time),
                value: Number.isFinite(range.value) ? range.value : 0
            }))
            .filter(range => range.value > 0)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

        const generatedTimes: string[] = [];

        if (mode === 'interval') {
            normalizedRanges.forEach(range => {
                const startPoints = range.start_time.split(':').map(Number);
                const endPoints = range.end_time.split(':').map(Number);
                const startH = startPoints[0] || 0;
                const startM = startPoints[1] || 0;
                const startS = startPoints[2] || 0;
                const endH = endPoints[0] || 0;
                const endM = endPoints[1] || 0;
                const endS = endPoints[2] || 0;
                let currentSeconds = (startH * 3600) + (startM * 60) + startS;
                const endSeconds = (endH * 3600) + (endM * 60) + endS;
                const intervalSeconds = range.value * 60;
                if (intervalSeconds <= 0) return;
                while (currentSeconds <= endSeconds) {
                    const h = Math.floor(currentSeconds / 3600);
                    const m = Math.floor((currentSeconds % 3600) / 60);
                    const s = Math.floor(currentSeconds % 60);
                    const formatted = [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
                    generatedTimes.push(formatted);
                    currentSeconds += intervalSeconds;
                }
            });
        }

        const uniqueTimes = Array.from(new Set(generatedTimes)).sort();
        onGenerate({
            mode,
            ranges: normalizedRanges,
            trips: uniqueTimes
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[90] flex items-center justify-center p-8 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-[40px] shadow-[0_0_100px_rgba(0,0,0,0.4)] w-full max-w-2xl animate-in zoom-in-95 duration-300 border utilitarian-border overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* High-End Tactical Header */}
                <div className="px-10 py-8 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                    <div className="flex items-center gap-5">
                        <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-600/20">
                            <Wand2 size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Proyección de Viajes</h2>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                                <Activity size={12} className="text-indigo-500" />
                                Algoritmo de Suministro: {serviceId}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white border utilitarian-border"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-10">
                    
                    {/* Operational Mode Selection */}
                    <div className="space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] px-1">Protocolo de Generación</p>
                        <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-[24px] border utilitarian-border shadow-inner">
                            <button
                                onClick={() => setMode('interval')}
                                className={clsx(
                                    "px-6 py-4 rounded-[18px] text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3",
                                    mode === 'interval' ? "bg-white dark:bg-slate-700 text-indigo-600 shadow-lg" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                <Clock size={16} strokeWidth={2.5} />
                                Por Intervalo
                            </button>
                            <button
                                onClick={() => setMode('buses')}
                                className={clsx(
                                    "px-6 py-4 rounded-[18px] text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3",
                                    mode === 'buses' ? "bg-white dark:bg-slate-700 text-indigo-600 shadow-lg" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                <Database size={16} strokeWidth={2.5} />
                                Por Flota
                            </button>
                        </div>
                    </div>

                    {/* Matrix Range Programming */}
                    <div className="space-y-6">
                        <div className="flex justify-between items-center px-1">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Rangos de Programación</p>
                             {mode === 'buses' && (
                                <div className="flex items-center gap-3 px-4 py-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-full">
                                    <Clock size={12} className="text-emerald-500" />
                                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Viaje Completo: {Math.round(totalTravelTime / 60)} min</span>
                                </div>
                             )}
                        </div>

                        <div className="space-y-4">
                            {ranges.map((range, idx) => (
                                <div 
                                    key={range.id} 
                                    className="group relative flex flex-col md:flex-row items-end gap-6 bg-slate-50 dark:bg-slate-800/30 p-8 rounded-[32px] border utilitarian-border hover:border-indigo-500/30 transition-all duration-500"
                                >
                                    <div className="absolute top-6 left-6 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border utilitarian-border flex items-center justify-center text-[10px] font-black text-slate-300">
                                        {idx + 1}
                                    </div>

                                    <div className="grid grid-cols-2 gap-6 flex-1 w-full pl-8">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">T. Inicio</label>
                                            <input
                                                type="text"
                                                placeholder="00:00:00"
                                                maxLength={8}
                                                value={range.start_time}
                                                onChange={(e) => updateRange(range.id, 'start_time', e.target.value)}
                                                onBlur={(e) => updateRange(range.id, 'start_time', formatTimeInput(e.target.value))}
                                                className="w-full text-sm bg-white dark:bg-slate-800 border utilitarian-border rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono font-black focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">T. Fin</label>
                                            <input
                                                type="text"
                                                placeholder="00:00:00"
                                                maxLength={8}
                                                value={range.end_time}
                                                onChange={(e) => updateRange(range.id, 'end_time', e.target.value)}
                                                onBlur={(e) => updateRange(range.id, 'end_time', formatTimeInput(e.target.value))}
                                                className="w-full text-sm bg-white dark:bg-slate-800 border utilitarian-border rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono font-black focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="w-full md:w-36 space-y-2">
                                        <label className="text-[9px] font-black text-indigo-500 uppercase tracking-widest px-1">
                                            {mode === 'interval' ? 'Intervalo (M)' : 'Unidades'}
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={range.value}
                                            onChange={(e) => updateRange(range.id, 'value', parseInt(e.target.value) || 0)}
                                            className="w-full text-sm bg-white dark:bg-slate-800 border utilitarian-border rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono font-black focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-sm"
                                        />
                                    </div>

                                    <button
                                        onClick={() => removeRange(range.id)}
                                        className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={20} strokeWidth={2.5} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addRange}
                            className="w-full py-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[32px] text-slate-400 hover:border-indigo-500/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-[0.25em] bg-white dark:bg-slate-800/10 active:scale-95"
                        >
                            <Plus size={20} strokeWidth={3} />
                            Anclar Rango Operativo
                        </button>
                    </div>

                    <div className="p-6 bg-slate-100 dark:bg-slate-800/50 rounded-[32px] border border-dashed border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                            <Info size={14} /> Nota de Protocolo
                        </p>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                            La generación automática calculará los tiempos de paso basándose en las matrices de velocidad actuales. 
                            Los conflictos de bunching serán mitigados automáticamente por el motor de proyección.
                        </p>
                    </div>
                </div>

                {/* Final Dashboard Controls */}
                <div className="px-10 py-10 border-t utilitarian-border bg-white dark:bg-slate-800/10 flex justify-end gap-6 text-slate-400 font-black">
                     <button 
                        onClick={onClose} 
                        className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={generateTimes}
                        className="px-12 py-5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-[0.25em] rounded-[24px] shadow-2xl shadow-indigo-600/30 flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-95"
                    >
                        <Wand2 size={18} strokeWidth={2.5} />
                        Consolidar Proyección
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AutoTripsModal;
