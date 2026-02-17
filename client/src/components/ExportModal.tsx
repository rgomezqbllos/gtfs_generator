import * as React from 'react';
import { X, Download, CheckSquare, Square, Search, Building2, Calendar, Bus } from 'lucide-react';
import { clsx } from 'clsx';
import type { Route } from '../types';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const API_URL = 'http://localhost:3000/api';

interface Agency {
    agency_id: string;
    agency_name: string;
}

interface Service {
    service_id: string;
    start_date: string;
    end_date: string;
    // days...
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

    // Fetch data when modal opens
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

    // Toggle Handlers
    const toggleAgency = (id: string) => {
        const next = new Set(selectedAgencyIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedAgencyIds(next);

        // Auto-select/deselect routes belonging to this agency?
        // Logic: specific route selection is respected, but if agency is unchecked, its routes are effectively excluded by the backend export logic anyway.
        // But for UI clarity, we could visually disable them or filter them.
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
            // Filter by search
            (r.route_short_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.route_long_name.toLowerCase().includes(searchTerm.toLowerCase())) &&
            // Filter by Selected Agencies (Optional UI choice, but makes sense)
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

            // Delay revocation to ensure browser registers the download
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);

            onClose();
        } catch (err) {
            console.error('Export error', err);
            alert('Failed to generate GTFS export.');
        } finally {
            setExporting(false);
        }
    };

    if (!isOpen) return null;

    const visibleRoutes = getVisibleRoutes();
    const isAllRoutesSelected = visibleRoutes.length > 0 && visibleRoutes.every(r => selectedRouteIds.has(r.route_id));

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-5xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-700">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Download size={24} className="text-[#1337ec]" />
                            Export GTFS
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Select Agencies, Services, and Routes to include in the strict GTFS export.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body - 3 Columns */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-700 bg-gray-50/30 dark:bg-gray-900/10">

                    {/* Column 1: Agencies */}
                    <div className="flex-1 flex flex-col min-w-[200px]">
                        <div className="p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 font-bold text-sm flex items-center gap-2 text-gray-700 dark:text-gray-200">
                            <Building2 size={16} /> Agencies
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {agencies.map(agency => (
                                <div
                                    key={agency.agency_id}
                                    onClick={() => toggleAgency(agency.agency_id)}
                                    className={clsx(
                                        "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors text-sm",
                                        selectedAgencyIds.has(agency.agency_id)
                                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200"
                                            : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                    )}
                                >
                                    {selectedAgencyIds.has(agency.agency_id) ? <CheckSquare size={16} /> : <Square size={16} />}
                                    <span className="truncate">{agency.agency_name}</span>
                                </div>
                            ))}
                            {agencies.length === 0 && <div className="p-4 text-xs text-gray-400 text-center">No agencies found.</div>}
                        </div>
                    </div>

                    {/* Column 2: Services */}
                    <div className="flex-1 flex flex-col min-w-[200px]">
                        <div className="p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 font-bold text-sm flex items-center gap-2 text-gray-700 dark:text-gray-200">
                            <Calendar size={16} /> Services (Calendar)
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {services.map(service => (
                                <div
                                    key={service.service_id}
                                    onClick={() => toggleService(service.service_id)}
                                    className={clsx(
                                        "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors text-sm",
                                        selectedServiceIds.has(service.service_id)
                                            ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                                            : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                    )}
                                >
                                    {selectedServiceIds.has(service.service_id) ? <CheckSquare size={16} /> : <Square size={16} />}
                                    <div className="flex flex-col">
                                        <span className="truncate font-mono text-xs">{service.service_id}</span>
                                        <span className="text-[10px] opacity-70">{service.start_date} - {service.end_date}</span>
                                    </div>
                                </div>
                            ))}
                            {services.length === 0 && <div className="p-4 text-xs text-gray-400 text-center">No services found.</div>}
                        </div>
                    </div>

                    {/* Column 3: Routes */}
                    <div className="flex-[2] flex flex-col min-w-[300px]">
                        <div className="p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 font-bold text-sm flex items-center justify-between text-gray-700 dark:text-gray-200">
                            <div className="flex items-center gap-2">
                                <Bus size={16} /> Routes
                            </div>
                            <button onClick={handleSelectAllRoutes} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                                {isAllRoutesSelected ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>

                        {/* Search Toolbar */}
                        <div className="px-3 py-2 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="Filter routes..."
                                    className="w-full pl-9 pr-3 py-1.5 bg-gray-100 dark:bg-gray-900 border-none rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500/50"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="grid grid-cols-1 gap-2">
                                {visibleRoutes.map(route => {
                                    const isSelected = selectedRouteIds.has(route.route_id);
                                    return (
                                        <div
                                            key={route.route_id}
                                            onClick={() => toggleRoute(route.route_id)}
                                            className={clsx(
                                                "flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all select-none group",
                                                isSelected
                                                    ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                                                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300"
                                            )}
                                        >
                                            <div className={clsx(
                                                "w-4 h-4 rounded flex items-center justify-center border transition-colors",
                                                isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600 group-hover:border-blue-400"
                                            )}>
                                                {isSelected && <CheckSquare size={12} />}
                                            </div>

                                            <div className="flex-1 min-w-0 flex items-center gap-3">
                                                <span className="font-mono font-bold text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-800 dark:text-gray-200 min-w-[30px] text-center">
                                                    {route.route_short_name}
                                                </span>
                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                                                    {route.route_long_name}
                                                </div>
                                                <div
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ backgroundColor: `#${route.route_color}` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                                {visibleRoutes.length === 0 && (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        No routes found matching filters.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl flex justify-between items-center">
                    <div className="text-sm text-gray-500 hidden sm:block">
                        {selectedAgencyIds.size} Agencies, {selectedServiceIds.size} Services, {selectedRouteIds.size} Routes
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={exporting || (selectedAgencyIds.size === 0 && selectedRouteIds.size === 0)}
                            className="px-6 py-2 bg-[#1337ec] hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all text-sm"
                        >
                            {exporting ? (
                                <>Processing...</>
                            ) : (
                                <>
                                    <Download size={18} />
                                    Download GTFS.zip
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
