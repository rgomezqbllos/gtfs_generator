
import React, { useState, useEffect, useMemo } from 'react';
import { 
    Search, Download, Trash2, Globe,  
    Navigation, Activity, Radio,
    CheckCircle2, Plus, Database, ShieldCheck, Upload
} from 'lucide-react';
import { clsx } from 'clsx';
import { API_URL } from '../config';
import ConfirmModal from './ConfirmModal';
import { useAuth } from '../context/AuthContext';

interface MapInstance {
    id: string;
    name: string;
    status: 'pending' | 'downloading' | 'processing' | 'ready' | 'error';
    isActive: boolean;
    is_local?: boolean;
    base_port?: number;
    disk_size?: number;
    running_profiles?: string[];
    healthy_profiles?: string[];
    total_profiles?: number;
    health_status?: 'live' | 'degraded' | 'offline';
}

interface GeofabrikRegion {
    id: string;
    name: string;
    url: string;
}

export const MapHub: React.FC = () => {
    const { token } = useAuth();
    const [maps, setMaps] = useState<MapInstance[]>([]);
    const [geofabrik, setGeofabrik] = useState<GeofabrikRegion[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [mapToDelete, setMapToDelete] = useState<string | null>(null);
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [customName, setCustomName] = useState('');
    const [customUrl, setCustomUrl] = useState('');
    const [uploadName, setUploadName] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [osrmStatus, setOsrmStatus] = useState<any>(null);

    const fetchMaps = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/maps`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setMaps(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/osrm/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setOsrmStatus(data);
                if (data.status === 'downloading' || data.status === 'processing') {
                    setTimeout(fetchStatus, 2000);
                    fetchMaps();
                } else if (data.status === 'error' || data.status === 'running') {
                    // Final refresh when process ends
                    fetchMaps();
                }
            }
        } catch (e) { console.error(e); }
    };

    const fetchGeofabrik = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/geofabrik`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data?.features) {
                const regions = data.features.map((f: any) => ({
                    id: f.properties.id,
                    name: f.properties.name,
                    url: f.properties.urls.pbf
                })).sort((a: any, b: any) => a.name.localeCompare(b.name));
                setGeofabrik(regions);
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (token) {
            fetchMaps();
            fetchStatus();
            fetchGeofabrik();
        }
    }, [token]);

    const handleAddMap = async (region: GeofabrikRegion | { name: string, url: string }) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/admin/maps`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ name: region.name, url: region.url })
            });
            if (res.ok) {
                setSearchQuery('');
                setCustomName('');
                setCustomUrl('');
                setShowCustomForm(false);
                fetchMaps();
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const handleAction = async (id: string, action: 'download' | 'activate') => {
        try {
            await fetch(`${API_URL}/admin/maps/${id}/${action}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchStatus();
        } catch (e) { console.error(e); }
    };

    const handleUploadMap = async () => {
        if (!uploadFile) return;

        setLoading(true);
        try {
            const formData = new FormData();
            if (uploadName.trim()) {
                formData.append('name', uploadName.trim());
            }
            formData.append('file', uploadFile);

            const res = await fetch(`${API_URL}/admin/maps/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || 'No se pudo cargar el archivo');
            }

            setUploadFile(null);
            setUploadName('');
            setShowUploadForm(false);
            fetchMaps();
            fetchStatus();
        } catch (e: any) {
            console.error(e);
            alert(e?.message || 'Error al subir archivo');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!mapToDelete) return;
        try {
            await fetch(`${API_URL}/admin/maps/${mapToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchMaps();
        } catch (e) { console.error(e); }
        finally { setMapToDelete(null); }
    };

    const handleCleanup = async () => {
        if (!window.confirm('¿Deseas realizar una limpieza de mantenimiento?\n\nEsto detendrá y eliminará cualquier contenedor de OSRM que no tenga un mapa correspondiente activo en la base de datos. Es útil para resolver conflictos de puertos.')) return;
        
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/admin/osrm/cleanup`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            alert(data.message || 'Limpieza completada');
            fetchMaps();
            fetchStatus();
        } catch (e) { 
            console.error(e);
            alert('Error al realizar la limpieza');
        } finally {
            setLoading(false);
        }
    };

    const filteredSuggestions = useMemo(() => {
        if (!searchQuery || searchQuery.length < 2) return [];
        const normalized = searchQuery.toLowerCase();
        return geofabrik.filter(g => 
            (g.name.toLowerCase().includes(normalized) || g.id.toLowerCase().includes(normalized)) &&
            !maps.some(m => m.name === g.name)
        ).slice(0, 12);
    }, [searchQuery, geofabrik, maps]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <Globe className="w-8 h-8 text-indigo-400" />
                        Map Hub
                    </h2>
                    <p className="text-slate-400 mt-1">Manage global map infrastructure and routing engines.</p>
                </div>
                
                {/* Global Actions and Status */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleCleanup}
                        disabled={loading}
                        className="px-4 py-2 rounded-xl bg-slate-900/50 border border-white/5 text-slate-400 hover:text-indigo-400 hover:border-indigo-500/30 transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                        title="Mantenimiento: Limpiar contenedores huérfanos"
                    >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Mantenimiento</span>
                    </button>

                    {osrmStatus && osrmStatus.status !== 'idle' && (
                        <div className="space-y-2">
                            <div className={clsx(
                                "px-4 py-2 rounded-full border flex items-center gap-3 shadow-lg",
                                osrmStatus.status === 'downloading' ? "border-sky-500/50 bg-sky-500/10 text-sky-400 animate-pulse" :
                                osrmStatus.status === 'processing' ? "border-amber-500/50 bg-amber-500/10 text-amber-400 animate-pulse" :
                                osrmStatus.status === 'running' ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" :
                                "border-rose-500/50 bg-rose-500/10 text-rose-400"
                            )}>
                                <Activity className="w-4 h-4" />
                                <span className="text-sm font-semibold uppercase tracking-wider">
                                    {osrmStatus.status}
                                    {(osrmStatus.status === 'downloading' || osrmStatus.status === 'processing') && osrmStatus.progress !== undefined && (
                                        <>: {osrmStatus.progress}%</>
                                    )}
                                </span>
                            </div>
                            {osrmStatus.message && (
                                <p className="text-[11px] text-slate-400 max-w-sm text-right">
                                    {osrmStatus.message}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Search and Custom Section */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                    <div className="relative group flex-1">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search Geofabrik (e.g. Mexico, Colombia, Spain)..."
                            className="block w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-lg shadow-inner"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                if (showCustomForm) setShowCustomForm(false);
                                if (showUploadForm) setShowUploadForm(false);
                            }}
                        />

                        {/* Search Suggestions */}
                        {filteredSuggestions.length > 0 && (
                            <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl max-h-[400px] overflow-y-auto custom-scrollbar">
                                {filteredSuggestions.map(region => (
                                    <button
                                        key={region.id}
                                        onClick={() => handleAddMap(region)}
                                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 group/item"
                                    >
                                        <div className="flex flex-col items-start">
                                            <span className="text-slate-300 font-medium group-hover/item:text-white transition-colors">{region.name}</span>
                                            <span className="text-[10px] text-slate-500 uppercase tracking-widest">{region.id}</span>
                                        </div>
                                        <Plus className="w-5 h-5 text-slate-600 group-hover/item:text-indigo-400 transition-colors" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => {
                            setShowCustomForm(!showCustomForm);
                            if (!showCustomForm) setShowUploadForm(false);
                        }}
                        className={clsx(
                            "px-6 py-4 rounded-2xl border font-bold transition-all flex items-center gap-2",
                            showCustomForm 
                                ? "bg-indigo-500 border-indigo-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]" 
                                : "bg-slate-900/50 border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                        )}
                    >
                        <Plus className="w-5 h-5" />
                        <span>URL Manual</span>
                    </button>

                    <button
                        onClick={() => {
                            setShowUploadForm(!showUploadForm);
                            if (!showUploadForm) setShowCustomForm(false);
                        }}
                        className={clsx(
                            "px-6 py-4 rounded-2xl border font-bold transition-all flex items-center gap-2",
                            showUploadForm
                                ? "bg-sky-500 border-sky-400 text-white shadow-[0_0_20px_rgba(14,165,233,0.4)]"
                                : "bg-slate-900/50 border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                        )}
                    >
                        <Upload className="w-5 h-5" />
                        <span>Subir Archivo</span>
                    </button>
                </div>

                {/* Custom URL Form */}
                {showCustomForm && (
                    <div className="p-6 rounded-3xl bg-indigo-500/5 border border-indigo-500/20 animate-in slide-in-from-top-4 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400/70 ml-2">Nombre de la Región</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Mexico CDMX"
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400/70 ml-2">URL del Archivo PBF (.osm.pbf)</label>
                                <input
                                    type="text"
                                    placeholder="https://download.geofabrik.de/..."
                                    value={customUrl}
                                    onChange={(e) => setCustomUrl(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                disabled={!customName || !customUrl || loading}
                                onClick={() => handleAddMap({ name: customName, url: customUrl })}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shadow-lg active:scale-95"
                            >
                                {loading ? 'Agregando...' : 'Añadir Infraestructura'}
                            </button>
                        </div>
                    </div>
                )}

                {showUploadForm && (
                    <div className="p-6 rounded-3xl bg-sky-500/5 border border-sky-500/20 animate-in slide-in-from-top-4 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-sky-400/70 ml-2">Nombre del Mapa</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Colombia 2026-03-26"
                                    value={uploadName}
                                    onChange={(e) => setUploadName(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 transition-all font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-sky-400/70 ml-2">Archivo .osm.pbf</label>
                                <input
                                    type="file"
                                    accept=".osm.pbf"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        setUploadFile(file);
                                        if (file && !uploadName.trim()) {
                                            const inferred = file.name.replace(/\.osm\.pbf$/i, '').replace(/[-_]+/g, ' ').trim();
                                            setUploadName(inferred);
                                        }
                                    }}
                                    className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-white file:mr-4 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1 file:text-xs file:font-bold file:text-white hover:file:bg-sky-500"
                                />
                                {uploadFile && (
                                    <p className="text-xs text-slate-400 ml-2">
                                        {uploadFile.name} · {(uploadFile.size / 1024 / 1024).toFixed(1)} MB
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                disabled={!uploadFile || loading}
                                onClick={handleUploadMap}
                                className="px-8 py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shadow-lg active:scale-95"
                            >
                                {loading ? 'Subiendo...' : 'Cargar Archivo'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Maps Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {maps.map(map => {
                    const liveProfiles = map.healthy_profiles?.length ?? 0;
                    const totalProfiles = map.total_profiles ?? 3;
                    const healthTone =
                        map.health_status === 'live'
                            ? "text-emerald-400"
                            : map.health_status === 'degraded'
                                ? "text-amber-400"
                                : "text-slate-500";

                    return (
                    <div 
                        key={map.id} 
                        className={clsx(
                            "relative overflow-hidden rounded-2xl border bg-slate-900/40 backdrop-blur-sm p-6 transition-all group",
                            map.isActive ? "border-indigo-500/50 ring-1 ring-indigo-500/20" : "border-white/5 hover:border-white/20"
                        )}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                                <Navigation className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div className="flex items-center gap-2">
                                {map.is_local && (
                                    <span className="px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-widest bg-sky-500/10 text-sky-300 border border-sky-500/20">
                                        local file
                                    </span>
                                )}
                                <span className={clsx(
                                    "px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-widest",
                                    map.status === 'ready' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                    map.status === 'error' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                                    "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                                )}>
                                    {map.status}
                                </span>
                            </div>
                        </div>

                        <h3 className="text-xl font-bold text-white mb-2">{map.name}</h3>
                        
                        <div className="grid grid-cols-2 gap-4 mt-6 mb-8 text-sm">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Database className="w-4 h-4 text-slate-600" />
                                <span>{map.disk_size ? `${(map.disk_size/1024/1024).toFixed(1)} MB` : 'Unknown size'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400">
                                <Radio className="w-4 h-4 text-slate-600" />
                                <span>{map.base_port || 'No port'}</span>
                            </div>
                        </div>

                        <div className="mb-6 text-xs uppercase tracking-widest">
                            <span className={clsx("font-black", healthTone)}>
                                {liveProfiles}/{totalProfiles} perfiles OSRM operativos
                            </span>
                        </div>

                        {/* Progress Bar (if processing/downloading) */}
                        {osrmStatus?.activeMapId === map.id && (map.status === 'downloading' || map.status === 'processing') && (
                            <div className="mt-4 mb-6">
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-indigo-500 transition-all duration-500" 
                                        style={{ width: `${osrmStatus.progress || 0}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-tighter tabular-nums">
                                    {map.status === 'downloading' ? 'Downloading' : 'Processing'}: {osrmStatus.progress || 0}%
                                </p>
                                {osrmStatus.message && (
                                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                                        {osrmStatus.message}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                            {!map.is_local && (map.status === 'pending' || map.status === 'error') && (
                                <button 
                                    onClick={() => handleAction(map.id, 'download')}
                                    className={clsx(
                                        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all shadow-lg active:scale-95",
                                        map.status === 'error' ? "bg-rose-600 hover:bg-rose-500" : "bg-indigo-600 hover:bg-indigo-500"
                                    )}
                                >
                                    <Download className="w-4 h-4" /> 
                                    {map.status === 'error' ? 'Retry' : 'Download'}
                                </button>
                            )}
                            {(map.status === 'ready' || map.status === 'error' || (map.status === 'pending' && (map.is_local || !!map.disk_size))) && !(map.isActive && map.status === 'ready') && (
                                <button 
                                    className={clsx(
                                        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all shadow-inner active:scale-95",
                                        (osrmStatus?.status === 'downloading' || osrmStatus?.status === 'processing') ? "opacity-30 cursor-not-allowed bg-slate-800" : "bg-slate-800 hover:bg-slate-700 text-white"
                                    )}
                                    disabled={osrmStatus?.status === 'downloading' || osrmStatus?.status === 'processing'}
                                    onClick={() => handleAction(map.id, 'activate')}
                                >
                                    <Activity className="w-4 h-4 text-indigo-400" /> Activate
                                </button>
                            )}
                            {map.isActive && map.status === 'ready' && map.health_status !== 'offline' && (
                                <div className={clsx(
                                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border",
                                    map.health_status === 'live'
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                )}>
                                    <CheckCircle2 className="w-4 h-4" />
                                    {map.health_status === 'live' ? 'Live' : 'Partial Live'}
                                </div>
                            )}
                            <button 
                                onClick={() => setMapToDelete(map.id)}
                                className="p-2.5 text-slate-500 hover:text-rose-400 transition-colors"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    );
                })}

                {/* Empty State */}
                {maps.length === 0 && !loading && (
                    <div className="col-span-full py-20 flex flex-col items-center border-2 border-dashed border-white/5 rounded-3xl opacity-50">
                        <Globe className="w-16 h-16 text-slate-600 mb-4" />
                        <h4 className="text-lg font-semibold text-slate-400">Hub is Empty</h4>
                        <p className="text-slate-500 max-w-xs text-center">Search for a city above to start provisioning maps.</p>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={!!mapToDelete}
                onCancel={() => setMapToDelete(null)}
                onConfirm={handleDelete}
                title="Delete Map Infrastructure?"
                isDestructive
                message="This will stop all OSRM containers and delete PBF files for this region. Local GTFS data will remain intact."
            />
        </div>
    );
};
