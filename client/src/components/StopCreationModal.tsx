import React, { useState, useEffect } from 'react';
import { X, Save, MapPin, Hash, Info } from 'lucide-react';

interface StopCreationModalProps {
    isOpen: boolean;
    lat: number;
    lon: number;
    onClose: () => void;
    onSave: (data: { stop_name: string; stop_code: string }) => void;
}

const StopCreationModal: React.FC<StopCreationModalProps> = ({ isOpen, lat, lon, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');

    useEffect(() => {
        if (isOpen) {
            setName('');
            setCode('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ stop_name: name.trim(), stop_code: code.trim() });
    };

    return (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-[0_0_50px_rgba(0,0,0,0.3)] w-full max-w-md border utilitarian-border overflow-hidden animate-in zoom-in-95 duration-300">
                
                {/* Tactical Header */}
                <div className="p-8 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
                                <MapPin size={20} strokeWidth={2.5} />
                            </div>
                            <h2 className="text-lg font-display font-black text-slate-900 dark:text-white uppercase tracking-tight">Alta de Nodo</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white border utilitarian-border"
                        >
                            <X size={20} strokeWidth={2.5} />
                        </button>
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                        Definición de nuevo punto de red en coordenadas geográficas.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {/* Name Field */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em] flex items-center gap-2 px-1">
                            <MapPin size={14} className="text-primary/50" /> Denominación
                        </label>
                        <input
                            type="text"
                            required
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-4 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-primary focus:bg-white dark:focus:bg-slate-800 transition-all outline-none"
                            placeholder="Ej: Terminal Central"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* Code Field */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em] flex items-center justify-between px-1">
                            <span className="flex items-center gap-2">
                                <Hash size={14} className="text-primary/50" /> Código Técnico
                            </span>
                            <span className="text-[9px] text-slate-400">Opcional</span>
                        </label>
                        <input
                            type="text"
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-4 text-sm font-bold font-mono text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-primary focus:bg-white dark:focus:bg-slate-800 transition-all outline-none"
                            placeholder="Ej: TC-104"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                        />
                    </div>

                    {/* Coordinates Read-only Info */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border utilitarian-border flex items-center gap-4">
                        <div className="p-2 bg-white dark:bg-slate-800 border utilitarian-border rounded-lg text-slate-400">
                             <Info size={16} />
                        </div>
                        <div className="flex-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Coordenadas del Nodo</p>
                            <p className="text-[12px] font-mono font-bold text-slate-600 dark:text-slate-300 leading-none tracking-tight">
                                {lat.toFixed(6)}, {lon.toFixed(6)}
                            </p>
                        </div>
                    </div>

                    {/* Action Footer */}
                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 transition-colors"
                        >
                            Abortar
                        </button>
                        <button
                            type="submit"
                            className="flex-[2] py-4 bg-primary text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <Save size={16} strokeWidth={2.5} /> Consolidar Nodo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StopCreationModal;
