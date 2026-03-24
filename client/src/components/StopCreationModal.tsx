import React, { useState, useEffect, useRef } from 'react';
import { X, Save, MapPin, Hash, Info, Truck } from 'lucide-react';
import type { Stop } from '../types';

interface StopCreationModalProps {
    isOpen: boolean;
    lat: number;
    lon: number;
    initialNodeType?: Stop['node_type'];
    onClose: () => void;
    onSave: (data: { stop_name: string; stop_code: string; node_type: Stop['node_type'] }) => void;
}

const NODE_TYPE_CONFIG: Record<NonNullable<Stop['node_type']>, { label: string; icon: React.ReactNode; color: string }> = {
    regular: { label: 'Parada', icon: <MapPin size={12} />, color: 'text-primary' },
    parking: { label: 'Parking', icon: <span className="font-black text-[10px]">P</span>, color: 'text-slate-900 dark:text-white' },
    depot: { label: 'Depósito', icon: <Truck size={12} />, color: 'text-slate-500' },
    commercial: { label: 'Comercial', icon: <MapPin size={12} />, color: 'text-amber-500' },
    operative: { label: 'Operativo', icon: <MapPin size={12} />, color: 'text-emerald-500' },
    checkpoint: { label: 'Checkpoint', icon: <MapPin size={12} />, color: 'text-violet-500' },
};

const StopCreationModal: React.FC<StopCreationModalProps> = ({ isOpen, lat, lon, initialNodeType = 'regular', onClose, onSave }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [nodeType, setNodeType] = useState<NonNullable<Stop['node_type']>>(initialNodeType);
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName('');
            setCode('');
            setNodeType(initialNodeType);
            setTimeout(() => nameRef.current?.focus(), 50);
        }
    }, [isOpen, initialNodeType]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ stop_name: name.trim(), stop_code: code.trim(), node_type: nodeType });
    };

    const config = NODE_TYPE_CONFIG[nodeType];

    return (
        <div className="absolute right-0 top-0 h-full w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-l utilitarian-border shadow-2xl z-[60] flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-6 border-b utilitarian-border bg-slate-50/80 dark:bg-slate-800/50 shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl bg-primary text-white shadow-lg shadow-primary/20`}>
                            <MapPin size={16} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-sm font-display font-black text-slate-900 dark:text-white uppercase tracking-tight">Alta de Nodo</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{config.label}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white border utilitarian-border"
                    >
                        <X size={16} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Node Type Selector */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em] px-1">Tipo</label>
                    <div className="grid grid-cols-3 gap-1.5">
                        {(['regular', 'parking', 'depot'] as const).map(type => {
                            const cfg = NODE_TYPE_CONFIG[type];
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setNodeType(type)}
                                    className={`py-2 px-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                                        nodeType === type
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                                    }`}
                                >
                                    <span className={cfg.color}>{cfg.icon}</span>
                                    {cfg.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Name Field */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em] flex items-center gap-2 px-1">
                        <MapPin size={12} className="text-primary/50" /> Denominación
                    </label>
                    <input
                        ref={nameRef}
                        type="text"
                        required
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-3 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-primary focus:bg-white dark:focus:bg-slate-800 transition-all outline-none"
                        placeholder="Ej: Terminal Central"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>

                {/* Code Field */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em] flex items-center justify-between px-1">
                        <span className="flex items-center gap-2"><Hash size={12} className="text-primary/50" /> Código</span>
                        <span className="text-[9px] text-slate-400">Opcional</span>
                    </label>
                    <input
                        type="text"
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-3 text-sm font-bold font-mono text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-primary focus:bg-white dark:focus:bg-slate-800 transition-all outline-none"
                        placeholder="Ej: TC-104"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                    />
                </div>

                {/* Coordinates */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border utilitarian-border flex items-center gap-3">
                    <div className="p-1.5 bg-white dark:bg-slate-800 border utilitarian-border rounded-lg text-slate-400 shrink-0">
                        <Info size={14} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Coordenadas</p>
                        <p className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 leading-none tracking-tight">
                            {lat.toFixed(6)}, {lon.toFixed(6)}
                        </p>
                    </div>
                </div>
            </form>

            {/* Footer */}
            <div className="p-6 border-t utilitarian-border shrink-0 flex gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 transition-colors rounded-2xl hover:bg-red-50 dark:hover:bg-red-950/20"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleSubmit as any}
                    className="flex-[2] py-3 bg-primary text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    <Save size={14} strokeWidth={2.5} /> Crear
                </button>
            </div>
        </div>
    );
};

export default StopCreationModal;
