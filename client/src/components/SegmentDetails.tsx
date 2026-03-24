import * as React from 'react';
import type { Segment, Stop } from '../types';
import { Trash2, ArrowRightLeft, Clock, Ruler, Save, X, Activity, Navigation, ChevronRight, GitCommit } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import Draggable from './UI/Draggable';
import { API_URL } from '../config';
import { defaultRoutingProfile, routingProfileMetadata } from '../constants/routingProfiles';

interface SegmentDetailsProps {
    segment: Segment;
    stops: Stop[];
    onClose: () => void;
    onDelete: (segmentId: string) => Promise<void>;
    onUpdate: (updatedSegment: Segment) => void;
    onClearWaypoints?: () => void;
}

const SegmentDetails: React.FC<SegmentDetailsProps> = ({ segment, stops, onClose, onDelete, onUpdate, onClearWaypoints }) => {
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
        stops.find(s => s.stop_id === segment.start_node_id)?.stop_name || 'Nodo Origen',
        [segment.start_node_id, stops]);

    const endStopName = React.useMemo(() =>
        stops.find(s => s.stop_id === segment.end_node_id)?.stop_name || 'Nodo Destino',
        [segment.end_node_id, stops]);
        
    const profileKey = segment.routing_profile || defaultRoutingProfile;
    const profileMeta = routingProfileMetadata[profileKey];

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const finalDistance = Number(distance);
            const finalTimeSeconds = Number(timeMinutes) * 60;

            const res = await fetch(`${API_URL}/segments/${segment.segment_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance: finalDistance,
                    travel_time: finalTimeSeconds,
                    allowed_transport_modes: segment.allowed_transport_modes 
                })
            });

            if (res.ok) {
                const updatedData = {
                    ...segment,
                    distance: finalDistance,
                    travel_time: finalTimeSeconds
                };
                onUpdate(updatedData);
                onClose(); 
            } else {
                alert('No se pudo actualizar el tramo');
            }
        } catch (err) {
            console.error(err);
            alert('Error de red');
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
            console.error('Eliminación fallida:', err);
            setErrorMsg((err as Error).message || 'No se pudo eliminar el segmento vial');
        }
    };

    return (
        <>
            <Draggable className="absolute top-20 right-[500px] w-[400px] glass-panel shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] z-40 flex flex-col border utilitarian-border animate-in zoom-in-95 fade-in duration-500 ease-out-expo pointer-events-auto rounded-[32px] overflow-hidden">

                {/* Header Area */}
                <div className="drag-handle cursor-move p-8 border-b utilitarian-border bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shadow-inner">
                            <Activity size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-lg font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1">Detalle de Arista</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Network Segment Insights</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-all rounded-xl hover:bg-white dark:hover:bg-slate-800">
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-8 space-y-8 flex-1 overflow-y-auto custom-scrollbar bg-white/20">

                    {/* Geographical Context */}
                    <div className="space-y-3">
                         <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">
                            Vinculación de Nodos
                         </div>
                         <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl border utilitarian-border flex flex-col gap-6 shadow-inner">
                            <div className="flex items-start gap-4">
                                <div className="mt-1 w-2 h-2 rounded-full bg-primary ring-4 ring-primary/10 shrink-0" />
                                <div>
                                    <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Punto de Origen</span>
                                    <span className="text-sm font-bold text-slate-900 dark:text-gray-100 leading-snug">{startStopName}</span>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4 pl-0.5">
                                <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-800 ml-[3.5px]" />
                                <div className="h-[1px] flex-1 bg-slate-100 dark:bg-slate-800" />
                                <ArrowRightLeft size={14} className="text-slate-300" />
                                <div className="h-[1px] flex-1 bg-slate-100 dark:bg-slate-800" />
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-indigo-500/10 shrink-0" />
                                <div>
                                    <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Punto de Destino</span>
                                    <span className="text-sm font-bold text-slate-900 dark:text-gray-100 leading-snug">{endStopName}</span>
                                </div>
                            </div>
                         </div>
                    </div>

                    {/* Connectivity Profile */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">
                            Perfil Cartográfico
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-3xl border utilitarian-border flex items-center gap-4">
                            <div 
                                className="h-10 w-10 rounded-2xl border-4 border-white dark:border-slate-800 shadow-md flex items-center justify-center text-white"
                                style={{ backgroundColor: profileMeta.color }}
                            >
                                <Navigation size={18} strokeWidth={2.5} />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-[13px] font-black text-slate-900 dark:text-gray-100 uppercase tracking-wider">{profileMeta.label}</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{profileMeta.description}</p>
                            </div>
                            <ChevronRight size={16} className="text-slate-300" />
                        </div>
                    </div>

                    {/* Virtual Nodes (Waypoints) */}
                    {(() => {
                        let wps: { lat: number; lng: number }[] = [];
                        const raw = segment.waypoints;
                        if (raw) {
                            if (typeof raw === 'string') { try { wps = JSON.parse(raw); } catch {} }
                            else if (Array.isArray(raw)) { wps = raw; }
                        }
                        if (wps.length === 0) return null;
                        return (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">
                                    Nodos Virtuales
                                </div>
                                <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-3xl border border-amber-200/50 dark:border-amber-800/30 flex items-center gap-4">
                                    <div className="h-8 w-8 rounded-xl bg-amber-400 flex items-center justify-center text-white shrink-0">
                                        <GitCommit size={16} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[11px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-widest">{wps.length} Waypoint{wps.length !== 1 ? 's' : ''}</p>
                                        <p className="text-[9px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-widest">Trazado personalizado activo</p>
                                    </div>
                                    {onClearWaypoints && (
                                        <button
                                            onClick={onClearWaypoints}
                                            className="text-[9px] font-black uppercase tracking-widest text-amber-600 hover:text-red-500 transition-colors"
                                        >
                                            Limpiar
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Operational Metrics Form */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Distancia Geodesica</label>
                            <div className="relative group">
                                <Ruler size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="number"
                                    step="any"
                                    className="w-full pl-10 pr-4 py-4 bg-white dark:bg-slate-800 border utilitarian-border rounded-2xl text-[15px] font-mono font-black text-slate-900 dark:text-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm"
                                    value={distance}
                                    onChange={e => setDistance(e.target.value === '' ? '' : Number(e.target.value))}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">METROS</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Tiempo Operativo</label>
                            <div className="relative group">
                                <Clock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="number"
                                    step="any"
                                    className="w-full pl-10 pr-4 py-4 bg-white dark:bg-slate-800 border utilitarian-border rounded-2xl text-[15px] font-mono font-black text-slate-900 dark:text-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm"
                                    value={timeMinutes}
                                    onChange={e => setTimeMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">MIN</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-8 border-t utilitarian-border bg-slate-50 dark:bg-slate-900 flex items-center gap-4">
                    <button
                        onClick={handleDeleteClick}
                        className="h-14 w-14 flex items-center justify-center rounded-2xl border utilitarian-border bg-white dark:bg-slate-800 text-slate-300 hover:text-red-500 hover:border-red-200 hover:shadow-lg transition-all active:scale-95 group"
                        title="Eliminar tramo"
                    >
                        <Trash2 size={22} className="group-hover:scale-110 transition-transform" />
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 h-14 bg-primary hover:scale-[1.02] text-white font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform" />
                        {isSaving ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save size={18} strokeWidth={2.5} />
                                <span>Sincronizar Cambios</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={onClose}
                        className="h-14 px-6 flex items-center justify-center rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                    >
                        Salir
                    </button>
                </div>

            </Draggable>

            <ConfirmModal
                isOpen={confirmOpen}
                title={errorMsg ? "Error de Restricción" : "¿Eliminar Segmento Arista?"}
                message={errorMsg || "Esta operación eliminará el tramo vial de la base de datos. Las rutas comerciales vinculadas a este trayecto perderán su continuidad."}
                onConfirm={handleConfirmDelete}
                onCancel={() => {
                    setConfirmOpen(false);
                    setErrorMsg(null);
                }}
                isError={!!errorMsg}
                confirmText="Confirmar Eliminación"
                cancelText="Mantener"
            />
        </>
    );
};

export default SegmentDetails;
