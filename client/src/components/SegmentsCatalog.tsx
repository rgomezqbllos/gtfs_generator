import { useEffect, useState } from 'react';
import { X, Trash2, AlertCircle } from 'lucide-react';
import { DataTable } from './UI/DataTable';
import type { ColumnDef } from './UI/DataTable';
import { API_URL } from '../config';
import ConfirmModal from './ConfirmModal';

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

interface SegmentsCatalogProps {
    onClose: () => void;
    onAddOnMap: () => void;
}

export default function SegmentsCatalog({ onClose, onAddOnMap }: SegmentsCatalogProps) {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                // Return 409 means dependency conflict
                setDeleteError(data.error || 'No se puede eliminar el segmento porque pertenece a una ruta existente.');
                return; // Do not close modal yet
            }

            // Success
            setSegments(prev => prev.filter(s => s.segment_id !== segmentToDelete.segment_id));
            setSegmentToDelete(null);
        } catch (err: any) {
            setDeleteError("Hubo un error de conexión al eliminar.");
        }
    };

    const columns: ColumnDef<Segment>[] = [
        { header: 'ID', accessorKey: 'segment_id', filterable: true, sortable: true },
        {
            header: 'Origen',
            accessorKey: 'start_node_name',
            filterable: true,
            sortable: true,
            cell: (row) => row.start_node_name ? `${row.start_node_name} (${row.start_node_id.substring(0, 8)})` : row.start_node_id
        },
        {
            header: 'Destino',
            accessorKey: 'end_node_name',
            filterable: true,
            sortable: true,
            cell: (row) => row.end_node_name ? `${row.end_node_name} (${row.end_node_id.substring(0, 8)})` : row.end_node_id
        },
        {
            header: 'Distancia (m)',
            accessorKey: 'distance',
            sortable: true,
            cell: (row) => `${Math.round(row.distance)} m`
        },
        {
            header: 'Tiempo (s)',
            accessorKey: 'travel_time',
            sortable: true,
            cell: (row) => `${Math.round(row.travel_time)} s`
        },
        {
            header: 'Tipo',
            accessorKey: 'type',
            filterable: true,
            sortable: true,
            filterType: 'select',
            filterOptions: [
                { label: 'Servicio (Revenue)', value: 'revenue' },
                { label: 'Vacía (Empty)', value: 'empty' },
            ]
        },
    ];

    return (
        <div className="absolute inset-0 z-40 bg-white dark:bg-[#0f111a] flex flex-col pt-4 px-6 animate-in slide-in-from-right-8 fade-in">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">Catálogo de Segmentos (Aristas)</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gestiona las conexiones entre paradas. Protegidos si son parte del trazado de rutas activas.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onAddOnMap}
                        className="px-4 py-2 bg-[#1337ec] text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm whitespace-nowrap"
                    >
                        Conectar en Mapa
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 dark:text-gray-400"
                    >
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden py-4">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-500">Cargando segmentos...</div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2">
                        <AlertCircle size={32} />
                        <p>{error}</p>
                    </div>
                ) : (
                    <DataTable
                        data={segments}
                        columns={columns}
                        keyField="segment_id"
                        actions={(segment) => (
                            <div className="flex items-center justify-end gap-2">
                                {/* Delete Action */}
                                <button
                                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                    onClick={() => handleDeleteClick(segment)}
                                    title="Eliminar Segmento"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        )}
                    />
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={!!segmentToDelete}
                title="Eliminar Segmento"
                message={deleteError ? (
                    <div className="flex flex-col gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/50">
                        <div className="flex items-center gap-2 font-medium">
                            <AlertCircle size={18} /> Error de Dependencia
                        </div>
                        <p className="text-sm">{deleteError}</p>
                    </div>
                ) : (
                    `¿Estás seguro que deseas eliminar la conexión entre origen y destino? Esta acción no se puede deshacer.`
                )}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setSegmentToDelete(null);
                    setDeleteError(null);
                }}
                confirmText={deleteError ? "Reintentar" : "Eliminar"}
                isDestructive={true}
            />
        </div>
    );
}

