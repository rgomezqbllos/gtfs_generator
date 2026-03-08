import * as React from 'react';
import type { Stop } from '../types';
import { X, Save, Trash2, MapPin, Hash, Navigation } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { API_URL } from '../config';

interface StopDetailsProps {
    stop: Stop;
    onClose: () => void;
    onUpdate: (updatedStop: Stop) => void;
    onDelete: (stopId: string) => Promise<void>;
}

const StopDetails: React.FC<StopDetailsProps> = ({ stop, onClose, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [formData, setFormData] = React.useState({ ...stop });
    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

    React.useEffect(() => {
        setFormData({ ...stop });
    }, [stop]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/stops/${stop.stop_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                onUpdate(formData);
                setIsEditing(false);
            } else {
                alert('No se pudo actualizar el nodo');
            }
        } catch (err) {
            console.error(err);
            alert('Error de red');
        }
    };

    const handleDeleteClick = () => {
        setConfirmOpen(true);
        setErrorMsg(null);
    };

    const handleConfirmDelete = async () => {
        try {
            await onDelete(stop.stop_id);
            setConfirmOpen(false);
            onClose();
        } catch (err: unknown) {
            console.error('Eliminación fallida:', err);
            setErrorMsg((err as Error).message || 'No se pudo eliminar el nodo');
        }
    };

    return (
        <>
            <div className="absolute top-4 right-4 w-96 glass-panel shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)] z-30 flex flex-col max-h-[85vh] overflow-hidden border utilitarian-border animate-in slide-in-from-right-4 duration-500 ease-out-expo pointer-events-auto rounded-3xl">
                
                {/* Header Area */}
                <div className="bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md p-6 flex justify-between items-center border-b utilitarian-border sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                            <MapPin size={20} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-wider">
                                {isEditing ? 'Gestión de Nodo' : 'Información de Punto'}
                            </h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Network Node Component</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-xl hover:bg-white dark:hover:bg-slate-800 transition-all">
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-white/20">
                    {isEditing ? (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">Identificador Público</label>
                                <input
                                    className="w-full bg-white dark:bg-slate-800 border utilitarian-border p-3.5 rounded-2xl text-[13px] font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-300"
                                    value={formData.stop_name}
                                    placeholder="Nombre de la parada..."
                                    onChange={e => setFormData({ ...formData, stop_name: e.target.value })}
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">Código (GTFS)</label>
                                    <div className="relative">
                                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-3.5 h-3.5" />
                                        <input
                                            className="w-full bg-white dark:bg-slate-800 border utilitarian-border pl-9 pr-3 py-3 rounded-2xl text-[13px] font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                            value={formData.stop_code || ''}
                                            onChange={e => setFormData({ ...formData, stop_code: e.target.value })}
                                            placeholder="REF-XXXX"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">Tipología</label>
                                    <select
                                        className="w-full bg-white dark:bg-slate-800 border utilitarian-border p-3 rounded-2xl text-[12px] font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none"
                                        value={formData.node_type || 'regular'}
                                        onChange={e => setFormData({ ...formData, node_type: e.target.value as Stop['node_type'] })}
                                    >
                                        <option value="regular">Parada Regular</option>
                                        <option value="station">Estación / Hub</option>
                                        <option value="commercial">Comercial</option>
                                        <option value="checkpoint">Punto de Control</option>
                                        <option value="parking">Parqueo / Patio</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">Coordenadas Geográficas</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">LAT</span>
                                        <input
                                            type="number" step="any"
                                            className="w-full bg-white dark:bg-slate-800 border utilitarian-border pl-10 pr-3 py-3 rounded-2xl text-[13px] font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                            value={formData.stop_lat}
                                            onChange={e => setFormData({ ...formData, stop_lat: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">LON</span>
                                        <input
                                            type="number" step="any"
                                            className="w-full bg-white dark:bg-slate-800 border utilitarian-border pl-10 pr-3 py-3 rounded-2xl text-[13px] font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                            value={formData.stop_lon}
                                            onChange={e => setFormData({ ...formData, stop_lon: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-3 text-[11px] font-black uppercase tracking-widest text-slate-500 border utilitarian-border rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Cancelar</button>
                                <button type="submit" className="flex-[2] py-3 bg-primary text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
                                    <Save size={16} strokeWidth={2.5} /> Sincronizar Nodo
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div>
                                <h3 className="text-2xl font-display font-black dark:text-white text-slate-900 leading-tight mb-2">{stop.stop_name}</h3>
                                <div className="inline-flex items-center gap-2 bg-primary/5 text-primary px-3 py-1.5 rounded-full border border-primary/10">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.15em]">{stop.node_type || 'Parada Regular'}</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">Detalle Técnico</h4>
                                <div className="bg-slate-50/50 dark:bg-slate-900/40 p-5 rounded-3xl border utilitarian-border space-y-4 shadow-inner">
                                    <div className="flex justify-between items-center group">
                                        <span className="text-[11px] font-bold text-slate-400">UUID Interno</span>
                                        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-[150px] group-hover:text-primary transition-colors cursor-help" title={stop.stop_id}>
                                            {stop.stop_id.split('-')[0]}...
                                        </span>
                                    </div>
                                    <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-bold text-slate-400">Referencia GTFS</span>
                                        <span className="font-mono text-[12px] font-black text-slate-900 dark:text-white">{stop.stop_code || 'AUTOGEN'}</span>
                                    </div>
                                    <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />
                                    <div className="flex justify-between items-center group">
                                        <div className="flex items-center gap-2">
                                             <Navigation size={12} className="text-primary group-hover:rotate-45 transition-transform" />
                                             <span className="text-[11px] font-bold text-slate-400">Geopunto</span>
                                        </div>
                                        <span className="font-mono text-[12px] font-black text-slate-900 dark:text-white">
                                            {stop.stop_lat.toFixed(5)}, {stop.stop_lon.toFixed(5)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 border-t utilitarian-border">
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="flex-1 py-3.5 bg-white dark:bg-slate-800 border utilitarian-border rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-800 dark:text-white hover:border-primary/50 hover:shadow-xl transition-all active:scale-95"
                                >
                                    Modificar Punto
                                </button>
                                <button
                                    onClick={handleDeleteClick}
                                    className="px-5 py-3.5 bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-100 dark:border-red-900/40 rounded-2xl hover:bg-red-100 transition-all group"
                                    title="Eliminar nodo de la red"
                                >
                                    <Trash2 size={20} strokeWidth={2} className="group-hover:scale-110 group-active:scale-90 transition-transform" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmOpen}
                title={errorMsg ? "Conflicto de Integridad" : "¿Eliminar Nodo?"}
                message={errorMsg || "Esta acción removerá el punto de la red cartográca de forma permanente. Las rutas que dependan de este nodo podrían quedar fragmentadas."}
                onConfirm={handleConfirmDelete}
                onCancel={() => {
                    setConfirmOpen(false);
                    setErrorMsg(null);
                }}
                isError={!!errorMsg}
                confirmText="Confirmar Eliminación"
                cancelText="Cancelar"
            />
        </>
    );
};

export default StopDetails;
