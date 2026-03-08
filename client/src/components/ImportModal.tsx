import * as React from 'react';
import { X, Upload, FileArchive, CheckCircle2, AlertCircle, Loader2, ChevronRight, ChevronDown, Check, Calendar, Activity, Database, LayoutGrid, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface RouteMetadata {
    route_id: string;
    short_name: string;
    long_name: string;
    agency_id: string;
    agency_name: string;
    route_type: string | number;
}

interface ServiceMetadata {
    service_id: string;
    routes: RouteMetadata[];
}

interface AgencyMetadata {
    id: string;
    name: string;
}

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose }) => {
    const { activeProject } = useAuth();
    const [step, setStep] = React.useState<'upload' | 'select' | 'processing' | 'result'>('upload');

    const [file, setFile] = React.useState<File | null>(null);
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [tempFileId, setTempFileId] = React.useState<string | null>(null);

    const [services, setServices] = React.useState<ServiceMetadata[]>([]);
    const [agencies, setAgencies] = React.useState<AgencyMetadata[]>([]);
    const [routeTypes, setRouteTypes] = React.useState<string[]>([]);

    const [selectedAgencyIds, setSelectedAgencyIds] = React.useState<Set<string>>(new Set());
    const [selectedRouteTypes, setSelectedRouteTypes] = React.useState<Set<string>>(new Set());

    const [selectedPairs, setSelectedPairs] = React.useState<Set<string>>(new Set());
    const [expandedServices, setExpandedServices] = React.useState<Set<string>>(new Set());

    const [progress, setProgress] = React.useState(0);
    const [message, setMessage] = React.useState('');
    const [result, setResult] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (isOpen) {
            setStep('upload');
            setFile(null);
            setError(null);
            setProgress(0);
            setMessage('');
            setResult(null);
            setServices([]);
            setAgencies([]);
            setRouteTypes([]);
            setTempFileId(null);
            setSelectedPairs(new Set());
            setSelectedAgencyIds(new Set());
            setSelectedRouteTypes(new Set());
        }
    }, [isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) validateAndSetFile(e.target.files[0]);
    };

    const validateAndSetFile = (f: File) => {
        if (!f.name.endsWith('.zip')) {
            setError('Formato inválido. Se requiere archivo .zip estándar.');
            return;
        }
        setFile(f);
        setError(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleScan = async () => {
        if (!file) return;
        setStep('processing');
        setProgress(0);
        setMessage('Analizando estructura del suministro GTFS...');
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_URL}/gtfs/scan`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Exploración fallida');

            const data = await res.json();
            setTempFileId(data.tempFileId);

            let loadedServices: ServiceMetadata[] = [];
            let loadedAgencies: AgencyMetadata[] = [];
            let loadedTypes: string[] = [];

            if (Array.isArray(data.metadata)) {
                loadedServices = data.metadata;
            } else {
                loadedServices = data.metadata.services;
                loadedAgencies = data.metadata.agencies || [];
                loadedTypes = data.metadata.routeTypes || [];
            }

            setServices(loadedServices);
            setAgencies(loadedAgencies);
            setRouteTypes(loadedTypes);

            setSelectedAgencyIds(new Set(loadedAgencies.map(a => a.id)));
            setSelectedRouteTypes(new Set(loadedTypes));

            const allPairs = new Set<string>();
            loadedServices.forEach((s) => {
                s.routes.forEach(r => allPairs.add(`${s.service_id}|${r.route_id}`));
            });
            setSelectedPairs(allPairs);
            setExpandedServices(new Set(loadedServices.slice(0, 1).map((s) => s.service_id)));

            setStep('select');
        } catch (err: any) {
            setError(err.message || 'Exploración fallida');
            setStep('upload');
        }
    };

    const getFilteredServices = () => {
        return services.map(service => {
            const filteredRoutes = service.routes.filter(r => {
                if (agencies.length > 0 && !selectedAgencyIds.has(r.agency_id)) return false;
                if (routeTypes.length > 0 && !selectedRouteTypes.has(String(r.route_type))) return false;
                return true;
            });
            if (filteredRoutes.length === 0) return null;
            return { ...service, routes: filteredRoutes };
        }).filter(Boolean) as ServiceMetadata[];
    };

    const filteredServices = getFilteredServices();

    const toggleService = (serviceId: string, routes: RouteMetadata[]) => {
        const newSelectedPairs = new Set(selectedPairs);
        const serviceKeys = routes.map(r => `${serviceId}|${r.route_id}`);
        const allSelected = serviceKeys.every(k => newSelectedPairs.has(k));
        if (allSelected) serviceKeys.forEach(k => newSelectedPairs.delete(k));
        else serviceKeys.forEach(k => newSelectedPairs.add(k));
        setSelectedPairs(newSelectedPairs);
    };

    const toggleRoute = (routeId: string, serviceId: string) => {
        const key = `${serviceId}|${routeId}`;
        const newSelectedPairs = new Set(selectedPairs);
        if (newSelectedPairs.has(key)) newSelectedPairs.delete(key);
        else newSelectedPairs.add(key);
        setSelectedPairs(newSelectedPairs);
    };

    const toggleExpand = (serviceId: string) => {
        const newExpanded = new Set(expandedServices);
        if (newExpanded.has(serviceId)) newExpanded.delete(serviceId);
        else newExpanded.add(serviceId);
        setExpandedServices(newExpanded);
    };

    const getRouteTypeName = (type: string | number) => {
        if (type === undefined || type === null) return 'Protocolo Desconocido';
        const typeStr = String(type);
        const map: Record<string, string> = {
            '0': 'Tranvía / LRT',
            '1': 'Metro / Subte',
            '2': 'Ferrocarril',
            '3': 'Autobus / Mixto',
            '4': 'Ferry',
            '5': 'Teleférico',
            '11': 'Trolebús',
            '12': 'Monorail'
        };
        return map[typeStr] || `Modo ${typeStr}`;
    };

    const handleExecuteImport = async () => {
        if (!tempFileId) return;
        setStep('processing');
        setProgress(0);
        setMessage('Iniciando sincronización de red...');

        try {
            const selectedPairsArray = Array.from(selectedPairs);
            const uniqueServices = new Set(selectedPairsArray.map(p => p.split('|')[0]));
            const uniqueRoutes = new Set(selectedPairsArray.map(p => p.split('|')[1]));

            const res = await fetch(`${API_URL}/gtfs/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tempFileId,
                    selectedPairs: selectedPairsArray,
                    selectedServices: Array.from(uniqueServices),
                    selectedRoutes: Array.from(uniqueRoutes)
                })
            });

            if (!res.ok) throw new Error('Sincronización fallida');
            const { taskId } = await res.json();
            pollStatus(taskId);

        } catch (err: any) {
            setError(err.message || 'Sincronización fallida');
            setStep('result');
        }
    };

    const pollStatus = (taskId: string) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API_URL}/gtfs/import/status/${taskId}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        clearInterval(interval);
                        setError('La tarea de importación no se encuentra. Es posible que el servidor se haya reiniciado.');
                        setStep('result');
                    }
                    return;
                }
                const data = await res.json();
                setProgress(data.progress);
                setMessage(data.message);
                if (data.status === 'completed') {
                    clearInterval(interval);
                    setStep('result');
                    setResult(data.details);
                } else if (data.status === 'error') {
                    clearInterval(interval);
                    setError(data.message || 'Sincronización fallida');
                    setStep('result');
                }
            } catch (err) {
                console.error("Error de sondeo", err);
                // Don't clear interval on transient network error, but maybe after some retries?
                // For now, let it retry.
            }
        }, 1000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-[40px] shadow-[0_0_100px_rgba(0,0,0,0.4)] w-full max-w-5xl flex flex-col h-[85vh] animate-in zoom-in-95 duration-300 border utilitarian-border overflow-hidden">

                {/* Tactical Header */}
                <div className="px-10 py-8 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <FileArchive className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white leading-tight">Importar Suministro GTFS</h2>
                            <p className="text-sm text-slate-400">
                                Cargando datos en: <span className="text-indigo-400 font-medium">{activeProject?.name || 'Proyecto Actual'}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white border utilitarian-border"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Analytical Body */}
                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-slate-50/30 dark:bg-slate-900/10">

                    {/* Step 1: Tactical Zone */}
                    {step === 'upload' && (
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDrop}
                            className={clsx(
                                "border-2 border-dashed rounded-[32px] p-16 flex flex-col items-center justify-center text-center transition-all cursor-pointer min-h-[400px] border-slate-200 dark:border-slate-800",
                                isDragOver ? "border-primary bg-primary/5 scale-[0.99]" : "bg-white dark:bg-slate-800/50 hover:border-primary/50 hover:bg-white dark:hover:bg-slate-800"
                            )}
                        >
                            <input type="file" accept=".zip" className="hidden" id="file-import" onChange={handleFileChange} />
                            <label htmlFor="file-import" className="flex flex-col items-center cursor-pointer w-full h-full">
                                {file ? (
                                    <div className="animate-in zoom-in-95 duration-500">
                                        <div className="w-24 h-24 rounded-[28px] bg-primary text-white flex items-center justify-center shadow-2xl shadow-primary/20 mx-auto mb-6">
                                            <FileArchive size={40} strokeWidth={2.5} />
                                        </div>
                                        <p className="text-xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-2">{file.name}</p>
                                        <p className="text-[10px] font-black font-mono text-primary uppercase tracking-[0.2em]">{(file.size / 1024 / 1024).toFixed(2)} MB • Listo para análisis</p>
                                        <button className="mt-8 px-6 py-2 rounded-xl border utilitarian-border text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-all">Cambiar Suministro</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-24 h-24 rounded-[32px] bg-slate-50 dark:bg-slate-900 border utilitarian-border flex items-center justify-center text-slate-300 transition-transform hover:-translate-y-2 duration-500 mb-8 shadow-sm">
                                            <Upload size={40} strokeWidth={2} />
                                        </div>
                                        <p className="text-lg font-display font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Vincular Archivo GTFS</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] max-w-xs leading-relaxed">Arrastre el paquete .zip de infraestructura o haga clic para procesar.</p>
                                    </>
                                )}
                            </label>
                            {error && <div className="mt-8 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-3 animate-in shake duration-500">
                                <AlertCircle size={16} className="text-red-500" />
                                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{error}</span>
                            </div>}
                        </div>
                    )}

                    {/* Step 2: Selection Board */}
                    {step === 'select' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
                            
                            {/* Analytics-based Filters */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Agencies Tactical Filter */}
                                <div className="bg-white dark:bg-slate-800 p-6 rounded-[28px] border utilitarian-border shadow-sm">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Database size={14} className="text-primary" /> Operadoras Detectadas
                                        </p>
                                        <div className="flex gap-4">
                                            <button onClick={() => setSelectedAgencyIds(new Set(agencies.map(a => a.id)))} className="text-[9px] font-black uppercase text-primary hover:underline">Totalizar</button>
                                            <button onClick={() => setSelectedAgencyIds(new Set())} className="text-[9px] font-black uppercase text-slate-400 hover:text-slate-600">Omitir</button>
                                        </div>
                                    </div>
                                    <div className="max-h-36 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                                        {agencies.map(a => (
                                            <button 
                                                key={a.id} 
                                                onClick={() => {
                                                    const next = new Set(selectedAgencyIds);
                                                    if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                                                    setSelectedAgencyIds(next);
                                                }}
                                                className={clsx(
                                                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all group",
                                                    selectedAgencyIds.has(a.id) ? "bg-primary/5 text-primary" : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all",
                                                    selectedAgencyIds.has(a.id) ? "bg-primary border-primary text-white" : "border-slate-200 dark:border-slate-700"
                                                )}>
                                                    {selectedAgencyIds.has(a.id) && <Check size={10} strokeWidth={4} />}
                                                </div>
                                                <span className="text-[11px] font-black uppercase tracking-tight text-left truncate">{a.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Modes Tactical Filter */}
                                <div className="bg-white dark:bg-slate-800 p-6 rounded-[28px] border utilitarian-border shadow-sm">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Activity size={14} className="text-primary" /> Modos Operativos
                                        </p>
                                        <div className="flex gap-4">
                                            <button onClick={() => setSelectedRouteTypes(new Set(routeTypes))} className="text-[9px] font-black uppercase text-primary hover:underline">Totalizar</button>
                                            <button onClick={() => setSelectedRouteTypes(new Set())} className="text-[9px] font-black uppercase text-slate-400 hover:text-slate-600">Omitir</button>
                                        </div>
                                    </div>
                                    <div className="max-h-36 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                                        {routeTypes.map(t => (
                                            <button 
                                                key={t} 
                                                onClick={() => {
                                                    const next = new Set(selectedRouteTypes);
                                                    if (next.has(t)) next.delete(t); else next.add(t);
                                                    setSelectedRouteTypes(next);
                                                }}
                                                className={clsx(
                                                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all group",
                                                    selectedRouteTypes.has(t) ? "bg-primary/5 text-primary" : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all",
                                                    selectedRouteTypes.has(t) ? "bg-primary border-primary text-white" : "border-slate-200 dark:border-slate-700"
                                                )}>
                                                    {selectedRouteTypes.has(t) && <Check size={10} strokeWidth={4} />}
                                                </div>
                                                <span className="text-[11px] font-black uppercase tracking-tight text-left truncate">{getRouteTypeName(t)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Inventory Board */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-4">
                                        <div className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                            <LayoutGrid size={16} className="text-primary" /> Inventario de Suministro
                                        </div>
                                        <span className="px-2 py-0.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[9px] font-black rounded-full uppercase tabular-nums tracking-widest">
                                            {selectedPairs.size} Seleccionados
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const allPairs = new Set<string>();
                                            filteredServices.forEach(s => s.routes.forEach(r => allPairs.add(`${s.service_id}|${r.route_id}`)));
                                            setSelectedPairs(allPairs);
                                        }}
                                        className="text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:underline hover:scale-105 transition-all"
                                    >
                                        Selección Total
                                    </button>
                                </div>

                                <div className="border utilitarian-border rounded-[32px] overflow-hidden bg-white dark:bg-slate-800 shadow-sm transition-all duration-500">
                                    {filteredServices.length === 0 ? (
                                        <div className="p-20 text-center flex flex-col items-center gap-4">
                                             <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-full text-slate-200">
                                                <Activity size={40} />
                                             </div>
                                             <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-relaxed max-w-xs">No hay entidades que coincidan con los filtros tácticos aplicados.</p>
                                        </div>
                                    ) : filteredServices.map(service => {
                                        const isExpanded = expandedServices.has(service.service_id);
                                        const serviceKeys = service.routes.map(r => `${service.service_id}|${r.route_id}`);
                                        const selectedCount = serviceKeys.filter(k => selectedPairs.has(k)).length;
                                        const totalCount = service.routes.length;
                                        const isSelected = selectedCount === totalCount && totalCount > 0;
                                        const isPartial = selectedCount > 0 && selectedCount < totalCount;

                                        return (
                                            <div key={service.service_id} className="border-b utilitarian-border last:border-0">
                                                <div className={clsx(
                                                    "flex items-center p-6 transition-all group",
                                                    isExpanded ? "bg-slate-50 dark:bg-slate-800/80" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                                )}>
                                                    <button onClick={() => toggleExpand(service.service_id)} className="p-2 mr-4 text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all transform group-hover:scale-110">
                                                        {isExpanded ? <ChevronDown size={20} strokeWidth={2.5} /> : <ChevronRight size={20} strokeWidth={2.5} />}
                                                    </button>
                                                    <button 
                                                        onClick={() => toggleService(service.service_id, service.routes)}
                                                        className={clsx(
                                                            "w-6 h-6 rounded-lg border-2 flex items-center justify-center mr-6 transition-all",
                                                            isSelected ? "bg-primary border-primary text-white" : isPartial ? "bg-primary/20 border-primary/40 text-primary" : "border-slate-200 dark:border-slate-700"
                                                        )}
                                                    >
                                                        {(isSelected || isPartial) && <Check size={14} strokeWidth={4} />}
                                                    </button>
                                                    <div className="flex-1 flex flex-col cursor-pointer" onClick={() => toggleExpand(service.service_id)}>
                                                        <div className="flex items-center gap-3">
                                                            <Calendar size={14} className="text-primary/60" />
                                                            <span className="text-[12px] font-black font-mono text-slate-900 dark:text-white uppercase tracking-tight leading-none">{service.service_id}</span>
                                                        </div>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">{selectedCount} de {totalCount} trazados seleccionados</span>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="bg-white dark:bg-slate-900/50 p-4 pl-24 space-y-2 animate-in slide-in-from-top-2 duration-300">
                                                        {service.routes.map(route => {
                                                            const key = `${service.service_id}|${route.route_id}`;
                                                            const isRouteSelected = selectedPairs.has(key);
                                                            return (
                                                                <button 
                                                                    key={route.route_id} 
                                                                    onClick={() => toggleRoute(route.route_id, service.service_id)}
                                                                    className={clsx(
                                                                        "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group",
                                                                        isRouteSelected ? "bg-primary/5 border-primary/20 shadow-sm" : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                                                                    )}
                                                                >
                                                                    <div className={clsx(
                                                                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all",
                                                                        isRouteSelected ? "bg-primary border-primary text-white" : "border-slate-200 dark:border-slate-700 group-hover:border-primary"
                                                                    )}>
                                                                        {isRouteSelected && <Check size={12} strokeWidth={4} />}
                                                                    </div>
                                                                    <div className="flex-1 overflow-hidden">
                                                                        <div className="flex items-center gap-3 mb-1.5">
                                                                            <span className="px-2 py-0.5 bg-slate-900 text-white dark:bg-slate-700 text-[10px] font-black rounded-lg font-mono tracking-tight uppercase">{route.short_name || route.route_id}</span>
                                                                            <span className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight truncate flex-1">{route.long_name}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-4">
                                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Database size={10} /> {route.agency_name}</span>
                                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Activity size={10} /> {getRouteTypeName(route.route_type)}</span>
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Deployment Status */}
                    {step === 'processing' && (
                        <div className="h-full flex flex-col items-center justify-center py-20 animate-in fade-in duration-1000">
                            <div className="relative mb-8">
                                <div className="absolute inset-0 bg-primary/20 blur-3xl animate-pulse rounded-full" />
                                <div className="w-32 h-32 rounded-[40px] bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center relative shadow-2xl">
                                    <Loader2 size={48} strokeWidth={2.5} className="animate-spin" />
                                </div>
                            </div>
                            <h3 className="text-xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4">{message}</h3>
                            <div className="w-96 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-full border utilitarian-border overflow-hidden mb-4">
                                <div className="h-3 bg-primary rounded-full transition-all duration-700 ease-out-expo shadow-[0_0_15px_rgba(37,99,235,0.4)]" style={{ width: `${progress}%` }} />
                            </div>
                            <span className="text-[10px] font-black font-mono text-primary uppercase tracking-[0.2em]">{progress}% COMPLETADO</span>
                        </div>
                    )}

                    {/* Step 4: Final Report */}
                    {step === 'result' && (
                        <div className="h-full flex flex-col max-w-4xl mx-auto p-2 animate-in zoom-in-95 slide-in-from-bottom-12 duration-700 ease-out-expo">
                            {error ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center">
                                    <div className="w-24 h-24 rounded-[32px] bg-red-500 text-white flex items-center justify-center mb-8 shadow-2xl shadow-red-500/20">
                                        <AlertCircle size={48} strokeWidth={2.5} />
                                    </div>
                                    <h3 className="text-2xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4">Integridad de Suministro Fallida</h3>
                                    <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest leading-relaxed bg-red-500/5 p-6 rounded-[24px] border border-red-500/10 italic">"{error}"</p>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full space-y-8 py-4">
                                    {/* Success Header */}
                                    <div className="flex items-center gap-6 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-[40px]">
                                        <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                                            <CheckCircle2 size={32} strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-2">Sincronización Completada</h3>
                                            <p className="text-[10px] font-bold text-slate-500 dark:text-emerald-400/60 uppercase tracking-[0.2em] leading-none">La red de transporte ha sido actualizada con éxito.</p>
                                        </div>
                                    </div>

                                    {/* Main KPIs Section */}
                                    {result && (
                                        <div className="grid grid-cols-3 gap-6">
                                            {[
                                                { label: 'Sincronizados', val: result.importedRoutesCount, color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10' },
                                                { label: 'Omitidos', val: result.skippedRoutesCount, color: 'text-slate-400', bg: 'bg-slate-500/5', border: 'border-slate-500/10' },
                                                { label: 'Inválidos', val: result.invalidRoutesCount, color: 'text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/10' }
                                            ].map((stat, i) => (
                                                <div key={i} className={clsx("p-10 rounded-[40px] border utilitarian-border text-center shadow-xl transition-all hover:scale-[1.02]", stat.bg, stat.border)}>
                                                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4 leading-none">{stat.label}</p>
                                                    <p className={clsx("text-6xl font-display font-black leading-none tracking-tighter", stat.color)}>{stat.val || 0}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Detailed Logs Section (Scrollable) */}
                                    {result?.skippedRoutes?.length > 0 && (
                                        <div className="flex-1 flex flex-col min-h-0 min-w-0">
                                            <div className="flex items-center justify-between mb-4 px-4 text-slate-400">
                                                <div className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                                    <Info size={14} /> Trazados Pre-existentes (Omitidos)
                                                </div>
                                                <div className="text-[10px] font-mono font-bold">{result.skippedRoutes.length} ITEMS</div>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-8 bg-slate-100/50 dark:bg-slate-800/20 rounded-[40px] border border-dashed border-slate-200 dark:border-slate-800 custom-scrollbar">
                                                <div className="flex flex-wrap gap-2">
                                                    {result.skippedRoutes.map((id: string, i: number) => (
                                                        <span key={i} className="px-3 py-1.5 bg-white dark:bg-slate-900/80 text-[10px] font-black font-mono text-slate-500 dark:text-slate-400 rounded-xl border utilitarian-border shadow-sm">
                                                            {id}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Tactical Footer Overlay */}
                <div className="px-10 py-10 border-t utilitarian-border bg-white dark:bg-slate-800/10 flex justify-end gap-6">
                    <button 
                        onClick={onClose} 
                        className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 transition-colors"
                    >
                        {step === 'result' ? 'Finalizar Reporte' : 'Abortar Operación'}
                    </button>

                    {step === 'upload' && (
                        <button
                            onClick={handleScan}
                            disabled={!file}
                            className="px-12 py-5 bg-primary hover:bg-[#1e4cd8] text-white text-[11px] font-black uppercase tracking-[0.25em] rounded-[24px] shadow-2xl shadow-primary/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-95 group"
                        >
                            <Activity size={18} strokeWidth={2.5} className="group-hover:rotate-180 transition-transform duration-500" />
                            Analizar Suministro
                        </button>
                    )}

                    {step === 'select' && (
                        <button
                            onClick={handleExecuteImport}
                            disabled={selectedPairs.size === 0}
                            className="px-12 py-5 bg-primary hover:bg-[#1e4cd8] text-white text-[11px] font-black uppercase tracking-[0.25em] rounded-[24px] shadow-2xl shadow-primary/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-95 group"
                        >
                            <ProtocoloImportIcon size={18} />
                            Ejecutar Vinculación ({selectedPairs.size})
                        </button>
                    )}

                    {step === 'result' && !error && (
                        <button
                            onClick={() => { onClose(); window.location.reload(); }}
                            className="px-12 py-5 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black uppercase tracking-[0.25em] rounded-[24px] shadow-2xl shadow-emerald-500/30 flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-95"
                        >
                            <CheckCircle2 size={18} strokeWidth={2.5} />
                            Reiniciar Entorno
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const ProtocoloImportIcon = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v19" />
        <path d="M5 10l7 7 7-7" />
    </svg>
);

export default ImportModal;
