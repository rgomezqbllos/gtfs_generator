import { useEffect, useState } from 'react';
import { X, Trash2, Edit2, AlertCircle, Plus, MapPin, Hash, Scan, Activity, Database, Loader2 } from 'lucide-react';
import { DataTable } from './UI/DataTable';
import type { ColumnDef } from './UI/DataTable';
import { Stop } from '../types';
import { API_URL } from '../config';
import ConfirmModal from './ConfirmModal';
import clsx from 'clsx';

interface StopsCatalogProps {
    onClose: () => void;
    onUpdateStop: (stop: Stop) => void;
    onAddOnMap: () => void;
    onDataChange?: () => void;
}

export default function StopsCatalog({ onClose, onUpdateStop, onAddOnMap, onDataChange }: StopsCatalogProps) {
    const [stops, setStops] = useState<Stop[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Delete flow state
    const [stopToDelete, setStopToDelete] = useState<Stop | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const fetchStops = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/stops`);
            if (!res.ok) throw new Error('Error al sincronizar inventario de paradas');
            const data = await res.json();
            setStops(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStops();
    }, []);

    const handleDeleteClick = (stop: Stop) => {
        setDeleteError(null);
        setStopToDelete(stop);
    };

    const confirmDelete = async () => {
        if (!stopToDelete) return;
        try {
            const res = await fetch(`${API_URL}/stops/${stopToDelete.stop_id}`, { method: 'DELETE' });
            const data = await res.json();

            if (!res.ok) {
                setDeleteError(data.error || 'No se puede eliminar la parada porque está en uso en trazados activos.');
                return;
            }

            setStops(prev => prev.filter(s => s.stop_id !== stopToDelete.stop_id));
            setStopToDelete(null);
            if (onDataChange) onDataChange();
        } catch (err: any) {
            setDeleteError("Fallo de comunicación en el protocolo de borrado.");
        }
    };

    const columns: ColumnDef<Stop>[] = [
        { 
            header: 'TECNICO ID', 
            accessorKey: 'stop_id', 
            filterable: true, 
            sortable: true,
            cell: (row) => (
                <div className="flex items-center gap-2">
                    <Scan size={12} className="text-slate-300" />
                    <span className="text-[10px] font-mono font-bold text-slate-400 tracking-tight">{row.stop_id.substring(0, 12)}...</span>
                </div>
            )
        },
        { 
            header: 'CODIGO', 
            accessorKey: 'stop_code', 
            filterable: true, 
            sortable: true,
            cell: (row) => (
                <div className="flex items-center gap-2">
                    <Hash size={12} className="text-primary/50" />
                    <span className="font-mono font-black text-primary tracking-widest">{row.stop_code}</span>
                </div>
            )
        },
        { 
            header: 'NOMENCLATURA', 
            accessorKey: 'stop_name', 
            filterable: true, 
            sortable: true,
            cell: (row) => (
                <div className="flex flex-col">
                    <span className="text-[13px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">{row.stop_name}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1 flex items-center gap-1">
                        <MapPin size={10} /> Geolocalización Activa
                    </span>
                </div>
            )
        },
        {
            header: 'CATEGORIA',
            accessorKey: 'node_type',
            filterable: true,
            sortable: true,
            filterType: 'select',
            filterOptions: [
                { label: 'Regular', value: 'regular' },
                { label: 'Comercial', value: 'commercial' },
                { label: 'Operativo', value: 'operative' },
                { label: 'Control', value: 'checkpoint' },
                { label: 'Parqueo', value: 'parking' },
            ],
            cell: (row) => (
                <span className={clsx(
                    "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border utilitarian-border",
                    row.node_type === 'regular' ? "bg-slate-100 dark:bg-slate-800 text-slate-500" :
                    row.node_type === 'commercial' ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20" :
                    "bg-amber-500/5 text-amber-600 border-amber-500/20"
                )}>
                    {row.node_type}
                </span>
            )
        },
        { 
            header: 'POSICIONAMIENTO', 
            accessorKey: 'stop_lat',
            cell: (row) => (
                <div className="flex flex-col gap-1 items-end">
                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border utilitarian-border">
                        {row.stop_lat.toFixed(6)}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border utilitarian-border">
                        {row.stop_lon.toFixed(6)}
                    </span>
                </div>
            )
        },
    ];

    return (
        <div className="absolute inset-0 z-[60] bg-white/95 dark:bg-slate-950/95 backdrop-blur-3xl flex flex-col p-8 lg:p-12 animate-in slide-in-from-right-12 duration-700 ease-out-expo">
            
            {/* Tactical Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start justify-between mb-12 gap-8">
                <div className="flex items-center gap-6">
                    <div className="p-5 bg-primary text-white rounded-3xl shadow-2xl shadow-primary/20 scale-110">
                        <MapPin size={32} strokeWidth={2.5} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                             <h2 className="text-3xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                                Inventario de Nodos
                            </h2>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Sincronizado</span>
                            </div>
                        </div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest max-w-2xl leading-relaxed">
                            Gestión integral de la infraestructura de paradas y terminales. 
                            La integridad referencial de los trazados está blindada mediante protocolos de validación en tiempo real.
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex gap-4 p-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border utilitarian-border mr-4">
                         <div className="px-4 py-2 text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Total Registros</p>
                            <p className="text-lg font-display font-black text-slate-900 dark:text-white leading-none">{stops.length}</p>
                         </div>
                         <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 my-auto" />
                         <div className="px-4 py-2 text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Integridad DB</p>
                            <p className="text-lg font-display font-black text-emerald-500 leading-none">100%</p>
                         </div>
                    </div>

                    <button
                        onClick={onAddOnMap}
                        className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-[20px] hover:scale-105 active:scale-95 transition-all font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 group"
                    >
                        <Plus size={18} strokeWidth={3} className="group-hover:rotate-90 transition-transform" />
                        Consolidar Parada
                    </button>
                    <button
                        onClick={onClose}
                        className="p-4 bg-white dark:bg-slate-800 rounded-[20px] transition-all border utilitarian-border text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 shadow-sm active:scale-95"
                    >
                        <X size={24} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Tactical Grid Overlay Area */}
            <div className="flex-1 min-h-0 relative">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-6 text-slate-400 animate-in fade-in duration-500">
                         <Loader2 size={48} className="text-primary animate-spin" />
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] animate-pulse">Sincronizando Entidades...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-500 gap-6 bg-red-50/20 dark:bg-red-900/5 rounded-[40px] border border-red-200/50 dark:border-red-900/20 p-12">
                        <div className="p-6 bg-red-500 text-white rounded-[28px] shadow-2xl shadow-red-500/20">
                            <AlertCircle size={40} strokeWidth={2.5} />
                        </div>
                        <div className="text-center max-w-sm">
                            <p className="font-display font-black text-2xl uppercase tracking-tight mb-3">Fallo Crítico de Datos</p>
                            <p className="text-[11px] font-bold text-red-500/80 uppercase tracking-widest leading-relaxed">"{error}"</p>
                            <button onClick={fetchStops} className="mt-8 px-6 py-3 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-600 transition-all">Reintentar Protocolo</button>
                        </div>
                    </div>
                ) : (
                    <div className="h-full animate-in fade-in slide-in-from-bottom-8 duration-1000">
                        <DataTable
                            data={stops}
                            columns={columns}
                            keyField="stop_id"
                            actions={(stop) => (
                                <div className="flex items-center gap-1">
                                    <button
                                        className="p-3 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all group"
                                        title="Editar Registro"
                                        onClick={() => onUpdateStop(stop)}
                                    >
                                        <Edit2 size={16} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                                    </button>
                                    <button
                                        className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all group"
                                        onClick={() => handleDeleteClick(stop)}
                                        title="Eliminar Registro"
                                    >
                                        <Trash2 size={16} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                                    </button>
                                </div>
                            )}
                        />
                    </div>
                )}
            </div>

            {/* High-End Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={!!stopToDelete}
                title="Protocolo de Eliminación"
                message={deleteError ? (
                    <div className="flex flex-col gap-4 p-6 bg-red-500/5 text-red-600 rounded-[24px] border border-red-500/20 mt-4 animate-in shake duration-500">
                        <div className="flex items-center gap-3 font-black text-[10px] uppercase tracking-[0.2em]">
                            <AlertCircle size={20} strokeWidth={2.5} /> Error de Integridad Referencial
                        </div>
                        <p className="text-[13px] font-bold leading-relaxed">{deleteError}</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-bold text-lg">
                            ¿Solicita la eliminación permanente del nodo <span className="text-slate-950 dark:text-white underline decoration-red-500 underline-offset-4">"{stopToDelete?.stop_name}"</span>? 
                        </p>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border utilitarian-border">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                                <AlertCircle size={12} className="inline mr-2 text-amber-500" />
                                La eliminación de un nodo central puede causar la invalidación de múltiples trazados OSRM y secuencias de viaje asociadas.
                             </p>
                        </div>
                    </div>
                )}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setStopToDelete(null);
                    setDeleteError(null);
                }}
                confirmText={deleteError ? "Reintentar Protocolo" : "Destruir Nodo"}
                isDestructive={true}
            />

            {/* Absolute Footer Decoration */}
            <div className="absolute bottom-6 left-12 flex items-center gap-8 opacity-40 pointer-events-none">
                 <div className="flex items-center gap-2">
                    <Database size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest">PostgreSQL Tier 1</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <Activity size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Network Consistency: 100%</span>
                 </div>
            </div>
        </div>
    );
}
