import * as React from 'react';
import { X, Upload, FileArchive, CheckCircle2, AlertTriangle, AlertCircle, Loader2, ChevronRight, ChevronDown, Check, Bus, Calendar } from 'lucide-react';
import { clsx } from 'clsx';
import { useEditor } from '../context/EditorContext';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

import { API_URL } from '../config';

// Interfaces
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
    // Wizard Steps: upload -> select -> processing -> result
    const [step, setStep] = React.useState<'upload' | 'select' | 'processing' | 'result'>('upload');

    // File State
    const [file, setFile] = React.useState<File | null>(null);
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [tempFileId, setTempFileId] = React.useState<string | null>(null);

    // Data State
    const [services, setServices] = React.useState<ServiceMetadata[]>([]);
    const [agencies, setAgencies] = React.useState<AgencyMetadata[]>([]);
    const [routeTypes, setRouteTypes] = React.useState<string[]>([]);

    // Filter State
    const [selectedAgencyIds, setSelectedAgencyIds] = React.useState<Set<string>>(new Set());
    const [selectedRouteTypes, setSelectedRouteTypes] = React.useState<Set<string>>(new Set());

    const [selectedPairs, setSelectedPairs] = React.useState<Set<string>>(new Set()); // "serviceId|routeId"
    const [expandedServices, setExpandedServices] = React.useState<Set<string>>(new Set());

    // Status State
    const [progress, setProgress] = React.useState(0);
    const [message, setMessage] = React.useState('');
    const [result, setResult] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);

    // Reset state when modal opens
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

    // --- File Handling ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) validateAndSetFile(e.target.files[0]);
    };

    const validateAndSetFile = (f: File) => {
        if (!f.name.endsWith('.zip')) {
            setError('Invalid file type. Please upload a .zip file.');
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

    // --- Step 1: Scan ---
    const handleScan = async () => {
        if (!file) return;
        setStep('processing');
        setProgress(0);
        setMessage('Uploading and Scanning GTFS file...');
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_URL}/gtfs/scan`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Scan failed');

            const data = await res.json();
            console.log('Scan result:', data);
            setTempFileId(data.tempFileId);

            // Handle new metadata structure
            // Fallback for old API response (array) vs new object
            let loadedServices: ServiceMetadata[] = [];
            let loadedAgencies: AgencyMetadata[] = [];
            let loadedTypes: string[] = [];

            if (Array.isArray(data.metadata)) {
                console.log('Metadata is array (Old Format)');
                loadedServices = data.metadata;
            } else {
                console.log('Metadata is object (New Format)', data.metadata);
                loadedServices = data.metadata.services;
                loadedAgencies = data.metadata.agencies || [];
                loadedTypes = data.metadata.routeTypes || [];
            }

            setServices(loadedServices);
            setAgencies(loadedAgencies);
            setRouteTypes(loadedTypes);

            // Select all filters by default
            setSelectedAgencyIds(new Set(loadedAgencies.map(a => a.id)));
            setSelectedRouteTypes(new Set(loadedTypes));

            // Pre-select all pairs
            const allPairs = new Set<string>();
            loadedServices.forEach((s) => {
                s.routes.forEach(r => allPairs.add(`${s.service_id}|${r.route_id}`));
            });
            setSelectedPairs(allPairs);

            setExpandedServices(new Set(loadedServices.slice(0, 1).map((s) => s.service_id))); // Expand first

            setStep('select');
        } catch (err: any) {
            setError(err.message || 'Scan failed');
            setStep('upload');
        }
    };

    // --- Filtering Logic ---
    const getFilteredServices = () => {
        return services.map(service => {
            // Filter routes within service
            const filteredRoutes = service.routes.filter(r => {
                // Check Agency Filter
                // Note: If no agencies returned (old API), allow all
                if (agencies.length > 0 && !selectedAgencyIds.has(r.agency_id)) return false;

                // Check Mode Filter
                if (routeTypes.length > 0 && !selectedRouteTypes.has(String(r.route_type))) return false;

                return true;
            });

            if (filteredRoutes.length === 0) return null;

            return {
                ...service,
                routes: filteredRoutes
            };
        }).filter(Boolean) as ServiceMetadata[];
    };

    const filteredServices = getFilteredServices();

    // --- Step 2: Selection Helpers ---
    const toggleService = (serviceId: string, routes: RouteMetadata[]) => {
        const newSelectedPairs = new Set(selectedPairs);

        // Check if all routes in this service are currently selected
        const serviceKeys = routes.map(r => `${serviceId}|${r.route_id}`);
        const allSelected = serviceKeys.every(k => newSelectedPairs.has(k));

        if (allSelected) {
            // Deselect all
            serviceKeys.forEach(k => newSelectedPairs.delete(k));
        } else {
            // Select all
            serviceKeys.forEach(k => newSelectedPairs.add(k));
        }
        setSelectedPairs(newSelectedPairs);
    };

    const toggleRoute = (routeId: string, serviceId: string) => {
        const key = `${serviceId}|${routeId}`;
        const newSelectedPairs = new Set(selectedPairs);

        if (newSelectedPairs.has(key)) {
            newSelectedPairs.delete(key);
        } else {
            newSelectedPairs.add(key);
        }
        setSelectedPairs(newSelectedPairs);
    };

    const toggleExpand = (serviceId: string) => {
        const newExpanded = new Set(expandedServices);
        if (newExpanded.has(serviceId)) newExpanded.delete(serviceId);
        else newExpanded.add(serviceId);
        setExpandedServices(newExpanded);
    };

    const toggleFilterAgency = (id: string) => {
        const next = new Set(selectedAgencyIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedAgencyIds(next);
    };

    const toggleFilterType = (type: string) => {
        const next = new Set(selectedRouteTypes);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        setSelectedRouteTypes(next);
    };

    const getRouteTypeName = (type: string | number) => {
        if (type === undefined || type === null) return 'Unknown Type';
        const typeStr = String(type);
        const map: Record<string, string> = {
            '0': 'Tram/Light Rail (0)',
            '1': 'Subway (1)',
            '2': 'Rail (2)',
            '3': 'Bus (3)',
            '4': 'Ferry (4)',
            '5': 'Cable Tram (5)',
            '6': 'Aerial Lift (6)',
            '7': 'Funicular (7)',
            '11': 'Trolleybus (11)',
            '12': 'Monorail (12)'
        };
        return map[typeStr] || `Type ${typeStr}`;
    };

    // --- Step 3: Execute Import ---
    const handleExecuteImport = async () => {
        if (!tempFileId) return;
        setStep('processing');
        setProgress(0);
        setMessage('Starting Import...');

        try {
            // Derive lists for backward compatibility / logging
            const selectedPairsArray = Array.from(selectedPairs);

            // Unique services/routes just for legacy logging if needed, but backend uses pairs now.
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

            if (!res.ok) throw new Error('Import failed');
            const { taskId } = await res.json();
            pollStatus(taskId);

        } catch (err: any) {
            setError(err.message || 'Import failed');
            setStep('result'); // Or error state
        }
    };

    const pollStatus = (taskId: string) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API_URL}/gtfs/import/status/${taskId}`);
                if (!res.ok) return;

                const data = await res.json();
                setProgress(data.progress);
                setMessage(data.message);

                if (data.status === 'completed') {
                    clearInterval(interval);
                    setStep('result');
                    setResult(data.details);
                } else if (data.status === 'error') {
                    clearInterval(interval);
                    setError(data.message);
                    setStep('result');
                }
            } catch (err) {
                console.error("Polling error", err);
            }
        }, 1000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-700">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Upload size={24} className="text-[#1337ec]" />
                            Import GTFS
                        </h2>
                        {step === 'select' && <p className="text-sm text-gray-500 mt-1">Select the services and routes you want to import.</p>}
                        {step === 'upload' && <p className="text-sm text-gray-500 mt-1">Upload a GTFS .zip file to scan content.</p>}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">

                    {/* Step 1: Upload */}
                    {step === 'upload' && (
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDrop}
                            className={clsx(
                                "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer min-h-[300px]",
                                isDragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            )}
                        >
                            <input type="file" accept=".zip" className="hidden" id="file-upload" onChange={handleFileChange} />
                            <label htmlFor="file-upload" className="flex flex-col items-center cursor-pointer w-full h-full">
                                {file ? (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center mb-4"><FileArchive size={32} /></div>
                                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{file.name}</p>
                                        <p className="text-sm text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        <p className="text-xs text-blue-500 font-medium mt-4">Click to change file</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center mb-4"><Upload size={32} /></div>
                                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">Click to upload or drag & drop</p>
                                        <p className="text-sm text-gray-500 mt-1">GTFS .zip file (Max 50MB)</p>
                                    </>
                                )}
                            </label>
                            {error && <p className="text-red-500 text-sm mt-4 font-medium">{error}</p>}
                        </div>
                    )}

                    {/* Step 2: Select */}
                    {step === 'select' && (
                        <div className="space-y-4">

                            {/* Filters */}
                            {(agencies.length > 0 || routeTypes.length > 0) && (
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-md">
                                            <Upload size={16} />
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Filter Data</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Agencies Filter */}
                                        {agencies.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Agencies</p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setSelectedAgencyIds(new Set(agencies.map(a => a.id)))}
                                                            className="text-[10px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded transition-colors"
                                                        >
                                                            All
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedAgencyIds(new Set())}
                                                            className="text-[10px] font-medium text-gray-500 hover:text-gray-700 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded transition-colors"
                                                        >
                                                            None
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="max-h-32 overflow-y-auto space-y-1 pr-2 custom-scrollbar border border-gray-100 dark:border-gray-700 rounded-lg p-2 bg-gray-50/50 dark:bg-gray-800/50">
                                                    {agencies.map(a => (
                                                        <div key={a.id} className="flex items-start gap-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 p-1 rounded cursor-pointer" onClick={() => toggleFilterAgency(a.id)}>
                                                            <div className={clsx(
                                                                "mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                                                                selectedAgencyIds.has(a.id)
                                                                    ? "bg-blue-600 border-blue-600"
                                                                    : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                                            )}>
                                                                {selectedAgencyIds.has(a.id) && <Check size={12} className="text-white" />}
                                                            </div>
                                                            <span className={clsx("text-xs break-all", selectedAgencyIds.has(a.id) ? "text-gray-900 dark:text-gray-200 font-medium" : "text-gray-500")}>
                                                                {a.name}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Route Types Filter */}
                                        {routeTypes.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Transport Modes</p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setSelectedRouteTypes(new Set(routeTypes))}
                                                            className="text-[10px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded transition-colors"
                                                        >
                                                            All
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedRouteTypes(new Set())}
                                                            className="text-[10px] font-medium text-gray-500 hover:text-gray-700 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded transition-colors"
                                                        >
                                                            None
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="max-h-32 overflow-y-auto space-y-1 pr-2 custom-scrollbar border border-gray-100 dark:border-gray-700 rounded-lg p-2 bg-gray-50/50 dark:bg-gray-800/50">
                                                    {routeTypes.map(t => (
                                                        <div key={t} className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 p-1 rounded cursor-pointer" onClick={() => toggleFilterType(t)}>
                                                            <div className={clsx(
                                                                "w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                                                                selectedRouteTypes.has(t)
                                                                    ? "bg-purple-600 border-purple-600"
                                                                    : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                                            )}>
                                                                {selectedRouteTypes.has(t) && <Check size={12} className="text-white" />}
                                                            </div>
                                                            <span className={clsx("text-xs", selectedRouteTypes.has(t) ? "text-gray-900 dark:text-gray-200 font-medium" : "text-gray-500")}>
                                                                {getRouteTypeName(String(t))}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-gray-500">
                                    {Array.from(selectedPairs).filter(p => {
                                        // Only count visible ones ?? Or keep total?
                                        // Currently calculating based on total selection
                                        return true;
                                    }).length} items selected
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const allPairs = new Set<string>();
                                            // Only select visible (filtered)
                                            filteredServices.forEach(s => s.routes.forEach(r => allPairs.add(`${s.service_id}|${r.route_id}`)));
                                            setSelectedPairs(allPairs);
                                        }}
                                        className="text-xs text-blue-600 hover:underline"
                                    >
                                        Select All Visible
                                    </button>
                                    <button
                                        onClick={() => setSelectedPairs(new Set())}
                                        className="text-xs text-gray-500 hover:underline"
                                    >
                                        Deselect All
                                    </button>
                                </div>
                            </div>

                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                {filteredServices.length === 0 && (
                                    <div className="p-8 text-center text-gray-500">
                                        No routes match the selected filters.
                                    </div>
                                )}
                                {filteredServices.map(service => {
                                    const isExpanded = expandedServices.has(service.service_id);

                                    // Check selection state for this service
                                    const serviceKeys = service.routes.map(r => `${service.service_id}|${r.route_id}`);
                                    const selectedCount = serviceKeys.filter(k => selectedPairs.has(k)).length;
                                    const totalCount = service.routes.length;
                                    const isSelected = selectedCount === totalCount && totalCount > 0;
                                    const isPartial = selectedCount > 0 && selectedCount < totalCount;

                                    return (
                                        <div key={service.service_id} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
                                            {/* Service Header */}
                                            <div className="flex items-center bg-gray-50 dark:bg-gray-800/50 p-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                                                <button onClick={() => toggleExpand(service.service_id)} className="p-1 mr-2 text-gray-500 hover:text-gray-700">
                                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                </button>
                                                <div
                                                    className="relative flex items-center justify-center w-5 h-5 mr-3 cursor-pointer border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                                    onClick={() => toggleService(service.service_id, service.routes)}
                                                >
                                                    {(isSelected || isPartial) && (
                                                        <div className={clsx("w-3 h-3 rounded-sm", isSelected ? "bg-blue-600" : "bg-blue-400")} />
                                                    )}
                                                </div>
                                                <div className="flex-1 flex items-center gap-2 cursor-pointer" onClick={() => toggleExpand(service.service_id)}>
                                                    <Calendar size={16} className="text-gray-400" />
                                                    <span className="font-mono font-medium text-sm text-gray-700 dark:text-gray-200">{service.service_id}</span>
                                                    <span className="text-xs text-gray-400">({selectedCount}/{totalCount} routes)</span>
                                                </div>
                                            </div>

                                            {/* Routes List */}
                                            {isExpanded && (
                                                <div className="bg-white dark:bg-gray-800 p-2 pl-12 space-y-1">
                                                    {service.routes.map(route => {
                                                        const key = `${service.service_id}|${route.route_id}`;
                                                        const isRouteSelected = selectedPairs.has(key);
                                                        return (
                                                            <div key={route.route_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                                <div
                                                                    className={clsx(
                                                                        "w-5 h-5 border rounded flex items-center justify-center cursor-pointer transition-colors",
                                                                        isRouteSelected ? "bg-blue-600 border-blue-600" : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                                                    )}
                                                                    onClick={() => toggleRoute(route.route_id, service.service_id)}
                                                                >
                                                                    {isRouteSelected && <Check size={14} className="text-white" />}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-sm text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-1.5 rounded">{route.short_name || route.route_id}</span>
                                                                        <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[300px]">{route.long_name}</span>
                                                                    </div>
                                                                    <div className="flex gap-2 mt-1">
                                                                        {route.agency_name && (
                                                                            <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-700 px-1 rounded">{route.agency_name}</span>
                                                                        )}
                                                                        <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-700 px-1 rounded">{getRouteTypeName(String(route.route_type))}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Processing */}
                    {step === 'processing' && (
                        <div className="space-y-4 py-12 flex flex-col items-center">
                            <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{message}</h3>
                            <div className="w-full max-w-md h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
                                <div className="h-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="text-sm text-gray-500">{progress}%</p>
                        </div>
                    )}

                    {/* Step 4: Result */}
                    {step === 'result' && (
                        <div className="space-y-6">
                            {error ? (
                                <div className="flex flex-col items-center text-center p-6 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                                    <AlertCircle size={32} className="text-red-500 mb-3" />
                                    <h3 className="text-lg font-bold text-red-800 dark:text-red-200">Import Failed</h3>
                                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col items-center text-center p-6 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-100 dark:border-green-900/30">
                                        <CheckCircle2 size={32} className="text-green-600 mb-3" />
                                        <h3 className="text-lg font-bold text-green-800 dark:text-green-200">Import Successful!</h3>
                                    </div>
                                    {result && (
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Imported</p>
                                                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{result.importedRoutesCount}</p>
                                            </div>
                                            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Skipped</p>
                                                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{result.skippedRoutesCount}</p>
                                            </div>
                                            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Invalid</p>
                                                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{result.invalidRoutesCount}</p>
                                            </div>
                                        </div>
                                    )}
                                    {/* Skipped Routes List */}
                                    {result?.skippedRoutes?.length > 0 && (
                                        <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4 border border-orange-100 dark:border-orange-900/30 max-h-32 overflow-y-auto">
                                            <p className="text-xs font-bold text-orange-800 mb-2">Skipped (Duplicate):</p>
                                            <p className="text-xs text-orange-700">{result.skippedRoutes.join(', ')}</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm">
                        {step === 'result' ? 'Close' : 'Cancel'}
                    </button>

                    {step === 'upload' && (
                        <button
                            onClick={handleScan}
                            disabled={!file}
                            className="px-6 py-2 bg-[#1337ec] hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 flex items-center gap-2 transition-all text-sm"
                        >
                            <Upload size={18} />
                            Scan File
                        </button>
                    )}

                    {step === 'select' && (
                        <button
                            onClick={handleExecuteImport}
                            disabled={selectedPairs.size === 0}
                            className="px-6 py-2 bg-[#1337ec] hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 flex items-center gap-2 transition-all text-sm"
                        >
                            <Upload size={18} />
                            Import {selectedPairs.size} Items
                        </button>
                    )}

                    {step === 'result' && !error && (
                        <button
                            onClick={() => { onClose(); window.location.reload(); }}
                            className="px-6 py-2 bg-[#1337ec] hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all text-sm"
                        >
                            <CheckCircle2 size={18} />
                            Done & Reload
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
