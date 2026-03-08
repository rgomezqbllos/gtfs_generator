import { useEffect, useState } from 'react';
import { X, Trash2, AlertCircle, Plus, GitBranch, Map } from 'lucide-react';
import { DataTable } from './UI/DataTable';
import type { ColumnDef } from './UI/DataTable';
import { API_URL } from '../config';
import ConfirmModal from './ConfirmModal';
import SegmentCreationModal from './SegmentCreationModal';
import type { RoutingProfile } from '../types';

export interface Segment {
    segment_id: string;
    start_node_id: string;
    end_node_id: string;
    start_node_name?: string;
    end_node_name?: string;
    distance: number;
    travel_time: number;
    type: string;
}

interface Stop {
    stop_id: string;
    stop_name: string;
}

interface SegmentsCatalogProps {
    onClose: () => void;
    onAddOnMap: () => void;
    onDataChange?: () => void;
    stops?: Stop[];
}

export default function SegmentsCatalog({ onClose, onAddOnMap, onDataChange, stops = [] }: SegmentsCatalogProps) {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Creation flow state
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Delete flow state
    const [segmentToDelete, setSegmentToDelete] = useState<Segment | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const fetchSegments = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/segments`);
            if (!res.ok) throw new Error('Failed to fetch segments');
            const data = await res.json();
            setSegments(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSegment = async (data: { start_node_id: string; end_node_id: string; profile: RoutingProfile; type: 'revenue' | 'empty' }) => {
        const res = await fetch(`${API_URL}/segments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_node_id: data.start_node_id,
                end_node_id: data.end_node_id,
                type: data.type,
                routing_profile: data.profile
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Error al crear el segmento');
        }

        await fetchSegments();
        if (onDataChange) onDataChange();
    };

    useEffect(() => {
        fetchSegments();
    }, []);

    const handleDeleteClick = (segment: Segment) => {
        setDeleteError(null);
        setSegmentToDelete(segment);
    };

    const confirmDelete = async () => {
        if (!segmentToDelete) return;
        try {
            const res = await fetch(`${API_URL}/segments/${segmentToDelete.segment_id}`, { method: 'DELETE' });
            const data = await res.json();

            if (!res.ok) {
                setDeleteError(data.error || 'No se puede eliminar el segmento porque pertenece a una ruta existente.');
                return;
            }

            setSegments(prev => prev.filter(s => s.segment_id !== segmentToDelete.segment_id));
            setSegmentToDelete(null);
            if (onDataChange) onDataChange();
        } catch (err: any) {
            setDeleteError("Hubo un error de conexión al eliminar.");
        }
    };

    const columns: ColumnDef<Segment>[] = [
        { 
            header: 'ID', 
            accessorKey: 'segment_id', 
            filterable: true, 
            sortable: true,
            cell: (row) => <span className="text-[10px] font-mono opacity-50">{row.segment_id.substring(0, 8)}...</span>
        },
        {
            header: 'Origen',
            accessorKey: 'start_node_name',
            filterable: true,
            sortable: true,
            cell: (row) => (
                <div className="flex flex-col">
                    <span className="font-bold">{row.start_node_name || 'Desconocido'}</span>
                    <span className="text-[10px] font-mono opacity-40">{row.start_node_id.substring(0, 8)}</span>
                </div>
            )
        },
        {
            header: 'Destino',
            accessorKey: 'end_node_name',
            filterable: true,
            sortable: true,
            cell: (row) => (
                <div className="flex flex-col">
                    <span className="font-bold">{row.end_node_name || 'Desconocido'}</span>
                    <span className="text-[10px] font-mono opacity-40">{row.end_node_id.substring(0, 8)}</span>
                </div>
            )
        },
        {
            header: 'Métricas',
            accessorKey: 'distance',
            sortable: true,
            cell: (row) => (
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Distancia</span>
                        <span className="font-mono text-xs">{Math.round(row.distance)}m</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Tiempo</span>
                        <span className="font-mono text-xs">{Math.round(row.travel_time)}s</span>
                    </div>
                </div>
            )
        },
        {
            header: 'Estado',
            accessorKey: 'type',
            filterable: true,
            sortable: true,
            filterType: 'select',
            filterOptions: [
                { label: 'Servicio (Revenue)', value: 'revenue' },
                { label: 'Vacía (Empty)', value: 'empty' },
            ],
            cell: (row) => (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                    row.type === 'revenue' 
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                        : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                }`}>
                    {row.type === 'revenue' ? 'REVENUE' : 'EMPTY'}
                </span>
            )
        },
    ];

    return (
        <div className="absolute inset-0 z-40 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md flex flex-col p-6 animate-in slide-in-from-right-12 duration-500 ease-out-expo">
            {/* Header Area */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <GitBranch size={18} className="text-primary" />
                        <h2 className="text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
                            Red de Aristas
                        </h2>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium max-w-lg text-balance">
                        Administra las conexiones lógicas y físicas entre nodos. 
                        El enrutamiento se calcula dinámicamente sobre la red vial.
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-xs uppercase tracking-widest border utilitarian-border"
                    >
                        <Plus size={16} />
                        Formulario
                    </button>
                    <button
                        onClick={onAddOnMap}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl hover:scale-105 active:scale-95 transition-all font-bold text-xs uppercase tracking-widest shadow-xl shadow-primary/20"
                    >
                        <Map size={16} strokeWidth={2.5} />
                        Conectar en Mapa
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2.5 bg-white dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all border utilitarian-border text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            <SegmentCreationModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                stops={stops}
                onSave={handleCreateSegment}
            />

            {/* Main Table Area */}
            <div className="flex-1 min-h-0">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 animate-pulse">
                        <div className="w-12 h-12 rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-primary animate-spin" />
                        <p className="text-xs font-bold uppercase tracking-widest">Compiling Network Data...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-500 gap-4 bg-red-50/50 dark:bg-red-900/10 rounded-2xl border border-red-200 dark:border-red-900/30">
                        <div className="p-4 bg-red-100 dark:bg-red-900/40 rounded-full">
                            <AlertCircle size={32} />
                        </div>
                        <div className="text-center">
                            <p className="font-display font-bold text-lg">Communication Failure</p>
                            <p className="text-sm opacity-70">{error}</p>
                        </div>
                    </div>
                ) : (
                    <DataTable
                        data={segments}
                        columns={columns}
                        keyField="segment_id"
                        actions={(segment) => (
                            <button
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                onClick={() => handleDeleteClick(segment)}
                                title="Eliminar Segmento"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    />
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={!!segmentToDelete}
                title="Eliminar Conexión"
                message={deleteError ? (
                    <div className="flex flex-col gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/50 mt-4 animate-in shake-1">
                        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-widest">
                            <AlertCircle size={16} /> Restricted Operation
                        </div>
                        <p className="text-[13px] font-medium leading-relaxed">{deleteError}</p>
                    </div>
                ) : (
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                        ¿Confirmas la eliminación de esta arista? La red de transporte perderá la conectividad entre estos dos nodos.
                    </p>
                )}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setSegmentToDelete(null);
                    setDeleteError(null);
                }}
                confirmText={deleteError ? "Reintentar" : "Confirmar Eliminación"}
                isDestructive={true}
            />
        </div>
    );
}
