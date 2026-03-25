import * as React from 'react';
import { X, CheckCircle, AlertCircle, MapPin, Clock, Ruler, GitBranch } from 'lucide-react';
import { clsx } from 'clsx';
import type { SegmentPreview } from '../types';
import type { RoutingProfile } from '../constants/routingProfiles';
import { routingProfileMetadata } from '../constants/routingProfiles';

interface SegmentPreviewPanelProps {
    previews: SegmentPreview[];
    selectedProfile: RoutingProfile | null;
    hoveredProfile: RoutingProfile | null;
    onSelect: (profile: RoutingProfile) => void;
    onHover: (profile: RoutingProfile | null) => void;
    onConfirm: () => void;
    onCancel: () => void;
    loading: boolean;
}

function formatDistance(meters: number | null): string {
    if (meters === null) return '—';
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    return `${Math.round(meters)} m`;
}

function formatTime(seconds: number | null): string {
    if (seconds === null) return '—';
    const mins = Math.round(seconds / 60);
    if (mins < 1) return '< 1 min';
    return `${mins} min`;
}

const SegmentPreviewPanel: React.FC<SegmentPreviewPanelProps> = ({
    previews,
    selectedProfile,
    hoveredProfile,
    onSelect,
    onHover,
    onConfirm,
    onCancel,
    loading
}) => {
    const hasFallback = previews.some(p => p.fallback);

    return (
        <div className="absolute bottom-6 right-6 z-[1000] w-[360px] pointer-events-auto">
            <div className="bg-white dark:bg-slate-900 rounded-[28px] shadow-[0_8px_48px_rgba(0,0,0,0.25)] border utilitarian-border overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">

                {/* Header */}
                <div className="px-6 py-5 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20">
                            <GitBranch size={16} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-[12px] font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                                Elegir Trayecto
                            </h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                Selecciona la ruta óptima
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-red-500 border utilitarian-border"
                    >
                        <X size={16} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Fallback warning */}
                {hasFallback && (
                    <div className="mx-4 mt-4 flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl">
                        <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                        <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                            Modo sin OSRM — trazado recto
                        </p>
                    </div>
                )}

                {/* Profile cards */}
                <div className="p-4 space-y-2">
                    {previews.map(preview => {
                        const meta = routingProfileMetadata[preview.profile];
                        const isSelected = selectedProfile === preview.profile;
                        const isHovered  = hoveredProfile  === preview.profile;
                        const isDisabled = !preview.available;

                        return (
                            <button
                                key={preview.profile}
                                disabled={isDisabled}
                                onClick={() => !isDisabled && onSelect(preview.profile)}
                                onMouseEnter={() => !isDisabled && onHover(preview.profile)}
                                onMouseLeave={() => onHover(null)}
                                className={clsx(
                                    'w-full text-left rounded-[20px] border transition-all relative overflow-hidden',
                                    isDisabled && 'opacity-40 cursor-not-allowed',
                                    !isDisabled && 'cursor-pointer active:scale-[0.98]',
                                    isSelected
                                        ? 'bg-white dark:bg-slate-800 shadow-lg border-primary/30'
                                        : isHovered
                                            ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                                            : 'bg-transparent border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                                )}
                            >
                                {/* Color bar */}
                                <div
                                    className="absolute top-0 left-0 w-1 h-full transition-all"
                                    style={{
                                        backgroundColor: meta.color,
                                        width: isSelected || isHovered ? '4px' : '3px'
                                    }}
                                />

                                <div className="pl-5 pr-4 py-4 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        {/* Name + badges */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={clsx(
                                                'text-[11px] font-black uppercase tracking-tight',
                                                isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'
                                            )}>
                                                {meta.label}
                                            </span>
                                            {preview.recommended && !isDisabled && (
                                                <span
                                                    className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full text-white"
                                                    style={{ backgroundColor: meta.color }}
                                                >
                                                    Recomendado
                                                </span>
                                            )}
                                            {isDisabled && (
                                                <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500">
                                                    No disponible
                                                </span>
                                            )}
                                        </div>

                                        {/* Distance + time */}
                                        {!isDisabled && (
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                                    <Ruler size={10} />
                                                    {formatDistance(preview.distance)}
                                                </span>
                                                {preview.travel_time !== null && (
                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                                        <Clock size={10} />
                                                        {formatTime(preview.travel_time)}
                                                    </span>
                                                )}
                                                {preview.fallback && (
                                                    <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wide">línea recta</span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Selection indicator */}
                                    {isSelected && (
                                        <CheckCircle size={18} className="flex-shrink-0" style={{ color: meta.color }} strokeWidth={2.5} />
                                    )}
                                    {!isSelected && !isDisabled && (
                                        <div className="w-4.5 h-4.5 rounded-full border-2 border-slate-200 dark:border-slate-600 flex-shrink-0" />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-4 pb-5 flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border utilitarian-border"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={!selectedProfile || loading}
                        className={clsx(
                            'flex-[2] py-3 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2',
                            selectedProfile && !loading
                                ? 'bg-primary shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95'
                                : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'
                        )}
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Creando…
                            </span>
                        ) : (
                            <>
                                <MapPin size={12} strokeWidth={2.5} />
                                Confirmar Trayecto
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SegmentPreviewPanel;
