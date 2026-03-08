import React, { useState, useEffect } from 'react';
import { Download, Trash2, Globe, Server, AlertTriangle, Loader2, Navigation, Radio, Activity } from 'lucide-react';
import clsx from 'clsx';
import ConfirmModal from './ConfirmModal';
import { API_URL } from '../config';

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

const MapManager: React.FC = () => {
    const [maps, setMaps] = useState<MapInfo[]>([]);
    const [status, setStatus] = useState<StatusInfo>({ status: 'idle', message: '' });
    const [loading, setLoading] = useState(false);
    const [selectedMap, setSelectedMap] = useState<string>('');
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
                    setTimeout(fetchStatus, 1000);
                    fetchMaps();
                } else if (data.status === 'running' || data.status === 'idle') {
                    fetchMaps(); 
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
            if (!customUrl) return alert('URL requerida');
            payload.customUrl = customUrl;
            payload.customName = customName || 'Mapa Personalizado';
            payload.region = ''; 
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
                fetchStatus(); 
                setCustomUrl('');
                setCustomName('');
                setMapMode('list');
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            alert('Error al iniciar descarga');
        }
    };

    const handleUpload = async () => {
        if (!uploadFile) return alert('No hay archivo seleccionado');
        if (!uploadFile.name.endsWith('.osm.pbf')) return alert('Debe ser un archivo .osm.pbf');

        const formData = new FormData();
        formData.append('file', uploadFile);

        setStatus({ status: 'downloading', message: `Subiendo ${uploadFile.name}...`, progress: 0 });

        try {
            const res = await fetch(`${API_URL}/maps/upload`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                setUploadFile(null);
                setMapMode('list');
                fetchMaps();
                setStatus({ status: 'idle', message: 'Carga completa' });
            } else {
                const err = await res.json();
                alert(`Error de carga: ${err.error}`);
                setStatus({ status: 'error', message: err.error });
            }
        } catch (e) {
            alert('Carga fallida');
            setStatus({ status: 'error', message: 'Carga fallida' });
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            const res = await fetch(`${API_URL}/maps/${confirmDelete}`, { method: 'DELETE' });
            if (res.ok) {
                fetchMaps();
            } else {
                alert('No se pudo eliminar el mapa');
            }
        } catch (e) {
            alert('Error al eliminar mapa');
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
                alert('Error al cancelar proceso');
            }
        } catch (e) {
            console.error('Error al cancelar', e);
        }
    };

    const isBusy = status.status === 'downloading' || status.status === 'processing';

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-primary animate-pulse">
                <Loader2 size={32} className="animate-spin mb-4" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Escaneando Núcleo OSRM...</span>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* Tactical Status Panel */}
            <div className={clsx(
                "p-8 rounded-[32px] border utilitarian-border flex flex-col gap-6 transition-all duration-500 shadow-xl overflow-hidden relative",
                status.status === 'error' ? "bg-red-500/5 ring-1 ring-red-500/20 shadow-red-500/5" :
                    status.status === 'running' ? "bg-emerald-500/5 ring-1 ring-emerald-500/20 shadow-emerald-500/5" :
                        isBusy ? "bg-primary/5 ring-1 ring-primary/20 shadow-primary/5" :
                            "bg-slate-50 shadow-inner"
            )}>
                {/* Background Decoration */}
                <div className="absolute -top-10 -right-10 opacity-[0.03] dark:opacity-[0.07] pointer-events-none">
                     <Radio size={200} />
                </div>

                <div className="flex items-start gap-5 relative z-10">
                    <div className={clsx(
                        "p-4 rounded-2xl shadow-lg transition-colors",
                         status.status === 'running' ? "bg-emerald-500 text-white" :
                         status.status === 'error' ? "bg-red-500 text-white" :
                         isBusy ? "bg-primary text-white" : "bg-white dark:bg-slate-800 text-slate-400 border utilitarian-border"
                    )}>
                        {status.status === 'running' && <Activity size={24} strokeWidth={2.5} />}
                        {status.status === 'error' && <AlertTriangle size={24} strokeWidth={2.5} />}
                        {isBusy && <Loader2 size={24} className="animate-spin" strokeWidth={2.5} />}
                        {!['running', 'error', 'downloading', 'processing'].includes(status.status) && <Server size={24} strokeWidth={2.5} />}
                    </div>

                    <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-1">Estado de Servidor OSRM</h4>
                                <p className="text-sm font-black dark:text-white uppercase tracking-wider">{status.status}</p>
                            </div>
                            {isBusy && (
                                <button
                                    onClick={handleCancel}
                                    className="bg-red-500 hover:bg-red-600 text-white text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl shadow-lg shadow-red-500/20 transition-all active:scale-95"
                                >
                                    Interrumpir
                                </button>
                            )}
                        </div>
                        <p className="text-[12px] font-medium opacity-80 leading-relaxed mb-4">{status.message}</p>
                        
                        {status.activeRegion && status.status === 'running' && (
                            <div className="inline-flex items-center gap-2 bg-white/50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border utilitarian-border">
                                <Navigation size={10} className="text-emerald-500" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Región Activa:</span>
                                <span className="text-[10px] font-mono font-black text-emerald-600 dark:text-emerald-400">{status.activeRegion}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Refined Progress indicator */}
                {status.status === 'downloading' && (
                    <div className="relative pt-4 overflow-hidden">
                        <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 shadow-inner">
                            <div
                                className="bg-primary h-full rounded-full transition-all duration-700 ease-out-expo shadow-[0_0_12px_rgba(19,55,236,0.4)]"
                                style={{ width: `${status.progress || 0}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between items-center mt-3">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">Descargando Paquetes Cartográficos...</span>
                            <span className="text-[11px] font-mono font-black text-primary">{status.progress || 0}%</span>
                        </div>
                    </div>
                )}

                {status.status === 'error' && (
                    <div className="flex justify-end pt-2">
                        <button
                            onClick={handleClearError}
                            className="text-[9px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 hover:underline"
                        >
                            Limpiar Alerta de Conflicto
                        </button>
                    </div>
                )}
            </div>

            {/* Map Management Logic */}
            <div className="bg-white/30 dark:bg-slate-900/40 rounded-[32px] border utilitarian-border p-8 space-y-8 shadow-sm">
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <div>
                        <h3 className="text-base font-display font-black text-slate-900 dark:text-white flex items-center gap-3 uppercase tracking-tight leading-none mb-1">
                            Adquisición de Red
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Provisionamiento de Mapas PBF</p>
                    </div>
                    
                    <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border utilitarian-border">
                        {[
                            { id: 'list', label: 'Libreria', icon: Globe },
                            { id: 'custom', label: 'URL PBF', icon: Download },
                            { id: 'upload', label: 'Carga Local', icon: Navigation }
                        ].map(mode => (
                            <button
                                key={mode.id}
                                onClick={() => setMapMode(mode.id as any)}
                                className={clsx(
                                    "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                                    mapMode === mode.id 
                                        ? "bg-white dark:bg-slate-700 text-primary shadow-sm ring-1 ring-slate-200 dark:ring-slate-600" 
                                        : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
                                )}
                            >
                                <mode.icon size={12} />
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-6">
                    {mapMode === 'list' && (
                        <div className="relative group">
                            <select
                                value={selectedMap}
                                onChange={(e) => setSelectedMap(e.target.value)}
                                disabled={isBusy}
                                className="w-full pl-5 pr-10 py-4 rounded-2xl bg-white dark:bg-slate-800 border-2 utilitarian-border hover:border-primary/40 outline-none focus:ring-4 focus:ring-primary/10 transition-all font-bold text-[13px] text-slate-800 dark:text-white appearance-none"
                            >
                                {maps.map(m => (
                                    <option key={m.key} value={m.key}>
                                        {m.name} {m.isDownloaded ? '✓ (Instalado)' : ''}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <Download size={16} />
                            </div>
                        </div>
                    )}

                    {mapMode === 'custom' && (
                        <div className="space-y-5 animate-in slide-in-from-top-2 duration-300">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Identificador de Región</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Montevideo Metropolitano"
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    disabled={isBusy}
                                    className="w-full px-5 py-3.5 rounded-2xl bg-white dark:bg-slate-800 border-2 utilitarian-border outline-none focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Enlace Geofabrik (.osm.pbf)</label>
                                <input
                                    type="text"
                                    placeholder="https://download.geofabrik.de/..."
                                    value={customUrl}
                                    onChange={(e) => setCustomUrl(e.target.value)}
                                    disabled={isBusy}
                                    className="w-full px-5 py-3.5 rounded-2xl bg-white dark:bg-slate-800 border-2 utilitarian-border outline-none focus:ring-4 focus:ring-primary/10 transition-all text-xs font-mono font-bold text-primary"
                                />
                            </div>
                        </div>
                    )}

                    {mapMode === 'upload' && (
                        <div className="p-10 border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-[32px] flex flex-col items-center justify-center gap-4 hover:border-primary/40 transition-colors group cursor-pointer relative overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
                            <input
                                type="file"
                                accept=".osm.pbf"
                                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                disabled={isBusy}
                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            />
                            <div className="p-6 bg-white dark:bg-slate-800 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none transition-transform group-hover:-translate-y-1 duration-300">
                                <Navigation size={32} className="text-primary group-hover:rotate-45 transition-transform" />
                            </div>
                            <div className="text-center">
                                <p className="text-[13px] font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    {uploadFile ? uploadFile.name : 'Arrastra o selecciona el archivo'}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Formato admitido: OSM Protocolbuffer (.pbf)</p>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={mapMode === 'upload' ? handleUpload : handleDownload}
                        disabled={isBusy || (mapMode === 'list' && !selectedMap) || (mapMode === 'custom' && !customUrl) || (mapMode === 'upload' && !uploadFile)}
                        className="w-full py-5 bg-primary text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-primary/20 hover:scale-[1.01] active:scale-95 disabled:opacity-30 disabled:grayscale transition-all flex items-center justify-center gap-3"
                    >
                        {isBusy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} strokeWidth={2.5} />}
                        {isBusy ? (mapMode === 'upload' ? 'Subiendo Núcleo...' : 'Sincronizando...') : (mapMode === 'upload' ? 'Iniciar Carga de Red' : 'Iniciar Sincronización')}
                    </button>
                    
                    {!isBusy && (
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 text-center uppercase tracking-widest">
                            Los mapas sincronizados aparecerán en la bóveda de infraestructura inferior.
                        </p>
                    )}
                </div>
            </div>

            {/* Vault Area */}
            <div className="space-y-4">
                <div className="flex items-center gap-3 px-1">
                    <Globe size={16} className="text-primary" />
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">Bóveda de Mapas Instalados</h3>
                </div>
                
                <div className="bg-slate-100/50 dark:bg-slate-900/30 rounded-[32px] border utilitarian-border overflow-hidden p-2 shadow-inner">
                    {maps.filter(m => m.isDownloaded).length === 0 ? (
                        <div className="p-10 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest italic opacity-50">Nucleo de infraestructura vacío</div>
                    ) : (
                        <div className="space-y-2">
                            {maps.filter(m => m.isDownloaded).map(m => (
                                <div key={m.key} className={clsx(
                                    "p-5 rounded-2xl border transition-all flex items-center justify-between group",
                                    m.isActive ? "bg-white dark:bg-slate-800 border-primary shadow-xl shadow-primary/5" : "bg-white/50 border-transparent hover:bg-white dark:hover:bg-slate-800"
                                )}>
                                    <div className="flex items-center gap-4">
                                        <div className={clsx(
                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                            m.isActive ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-900 text-slate-300"
                                        )}>
                                            <Navigation size={18} strokeWidth={2.5} className={m.isActive ? "rotate-45" : ""} />
                                        </div>
                                        <div>
                                            <span className="text-sm font-black text-slate-900 dark:text-white block tracking-tight">{m.name}</span>
                                            <span className="text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{m.key}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        {m.isActive ? (
                                            <div className="px-5 py-2.5 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-[0.15em] rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                                Activo para Ruteo
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
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
                                                    className="px-5 py-2.5 text-[9px] font-black uppercase tracking-widest text-primary border-2 border-primary/20 rounded-xl hover:bg-primary hover:text-white transition-all"
                                                    disabled={isBusy}
                                                >
                                                    Habilitar
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDelete(m.key)}
                                                    className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                                    disabled={isBusy}
                                                >
                                                    <Trash2 size={18} strokeWidth={2.5} />
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
                title="¿Purgar Mapa Instalado?"
                message={`Esta acción eliminará los binarios cartográficos del servidor OSRM para la región especificada. Deberá sincronizar nuevamente si desea habilitar ruteo para esta área.`}
                confirmText="Confirmar Purgado"
                isDestructive={true}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
};

export default MapManager;
