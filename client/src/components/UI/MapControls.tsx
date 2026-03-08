import React from 'react';
import { Plus, Minus, Navigation } from 'lucide-react';
import MapSearch from './MapSearch';

interface MapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onLocate: () => void;
    onSearch?: (coords: { lat: number; lon: number }) => void;
    projectLocation?: { lat: number; lon: number; name: string } | null;
}

const MapControls: React.FC<MapControlsProps> = ({ onZoomIn, onZoomOut, onLocate, onSearch, projectLocation }) => {
    return (
        <>
            {/* Top Bar Navigation Area */}
            <div className="absolute left-[88px] top-6 z-20 pointer-events-none flex gap-4 items-start w-[calc(100%-112px)]">
                <div className="pointer-events-auto flex-1 max-w-lg">
                    {onSearch && <MapSearch onSelect={onSearch} projectLocation={projectLocation} />}
                </div>
            </div>

            {/* Float Controls (Sidebar Integrated Style) */}
            <div className="absolute bottom-10 left-10 flex flex-col gap-3 z-20 pointer-events-auto">
                <div className="flex flex-col rounded-xl glass-panel shadow-2xl overflow-hidden overflow-hidden">
                    <button
                        onClick={onZoomIn}
                        className="p-3.5 text-slate-500 hover:text-primary hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-all border-b utilitarian-border"
                        title="Zoom In"
                    >
                        <Plus size={18} strokeWidth={2.5} />
                    </button>
                    <button
                        onClick={onZoomOut}
                        className="p-3.5 text-slate-500 hover:text-primary hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-all"
                        title="Zoom Out"
                    >
                        <Minus size={18} strokeWidth={2.5} />
                    </button>
                </div>
                
                <button
                    onClick={onLocate}
                    className="h-[46px] w-[46px] rounded-xl glass-panel text-slate-500 hover:text-primary hover:bg-slate-100/50 dark:hover:bg-slate-800/50 shadow-2xl flex items-center justify-center transition-all group"
                    title="Center on Project"
                >
                    <Navigation size={18} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                </button>
            </div>
        </>
    );
};

export default MapControls;
