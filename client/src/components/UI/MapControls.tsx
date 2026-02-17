import React from 'react';
import { Plus, Minus, Navigation } from 'lucide-react';

interface MapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onLocate: () => void;
}

const MapControls: React.FC<MapControlsProps> = ({ onZoomIn, onZoomOut, onLocate }) => {
    return (
        <>
            {/* Map Controls (Floating Top Left) - SEARCH REMOVED */}
            {/* <div className="absolute left-6 top-6 ..."> ... </div> */}

            {/* Map UI Tools (Floating Bottom Left) */}
            <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-20">
                <div className="flex flex-col rounded-xl bg-white dark:bg-gray-800 shadow-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
                    <button
                        onClick={onZoomIn}
                        className="p-3 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-700 border-b border-slate-100 dark:border-gray-700 transition-colors"
                        title="Zoom In"
                    >
                        <Plus size={20} />
                    </button>
                    <button
                        onClick={onZoomOut}
                        className="p-3 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                        title="Zoom Out"
                    >
                        <Minus size={20} />
                    </button>
                </div>
                <button
                    onClick={onLocate}
                    className="h-12 w-12 rounded-xl bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-400 shadow-lg border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
                    title="Locate Me"
                >
                    <Navigation size={20} />
                </button>
            </div>
        </>
    );
};

export default MapControls;
