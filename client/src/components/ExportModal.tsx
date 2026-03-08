import * as React from 'react';
import { X, Download, CheckSquare, Search, Building2, Calendar, Bus, FileArchive, ChevronRight, Activity, Database } from 'lucide-react';
import { clsx } from 'clsx';
import type { Route } from '../types';
import { API_URL } from '../config';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Agency {
    agency_id: string;
    agency_name: string;
}

interface Service {
    service_id: string;
    start_date: string;
    end_date: string;
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
    const [routes, setRoutes] = React.useState<Route[]>([]);
    const [agencies, setAgencies] = React.useState<Agency[]>([]);
    const [services, setServices] = React.useState<Service[]>([]);

    const [selectedAgencyIds, setSelectedAgencyIds] = React.useState<Set<string>>(new Set());
    const [selectedServiceIds, setSelectedServiceIds] = React.useState<Set<string>>(new Set());
    const [selectedRouteIds, setSelectedRouteIds] = React.useState<Set<string>>(new Set());

    const [, setLoading] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');

    React.useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [routesRes, agenciesRes, servicesRes] = await Promise.all([
                fetch(`${API_URL}/routes`),
                fetch(`${API_URL}/agency`),
                fetch(`${API_URL}/calendar`)
            ]);

            const routesData = await routesRes.json();
            const agenciesData = await agenciesRes.json();
            const servicesData = await servicesRes.json();

