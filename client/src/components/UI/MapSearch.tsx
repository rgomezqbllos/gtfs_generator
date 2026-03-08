import React, { useState, useEffect, useRef } from 'react';
import { Search as SearchIcon, X, MapPin, Loader2, Home } from 'lucide-react';

interface SearchResult {
    name: string;
    city?: string;
    country?: string;
    description: string;
    lat: number;
    lon: number;
}

interface MapSearchProps {
    onSelect: (coords: { lat: number; lon: number }) => void;
    projectLocation?: { lat: number; lon: number; name: string } | null;
}

const MapSearch: React.FC<MapSearchProps> = ({ onSelect, projectLocation }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const searchPlaces = async (text: string) => {
        if (text.length < 3) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=5`);
            const data = await res.json();
            
            const places: SearchResult[] = data.features.map((f: any) => {
                const p = f.properties;
                const name = p.name || p.street || '';
                const city = p.city || p.state || '';
                const country = p.country || '';
                
                return {
                    name,
                    city,
                    country,
                    description: [name, city, country].filter(Boolean).join(', '),
                    lat: f.geometry.coordinates[1],
                    lon: f.geometry.coordinates[0]
                };
            });
            setResults(places);
            setIsOpen(true);
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (query) searchPlaces(query);
        }, 500);
        return () => clearTimeout(timer);
    }, [query]);

    const handleSelect = (lat: number, lon: number) => {
        onSelect({ lat, lon });
        setIsOpen(false);
        setQuery('');
    };

    return (
        <div className="relative pointer-events-auto w-full max-w-sm" ref={dropdownRef}>
            <div className="flex items-center glass-panel rounded-xl shadow-2xl p-1 gap-1 focus-within:ring-2 focus-within:ring-primary/40 transition-all duration-300">
                <div className="pl-3 pr-2 text-slate-400">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <SearchIcon className="w-4 h-4" strokeWidth={2.5} />}
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search spatial location..."
                    className="flex-1 bg-transparent border-none outline-none text-[13px] font-semibold text-slate-800 dark:text-white placeholder:text-slate-500 py-2"
                />
                
                <div className="flex items-center gap-1 pr-1">
                    {query && (
                        <button 
                            onClick={() => { setQuery(''); setResults([]); }}
                            className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" strokeWidth={3} />
                        </button>
                    )}
                    
                    {projectLocation && (
                        <button
                            onClick={() => handleSelect(projectLocation.lat, projectLocation.lon)}
                            className="p-2 text-slate-500 hover:text-primary transition-all rounded-lg"
                            title={`Go to project center: ${projectLocation.name}`}
                        >
                            <Home className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            </div>

            {/* Dropdown Results */}
            {isOpen && (results.length > 0 || (loading && query.length >= 3)) && (
                <div className="absolute top-full left-0 right-0 mt-3 glass-panel rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden z-[100] animate-in fade-in slide-in-from-top-4 duration-500 ease-out-expo">
                    {results.length > 0 ? (
                        <div className="flex flex-col">
                            <div className="px-4 py-2 border-b utilitarian-border bg-slate-50/50 dark:bg-slate-800/30">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Locations</span>
                            </div>
                            {results.map((res, idx) => (
                                <button
                                    key={`${res.lat}-${res.lon}-${idx}`}
                                    onClick={() => handleSelect(res.lat, res.lon)}
                                    className="w-full flex items-center gap-4 p-4 hover:bg-primary/5 text-left transition-all border-b utilitarian-border last:border-none group"
                                >
                                    <div className="shrink-0 p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-primary group-hover:text-white transition-all">
                                        <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-900 dark:text-white truncate text-[13px] tracking-tight">
                                            {res.name}
                                        </div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-500 font-medium truncate mt-0.5">
                                            {res.city ? `${res.city}, ` : ''}{res.country}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-12 text-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4 opacity-40" />
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Identifying coordinates...</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MapSearch;
