import { useEffect, useState } from 'react';
import { X, Trash2, Edit2, AlertCircle } from 'lucide-react';
import { DataTable } from './UI/DataTable';
import type { ColumnDef } from './UI/DataTable';
import { Stop } from '../types';
import { API_URL } from '../config';
import ConfirmModal from './ConfirmModal';

interface StopsCatalogProps {
    onClose: () => void;
    onUpdateStop: (stop: Stop) => void;
    onAddOnMap: () => void;
}

export default function StopsCatalog({ onClose, onUpdateStop, onAddOnMap }: StopsCatalogProps) {
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
            if (!res.ok) throw new Error('Failed to fetch stops');
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
                // Return 409 means dependency conflict
                setDeleteError(data.error || 'No se puede eliminar la parada porque está en uso.');
                return; // Do not close modal yet
            }

            // Success
            setStops(prev => prev.filter(s => s.stop_id !== stopToDelete.stop_id));
            setStopToDelete(null);
        } catch (err: any) {
            setDeleteError("Hubo un error de conexión al eliminar.");
        }
    };

    const columns: ColumnDef<Stop>[] = [
        { header: 'ID', accessorKey: 'stop_id', filterable: true, sortable: true },
        { header: 'Código', accessorKey: 'stop_code', filterable: true, sortable: true },
        { header: 'Nombre', accessorKey: 'stop_name', filterable: true, sortable: true },
        {
            header: 'Tipo',
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
            ]
        },
        { header: 'Latitud', accessorKey: 'stop_lat' },
        { header: 'Longitud', accessorKey: 'stop_lon' },
    ];

    return (
        <div className="absolute inset-0 z-40 bg-white dark:bg-[#0f111a] flex flex-col pt-4 px-6 animate-in slide-in-from-right-8 fade-in">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">Catálogo de Paradas (Nodos)</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gestiona todos los nodos. Las eliminaciones están protegidas si están en uso en segmentos o viajes.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onAddOnMap}
                        className="px-4 py-2 bg-[#1337ec] text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm whitespace-nowrap"
                    >
                        Añadir en Mapa
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
                    <div className="flex items-center justify-center h-full text-gray-500">Cargando paradas...</div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2">
                        <AlertCircle size={32} />
                        <p>{error}</p>
                    </div>
                ) : (
                    <DataTable
                        data={stops}
                        columns={columns}
                        keyField="stop_id"
                        actions={(stop) => (
                            <div className="flex items-center justify-end gap-2">
                                {/* Future enhancement: Edit Stop via Modal */}
                                <button
                                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-[#1337ec]/20 rounded transition-colors"
                                    title="Editar en mapa"
                                    onClick={() => onUpdateStop(stop)} // Just an example, maybe selects it in Map
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                    onClick={() => handleDeleteClick(stop)}
                                    title="Eliminar"
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
                isOpen={!!stopToDelete}
                title="Eliminar Parada"
                message={deleteError ? (
                    <div className="flex flex-col gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/50">
                        <div className="flex items-center gap-2 font-medium">
                            <AlertCircle size={18} /> Error de Dependencia
                        </div>
                        <p className="text-sm">{deleteError}</p>
                    </div>
                ) : (
                    `¿Estás seguro que deseas eliminar la parada "${stopToDelete?.stop_name}"? Esta acción no se puede deshacer.`
                )}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setStopToDelete(null);
                    setDeleteError(null);
                }}
                confirmText={deleteError ? "Reintentar" : "Eliminar"}
                isDestructive={true}
            />
        </div>
    );
}

