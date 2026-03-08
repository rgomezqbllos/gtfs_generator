import * as React from 'react';
import { useEditor } from '../context/EditorContext';
import { Plus, ArrowRight, Clock, Ruler, GripHorizontal, Download, Wand2, X } from 'lucide-react';
import type { Segment, Stop } from '../types';
import { clsx } from 'clsx';
import { API_URL } from '../config';
import { AlertCircle, Loader2, Info } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description: string;
    children: React.ReactNode;
    confirmLabel?: string;
    onConfirm?: () => void;
    isDestructive?: boolean;
    isLoading?: boolean;
}

const Modal: React.FC<ModalProps> = ({ 
    isOpen, onClose, title, description, children, confirmLabel, onConfirm, isDestructive, isLoading 
}) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-[0_0_50px_rgba(0,0,0,0.3)] w-full max-w-md border utilitarian-border overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-8 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50">
                    <h3 className="text-base font-display font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1 flex items-center gap-3">
                         {isDestructive ? <AlertCircle className="text-red-500" size={20} /> : <Info className="text-primary" size={20} />}
                         {title}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{description}</p>
                </div>
                <div className="p-8">{children}</div>
                <div className="p-8 pt-0 flex flex-col gap-3">
                    {onConfirm && (
                        <button
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={clsx(
                                "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl transition-all flex items-center justify-center gap-3",
                                isDestructive ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20" : "bg-primary hover:bg-blue-700 text-white shadow-primary/20"
                            )}
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                            {confirmLabel || "Confirmar"}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

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
    const [showConfirm, setShowConfirm] = React.useState(false);
    const [result, setResult] = React.useState<{ created: number, failed: number } | null>(null);
    const [progress, setProgress] = React.useState(0);

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
        setShowConfirm(false);
        setIsGenerating(true);
        setProgress(0);
        let createdCount = 0;
        let failedCount = 0;

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
                        parkings.forEach((parkingId: string) => {
                            if (parkingId !== firstStopId) {
                                newSegments.push({ start: firstStopId, end: parkingId });
                                newSegments.push({ start: parkingId, end: firstStopId });
                            }
                            if (parkingId !== lastStopId && firstStopId !== lastStopId) {
                                newSegments.push({ start: lastStopId, end: parkingId });
                                newSegments.push({ start: parkingId, end: lastStopId });
                            }
                        });
                    }
                });
            });

            // 2. Filter existing
            const existingSig = new Set(segments.map(s => `${s.start_node_id}-${s.end_node_id}`));
            const uniqueSegments = new Set<string>();
            const segmentsToCreate: { start: string, end: string }[] = [];

            newSegments.forEach(pair => {
                const sig = `${pair.start}-${pair.end}`;
                if (existingSig.has(sig)) return;
                if (uniqueSegments.has(sig)) return;
                uniqueSegments.add(sig);
                segmentsToCreate.push(pair);
            });

            if (segmentsToCreate.length === 0) {
                setResult({ created: 0, failed: 0 });
                return;
            }

            // 3. Create them in sequence
            for (let i = 0; i < segmentsToCreate.length; i++) {
                const pair = segmentsToCreate[i];
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

                    if (res.ok) createdCount++;
                    else failedCount++;
                } catch (e) {
                    failedCount++;
                }
                setProgress(Math.round(((i + 1) / segmentsToCreate.length) * 100));
            }

            onRefresh();
            setResult({ created: createdCount, failed: failedCount });

        } catch (err) {
            console.error(err);
            setResult({ created: createdCount, failed: failedCount + 1 });
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

            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col gap-3">
                <button
                    onClick={() => setShowConfirm(true)}
                    disabled={isGenerating}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shadow-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 relative overflow-hidden group"
                >
                    {isGenerating ? (
                        <div className="flex flex-col items-center gap-1">
                            <span className="flex items-center gap-2 animate-pulse">
                                <Loader2 size={14} className="animate-spin" /> Procesando Suministro
                            </span>
                            <div className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-300" style={{ width: `${progress}%` }} />
                        </div>
                    ) : (
                        <>
                            <Wand2 size={16} strokeWidth={2.5} className="group-hover:rotate-12 transition-transform" />
                            Auto-Connect Red
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

            {/* Modals */}
            <Modal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                title="Generar Conexiones"
                description="Protocolo de Vinculación Automática"
                onConfirm={handleAutoConnect}
                confirmLabel="Ejecutar Proceso"
            >
                <div className="space-y-4">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tight leading-relaxed">
                        Este proceso generará automáticamente vectores de red (deadheads) para los siguientes casos:
                    </p>
                    <ul className="space-y-2">
                        {[
                            "Terminales de cabecera ida/vuelta",
                            "Vinculación a Patios/Parqueaderos asignados",
                            "Circuitos de retorno operativo"
                        ].map((item, i) => (
                            <li key={i} className="flex items-center gap-3 text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border utilitarian-border">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-lg shadow-primary/40" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            </Modal>

            <Modal
                isOpen={result !== null}
                onClose={() => setResult(null)}
                title="Suministro Finalizado"
                description="Reporte de Integridad de Red"
                onConfirm={() => setResult(null)}
                confirmLabel="Cerrar Reporte"
            >
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl text-center">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Creados</p>
                        <p className="text-3xl font-display font-black text-emerald-500 leading-none">{result?.created || 0}</p>
                    </div>
                    <div className="p-6 bg-red-500/5 border border-red-500/10 rounded-3xl text-center">
                        <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1">Fallidos</p>
                        <p className="text-3xl font-display font-black text-red-500 leading-none">{result?.failed || 0}</p>
                    </div>
                </div>
                {result?.created === 0 && result?.failed === 0 && (
                    <div className="mt-4 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-2xl text-center flex items-center gap-3">
                        <Info size={16} className="text-slate-400" />
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-tight">No se detectaron nuevas conexiones necesarias.</p>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default EmptySegmentsManager;
