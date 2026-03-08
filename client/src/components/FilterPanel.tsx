import React, { useState, useEffect } from 'react';
import { Filter, Search, X, ChevronDown, ChevronRight, Bus, MapPin, ArrowRightLeft, Route, Building, RotateCcw } from 'lucide-react';
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
    selectedAgencies: string[]; 
    routeSearch: string;
    segmentSearch: string;
    stopSearch: string;
    agencySearch: string; 
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
                    "glass-panel p-3.5 rounded-xl shadow-2xl hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 pointer-events-auto group border utilitarian-border",
                    activeCount > 0 && "ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900",
                    className
                )}
                title="Abrir Filtros Avanzados"
            >
                <div className="relative">
                    <Filter className={clsx("w-5 h-5 transition-colors", activeCount > 0 ? "text-primary" : "text-slate-500 group-hover:text-primary")} />
                    {activeCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-primary text-white text-[9px] font-bold h-4 min-w-[1rem] flex items-center justify-center px-1 rounded-full shadow-lg shadow-primary/20">
                            {activeCount}
                        </span>
                    )}
                </div>
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
        <div className={twMerge(
            "glass-panel rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)] flex flex-col w-80 h-full max-h-[calc(100vh-6rem)] border border-white/20 dark:border-slate-800 overflow-hidden animate-in slide-in-from-left-4 duration-500 ease-out-expo pointer-events-auto", 
            className
        )}>

            {/* Header */}
            <div className="p-5 border-b utilitarian-border flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-primary" />
                    <span className="text-[13px] font-display font-bold text-slate-900 dark:text-white uppercase tracking-wider">Filtros de Red</span>
                </div>
                <div className="flex items-center gap-1">
                    {activeCount > 0 && (
                        <button
                            onClick={clearFilters}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                            title="Resetear filtros"
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                        <X className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 custom-scrollbar">

                {/* AGENCIES SECTION */}
                <div className="space-y-3">
                    <button
                        onClick={() => toggleSection('agencies')}
                        className="w-full flex items-center justify-between text-left group"
                    >
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-primary transition-colors">
                            <Building className="w-3.5 h-3.5" /> Agencias
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedAgencies.length > 0 && (
                                <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 rounded-full">
                                    {filters.selectedAgencies.length}
                                </span>
                            )}
                            {expandedSection === 'agencies' ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                        </div>
                    </button>

                    {expandedSection === 'agencies' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
                            <div className="relative">
                                <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Filtrar agencias..."
                                    className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-slate-100 dark:bg-slate-800 border utilitarian-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                    value={filters.agencySearch}
                                    onChange={e => updateFilters({ agencySearch: e.target.value })}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                {visibleAgencies.map(agency => (
                                    <label
                                        key={agency}
                                        className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                className="peer appearance-none w-3.5 h-3.5 rounded border-2 border-slate-300 dark:border-slate-700 checked:bg-primary checked:border-primary transition-all cursor-pointer"
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
                                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all">
                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                        </div>
                                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{agency}</span>
                                    </label>
                                ))}
                                {visibleAgencies.length === 0 && (
                                    <div className="text-[10px] text-slate-400 text-center py-4 font-bold uppercase tracking-widest">Sin resultados</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ROUTES SECTION */}
                <div className="space-y-3">
                    <button
                        onClick={() => toggleSection('routes')}
                        className="w-full flex items-center justify-between text-left group"
                    >
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-primary transition-colors">
                            <Bus className="w-3.5 h-3.5" /> Rutas
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedRoutes.length > 0 && (
                                <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 rounded-full">
                                    {filters.selectedRoutes.length}
                                </span>
                            )}
                            {expandedSection === 'routes' ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                        </div>
                    </button>

                    {expandedSection === 'routes' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
                            <div className="relative">
                                <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar ruta..."
                                    className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-slate-100 dark:bg-slate-800 border utilitarian-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                    value={filters.routeSearch}
                                    onChange={e => updateFilters({ routeSearch: e.target.value })}
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                {visibleRoutes.map(route => (
                                    <label
                                        key={route.route_id}
                                        className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 rounded border-2 border-slate-300 dark:border-slate-700 text-primary focus:ring-primary"
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
                                            className="w-2 h-2 rounded-sm shrink-0 shadow-sm"
                                            style={{ backgroundColor: `#${route.route_color}` }}
                                        />
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">{route.route_short_name}</span>
                                            <span className="text-[9px] text-slate-400 font-medium truncate">{route.route_long_name}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* DIRECTION SECTION */}
                <div className="space-y-3">
                    <button
                        onClick={() => toggleSection('directions')}
                        className="w-full flex items-center justify-between text-left group"
                    >
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-primary transition-colors">
                            <ArrowRightLeft className="w-3.5 h-3.5" /> Orientación
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedDirections.length > 0 && <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 rounded-full">{filters.selectedDirections.length}</span>}
                            {expandedSection === 'directions' ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                        </div>
                    </button>
                    {expandedSection === 'directions' && (
                        <div className="flex flex-col gap-2 p-1 animate-in fade-in slide-in-from-top-1 duration-300">
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
                                        "w-full py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all duration-300 flex items-center justify-between group",
                                        filters.selectedDirections.includes(dir)
                                            ? "bg-primary border-primary text-white shadow-lg shadow-primary/20"
                                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"
                                    )}
                                >
                                    <span>{dir === 0 ? 'Trayecto Ida' : 'Trayecto Vuelta'}</span>
                                    <div className={clsx(
                                        "w-1.5 h-1.5 rounded-full", 
                                        filters.selectedDirections.includes(dir) ? "bg-white" : (dir === 0 ? "bg-emerald-400" : "bg-primary")
                                    )} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* STOPS SECTION */}
                <div className="space-y-3">
                    <button
                        onClick={() => toggleSection('stops')}
                        className="w-full flex items-center justify-between text-left group"
                    >
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-primary transition-colors">
                            <MapPin className="w-3.5 h-3.5" /> Paradas
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedStops.length > 0 && <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 rounded-full">{filters.selectedStops.length}</span>}
                            {expandedSection === 'stops' ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                        </div>
                    </button>

                    {expandedSection === 'stops' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
                            <div className="relative">
                                <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar paradas..."
                                    className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-slate-100 dark:bg-slate-800 border utilitarian-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                    value={filters.stopSearch}
                                    onChange={e => updateFilters({ stopSearch: e.target.value })}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                {visibleStops.slice(0, 50).map(stop => (
                                    <label
                                        key={stop.stop_id}
                                        className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 rounded border-2 border-slate-300 dark:border-slate-700 text-primary focus:ring-primary transition-all"
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
                                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">{stop.stop_name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* SEGMENTS SECTION */}
                <div className="space-y-3">
                    <button
                        onClick={() => toggleSection('segments')}
                        className="w-full flex items-center justify-between text-left group"
                    >
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-primary transition-colors">
                            <Route className="w-3.5 h-3.5" /> Aristas
                        </div>
                        <div className="flex items-center gap-2">
                            {filters.selectedSegments.length > 0 && <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 rounded-full">{filters.selectedSegments.length}</span>}
                            {expandedSection === 'segments' ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                        </div>
                    </button>

                    {expandedSection === 'segments' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
                            <div className="relative">
                                <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Origen o destino..."
                                    className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-slate-100 dark:bg-slate-800 border utilitarian-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                    value={filters.segmentSearch}
                                    onChange={e => updateFilters({ segmentSearch: e.target.value })}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                {visibleSegments.slice(0, 50).map(seg => (
                                    <label
                                        key={seg.segment_id}
                                        className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 rounded border-2 border-slate-300 dark:border-slate-700 text-primary focus:ring-primary"
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
                                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">{seg.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

            </div>
            
            {/* Action Footer (Optional placeholder for future save/export filters) */}
            <div className="p-4 border-t utilitarian-border bg-slate-50/50 dark:bg-slate-900/30">
                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">
                    Filtrado Espacial Activo
                 </p>
            </div>
        </div>
    );
};

export default FilterPanel;
