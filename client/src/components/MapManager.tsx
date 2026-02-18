
import React, { useState, useEffect } from 'react';
import { Download, Trash2, Globe, Server, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import ConfirmModal from './ConfirmModal';

interface MapInfo {
    key: string;
    name: string;
    isDownloaded: boolean;
    isActive: boolean;
}

interface StatusInfo {
    status: 'idle' | 'downloading' | 'processing' | 'running' | 'error';
    message: string;
    progress?: number;
    activeRegion?: string;
}

import { API_URL } from '../config';

const MapManager: React.FC = () => {
    const [maps, setMaps] = useState<MapInfo[]>([]);
    const [status, setStatus] = useState<StatusInfo>({ status: 'idle', message: '' });
    const [loading, setLoading] = useState(false);
    const [selectedMap, setSelectedMap] = useState<string>('');
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    // Custom Map State
    const [isCustomMode, setIsCustomMode] = useState(false);
    const [customUrl, setCustomUrl] = useState('');
    const [customName, setCustomName] = useState('');

    const fetchMaps = async () => {
        try {
            const res = await fetch(`${API_URL}/maps`);
            if (res.ok) {
                const data = await res.json();
                setMaps(data);
                if (!selectedMap && data.length > 0) setSelectedMap(data[0].key);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/maps/status`);
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
                if (data.status === 'downloading' || data.status === 'processing') {
                    // Poll faster if busy
                    setTimeout(fetchStatus, 1000);
                    // Refresh maps to update "Active" indicators
                    fetchMaps();
                } else if (data.status === 'running' || data.status === 'idle') {
                    fetchMaps(); // Ensure UI is in sync
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchMaps(), fetchStatus()]).finally(() => setLoading(false));
    }, []);

    const handleDownload = async () => {
        const payload: any = {};

        if (isCustomMode) {
            if (!customUrl) return alert('URL is required');
            payload.customUrl = customUrl;
            payload.customName = customName || 'Custom Map';
            payload.region = ''; // Not used for custom
        } else {
            if (!selectedMap) return;
            payload.region = selectedMap;
        }

        try {
            const res = await fetch(`${API_URL}/maps/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                fetchStatus(); // Start polling
                setCustomUrl('');
                setCustomName('');
                setIsCustomMode(false);
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            alert('Failed to start download');
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            const res = await fetch(`${API_URL}/maps/${confirmDelete}`, { method: 'DELETE' });
            if (res.ok) {
                fetchMaps();
            } else {
                alert('Failed to delete map');
            }
        } catch (e) {
            alert('Error deleting map');
        } finally {
            setConfirmDelete(null);
        }
    };

    const isBusy = status.status === 'downloading' || status.status === 'processing';

    if (loading) {
        return (
            <div className="flex justify-center p-8 text-blue-600">
                <Loader2 size={24} className="animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">

            {/* Status Card */}
            <div className={clsx(
                "p-4 rounded-xl border flex flex-col gap-3 transition-colors",
                status.status === 'error' ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300" :
                    status.status === 'running' ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300" :
                        isBusy ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300" :
                            "bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
            )}>
                <div className="flex items-start gap-3">
                    {status.status === 'running' && <CheckCircle size={20} className="mt-0.5" />}
                    {status.status === 'error' && <AlertTriangle size={20} className="mt-0.5" />}
                    {isBusy && <Loader2 size={20} className="animate-spin mt-0.5" />}
                    {!['running', 'error', 'downloading', 'processing'].includes(status.status) && <Server size={20} className="mt-0.5" />}

                    <div className="flex-1">
                        <h4 className="font-bold text-sm uppercase mb-1">OSRM Server Status: {status.status}</h4>
                        <p className="text-sm opacity-90">{status.message}</p>
                        {status.activeRegion && status.status === 'running' && (
                            <p className="text-xs font-mono mt-1 opacity-75">Active Region: {status.activeRegion}</p>
                        )}
                    </div>
                </div>

                {/* Progress Bar */}
                {status.status === 'downloading' && (
                    <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2.5 mt-2 overflow-hidden">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${status.progress || 0}%` }}
                        ></div>
                        <p className="text-xs text-right mt-1 font-mono">{status.progress || 0}%</p>
                    </div>
                )}
            </div>

            {/* Downloader */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Download size={18} className="text-blue-600" /> Install / Switch Map
                    </h3>
                    <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button
                            onClick={() => setIsCustomMode(false)}
                            className={clsx("text-xs px-3 py-1.5 rounded-md transition-all font-medium", !isCustomMode ? "bg-white dark:bg-gray-600 text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400")}
                        >
                            List
                        </button>
                        <button
                            onClick={() => setIsCustomMode(true)}
                            className={clsx("text-xs px-3 py-1.5 rounded-md transition-all font-medium", isCustomMode ? "bg-white dark:bg-gray-600 text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400")}
                        >
                            Custom URL
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-3">

                    {!isCustomMode ? (
                        <select
                            value={selectedMap}
                            onChange={(e) => setSelectedMap(e.target.value)}
                            disabled={isBusy}
                            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                            {maps.map(m => (
                                <option key={m.key} value={m.key}>
                                    {m.name} {m.isActive ? '(Active)' : ''} {m.isDownloaded ? '✓' : ''}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Map Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. My Custom City"
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    disabled={isBusy}
                                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">PBF URL</label>
                                <input
                                    type="text"
                                    placeholder="https://download.geofabrik.de/.../city.osm.pbf"
                                    value={customUrl}
                                    onChange={(e) => setCustomUrl(e.target.value)}
                                    disabled={isBusy}
                                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                                />
                            </div>
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                                Tip: Use links from <a href="https://download.geofabrik.de/" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">Geofabrik.de</a>. Must end in .osm.pbf
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleDownload}
                        disabled={isBusy || (!isCustomMode && !selectedMap) || (isCustomMode && !customUrl)}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {isBusy ? 'Processing...' : 'Download & Activate'}
                    </button>
                    {!isBusy && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            Downloading a new map will stop the current routing server.
                        </p>
                    )}
                </div>
            </div>

            {/* Installed Maps */}
            <div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                    <Globe size={16} /> Installed Maps
                </h3>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {maps.filter(m => m.isDownloaded).length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm italic">No maps installed</div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {maps.filter(m => m.isDownloaded).map(m => (
                                <div key={m.key} className="p-3 flex items-center justify-between hover:bg-white dark:hover:bg-gray-800 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <div className={clsx("w-2 h-2 rounded-full", m.isActive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-gray-300 dark:bg-gray-600",
                                            m.name.startsWith('Custom') ? "bg-purple-500" : ""
                                        )}></div>
                                        <div>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 block">{m.name}</span>
                                            {m.name.startsWith('Custom') && <span className="text-[10px] text-gray-400 font-mono">{m.key}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {m.isActive ? (
                                            <span className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">Active</span>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDelete(m.key)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                title="Delete Map Files"
                                                disabled={isBusy}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={!!confirmDelete}
                title="Delete Map?"
                message={`Are you sure you want to delete the map files for this region? You will need to re-download it to use it again.`}
                confirmText="Delete"
                isDestructive={true}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
};

export default MapManager;
