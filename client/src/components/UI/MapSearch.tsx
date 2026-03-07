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
        <div className="relative pointer-events-auto w-80" ref={dropdownRef}>
            <div className="flex items-center bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-1.5 gap-1 group transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/50">
                <div className="p-2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <SearchIcon className="w-4 h-4" />}
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search city or specific place..."
                    className="flex-1 bg-transparent border-none outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 py-1.5"
                />
                {query && (
                    <button 
                        onClick={() => { setQuery(''); setResults([]); }}
                        className="p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
                
                {projectLocation && (
                    <button
                        onClick={() => handleSelect(projectLocation.lat, projectLocation.lon)}
                        className="p-2 border-l border-slate-100 dark:border-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
                        title={`Go to project center: ${projectLocation.name}`}
                    >
                        <Home className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dropdown Results */}
            {isOpen && (results.length > 0 || (loading && query.length >= 3)) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                    {results.map((res, idx) => (
                        <button
                            key={`${res.lat}-${res.lon}-${idx}`}
                            onClick={() => handleSelect(res.lat, res.lon)}
                            className="w-full flex items-start gap-4 p-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-all border-b border-slate-50 dark:border-slate-800 last:border-none group"
                        >
                            <div className="mt-1 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700 shadow-sm transition-colors text-slate-400 group-hover:text-blue-500">
                                <MapPin className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-900 dark:text-white truncate text-sm">
                                    {res.name}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                    {res.city ? `${res.city}, ` : ''}{res.country}
                                </div>
                            </div>
                        </button>
                    ))}
                    
                    {loading && results.length === 0 && (
                        <div className="p-10 text-center">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-medium">Searching world maps...</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MapSearch;
