import * as React from 'react';
import { X, Check, Bus, Save, Building2, Activity, Palette, Type, Globe, Layers, GitBranch } from 'lucide-react';
import { clsx } from 'clsx';
import type { Route } from '../types';
import { API_URL } from '../config';
import { defaultRoutingProfile, routingProfileMetadata, routingProfiles, type RoutingProfile } from '../constants/routingProfiles';

interface RouteCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    routeToEdit?: Route | null;
}

const ROUTE_TYPES = [
    { value: 0, label: 'Tram / Streetcar' },
    { value: 1, label: 'Subway / Metro' },
    { value: 2, label: 'Rail' },
    { value: 3, label: 'Bus' },
    { value: 4, label: 'Ferry' },
    { value: 5, label: 'Cable Tram' },
    { value: 6, label: 'Aerial Lift' },
    { value: 7, label: 'Funicular' },
    { value: 11, label: 'Trolleybus' },
    { value: 12, label: 'Monorail' },
];

const RouteCreationModal: React.FC<RouteCreationModalProps> = ({ isOpen, onClose, onCreated, routeToEdit }) => {
    const isEditMode = !!routeToEdit;
    const [formData, setFormData] = React.useState<Partial<Route>>({
        route_short_name: '',
        route_long_name: '',
        route_type: 3,
        route_color: '1337ec',
        route_text_color: 'FFFFFF',
        agency_name: '',
        route_desc: '',
        route_url: '',
        route_sort_order: undefined,
        routing_profile: defaultRoutingProfile
    });

    const [loading, setLoading] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<'basic' | 'advanced'>('basic');
    const [agencies, setAgencies] = React.useState<{ agency_id: string; agency_name: string }[]>([]);
    const [parkingStops, setParkingStops] = React.useState<{ stop_id: string; stop_name: string }[]>([]);

    React.useEffect(() => {
        if (isOpen) {
            fetchAgencies();
            fetchParkingStops();
            if (routeToEdit) {
                setFormData({
                    ...routeToEdit,
                    routing_profile: (routeToEdit.routing_profile as RoutingProfile) || defaultRoutingProfile
                });
            } else {
                setFormData({
                    route_short_name: '',
                    route_long_name: '',
                    route_type: 3,
                    route_color: '1337ec',
                    route_text_color: 'FFFFFF',
                    agency_name: '',
                    agency_id: '',
                    route_desc: '',
                    route_url: '',
                    route_sort_order: undefined,
                    parkings: [],
                    routing_profile: defaultRoutingProfile
                });
            }
            setActiveTab('basic');
        }
    }, [isOpen, routeToEdit]);

    const fetchAgencies = async () => {
        try {
            const res = await fetch(`${API_URL}/agency`);
            if (res.ok) {
                const data = await res.json();
                setAgencies(Array.isArray(data) ? data : [data]);
            }
        } catch (err) {
            console.error('Failed to fetch agencies', err);
        }
    };

    const fetchParkingStops = async () => {
        try {
            const res = await fetch(`${API_URL}/stops`);
            if (res.ok) {
                const data = await res.json();
                const stops = Array.isArray(data) ? data : [];
                const parkings = stops.filter((s: any) => s.node_type === 'parking');
                setParkingStops(parkings);
            }
        } catch (err) {
            console.error('Failed to fetch parking stops', err);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!formData.route_short_name || !formData.route_long_name) {
            alert("Protocol Violation: Required fields missing (ID & Label)");
            return;
        }

        setLoading(true);
        try {
            const url = isEditMode ? `${API_URL}/routes/${routeToEdit.route_id}` : `${API_URL}/routes`;
            const method = isEditMode ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                onCreated();
                onClose();
            } else {
                alert(`Critical Failure: ${isEditMode ? 'Update' : 'Creation'} rejected by core.`);
            }
        } catch (err) {
            console.error(err);
            alert("Network Congestion: Error saving route intelligence.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative bg-white dark:bg-slate-900 rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.6)] w-full max-w-2xl border utilitarian-border overflow-hidden animate-in zoom-in-95 duration-400 ease-out-expo flex flex-col max-h-[90vh]">

                {/* Tactical Header */}
                <div className="px-10 py-8 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center transition-all">
                    <div className="flex items-center gap-5">
                        <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-600/20">
                            <Bus size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                                {isEditMode ? 'Reconfigurar Ruta' : 'Nueva Inteligencia de Ruta'}
                            </h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                                <Activity size={12} className="text-indigo-500" />
                                Protocolo de Suministro GTFS
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2.5 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-red-500 border utilitarian-border">
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Sub-Navigation Tabs */}
                <div className="flex border-b utilitarian-border bg-white dark:bg-slate-900 px-10">
                    <button
                        onClick={() => setActiveTab('basic')}
                        className={clsx(
                            "py-6 text-[11px] font-black uppercase tracking-[0.2em] border-b-4 transition-all mr-10",
                            activeTab === 'basic'
                                ? "border-indigo-600 text-indigo-600"
                                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        )}
                    >
                        Arquitectura Base
                    </button>
                    <button
                        onClick={() => setActiveTab('advanced')}
                        className={clsx(
                            "py-6 text-[11px] font-black uppercase tracking-[0.2em] border-b-4 transition-all",
                            activeTab === 'advanced'
                                ? "border-indigo-600 text-indigo-600"
                                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        )}
                    >
                        Configuración Maestra
                    </button>
                </div>

                {/* Scrollable Form Body */}
                <div className="p-10 space-y-10 overflow-y-auto flex-1 custom-scrollbar">
                    {activeTab === 'basic' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                             <div className="grid grid-cols-5 gap-6">
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">ID Operativo *</label>
                                    <input
                                        autoFocus={!isEditMode}
                                        type="text"
                                        placeholder="E.g. 101"
                                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border utilitarian-border rounded-2xl text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono font-black placeholder:text-slate-300"
                                        value={formData.route_short_name}
                                        onChange={e => setFormData({ ...formData, route_short_name: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-3 space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Denominación Comercial *</label>
                                    <input
                                        type="text"
                                        placeholder="Corredor Central Express"
                                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border utilitarian-border rounded-2xl text-[15px] font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-300"
                                        value={formData.route_long_name}
                                        onChange={e => setFormData({ ...formData, route_long_name: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Agencia de Adscripción</label>
                                <div className="relative group">
                                    <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                    <select
                                        className="w-full pl-14 pr-6 py-4 bg-slate-50 dark:bg-slate-800 border utilitarian-border rounded-2xl text-[14px] font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all appearance-none"
                                        value={formData.agency_id || ''}
                                        onChange={e => setFormData({ ...formData, agency_id: e.target.value, agency_name: agencies.find(a => a.agency_id === e.target.value)?.agency_name })}
                                    >
                                        <option value="">-- Seleccionar Agencia --</option>
                                        {agencies.map(a => (
                                            <option key={a.agency_id} value={a.agency_id}>{a.agency_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Modalidad de Tránsito</label>
                                    <select
                                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border utilitarian-border rounded-2xl text-[14px] font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                                        value={formData.route_type}
                                        onChange={e => setFormData({ ...formData, route_type: Number(e.target.value) })}
                                    >
                                        {ROUTE_TYPES.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Prioridad en Red</label>
                                    <input
                                        type="number"
                                        placeholder="Orden (E.g. 1)"
                                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border utilitarian-border rounded-2xl text-[14px] font-mono font-black text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 outline-none"
                                        value={formData.route_sort_order || ''}
                                        onChange={e => setFormData({ ...formData, route_sort_order: parseInt(e.target.value) || undefined })}
                                    />
                                </div>
                            </div>

                            {/* Routing Profile Selector */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                                    <GitBranch size={14} className="text-indigo-500" /> Perfil de Routing Preferido
                                </label>
                                <div className="space-y-2">
                                    {routingProfiles.map(profile => {
                                        const meta = routingProfileMetadata[profile];
                                        const isActive = formData.routing_profile === profile;
                                        return (
                                            <button
                                                key={profile}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, routing_profile: profile as RoutingProfile })}
                                                className={clsx(
                                                    'w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all relative overflow-hidden',
                                                    isActive
                                                        ? 'bg-white dark:bg-slate-800 border-indigo-500/50 shadow-md shadow-indigo-500/10'
                                                        : 'bg-slate-50 dark:bg-slate-800/30 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                                                )}
                                            >
                                                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: meta.color }} />
                                                <div className="pl-2 flex-1">
                                                    <div className={clsx('text-[12px] font-black uppercase tracking-tight', isActive ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>
                                                        {meta.label}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{meta.description}</div>
                                                </div>
                                                {isActive && (
                                                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: meta.color }}>
                                                        <Check size={11} className="text-white" strokeWidth={3} />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'advanced' && (
                        <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                            {/* Color Programming Matrix */}
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-3 p-6 bg-slate-50 dark:bg-slate-800/30 rounded-[32px] border utilitarian-border group">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                                        <Palette size={14} className="text-indigo-500" /> Cromática de Fondo
                                    </label>
                                    <div className="flex items-center gap-5">
                                        <div className="relative group/color">
                                            <input
                                                type="color"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                value={`#${formData.route_color}`}
                                                onChange={e => setFormData({ ...formData, route_color: e.target.value.substring(1) })}
                                            />
                                            <div className="w-16 h-16 rounded-[20px] shadow-2xl border-4 border-white dark:border-slate-700 transition-transform group-hover/color:scale-105" style={{ backgroundColor: `#${formData.route_color}` }} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[14px] font-mono font-black text-slate-900 dark:text-white uppercase">#{formData.route_color}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Suministro Hexadecimal</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3 p-6 bg-slate-50 dark:bg-slate-800/30 rounded-[32px] border utilitarian-border group">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                                        <Type size={14} className="text-indigo-500" /> Cromática de Texto
                                    </label>
                                    <div className="flex items-center gap-5">
                                        <div className="relative group/color">
                                            <input
                                                type="color"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                value={`#${formData.route_text_color}`}
                                                onChange={e => setFormData({ ...formData, route_text_color: e.target.value.substring(1) })}
                                            />
                                            <div className="w-16 h-16 rounded-[20px] shadow-2xl border-4 border-white dark:border-slate-700 transition-transform group-hover/color:scale-105" style={{ backgroundColor: `#${formData.route_text_color}` }} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[14px] font-mono font-black text-slate-900 dark:text-white uppercase">#{formData.route_text_color}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Contraste Legible</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Unified Preview Center */}
                            <div className="flex flex-col items-center justify-center p-10 bg-slate-950 rounded-[40px] shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-600/10 to-transparent opacity-50" />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-8 relative z-10">Visualización de Activo</span>
                                <div
                                    className="px-10 py-5 rounded-[24px] text-2xl font-display font-black shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-700 group-hover:scale-110 relative z-10"
                                    style={{ backgroundColor: `#${formData.route_color}`, color: `#${formData.route_text_color}` }}
                                >
                                    {formData.route_short_name || '101'}
                                </div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-8 relative z-10">{formData.route_long_name || 'Downtown Express'}</p>
                            </div>

                            <div className="space-y-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                                        <Globe size={14} className="text-indigo-500" /> Link de Inteligencia de Red
                                    </label>
                                    <input
                                        type="url"
                                        placeholder="https://transit-authority.gov/routes/101"
                                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border utilitarian-border rounded-2xl text-[13px] font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 outline-none"
                                        value={formData.route_url || ''}
                                        onChange={e => setFormData({ ...formData, route_url: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Resumen Operativo</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Especificaciones de contingencia, requerimientos de flota o notas de servicio..."
                                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border utilitarian-border rounded-2xl text-[13px] font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none"
                                        value={formData.route_desc || ''}
                                        onChange={e => setFormData({ ...formData, route_desc: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Complex Property - Parking Linkage */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-end px-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Layers size={14} className="text-indigo-500" /> Nodos de Pernocta Vinculados
                                    </label>
                                    <div className="flex gap-4">
                                        <button type="button" onClick={() => setFormData({ ...formData, parkings: parkingStops.map(p => p.stop_id) })} className="text-[9px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-600 transition-colors">Seleccionar Todo</button>
                                        <button type="button" onClick={() => setFormData({ ...formData, parkings: [] })} className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">Purgar Selección</button>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border utilitarian-border rounded-[32px] max-h-48 overflow-y-auto grid grid-cols-2 gap-2 custom-scrollbar">
                                    {parkingStops.length === 0 ? (
                                        <div className="col-span-2 py-6 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">No se detectaron nodos tipo "Estacionamiento"</div>
                                    ) : (
                                        parkingStops.map(stop => (
                                            <label key={stop.stop_id} className="flex items-center gap-3 cursor-pointer hover:bg-white dark:hover:bg-slate-700 p-3 rounded-2xl transition-all border border-transparent hover:border-indigo-500/20 group">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        className="peer appearance-none w-5 h-5 rounded-lg border-2 border-slate-200 dark:border-slate-700 checked:bg-indigo-600 checked:border-indigo-600 transition-all cursor-pointer shadow-sm"
                                                        checked={formData.parkings?.includes(stop.stop_id) || false}
                                                        onChange={(e) => {
                                                            const currentParkings = formData.parkings || [];
                                                            setFormData({ ...formData, parkings: e.target.checked ? [...currentParkings, stop.stop_id] : currentParkings.filter(id => id !== stop.stop_id) });
                                                        }}
                                                    />
                                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                    </div>
                                                </div>
                                                <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200 transition-colors group-hover:text-indigo-600">{stop.stop_name}</span>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Final Protocol Controls */}
                <div className="px-10 py-10 border-t utilitarian-border bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-6">
                    <button
                        onClick={onClose}
                        className="px-8 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-red-500 transition-colors"
                    >
                        Abortar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className={clsx(
                            "px-12 py-5 rounded-[24px] bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.25em] shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all flex items-center gap-4 hover:scale-[1.02] active:scale-95",
                            loading && "opacity-70 cursor-wait"
                        )}
                    >
                        {loading ? 'Sincronizando...' : (
                            <>
                                {isEditMode ? <Save size={18} strokeWidth={2.5} /> : <Check size={18} strokeWidth={2.5} />}
                                {isEditMode ? 'Consolidar Cambios' : 'Anclar Nueva Ruta'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RouteCreationModal;
