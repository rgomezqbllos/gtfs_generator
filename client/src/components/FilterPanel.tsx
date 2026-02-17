import React, { useState, useEffect } from 'react';
import { Filter, Search, X, ChevronDown, ChevronRight, Bus, MapPin, ArrowRightLeft, Route, Building } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface FilterPanelProps {
    routesStructure: any[];
    onFilterChange: (filters: FilterState) => void;
    className?: string;
}

export interface FilterState {
    selectedRoutes: string[];
    selectedDirections: number[];
    selectedSegments: string[];
    selectedStops: string[];
    selectedAgencies: string[]; // New
    routeSearch: string;
    segmentSearch: string;
    stopSearch: string;
    agencySearch: string; // New
}

const FilterPanel: React.FC<FilterPanelProps> = ({ routesStructure, onFilterChange, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedSection, setExpandedSection] = useState<string | null>('routes');

    const [filters, setFilters] = useState<FilterState>({
        selectedRoutes: [],
        selectedDirections: [],
        selectedSegments: [],
        selectedStops: [],
        selectedAgencies: [],
        routeSearch: '',
        segmentSearch: '',
        stopSearch: '',
        agencySearch: ''
    });

    const [allSegments, setAllSegments] = useState<any[]>([]);
    const [allStops, setAllStops] = useState<any[]>([]);
    const [allAgencies, setAllAgencies] = useState<string[]>([]);

    useEffect(() => {
        const segs = new Map();
        const stps = new Map();
        const agencies = new Set<string>();

        routesStructure.forEach(route => {
            if (route.agency_name) {
                agencies.add(route.agency_name);
            } else {
                agencies.add('(No Agency)');
            }
            route.directions.forEach((dir: any) => {
                dir.segments.forEach((seg: any) => {
                    if (!segs.has(seg.segment_id)) {
                        segs.set(seg.segment_id, seg);
                    }
                });
                dir.stops.forEach((stop: any) => {
                    if (!stps.has(stop.stop_id)) {
                        stps.set(stop.stop_id, stop);
                    }
                });
            });
        });

        const stopsMap = new Map(Array.from(stps.values()).map((s: any) => [s.stop_id, s.stop_name]));

        const segmentsList = Array.from(segs.values()).map(s => ({
            ...s,
            name: `${stopsMap.get(s.start_node_id) || '?'} → ${stopsMap.get(s.end_node_id) || '?'}`
        }));

        setAllSegments(segmentsList);
        setAllStops(Array.from(stps.values()));
        setAllAgencies(Array.from(agencies).sort());

    }, [routesStructure]);

    const updateFilters = (updates: Partial<FilterState>) => {
        const newFilters = { ...filters, ...updates };
        setFilters(newFilters);
        onFilterChange(newFilters);
    };

    const clearFilters = () => {
        const reset = {
            selectedRoutes: [],
            selectedDirections: [],
            selectedSegments: [],
            selectedStops: [],
            selectedAgencies: [],
            routeSearch: '',
            segmentSearch: '',
            stopSearch: '',
            agencySearch: ''
        };
        setFilters(reset);
        onFilterChange(reset);
    };

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    const activeCount =
        filters.selectedRoutes.length +
        filters.selectedDirections.length +
        filters.selectedSegments.length +
        filters.selectedStops.length +
        filters.selectedAgencies.length;

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={twMerge(
                    "bg-white p-3 rounded-xl shadow-lg hover:bg-gray-50 transition-all duration-200 border border-gray-100 flex items-center gap-2",
                    activeCount > 0 && "ring-2 ring-blue-500 ring-offset-2",
                    className
                )}
                title="Open Advanced Filters"
            >
                <Filter className={clsx("w-5 h-5", activeCount > 0 ? "text-blue-600" : "text-gray-600")} />
                {activeCount > 0 && (
                    <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                        {activeCount}
                    </span>
                )}
            </button>
        );
    }

    // Filter Logic for Lists
    const visibleRoutes = routesStructure.filter(r =>
        (r.route_short_name || '').toLowerCase().includes(filters.routeSearch.toLowerCase()) ||
        (r.route_long_name || '').toLowerCase().includes(filters.routeSearch.toLowerCase())
    );

    const visibleSegments = allSegments.filter(s =>
        s.name.toLowerCase().includes(filters.segmentSearch.toLowerCase())
    );

    const visibleStops = allStops.filter(s =>
        (s.stop_name || '').toLowerCase().includes(filters.stopSearch.toLowerCase())
    );

    const visibleAgencies = allAgencies.filter(a =>
        a.toLowerCase().includes(filters.agencySearch.toLowerCase())
    );

    return (
        <div className={twMerge("bg-white rounded-xl shadow-2xl flex flex-col w-80 h-full max-h-[calc(100vh-4rem)] border border-gray-100 overflow-hidden animate-in slide-in-from-left-2 duration-200", className)}>

            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-gray-800">Filters</span>
                    {activeCount > 0 && (
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                            {activeCount} active
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {activeCount > 0 && (
                        <button
                            onClick={clearFilters}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                            Reset
                        </button>
                    )}
                    <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-200">

                {/* AGENCIES SECTION */}
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <button
                        onClick={() => toggleSection('agencies')}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Building className="w-4 h-4 text-gray-500" /> Agencies
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedAgencies.length > 0 && <span className="text-xs bg-gray-200 text-gray-700 px-1.5 rounded-full">{filters.selectedAgencies.length}</span>}
                            {expandedSection === 'agencies' ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                        </div>
                    </button>

                    {expandedSection === 'agencies' && (
                        <div className="p-3 bg-white space-y-2">
                            <div className="relative">
                                <Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search agencies..."
                                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
                                    value={filters.agencySearch}
                                    onChange={e => updateFilters({ agencySearch: e.target.value })}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {visibleAgencies.map(agency => (
                                    <label
                                        key={agency}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={filters.selectedAgencies.includes(agency)}
                                            onChange={() => {
                                                const current = filters.selectedAgencies;
                                                updateFilters({
                                                    selectedAgencies: current.includes(agency)
                                                        ? current.filter(a => a !== agency)
                                                        : [...current, agency]
                                                });
                                            }}
                                        />
                                        <span className="text-xs font-medium text-gray-700 flex-1">{agency}</span>
                                    </label>
                                ))}
                                {visibleAgencies.length === 0 && (
                                    <div className="text-xs text-gray-400 text-center py-2">No agencies found</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ROUTES SECTION */}
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <button
                        onClick={() => toggleSection('routes')}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Bus className="w-4 h-4 text-gray-500" /> Routes
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedRoutes.length > 0 && <span className="text-xs bg-gray-200 text-gray-700 px-1.5 rounded-full">{filters.selectedRoutes.length}</span>}
                            {expandedSection === 'routes' ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                        </div>
                    </button>

                    {expandedSection === 'routes' && (
                        <div className="p-3 bg-white space-y-2">
                            <div className="relative">
                                <Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Find route..."
                                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
                                    value={filters.routeSearch}
                                    onChange={e => updateFilters({ routeSearch: e.target.value })}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {visibleRoutes.map(route => (
                                    <label
                                        key={route.route_id}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={filters.selectedRoutes.includes(route.route_id)}
                                            onChange={() => {
                                                const current = filters.selectedRoutes;
                                                updateFilters({
                                                    selectedRoutes: current.includes(route.route_id)
                                                        ? current.filter(id => id !== route.route_id)
                                                        : [...current, route.route_id]
                                                });
                                            }}
                                        />
                                        <div
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: `#${route.route_color}` }}
                                        />
                                        <span className="text-xs font-medium text-gray-700 flex-1">{route.route_short_name}</span>
                                        <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{route.route_long_name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* DIRECTION SECTION */}
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <button
                        onClick={() => toggleSection('directions')}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <ArrowRightLeft className="w-4 h-4 text-gray-500" /> Direction
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedDirections.length > 0 && <span className="text-xs bg-gray-200 text-gray-700 px-1.5 rounded-full">{filters.selectedDirections.length}</span>}
                            {expandedSection === 'directions' ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                        </div>
                    </button>
                    {expandedSection === 'directions' && (
                        <div className="p-3 bg-white flex gap-2">
                            {[0, 1].map(dir => (
                                <button
                                    key={dir}
                                    onClick={() => {
                                        const current = filters.selectedDirections;
                                        updateFilters({
                                            selectedDirections: current.includes(dir)
                                                ? current.filter(d => d !== dir)
                                                : [...current, dir]
                                        });
                                    }}
                                    className={clsx(
                                        "flex-1 py-2 px-3 rounded-md text-xs font-medium border transition-all duration-200 flex items-center justify-center gap-1",
                                        filters.selectedDirections.includes(dir)
                                            ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
                                            : "bg-white border-gray-100 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                                    )}
                                >
                                    <div className={clsx("w-2 h-2 rounded-full", dir === 0 ? "bg-emerald-400" : "bg-orange-400")} />
                                    {dir === 0 ? 'Outbound (Ida)' : 'Inbound (Vuelta)'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* STOPS SECTION */}
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <button
                        onClick={() => toggleSection('stops')}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <MapPin className="w-4 h-4 text-gray-500" /> Stops
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedStops.length > 0 && <span className="text-xs bg-gray-200 text-gray-700 px-1.5 rounded-full">{filters.selectedStops.length}</span>}
                            {expandedSection === 'stops' ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                        </div>
                    </button>

                    {expandedSection === 'stops' && (
                        <div className="p-3 bg-white space-y-2">
                            <div className="relative">
                                <Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search stops..."
                                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
                                    value={filters.stopSearch}
                                    onChange={e => updateFilters({ stopSearch: e.target.value })}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {visibleStops.slice(0, 50).map(stop => (
                                    <label
                                        key={stop.stop_id}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={filters.selectedStops.includes(stop.stop_id)}
                                            onChange={() => {
                                                const current = filters.selectedStops;
                                                updateFilters({
                                                    selectedStops: current.includes(stop.stop_id)
                                                        ? current.filter(id => id !== stop.stop_id)
                                                        : [...current, stop.stop_id]
                                                });
                                            }}
                                        />
                                        <span className="text-xs text-gray-700 truncate">{stop.stop_name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* SEGMENTS SECTION */}
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <button
                        onClick={() => toggleSection('segments')}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Route className="w-4 h-4 text-gray-500" /> Segments
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedSegments.length > 0 && <span className="text-xs bg-gray-200 text-gray-700 px-1.5 rounded-full">{filters.selectedSegments.length}</span>}
                            {expandedSection === 'segments' ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                        </div>
                    </button>

                    {expandedSection === 'segments' && (
                        <div className="p-3 bg-white space-y-2">
                            <div className="relative">
                                <Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Origin or destination..."
                                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
                                    value={filters.segmentSearch}
                                    onChange={e => updateFilters({ segmentSearch: e.target.value })}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {visibleSegments.slice(0, 50).map(seg => (
                                    <label
                                        key={seg.segment_id}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={filters.selectedSegments.includes(seg.segment_id)}
                                            onChange={() => {
                                                const current = filters.selectedSegments;
                                                updateFilters({
                                                    selectedSegments: current.includes(seg.segment_id)
                                                        ? current.filter(id => id !== seg.segment_id)
                                                        : [...current, seg.segment_id]
                                                });
                                            }}
                                        />
                                        <span className="text-xs text-gray-700 truncate">{seg.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default FilterPanel;