            if (Array.isArray(routesData)) {
                setRoutes(routesData);
                setSelectedRouteIds(new Set(routesData.map((r: any) => r.route_id)));
            }
            if (Array.isArray(agenciesData)) {
                setAgencies(agenciesData);
                setSelectedAgencyIds(new Set(agenciesData.map((a: any) => a.agency_id)));
            }
            if (Array.isArray(servicesData)) {
                setServices(servicesData);
                setSelectedServiceIds(new Set(servicesData.map((s: any) => s.service_id)));
            }
        } catch (err) {
            console.error('Failed to fetch export data', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleAgency = (id: string) => {
        const next = new Set(selectedAgencyIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedAgencyIds(next);
    };

    const toggleService = (id: string) => {
        const next = new Set(selectedServiceIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedServiceIds(next);
    };

    const toggleRoute = (id: string) => {
        const next = new Set(selectedRouteIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedRouteIds(next);
    };

    const handleSelectAllRoutes = () => {
        const visibleRoutes = getVisibleRoutes();
        const allVisibleSelected = visibleRoutes.every(r => selectedRouteIds.has(r.route_id));

        const next = new Set(selectedRouteIds);
        if (allVisibleSelected) {
            visibleRoutes.forEach(r => next.delete(r.route_id));
        } else {
            visibleRoutes.forEach(r => next.add(r.route_id));
        }
        setSelectedRouteIds(next);
    };

    const getVisibleRoutes = () => {
        return routes.filter(r =>
            (r.route_short_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.route_long_name.toLowerCase().includes(searchTerm.toLowerCase())) &&
            (r.agency_id ? selectedAgencyIds.has(r.agency_id) : true)
        );
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await fetch(`${API_URL}/gtfs/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agency_ids: Array.from(selectedAgencyIds),
                    service_ids: Array.from(selectedServiceIds),
                    route_ids: Array.from(selectedRouteIds)
                })
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gtfs.zip';
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);

            onClose();
        } catch (err) {
            console.error('Export error', err);
            alert('Falló la generación del suministro GTFS.');
        } finally {
            setExporting(false);
        }
    };

    if (!isOpen) return null;

    const visibleRoutes = getVisibleRoutes();
    const isAllRoutesSelected = visibleRoutes.length > 0 && visibleRoutes.every(r => selectedRouteIds.has(r.route_id));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-[40px] shadow-[0_0_100px_rgba(0,0,0,0.4)] w-full max-w-7xl flex flex-col h-[85vh] animate-in zoom-in-95 duration-300 border utilitarian-border overflow-hidden">

                {/* Tactical Header */}
                <div className="px-12 py-10 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="p-4 bg-primary text-white rounded-2xl shadow-xl shadow-primary/20">
                            <FileArchive size={32} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Suministro de Capa GTFS</h2>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-2">Configuración de exportación masiva y validación de protocolos.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all text-slate-400 hover:text-red-500 border utilitarian-border shadow-sm group active:scale-95"
                    >
                        <X size={24} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform" />
                    </button>
                </div>

                {/* Analytical Body - 3 Tactical Columns */}
                <div className="flex-1 overflow-hidden flex divide-x utilitarian-border bg-slate-50/30 dark:bg-slate-900/10">

                    {/* Column 1: Core Agencies */}
                    <div className="w-[300px] flex flex-col">
                        <div className="px-6 py-4 border-b utilitarian-border bg-white dark:bg-slate-800 font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-between text-slate-400">
                            <span className="flex items-center gap-2">
                                <Building2 size={14} className="text-primary" /> Operadoras
                            </span>
                            <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{agencies.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {agencies.map(agency => (
                                <button
                                    key={agency.agency_id}
                                    onClick={() => toggleAgency(agency.agency_id)}
                                    className={clsx(
                                        "w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-left group",
                                        selectedAgencyIds.has(agency.agency_id)
                                            ? "bg-primary/5 border-primary/30 text-primary shadow-sm ring-1 ring-primary/10"
                                            : "bg-white dark:bg-slate-800 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                    )}
                                >
                                    <div className={clsx(
                                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all",
                                        selectedAgencyIds.has(agency.agency_id) ? "bg-primary border-primary text-white" : "border-slate-200 dark:border-slate-700 group-hover:border-primary"
                                    )}>
                                        {selectedAgencyIds.has(agency.agency_id) && <CheckSquare size={12} strokeWidth={3} />}
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-tight truncate flex-1">{agency.agency_name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Column 2: Temporal Calendars */}
                    <div className="w-[340px] flex flex-col">
                        <div className="px-6 py-4 border-b utilitarian-border bg-white dark:bg-slate-800 font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-between text-slate-400">
                            <span className="flex items-center gap-2">
                                <Calendar size={14} className="text-primary" /> Vigencia
                            </span>
                            <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{services.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {services.map(service => (
                                <button
                                    key={service.service_id}
                                    onClick={() => toggleService(service.service_id)}
                                    className={clsx(
                                        "w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-left group",
                                        selectedServiceIds.has(service.service_id)
                                            ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-600 shadow-sm ring-1 ring-emerald-500/10"
                                            : "bg-white dark:bg-slate-800 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                    )}
                                >
                                    <div className={clsx(
                                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all",
                                        selectedServiceIds.has(service.service_id) ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-200 dark:border-slate-700 group-hover:border-emerald-500"
                                    )}>
                                        {selectedServiceIds.has(service.service_id) && <CheckSquare size={12} strokeWidth={3} />}
                                    </div>
                                    <div className="flex flex-col flex-1 truncate">
                                        <span className="text-[11px] font-black font-mono tracking-tight uppercase leading-none">{service.service_id}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">{service.start_date} → {service.end_date}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Column 3: Routes & Paths Hierarchy */}
                    <div className="flex-1 flex flex-col">
                        <div className="px-8 py-5 border-b utilitarian-border bg-white dark:bg-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-8">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                    <Bus size={14} className="text-primary" /> Inventario de Rutas
                                </div>
                                <div className="relative group w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-hover:text-primary" size={14} />
                                    <input
                                        type="text"
                                        placeholder="Filtrar trazados..."
                                        className="w-full bg-slate-100 dark:bg-slate-900/50 border-2 border-transparent rounded-xl py-2 pl-10 pr-4 text-[11px] font-black uppercase tracking-tight focus:bg-white dark:focus:bg-slate-900 focus:border-primary/20 transition-all outline-none"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button 
                                onClick={handleSelectAllRoutes} 
                                className="text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:underline px-4 py-2 border utilitarian-border rounded-xl bg-slate-50 dark:bg-slate-800 transition-all active:scale-95"
                            >
                                {isAllRoutesSelected ? 'Invertir ' : 'Totalizar'}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {visibleRoutes.map(route => {
                                    const isSelected = selectedRouteIds.has(route.route_id);
                                    return (
                                        <button
                                            key={route.route_id}
                                            onClick={() => toggleRoute(route.route_id)}
                                            className={clsx(
                                                "flex items-center gap-4 p-5 rounded-[24px] border transition-all relative overflow-hidden group select-none text-left",
                                                isSelected
                                                    ? "bg-white dark:bg-slate-800 border-primary shadow-xl shadow-primary/10 ring-1 ring-primary/20 scale-[1.02]"
                                                    : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:translate-x-1"
                                            )}
                                        >
                                            <div className={clsx(
                                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                                isSelected ? "bg-primary border-primary text-white" : "border-slate-200 dark:border-slate-700 group-hover:border-primary"
                                            )}>
                                                {isSelected && <CheckSquare size={14} strokeWidth={3} />}
                                            </div>

                                            <div className="flex-1 flex items-center gap-4 overflow-hidden">
                                                <div 
                                                    className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-[13px] font-display font-black text-white shadow-lg shadow-black/10"
                                                    style={{ backgroundColor: `#${route.route_color}` }}
                                                >
                                                    {route.route_short_name}
                                                </div>
                                                <div className="flex-1 truncate">
                                                    <p className={clsx("text-[11px] font-black uppercase tracking-tight truncate leading-tight", isSelected ? "text-slate-900 dark:text-white" : "text-slate-500")}>
                                                        {route.route_long_name}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-2">
                                                        <Activity size={10} /> Suministro Activo
                                                    </p>
                                                </div>
                                            </div>
                                            <ChevronRight size={14} className={clsx("transition-all", isSelected ? "text-primary translate-x-1" : "text-slate-200 group-hover:text-slate-400")} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tactical Footer */}
                <div className="px-12 py-8 border-t utilitarian-border bg-white dark:bg-slate-800/10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Entidades Consolidadas</span>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border utilitarian-border">
                                    <Building2 size={12} className="text-primary" />
                                    <span className="text-[13px] font-display font-black text-slate-700 dark:text-slate-200">{selectedAgencyIds.size}</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border utilitarian-border">
                                    <Calendar size={12} className="text-emerald-500" />
                                    <span className="text-[13px] font-display font-black text-slate-700 dark:text-slate-200">{selectedServiceIds.size}</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border utilitarian-border">
                                    <Bus size={12} className="text-indigo-500" />
                                    <span className="text-[13px] font-display font-black text-slate-700 dark:text-slate-200">{selectedRouteIds.size}</span>
                                </div>
                            </div>
                        </div>
                        <div className="w-px h-12 bg-slate-200 dark:bg-slate-700" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Protocolo de Salida</span>
                            <span className="text-[11px] font-black text-primary uppercase tracking-[0.1em]">Stricto Sensu GTFS 2.0 (ZIP)</span>
                        </div>
                    </div>

                    <div className="flex gap-4 w-full md:w-auto">
                        <button
                            onClick={onClose}
                            className="flex-1 md:flex-none px-8 py-5 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={exporting || (selectedAgencyIds.size === 0 && selectedRouteIds.size === 0)}
                            className="flex-1 md:flex-none px-12 py-5 bg-primary hover:bg-[#1e4cd8] text-white text-[11px] font-black uppercase tracking-[0.25em] rounded-[24px] shadow-2xl shadow-primary/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-4 transition-all hover:scale-[1.02] active:scale-95 group"
                        >
                            {exporting ? (
                                <>
                                    <Database size={20} className="animate-spin" /> Procesando...
                                </>
                            ) : (
                                <>
                                    <Download size={20} strokeWidth={2.5} className="group-hover:translate-y-0.5 transition-transform" />
                                    Iniciar Exportación
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportModal;
