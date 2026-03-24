import React, { useEffect, useRef } from 'react';
import { MapPin, GitBranch, Copy, Truck } from 'lucide-react';
import type { Stop } from '../../types';

interface MapContextMenuProps {
    x: number;
    y: number;
    lat: number;
    lon: number;
    onCreateNode: (type: Stop['node_type']) => void;
    onStartSegment: () => void;
    onClose: () => void;
}

const MapContextMenu: React.FC<MapContextMenuProps> = ({ x, y, lat, lon, onCreateNode, onStartSegment, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    // Flip to avoid viewport overflow
    const menuWidth = 220;
    const menuHeight = 200;
    const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
    const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

    const coordStr = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

    const menuStyle: React.CSSProperties = {
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 9999,
        minWidth: menuWidth
    };

    return (
        <div ref={menuRef} style={menuStyle}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border utilitarian-border overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
            <button
                onClick={() => { onCreateNode('regular'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 hover:bg-primary/10 hover:text-primary transition-colors text-left"
            >
                <MapPin size={14} className="text-primary shrink-0" />
                Nueva Parada
            </button>
            <button
                onClick={() => { onCreateNode('parking'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
            >
                <span className="w-4 h-4 bg-black dark:bg-white rounded-sm flex items-center justify-center text-white dark:text-black font-bold text-[9px] shrink-0">P</span>
                Nuevo Parking
            </button>
            <button
                onClick={() => { onCreateNode('depot'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
            >
                <Truck size={14} className="text-slate-500 shrink-0" />
                Nuevo Depósito
            </button>
            <div className="border-t utilitarian-border mx-3" />
            <button
                onClick={() => { onStartSegment(); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600 transition-colors text-left"
            >
                <GitBranch size={14} className="text-blue-500 shrink-0" />
                Conectar Paradas
            </button>
            <div className="border-t utilitarian-border mx-3" />
            <button
                onClick={() => { navigator.clipboard.writeText(coordStr); onClose(); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-[10px] font-mono font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
                <Copy size={11} className="shrink-0" />
                {coordStr}
            </button>
        </div>
    );
};

export default MapContextMenu;
