import * as React from 'react';
import type { Route } from '../types';
import { Trash2, Map as MapIcon, Edit2, Search, ArrowUpDown, Plus } from 'lucide-react';

import ConfirmModal from './ConfirmModal';
import RouteCreationModal from './RouteCreationModal';
import TripsManager from './TripsManager';

const API_URL = 'http://localhost:3000/api';

interface RouteCatalogProps {
    onOpenMap: () => void;
    onSelectRoute: (route: Route) => void; // Opens Details
    onDataUpdate?: () => void;
}

interface RouteMetrics {
    [routeId: string]: {
        dist0: number; // meters
        dist1: number;
        time0: number; // seconds
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

    const fetchRoutes = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/routes`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setRoutes(data);
                // Fetch metrics for all routes
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
            // Fetch both directions
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
        <div className="absolute inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex flex-col animate-in fade-in duration-300">
            {/* Header / Actions */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6 shadow-sm">
                <div className="max-w-7xl mx-auto flex flex-col gap-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Route Catalog</h1>
                            <p className="text-gray-500 dark:text-gray-400 mt-1">Manage network routes, agencies, and performance metrics.</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onOpenMap}
                                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium shadow-sm"
                            >
                                <MapIcon size={18} />
                                Map View
                            </button>
                            <button
                                onClick={handleCreate}
                                className="flex items-center gap-2 px-4 py-2 bg-[#1337ec] text-white rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-lg shadow-blue-500/20"
                            >
                                <Plus size={18} />
                                Add New Route
                            </button>
                        </div>
                    </div>

                    {/* Search & Filter Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search routes by name or code..."
                            className="w-full max-w-md pl-10 pr-4 py-3 bg-gray-100 dark:bg-gray-900/50 border-none rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-gray-400"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto px-8 py-8">
                <div className="max-w-7xl mx-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 dark:bg-gray-900/50 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700">
                                    <th className="px-6 py-4 w-24">Code</th>
                                    <th className="px-6 py-4 w-32">Color</th>
                                    <th className="px-6 py-4">Route Name</th>
                                    <th className="px-6 py-4 w-48">Agency</th>
                                    <th className="px-6 py-4 text-center w-40">Dist (km)<br /><span className="text-[10px] normal-case opacity-70">(Out / Return)</span></th>
                                    <th className="px-6 py-4 text-center w-40">Time<br /><span className="text-[10px] normal-case opacity-70">(Out / Return)</span></th>
                                    <th className="px-6 py-4 w-48 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                {loading && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-400 animate-pulse">
                                            Loading routes data...
                                        </td>
                                    </tr>
                                )}

                                {!loading && filteredRoutes.map(route => {
                                    const m = metrics[route.route_id] || { dist0: 0, dist1: 0, time0: 0, time1: 0 };

                                    return (
                                        <tr key={route.route_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                                            {/* Code */}
                                            <td className="px-6 py-4">
                                                <div
                                                    className="group/code cursor-pointer flex items-center gap-2"
                                                    onClick={() => handleEdit(route)}
                                                >
                                                    <span className="font-mono font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm group-hover/code:bg-blue-50 dark:group-hover/code:bg-blue-900/20 transition-colors">
                                                        {route.route_short_name}
                                                    </span>
                                                    <Edit2 size={12} className="opacity-0 group-hover/code:opacity-100 text-gray-400" />
                                                </div>
                                            </td>

                                            {/* Color */}
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative w-8 h-8 rounded-full shadow-sm border border-black/5 overflow-hidden group/color cursor-pointer transition-transform hover:scale-110"
                                                        onClick={() => handleEdit(route)}
                                                    >
                                                        <div
                                                            className="absolute inset-0"
                                                            style={{
                                                                backgroundColor: `#${route.route_color}`,
                                                                color: `#${route.route_text_color}`
                                                            }}
                                                        >
                                                            <div className="flex items-center justify-center w-full h-full text-[10px] font-bold opacity-0 group-hover/color:opacity-100 transition-opacity">
                                                                TXT
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-mono text-gray-500 uppercase">#{route.route_color}</span>
                                                        <span className="text-[10px] font-mono text-gray-400 uppercase">#{route.route_text_color}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Name */}
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-between group/name gap-4">
                                                    <button
                                                        onClick={() => onSelectRoute(route)}
                                                        className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors group/link flex-1"
                                                    >
                                                        <div className="font-semibold text-gray-900 dark:text-gray-100 text-base mb-0.5 group-hover/link:underline decoration-2 underline-offset-2 truncate">
                                                            {route.route_long_name}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {route.route_desc || 'Bus Route'}
                                                        </div>
                                                    </button>
                                                    <button
                                                        className="opacity-0 group-hover/name:opacity-100 p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEdit(route);
                                                        }}
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Agency */}
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-600 dark:text-gray-300">
                                                    {route.agency_name || <span className="text-gray-400 italic">No Agency</span>}
                                                </div>
                                            </td>

                                            {/* Dist Metrics */}
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center gap-1 font-mono text-sm bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded">
                                                    <span className="text-gray-900 dark:text-white font-bold">{formatDist(m.dist0)}</span>
                                                    <span className="text-gray-400">/</span>
                                                    <span className="text-gray-600 dark:text-gray-300">{formatDist(m.dist1)}</span>
                                                </span>
                                            </td>

                                            {/* Time Metrics */}
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center gap-1 font-mono text-sm bg-blue-50 dark:bg-blue-900/10 px-2 py-1 rounded text-blue-700 dark:text-blue-300">
                                                    <span className="font-bold">{formatTime(m.time0)}</span>
                                                    <span className="opacity-50">/</span>
                                                    <span>{formatTime(m.time1)}</span>
                                                </span>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                                        title="Trips"
                                                        onClick={() => setTripsRoute(route)}
                                                    >
                                                        <ArrowUpDown size={18} />
                                                    </button>
                                                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
                                                    <button
                                                        onClick={() => {
                                                            setRouteToDelete(route.route_id);
                                                            setConfirmOpen(true);
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                        title="Delete Route"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {!loading && filteredRoutes.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                                            <div className="flex flex-col items-center gap-3">
                                                <Search size={48} className="text-gray-200 dark:text-gray-700" />
                                                <p>No routes found matching your search.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmOpen}
                title="Delete Route?"
                message="Are you sure you want to delete this route? This action cannot be undone."
                onConfirm={handleDelete}
                onCancel={() => setConfirmOpen(false)}
                isError={false}
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

            {tripsRoute && (
                <TripsManager
                    route={tripsRoute}
                    onClose={() => setTripsRoute(null)}
                />
            )}
        </div>
    );
};

export default RouteCatalog;
