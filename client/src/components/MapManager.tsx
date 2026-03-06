
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
    const [mapMode, setMapMode] = useState<'list' | 'custom' | 'upload'>('list');
    const [customUrl, setCustomUrl] = useState('');
    const [customName, setCustomName] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);

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

        if (mapMode === 'custom') {
            if (!customUrl) return alert('URL is required');
            payload.customUrl = customUrl;
            payload.customName = customName || 'Custom Map';
            payload.region = ''; // Not used for custom
        } else if (mapMode === 'list') {
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
                setMapMode('list');
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            alert('Failed to start download');
        }
    };

    const handleUpload = async () => {
        if (!uploadFile) return alert('No file selected');
        if (!uploadFile.name.endsWith('.osm.pbf')) return alert('File must be an .osm.pbf file');

        const formData = new FormData();
        formData.append('file', uploadFile);

        setStatus({ status: 'downloading', message: `Uploading ${uploadFile.name}...`, progress: 0 });

        try {
            const res = await fetch(`${API_URL}/maps/upload`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                setUploadFile(null);
                setMapMode('list');
                fetchMaps();
                setStatus({ status: 'idle', message: 'Upload complete' });
            } else {
                const err = await res.json();
                alert(`Upload error: ${err.error}`);
                setStatus({ status: 'error', message: err.error });
            }
        } catch (e) {
            alert('Upload failed');
            setStatus({ status: 'error', message: 'Upload failed' });
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

    const handleClearError = async () => {
        try {
            const res = await fetch(`${API_URL}/maps/status/clear`, { method: 'POST' });
            if (res.ok) {
                fetchStatus();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleCancel = async () => {
        try {
            const res = await fetch(`${API_URL}/maps/cancel`, { method: 'POST' });
            if (res.ok) {
                fetchStatus();
            } else {
                alert('Failed to cancel process');
            }
        } catch (e) {
            console.error('Error cancelling', e);
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
                        <div className="flex justify-between items-start">
                            <h4 className="font-bold text-sm uppercase mb-1">OSRM Server Status: {status.status}</h4>
                            {isBusy && (
                                <button
                                    onClick={handleCancel}
                                    className="bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-300 text-xs px-3 py-1 rounded-md border border-red-200 dark:border-red-800 transition-colors font-medium -mt-1"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
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

                {/* Error Actions */}
                {status.status === 'error' && (
                    <div className="flex justify-end mt-2">
                        <button
                            onClick={handleClearError}
                            className="bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-300 text-xs px-3 py-1.5 rounded-md transition-colors font-medium border border-red-200 dark:border-red-800"
                        >
                            Clear Error Alert
                        </button>
                    </div>
                )}
            </div>

            {/* Downloader */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Download size={18} className="text-blue-600" /> Install Maps
                    </h3>
                    <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button
                            onClick={() => setMapMode('list')}
                            className={clsx("text-xs px-3 py-1.5 rounded-md transition-all font-medium", mapMode === 'list' ? "bg-white dark:bg-gray-600 text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400")}
                        >
                            List
                        </button>
                        <button
                            onClick={() => setMapMode('custom')}
                            className={clsx("text-xs px-3 py-1.5 rounded-md transition-all font-medium", mapMode === 'custom' ? "bg-white dark:bg-gray-600 text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400")}
                        >
                            URL
                        </button>
                        <button
                            onClick={() => setMapMode('upload')}
                            className={clsx("text-xs px-3 py-1.5 rounded-md transition-all font-medium", mapMode === 'upload' ? "bg-white dark:bg-gray-600 text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-gray-400")}
                        >
                            Upload File
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-3">

                    {mapMode === 'list' && (
                        <select
                            value={selectedMap}
                            onChange={(e) => setSelectedMap(e.target.value)}
                            disabled={isBusy}
                            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                            {maps.map(m => (
                                <option key={m.key} value={m.key}>
                                    {m.name} {m.isDownloaded ? '✓ (Installed)' : ''}
                                </option>
                            ))}
                        </select>
                    )}

                    {mapMode === 'custom' && (
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

                    {mapMode === 'upload' && (
                        <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-2 block">Local .osm.pbf File</label>
                                <input
                                    type="file"
                                    accept=".osm.pbf"
                                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                    disabled={isBusy}
                                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-200 transition-colors"
                                />
                            </div>
                        </div>
                    )}

                    {mapMode === 'upload' ? (
                        <button
                            onClick={handleUpload}
                            disabled={isBusy || !uploadFile}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            {isBusy ? 'Uploading...' : 'Upload Offline Map'}
                        </button>
                    ) : (
                        <button
                            onClick={handleDownload}
                            disabled={isBusy || (mapMode === 'list' && !selectedMap) || (mapMode === 'custom' && !customUrl)}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            {isBusy ? 'Downloading...' : 'Download Map'}
                        </button>
                    )}

                    {!isBusy && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            Installed maps will appear in the list below. Activate them to start routing.
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
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        // Trigger local activation logic
                                                        setSelectedMap(m.key);
                                                        setMapMode('list');
                                                        fetch(`${API_URL}/maps/activate`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ region: m.key })
                                                        }).then(res => {
                                                            if (res.ok) fetchStatus();
                                                            else res.json().then(err => alert(`Error: ${err.error}`));
                                                        });
                                                    }}
                                                    className="p-1 px-3 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800 transition-colors"
                                                    disabled={isBusy}
                                                >
                                                    Activate
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDelete(m.key)}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                    title="Delete Map Files"
                                                    disabled={isBusy}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
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
