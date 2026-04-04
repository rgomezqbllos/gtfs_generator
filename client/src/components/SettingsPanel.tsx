import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, MapPin, Download, Upload, X, RotateCcw, Save, Settings, Users, Globe, ExternalLink } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import AgencyManager from './AgencyManager';
import MapManager from './MapManager';
import { useSettings } from '../context/SettingsContext';
import { useEditor } from '../context/EditorContext';
import { useAuth } from '../context/AuthContext';
import { clsx } from 'clsx';
import { API_URL } from '../config';

interface SettingsPanelProps {
    onClose: () => void;
    currentViewState: {
        longitude: number;
        latitude: number;
        zoom: number;
    };
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, currentViewState }) => {
    const { defaultLocation, setDefaultLocation } = useSettings();
    const [activeTab, setActiveTab] = useState<'general' | 'agency' | 'map'>('general');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const { setActivePanel } = useEditor();
    const { myProjects, activeProject, setActiveProject, isSuperAdmin } = useAuth();
    const isAdmin = isSuperAdmin;

    // General Settings State
    const [cityName, setCityName] = useState(defaultLocation.cityName);
    const [lat, setLat] = useState(defaultLocation.latitude);
    const [lng, setLng] = useState(defaultLocation.longitude);
    const [zoom, setZoom] = useState(defaultLocation.zoom);

    // Sync context to local state
    useEffect(() => {
        setCityName(defaultLocation.cityName);
        setLat(defaultLocation.latitude);
        setLng(defaultLocation.longitude);
        setZoom(defaultLocation.zoom);
    }, [defaultLocation]);

    useEffect(() => {
        if (!activeProject || isSuperAdmin) return;

        let cancelled = false;
        const loadProjectPreference = async () => {
            try {
                const res = await fetch(`${API_URL}/map-preference`);
                const data = await res.json();
                const pref = data?.preference;
                if (!pref || cancelled) return;

                if (
                    typeof pref.center_lat === 'number' &&
                    typeof pref.center_lon === 'number' &&
                    typeof pref.zoom === 'number'
                ) {
                    setCityName(activeProject.name);
                    setLat(pref.center_lat);
                    setLng(pref.center_lon);
                    setZoom(pref.zoom);
                }
            } catch (error) {
                console.warn('No se pudo cargar preferencia de mapa por proyecto', error);
            }
        };

        loadProjectPreference();
        return () => { cancelled = true; };
    }, [activeProject?.id, isSuperAdmin]);

    const handleSaveLocation = async () => {
        const newLocation = {
            cityName,
            latitude: Number(lat),
            longitude: Number(lng),
            zoom: Number(zoom)
        };

        if (activeProject && !isSuperAdmin) {
            try {
                const res = await fetch(`${API_URL}/map-preference`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        center_lat: newLocation.latitude,
                        center_lon: newLocation.longitude,
                        zoom: newLocation.zoom,
                    }),
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data?.error || 'No se pudo guardar la preferencia de mapa');
                }
                alert(`Punto predeterminado guardado para "${activeProject.name}"`);
                return;
            } catch (error: any) {
                alert(error?.message || 'Error al guardar preferencia de mapa');
                return;
            }
        }

        setDefaultLocation(newLocation);
        alert('Ubicación predeterminada global sincronizada');
    };

    const handleUseCurrentLocation = () => {
        setLat(Number(currentViewState.latitude.toFixed(6)));
        setLng(Number(currentViewState.longitude.toFixed(6)));
        setZoom(Number(currentViewState.zoom.toFixed(2)));
    };

    const handleResetDatabase = async () => {
        if (!activeProject) {
            alert('Selecciona primero un proyecto activo para purgar sus datos.');
            return;
        }

        setIsResetting(true);
        try {
            const res = await fetch(`${API_URL}/projects/reset`, {
                method: 'POST'
            });

            if (res.ok) {
                alert(`Se purgaron los datos del proyecto "${activeProject.name}". La sesión se recargará.`);
                window.location.reload();
            } else {
                const data = await res.json();
                alert(`Error al purgar: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error resetting database:', error);
            alert('Error de conexión con el servidor.');
        } finally {
            setIsResetting(false);
            setShowResetConfirm(false);
        }
    };

    return (
        <div className="absolute top-0 right-0 h-full w-[420px] glass-panel border-l border-white/20 dark:border-slate-800 shadow-[0_0_80px_rgba(0,0,0,0.4)] overflow-hidden z-30 flex flex-col animate-in slide-in-from-right-full duration-700 ease-out-expo pointer-events-auto">
            
            {/* Header Content */}
            <div className="px-8 py-8 border-b utilitarian-border bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-xl">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight leading-none mb-2 underline decoration-primary/40 underline-offset-8">
                            Ajustes Operativos
                        </h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Geo-Configuración & Red</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 rounded-xl hover:bg-white dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-all border utilitarian-border"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Tactical Tabs */}
                <div className="flex p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border utilitarian-border">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-2 py-3 text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all",
                            activeTab === 'general'
                                ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                        )}
                    >
                        <Settings size={14} className={activeTab === 'general' ? "text-primary" : "text-slate-400"} />
                        General
                    </button>
                    <button
                        onClick={() => setActiveTab('agency')}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-2 py-3 text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all",
                            activeTab === 'agency'
                                ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                        )}
                    >
                        <Users size={14} className={activeTab === 'agency' ? "text-primary" : "text-slate-400"} />
                        Agencias
                    </button>
                    <button
                        onClick={() => setActiveTab('map')}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-2 py-3 text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all",
                            activeTab === 'map'
                                ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                        )}
                    >
                        <Globe size={14} className={activeTab === 'map' ? "text-primary" : "text-slate-400"} />
                        {isAdmin ? 'Red OSRM' : 'Proyectos'}
                    </button>
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="p-8 overflow-y-auto flex-1 custom-scrollbar bg-white/20">
                {activeTab === 'general' && (
                    <div className="space-y-10 fade-in animate-in duration-500">
                        
                        {/* Map Location Section */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                                <MapPin size={14} className="text-primary" /> Punto Geodésico Base
                            </div>
                            
                            <div className="space-y-5 bg-slate-50/50 dark:bg-slate-900/40 p-6 rounded-[32px] border utilitarian-border shadow-inner">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Nombre de la Región</label>
                                    <input
                                        type="text"
                                        value={cityName}
                                        onChange={(e) => setCityName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="relative group">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-300">LAT</span>
                                        <input
                                            type="number"
                                            step="any"
                                            value={lat}
                                            onChange={(e) => setLat(Number(e.target.value))}
                                            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-mono text-slate-900 dark:text-white focus:ring-4 focus:ring-primary/10 outline-none"
                                        />
                                    </div>
                                    <div className="relative group">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-300">LON</span>
                                        <input
                                            type="number"
                                            step="any"
                                            value={lng}
                                            onChange={(e) => setLng(Number(e.target.value))}
                                            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-mono text-slate-900 dark:text-white focus:ring-4 focus:ring-primary/10 outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Nivel de Proximidad (Zoom)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={zoom}
                                        onChange={(e) => setZoom(Number(e.target.value))}
                                        className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-mono text-slate-900 dark:text-white focus:ring-4 focus:ring-primary/10 outline-none"
                                    />
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={handleUseCurrentLocation}
                                        className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest border border-primary/20 text-primary rounded-2xl bg-white dark:bg-slate-800 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 group"
                                    >
                                        <RotateCcw size={14} className="group-hover:rotate-180 transition-transform duration-500" /> Map Capture
                                    </button>
                                    <button
                                        onClick={handleSaveLocation}
                                        className="flex-1 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Save size={14} /> Sincronizar
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Management Grid */}
                        <div className="grid grid-cols-1 gap-6">
                            {/* Backup Card */}
                            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-[32px] p-6 space-y-4">
                                <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.15em]">
                                    <Download size={16} /> Respaldo Consolidado
                                </div>
                                <p className="text-[11px] text-emerald-700/60 dark:text-emerald-300/40 font-medium leading-relaxed">
                                    Genera un paquete ZIP con la infraestructura completa de nodos, rutas e inteligencia de red.
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => window.open(`${API_URL}/admin/backup`, '_blank')}
                                        className="py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Download size={14} /> Exportar
                                    </button>

                                    <label className="cursor-pointer">
                                        <input
                                            type="file"
                                            accept=".zip"
                                            className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (!confirm("Confirmar restauración integral: Se sobreescribirán todos los datos actuales.")) return;

                                                const formData = new FormData();
                                                formData.append('file', file);

                                                try {
                                                    const res = await fetch(`${API_URL}/admin/restore`, {
                                                        method: 'POST',
                                                        body: formData
                                                    });
                                                    const payload = await res.json().catch(() => ({}));
                                                    if (res.ok) {
                                                        alert("Red restaurada con éxito. Reiniciando núcleo...");
                                                        window.location.reload();
                                                    } else {
                                                        alert("Fallo crítico en restauración: " + (payload.error || "Código Desconocido"));
                                                    }
                                                } catch (err) {
                                                    alert("Fallo de comunicación persistente");
                                                } finally {
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                        <div className="w-full py-3 bg-white dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-50 transition-all text-center flex items-center justify-center gap-2">
                                            <Upload size={14} /> Importar
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Admin Link Area */}
                            {isAdmin && (
                                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-[32px] p-6 space-y-4">
                                     <div className="flex items-center gap-2 text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.15em]">
                                        <ExternalLink size={16} /> Panel Maestro
                                    </div>
                                    <p className="text-[11px] text-indigo-700/60 dark:text-indigo-300/40 font-medium leading-relaxed">
                                        Administración de identidades, cuotas de proyecto y seguridad de tenencia.
                                    </p>
                                    <button
                                        onClick={() => setActivePanel('admin_panel')}
                                        className="w-full py-3.5 bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        Consola Administrativa
                                    </button>
                                </div>
                            )}

                            {/* Danger Area */}
                            <div className="bg-red-500/5 border border-red-500/10 rounded-[32px] p-6 space-y-4">
                                <div className="flex items-center gap-2 text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-[0.15em]">
                                    <AlertTriangle size={16} /> Zona Crítica
                                </div>
                                <p className="text-[11px] text-red-700/60 dark:text-red-300/40 font-medium leading-relaxed">
                                    Purgado total de infraestructura: elimina nodos, rutas y lógica de red del proyecto activo de forma irreversible.
                                </p>
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    disabled={isResetting || !activeProject}
                                    className="w-full py-3 bg-white dark:bg-red-900/20 border border-red-200 dark:border-red-900 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-red-50 transition-all flex items-center justify-center gap-2 active:scale-95"
                                >
                                    <Trash2 size={16} />
                                    {isResetting ? 'Purgando...' : 'Purgar proyecto activo'}
                                </button>
                                {!activeProject && (
                                    <p className="text-[11px] text-red-500/80 mt-2">Selecciona un proyecto activo para habilitar el purgado.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'agency' && (
                    <div className="fade-in animate-in duration-500">
                        <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-[32px] mb-8 shadow-inner">
                            <p className="text-[11px] text-blue-700/80 dark:text-blue-300/60 font-bold leading-relaxed uppercase tracking-widest text-center">
                                Gestión de Operadores de Tránsito
                            </p>
                        </div>
                        <AgencyManager />
                    </div>
                )}

                {activeTab === 'map' && (
                    <div className="fade-in animate-in duration-500 space-y-6">
                        <div className="space-y-4">
                            <div className="bg-primary/10 border border-primary/20 p-6 rounded-[32px] shadow-inner">
                                <p className="text-[11px] text-primary/80 dark:text-primary/60 font-bold leading-relaxed uppercase tracking-widest text-center">
                                    Selecciona el proyecto activo
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
                                    El motor OSRM y los datos de paradas/rutas se aislan por proyecto asignado.
                                </p>
                            </div>
                            <div className="space-y-3 bg-slate-50/60 dark:bg-slate-900/40 p-6 rounded-[32px] border utilitarian-border">
                                {myProjects.length === 0 && (
                                    <p className="text-sm text-slate-500">No tienes proyectos asignados. Pide acceso al administrador.</p>
                                )}
                                {myProjects.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => setActiveProject(p)}
                                        className={clsx(
                                            "w-full text-left px-4 py-3 rounded-2xl border transition-all",
                                            activeProject?.id === p.id
                                                ? "border-primary/40 bg-primary/10 text-white"
                                                : "border-white/10 bg-slate-900/30 hover:border-primary/30 text-slate-200"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-sm font-semibold">{p.name}</div>
                                                <div className="text-[11px] text-slate-400 uppercase tracking-widest truncate max-w-[240px]">
                                                    {(p as any).map_name || 'Mapa asignado'} · {p.routing_engine_url?.split('//')[1] || 'sin motor'}
                                                </div>
                                            </div>
                                            {activeProject?.id === p.id && (
                                                <span className="text-[10px] font-black text-emerald-400 uppercase">Activo</span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                                <p className="text-[11px] text-slate-500 mt-2">
                                    Al cambiar de proyecto, todos los POST incluyen automáticamente el <code>X-Project-Id</code> y el motor adecuado; no necesitas tocar mapas ni URLs.
                                </p>
                            </div>
                        </div>
                        {isAdmin && (
                            <>
                                <div className="bg-primary/10 border border-primary/20 p-6 rounded-[32px] shadow-inner">
                                    <p className="text-[11px] text-primary/80 dark:text-primary/60 font-bold leading-relaxed uppercase tracking-widest text-center">
                                        Núcleo de Enrutamiento Offline
                                    </p>
                                </div>
                                <MapManager />
                            </>
                        )}
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={showResetConfirm}
                title="¿Purgar datos del proyecto?"
                message={`Esta acción es irreversible y eliminará paradas, rutas, segmentos y horarios solo del proyecto activo${activeProject ? `: ${activeProject.name}` : ''}.`}
                confirmText="Sí, purgar proyecto"
                onConfirm={handleResetDatabase}
                onCancel={() => setShowResetConfirm(false)}
            />
        </div>
    );
};

export default SettingsPanel;
