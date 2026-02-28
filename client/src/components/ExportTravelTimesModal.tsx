import * as React from 'react';
import { X, Download, CheckSquare, Building2, Calendar, FileText, Bus, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { API_URL } from '../config';
import type { Route } from '../types';

interface ExportTravelTimesModalProps {
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

const ExportTravelTimesModal: React.FC<ExportTravelTimesModalProps> = ({ isOpen, onClose }) => {
    const [agencies, setAgencies] = React.useState<Agency[]>([]);
    const [services, setServices] = React.useState<Service[]>([]);
    const [routes, setRoutes] = React.useState<Route[]>([]);

    const [selectedAgencyIds, setSelectedAgencyIds] = React.useState<Set<string>>(new Set());
    const [selectedServiceId, setSelectedServiceId] = React.useState<string>('');
    const [selectedRouteIds, setSelectedRouteIds] = React.useState<Set<string>>(new Set());
    const [customVersion, setCustomVersion] = React.useState<string>('');
    const [searchTerm, setSearchTerm] = React.useState('');

    const [loading, setLoading] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);

    // Fetch data when modal opens
    React.useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [agenciesRes, servicesRes, routesRes] = await Promise.all([
                fetch(`${API_URL}/agency`),
                fetch(`${API_URL}/calendar`),
                fetch(`${API_URL}/routes`)
            ]);

            const agenciesData = await agenciesRes.json();
            const servicesData = await servicesRes.json();
            const routesData = await routesRes.json();

            if (Array.isArray(agenciesData)) {
                setAgencies(agenciesData);
                setSelectedAgencyIds(new Set(agenciesData.map((a: any) => a.agency_id)));
            }
            if (Array.isArray(servicesData)) {
                setServices(servicesData);
                if (servicesData.length > 0) {
                    setSelectedServiceId(servicesData[0].service_id);
                }
            }
            if (Array.isArray(routesData)) {
                setRoutes(routesData);
                setSelectedRouteIds(new Set(routesData.map((r: any) => r.route_id)));
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
    };

    const toggleRoute = (id: string) => {
        const next = new Set(selectedRouteIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedRouteIds(next);
    };

    const getVisibleRoutes = () => {
        return routes.filter(r =>
            (r.route_short_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.route_long_name.toLowerCase().includes(searchTerm.toLowerCase())) &&
            (r.agency_id ? selectedAgencyIds.has(r.agency_id) : true)
        );
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

    const handleExport = async () => {
        if (!selectedServiceId) {
            alert('A Service ID must be selected');
            return;
        }

        if (selectedAgencyIds.size === 0) {
            alert('At least one Agency must be selected');
            return;
        }

        setExporting(true);
        try {
            const response = await fetch(`${API_URL}/gtfs/export-travel-times`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agency_ids: Array.from(selectedAgencyIds),
                    service_id: selectedServiceId,
                    route_ids: Array.from(selectedRouteIds),
                    custom_version: customVersion
                })
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            // Check if backend returned empty CSV
            if (blob.size === 0) {
                alert('No trips or routes found for the selected options.');
                return;
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'trips_times.csv';
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);

            onClose();
        } catch (err) {
            console.error('Export error', err);
            alert('Failed to generate Travel Times export.');
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
                            <FileText size={24} className="text-green-600" />
                            Export Travel Times
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Export route travel times into the trips_times.csv format.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body - 2 Columns */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-700 bg-gray-50/30 dark:bg-gray-900/10">

                    {/* Column 1: Agencies */}
                    <div className="flex-1 flex flex-col min-w-[250px]">
                        <div className="p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 font-bold text-sm flex items-center gap-2 text-gray-700 dark:text-gray-200">
                            <Building2 size={16} /> Agencies
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {agencies.map(agency => (
                                <div
                                    key={agency.agency_id}
                                    onClick={() => toggleAgency(agency.agency_id)}
                                    className={clsx(
                                        "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors shadow-sm border",
                                        selectedAgencyIds.has(agency.agency_id)
                                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800"
                                            : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                                    )}
                                >
                                    <div className={clsx(
                                        "w-5 h-5 rounded flex items-center justify-center border transition-colors",
                                        selectedAgencyIds.has(agency.agency_id) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600"
                                    )}>
                                        {selectedAgencyIds.has(agency.agency_id) && <CheckSquare size={14} />}
                                    </div>
                                    <span className="font-semibold text-sm truncate">{agency.agency_name}</span>
                                </div>
                            ))}
                            {agencies.length === 0 && !loading && (
                                <div className="text-center text-gray-500 text-sm py-4">No agencies available.</div>
                            )}
                            {loading && (
                                <div className="text-center text-gray-500 text-sm py-4">Loading...</div>
                            )}
                        </div>
                    </div>

                    {/* Column 2: Specific Export Settings */}
                    <div className="flex-1 flex flex-col min-w-[250px] bg-white dark:bg-gray-800">
                        <div className="p-3 border-b border-gray-100 dark:border-gray-700 font-bold text-sm flex items-center gap-2 text-gray-700 dark:text-gray-200">
                            <Calendar size={16} /> Configuration
                        </div>
                        <div className="p-6 space-y-6">

                            {/* Service ID Selector */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Service ID (DayType)
                                </label>
                                <select
                                    value={selectedServiceId}
                                    onChange={(e) => setSelectedServiceId(e.target.value)}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none shadow-sm transition-all"
                                >
                                    {services.map(c => (
                                        <option key={c.service_id} value={c.service_id}>{c.service_id}</option>
                                    ))}
                                </select>
                                <p className="mt-2 text-xs text-gray-500">
                                    Select the service representing the operational timeframe you wish to export.
                                </p>
                            </div>

                            {/* Custom Version Input */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Custom Version Name (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={customVersion}
                                    onChange={(e) => setCustomVersion(e.target.value)}
                                    placeholder="e.g. L100-WD-2025"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none shadow-sm transition-all"
                                />
                                <p className="mt-2 text-xs text-gray-500">
                                    This text will be inserted directly into the "Version" column for all exported rows.
                                </p>
                            </div>

                        </div>
                    </div>

                    {/* Column 3: Routes */}
                    <div className="flex-[1.5] flex flex-col min-w-[300px]">
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
                                    className="w-full pl-9 pr-3 py-1.5 bg-gray-100 dark:bg-gray-900 border-none rounded-md text-sm outline-none focus:ring-1 focus:ring-green-500/50"
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
                                                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-green-300"
                                            )}
                                        >
                                            <div className={clsx(
                                                "w-4 h-4 rounded flex items-center justify-center border transition-colors",
                                                isSelected ? "bg-green-600 border-green-600 text-white" : "border-gray-300 dark:border-gray-600 group-hover:border-green-400"
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
                        {selectedAgencyIds.size} Agency(s), {selectedRouteIds.size} Route(s) selected
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
                            disabled={exporting || selectedAgencyIds.size === 0 || !selectedServiceId || selectedRouteIds.size === 0}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all text-sm"
                        >
                            {exporting ? (
                                <>Processing...</>
                            ) : (
                                <>
                                    <Download size={18} />
                                    Download CSV
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportTravelTimesModal;
