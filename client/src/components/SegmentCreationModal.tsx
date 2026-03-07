import React, { useState } from 'react';
import { X, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import type { RoutingProfile } from '../types';
import { routingProfiles, routingProfileMetadata, defaultRoutingProfile } from '../constants/routingProfiles';

interface Stop {
    stop_id: string;
    stop_name: string;
}

interface SegmentCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    stops: Stop[];
    onSave: (data: { start_node_id: string; end_node_id: string; profile: RoutingProfile; type: 'revenue' | 'empty' }) => Promise<void>;
}

export default function SegmentCreationModal({ isOpen, onClose, stops, onSave }: SegmentCreationModalProps) {
    const [startNodeId, setStartNodeId] = useState('');
    const [endNodeId, setEndNodeId] = useState('');
    const [profile, setProfile] = useState<RoutingProfile>(defaultRoutingProfile);
    const [type, setType] = useState<'revenue' | 'empty'>('revenue');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!startNodeId || !endNodeId) {
            setError('Por favor selecciona origen y destino');
            return;
        }
        if (startNodeId === endNodeId) {
            setError('El origen y el destino no pueden ser iguales');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await onSave({ start_node_id: startNodeId, end_node_id: endNodeId, profile, type });
            onClose();
            // Reset form
            setStartNodeId('');
            setEndNodeId('');
        } catch (err: any) {
            setError(err.message || 'Error al crear el segmento');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#1a1c2e] w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Nueva Arista por Formulario</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && (
                        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl border border-red-100 dark:border-red-900/50 animate-in shake duration-300">
                            <AlertCircle size={18} />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Origin */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Punto de Origen</label>
                            <select
                                value={startNodeId}
                                onChange={(e) => setStartNodeId(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                                required
                            >
                                <option value="">Seleccionar Origen...</option>
                                {stops.map(stop => (
                                    <option key={stop.stop_id} value={stop.stop_id}>
                                        {stop.stop_name} ({stop.stop_id.substring(0, 8)})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Destination */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Punto de Destino</label>
                            <select
                                value={endNodeId}
                                onChange={(e) => setEndNodeId(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                                required
                            >
                                <option value="">Seleccionar Destino...</option>
                                {stops.map(stop => (
                                    <option key={stop.stop_id} value={stop.stop_id}>
                                        {stop.stop_name} ({stop.stop_id.substring(0, 8)})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center justify-center py-2">
                        <div className="h-px bg-gray-100 dark:bg-gray-800 flex-1"></div>
                        <div className="px-4 text-gray-300 dark:text-gray-600"><ArrowRight size={20} /></div>
                        <div className="h-px bg-gray-100 dark:bg-gray-800 flex-1"></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {/* Type */}
                         <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo de Segmento</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as 'revenue' | 'empty')}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                            >
                                <option value="revenue">Servicio (Revenue)</option>
                                <option value="empty">Vacío (Empty/Deadhead)</option>
                            </select>
                        </div>

                        {/* Profile */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Perfil de Enrutamiento</label>
                            <select
                                value={profile}
                                onChange={(e) => setProfile(e.target.value as RoutingProfile)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                            >
                                {routingProfiles.map(p => (
                                    <option key={p} value={p}>
                                        {routingProfileMetadata[p].label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-semibold"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-[2] px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Procesando...
                                </>
                            ) : (
                                "Crear Arista"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
