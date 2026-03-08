import * as React from 'react';
import type { Route } from '../types';
import { Trash2, Map as MapIcon, Edit2, Search, ArrowUpDown, Plus, FileText, Route as RouteIcon, Activity, Database, Clock, Layers, ChevronRight, Loader2 } from 'lucide-react';

import ConfirmModal from './ConfirmModal';
import RouteCreationModal from './RouteCreationModal';
import TripsManager from './TripsManager';
import ExportTravelTimesModal from './ExportTravelTimesModal';

import { API_URL } from '../config';

interface RouteCatalogProps {
    onOpenMap: () => void;
    onSelectRoute: (route: Route) => void; 
    onDataUpdate?: () => void;
}

interface RouteMetrics {
    [routeId: string]: {
        dist0: number; 
        dist1: number;
        time0: number; 
        time1: number;
    }
}

const RouteCatalog: React.FC<RouteCatalogProps> = ({ onOpenMap, onSelectRoute, onDataUpdate }) => {
    const [routes, setRoutes] = React.useState<Route[]>([]);
    const [metrics, setMetrics] = React.useState<RouteMetrics>({});
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');

    // Delete State
    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [routeToDelete, setRouteToDelete] = React.useState<string | null>(null);

    // Create / Edit State
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [routeToEdit, setRouteToEdit] = React.useState<Route | null>(null);

    // Trips Manager State
    const [tripsRoute, setTripsRoute] = React.useState<Route | null>(null);

    // Export Travel Times State
    const [isExportTimesOpen, setIsExportTimesOpen] = React.useState(false);

    const fetchRoutes = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/routes`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setRoutes(data);
                data.forEach(route => fetchRouteMetrics(route.route_id));
            }
        } catch (err) {
            console.error('Failed to fetch routes', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchRouteMetrics = async (routeId: string) => {
        try {
            const [res0, res1, segmentsRes] = await Promise.all([
                fetch(`${API_URL}/routes/${routeId}/path?direction_id=0`),
                fetch(`${API_URL}/routes/${routeId}/path?direction_id=1`),
                fetch(`${API_URL}/segments`)
            ]);

            const path0 = await res0.json();
            const path1 = await res1.json();
            const segments = await segmentsRes.json();

            const calculateMetrics = (stopIds: string[]) => {
                if (!stopIds || stopIds.length < 2) return { dist: 0, time: 0 };
                let dist = 0;
                let time = 0;
                for (let i = 0; i < stopIds.length - 1; i++) {
                    const from = stopIds[i];
                    const to = stopIds[i + 1];
                    const seg = segments.find((s: any) => s.start_node_id === from && s.end_node_id === to);
                    if (seg) {
                        dist += (seg.distance || 0);
                        time += (seg.travel_time || 0);
                    }
                }
                return { dist, time };
            };

            const m0 = calculateMetrics(path0.ordered_stop_ids);
            const m1 = calculateMetrics(path1.ordered_stop_ids);

            setMetrics(prev => ({
                ...prev,
                [routeId]: {
                    dist0: m0.dist,
                    time0: m0.time,
                    dist1: m1.dist,
                    time1: m1.time
                }
            }));

        } catch (err) {
            console.warn(`Failed metrics for route ${routeId}`, err);
        }
    };

    React.useEffect(() => {
        fetchRoutes();
    }, [fetchRoutes]);

    const handleDelete = async () => {
        if (!routeToDelete) return;
        try {
            await fetch(`${API_URL}/routes/${routeToDelete}`, { method: 'DELETE' });
            setRoutes(prev => prev.filter(r => r.route_id !== routeToDelete));
            setConfirmOpen(false);
            setRouteToDelete(null);
            if (onDataUpdate) onDataUpdate();
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    const handleEdit = (route: Route) => {
        setRouteToEdit(route);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setRouteToEdit(null);
        setIsModalOpen(true);
    };

    const formatDist = (meters: number) => (meters / 1000).toFixed(2);
    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const filteredRoutes = routes.filter(r =>
        r.route_short_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.route_long_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="absolute inset-0 z-[60] bg-white dark:bg-slate-950 flex flex-col p-8 lg:p-12 animate-in fade-in duration-700 ease-out-expo">
            
            {/* High-End Tactical Header */}
            <div className="flex flex-col xl:flex-row items-start justify-between mb-12 gap-8">
                <div className="flex items-center gap-6">
                    <div className="p-5 bg-primary text-white rounded-3xl shadow-2xl shadow-primary/20 scale-110">
                        <RouteIcon size={32} strokeWidth={2.5} />
                    </div>
                    <div>
                         <div className="flex items-center gap-3 mb-2">
                             <h2 className="text-3xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                                Catálogo de Rutas
                            </h2>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary rounded-full border border-primary/20">
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Sincronizado</span>
                            </div>
                        </div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest max-w-2xl leading-relaxed">
                            Gestión operativa del inventario de red. Administre la topología de trazados, 
                            el rendimiento métrico por sentido y el despacho de servicios asociados.
                        </p>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex gap-4 p-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border utilitarian-border mr-2">
                         <div className="px-4 py-2 text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Rutas Activas</p>
                            <p className="text-lg font-display font-black text-slate-900 dark:text-white leading-none">{routes.length}</p>
                         </div>
                         <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 my-auto" />
                         <div className="px-4 py-2 text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Suministro</p>
                            <p className="text-lg font-display font-black text-emerald-500 leading-none">OK</p>
                         </div>
                    </div>

                    <button
                        onClick={() => setIsExportTimesOpen(true)}
                        className="flex items-center gap-2.5 px-6 py-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-[20px] hover:text-primary transition-all font-black text-[10px] uppercase tracking-widest border utilitarian-border shadow-sm active:scale-95"
                    >
                        <FileText size={16} strokeWidth={2.5} />
                        Exportar Tiempos
                    </button>
                    <button
                        onClick={onOpenMap}
                        className="flex items-center gap-2.5 px-6 py-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-[20px] hover:text-primary transition-all font-black text-[10px] uppercase tracking-widest border utilitarian-border shadow-sm active:scale-95"
                    >
                        <MapIcon size={16} strokeWidth={2.5} />
                        Visualizar Red
                    </button>
                    <button
                        onClick={handleCreate}
                        className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-[20px] hover:scale-105 active:scale-95 transition-all font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 group"
                    >
                        <Plus size={18} strokeWidth={3} className="group-hover:rotate-90 transition-transform" />
                        Nueva Ruta
                    </button>
                </div>
            </div>

            {/* Tactical Search & Tools Bar */}
            <div className="mb-8 flex flex-col md:flex-row gap-6">
                <div className="relative group flex-1 max-w-xl">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="BUSCAR TRAZADO POR CÓDIGO O DENOMINACIÓN..."
                        className="w-full pl-14 pr-6 py-4 bg-slate-50 dark:bg-slate-800/30 border-2 border-transparent focus:border-primary/20 rounded-[20px] text-[12px] font-black uppercase tracking-tight placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 outline-none transition-all shadow-sm"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Main Application Catalog Table */}
            <div className="flex-1 min-h-0 bg-white dark:bg-slate-900 border utilitarian-border rounded-[32px] overflow-hidden shadow-sm flex flex-col">
                <div className="overflow-x-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/20 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 border-b utilitarian-border">
                                <th className="px-8 py-6 w-28">Código</th>
                                <th className="px-8 py-6 w-24 text-center">Color</th>
                                <th className="px-8 py-6">Identificación y Trazado</th>
                                <th className="px-8 py-6 w-56">Operadora</th>
                                <th className="px-8 py-6 text-center w-64 border-l border-r utilitarian-border">Métrica Operativa (Km/Tiempo)</th>
                                <th className="px-8 py-6 w-44 text-right">Protocolos</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y utilitarian-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-32 text-center">
                                        <div className="flex flex-col items-center gap-6">
                                             <Loader2 size={40} className="text-primary animate-spin" />
                                             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 animate-pulse">Sincronizando Catálogo...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredRoutes.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-40 text-center">
                                        <div className="flex flex-col items-center gap-6 text-slate-200 dark:text-slate-800">
                                            <Layers size={80} strokeWidth={1} />
                                            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Sin rutas registradas en el entorno</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredRoutes.map((route, idx) => {
                                const m = metrics[route.route_id] || { dist0: 0, dist1: 0, time0: 0, time1: 0 };
                                return (
                                    <tr key={route.route_id} 
                                        style={{ animationDelay: `${idx * 40}ms` }}
                                        className="hover:bg-primary/5 dark:hover:bg-primary/5 transition-colors group/row animate-in fade-in slide-in-from-left-4 duration-500"
                                    >
                                        {/* Code */}
                                        <td className="px-8 py-7" onClick={() => handleEdit(route)}>
                                            <div className="flex flex-col cursor-pointer">
                                                <span className="font-mono text-[14px] font-black text-primary tracking-tighter leading-none">
                                                    {route.route_short_name}
                                                </span>
                                                <span className="text-[9px] font-mono font-bold text-slate-300 mt-2 opacity-0 group-hover/row:opacity-100 transition-opacity uppercase">
                                                    ID: {route.route_id.substring(0, 8)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Color Signature */}
                                        <td className="px-8 py-7">
                                            <div className="flex justify-center">
                                                <div 
                                                    className="w-10 h-10 rounded-[14px] shadow-lg border-2 border-white dark:border-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 cursor-pointer transform hover:rotate-12 transition-transform"
                                                    style={{ backgroundColor: `#${route.route_color}` }}
                                                    onClick={() => handleEdit(route)}
                                                />
                                            </div>
                                        </td>

                                        {/* Identification */}
                                        <td className="px-8 py-7">
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => onSelectRoute(route)}
                                                    className="text-left font-display font-black text-[16px] text-slate-900 dark:text-white hover:text-primary transition-colors leading-tight uppercase tracking-tight flex items-center gap-2 group/btn"
                                                >
                                                    {route.route_long_name}
                                                    <ChevronRight size={14} className="opacity-0 -translate-x-2 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all text-primary" />
                                                </button>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                    <Activity size={10} /> {route.route_desc || 'Sin descripción técnica consolidada'}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Agency Entity */}
                                        <td className="px-8 py-7">
                                            <div className="flex items-center gap-2">
                                                <Database size={12} className="text-slate-300" />
                                                <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest truncate max-w-[180px]">
                                                    {route.agency_name || <span className="text-slate-200 dark:text-slate-800 font-black italic">PENDIENTE</span>}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Comparative Metrics */}
                                        <td className="px-8 py-7 border-l border-r utilitarian-border bg-slate-50/20 dark:bg-slate-800/10">
                                            <div className="flex flex-col gap-4">
                                                <div className="flex items-center justify-between gap-6">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Sentido 0</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-[12px] font-black text-slate-900 dark:text-white">{formatDist(m.dist0)}</span>
                                                            <span className="text-[9px] font-bold text-slate-400">KM</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-1.5 px-2 py-0.5 bg-primary/5 rounded-md">
                                                            <Clock size={10} className="text-primary" />
                                                            <span className="font-mono text-[11px] font-black text-primary">{formatTime(m.time0)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-px h-10 bg-slate-200 dark:bg-slate-700" />
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Sentido 1</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-[12px] font-black text-slate-900 dark:text-white">{formatDist(m.dist1)}</span>
                                                            <span className="text-[9px] font-bold text-slate-400">KM</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-1.5 px-2 py-0.5 bg-slate-900 text-white dark:bg-slate-700 rounded-md shadow-sm">
                                                            <Clock size={10} className="text-white/60" />
                                                            <span className="font-mono text-[11px] font-black">{formatTime(m.time1)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Actions Protocol */}
                                        <td className="px-8 py-7 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-all translate-x-4 group-hover/row:translate-x-0">
                                                <button
                                                    className="p-3 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all active:scale-90"
                                                    title="Gestionar Despacho (Expediciones)"
                                                    onClick={() => setTripsRoute(route)}
                                                >
                                                    <ArrowUpDown size={18} strokeWidth={2.5} />
                                                </button>
                                                <button
                                                    className="p-3 text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/5 rounded-xl transition-all active:scale-90"
                                                    title="Editar Topología"
                                                    onClick={() => handleEdit(route)}
                                                >
                                                    <Edit2 size={18} strokeWidth={2.5} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setRouteToDelete(route.route_id);
                                                        setConfirmOpen(true);
                                                    }}
                                                    className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all active:scale-90"
                                                    title="Destruir Registro"
                                                >
                                                    <Trash2 size={18} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Components Stack */}
            <ConfirmModal
                isOpen={confirmOpen}
                title="Protocolo de Destrucción"
                message="¿Solicita la eliminación definitiva de la ruta y todos sus servicios operativos asociados? Esta acción eludirá los mecanismos de recuperación."
                onConfirm={handleDelete}
                onCancel={() => setConfirmOpen(false)}
                isDestructive={true}
            />

            <RouteCreationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreated={() => {
                    fetchRoutes();
                    if (onDataUpdate) onDataUpdate();
                }}
                routeToEdit={routeToEdit}
            />

            <ExportTravelTimesModal
                isOpen={isExportTimesOpen}
                onClose={() => setIsExportTimesOpen(false)}
            />

            {tripsRoute && (
                <TripsManager
                    route={tripsRoute}
                    onClose={() => setTripsRoute(null)}
                />
            )}

            {/* System Status Footer Decoration */}
            <div className="mt-8 flex items-center justify-between px-4 opacity-50 pointer-events-none">
                 <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2">
                        <Database size={12} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Protocolo: GTFS 2.0.1</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Activity size={12} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Latencia DB: 12ms</span>
                    </div>
                 </div>
                 <div className="text-[9px] font-black uppercase tracking-widest">© 2026 GTFS PRO EXTREME EDITION</div>
            </div>
        </div>
    );
};

export default RouteCatalog;
