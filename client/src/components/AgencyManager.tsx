import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Building2, Globe, Clock, Languages, Phone, Mail, X, Save, Hash } from 'lucide-react';
import { clsx } from 'clsx';
import ConfirmModal from './ConfirmModal';
import { COMMON_TIMEZONES } from '../utils/TimeUtils';
import { API_URL } from '../config';

interface Agency {
    agency_id: string;
    agency_name: string;
    agency_url: string;
    agency_timezone: string;
    agency_lang?: string;
    agency_phone?: string;
    agency_email?: string;
}

const AgencyManager: React.FC = () => {
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [loading, setLoading] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [currentAgency, setCurrentAgency] = useState<Partial<Agency>>({});
    const [agencyToDelete, setAgencyToDelete] = useState<string | null>(null);

    useEffect(() => {
        fetchAgencies();
    }, []);

    const fetchAgencies = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/agency`);
            if (res.ok) {
                const data = await res.json();
                setAgencies(Array.isArray(data) ? data : [data]);
            }
        } catch (err) {
            console.error('Failed to fetch agencies', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!currentAgency.agency_name || !currentAgency.agency_url || !currentAgency.agency_timezone) {
            alert('Campos requeridos: Nombre, URL y Zona Horaria');
            return;
        }

        try {
            const isNew = !currentAgency.agency_id;
            const url = isNew ? `${API_URL}/agency` : `${API_URL}/agency/${currentAgency.agency_id}`;
            const method = isNew ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentAgency)
            });

            if (!res.ok) throw new Error('Fallo al guardar');

            await fetchAgencies();
            setIsEditing(false);
            setCurrentAgency({});
        } catch (err) {
            console.error(err);
            alert('Error al guardar el operador');
        }
    };

    const handleDelete = async () => {
        if (!agencyToDelete) return;

        try {
            const res = await fetch(`${API_URL}/agency/${agencyToDelete}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Fallo al eliminar el operador');
            } else {
                await fetchAgencies();
            }
        } catch (err) {
            console.error(err);
            alert('Error crítico de red');
        } finally {
            setAgencyToDelete(null);
        }
    };

    const startEdit = (agency: Agency) => {
        setCurrentAgency({ ...agency });
        setIsEditing(true);
    };

    const startCreate = () => {
        setCurrentAgency({
            agency_timezone: 'America/Montevideo',
            agency_lang: 'es'
        });
        setIsEditing(true);
    };

    if (isEditing) {
        return (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500 ease-out-expo">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-1 px-1">
                            {currentAgency.agency_id ? 'Modificar Operador' : 'Alta de Operador'}
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Entidad de Tránsito</p>
                    </div>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="p-2 border utilitarian-border rounded-xl hover:bg-white dark:hover:bg-slate-800 text-slate-400 transition-all"
                    >
                        <X size={18} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="space-y-5 bg-slate-50/50 dark:bg-slate-900/40 p-6 rounded-[32px] border utilitarian-border shadow-inner">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1 flex items-center gap-2">
                            <Building2 size={12} className="text-primary" /> Nombre Comercial *
                        </label>
                        <input
                            type="text"
                            placeholder="Ej: CUTCSA Montevideo"
                            className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                            value={currentAgency.agency_name || ''}
                            onChange={e => setCurrentAgency({ ...currentAgency, agency_name: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1 flex items-center gap-2">
                            <Globe size={12} className="text-primary" /> Sitio Web Oficial *
                        </label>
                        <input
                            type="text"
                            placeholder="https://www.operador.com.uy"
                            className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-bold text-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                            value={currentAgency.agency_url || ''}
                            onChange={e => setCurrentAgency({ ...currentAgency, agency_url: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1 flex items-center gap-2">
                            <Clock size={12} className="text-primary" /> Huso Horario Operativo *
                        </label>
                        <div className="relative">
                            <select
                                className="w-full pl-4 pr-10 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-bold text-slate-700 dark:text-white focus:ring-4 focus:ring-primary/10 outline-none appearance-none transition-all"
                                value={currentAgency.agency_timezone || ''}
                                onChange={e => setCurrentAgency({ ...currentAgency, agency_timezone: e.target.value })}
                            >
                                <option value="">Seleccionar Región Temporal...</option>
                                {COMMON_TIMEZONES.map(tz => (
                                    <option key={tz} value={tz}>{tz}</option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                                <Clock size={16} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1 flex items-center gap-2">
                                <Languages size={12} /> Idioma Default
                            </label>
                            <input
                                type="text"
                                placeholder="es"
                                className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-bold text-slate-900 dark:text-white outline-none"
                                value={currentAgency.agency_lang || ''}
                                onChange={e => setCurrentAgency({ ...currentAgency, agency_lang: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1 flex items-center gap-2">
                                <Phone size={12} /> Contacto
                            </label>
                            <input
                                type="text"
                                placeholder="+598..."
                                className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-bold text-slate-900 dark:text-white outline-none"
                                value={currentAgency.agency_phone || ''}
                                onChange={e => setCurrentAgency({ ...currentAgency, agency_phone: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1 flex items-center gap-2">
                            <Mail size={12} /> Correo de Soporte
                        </label>
                        <input
                            type="email"
                            placeholder="infraestructura@operador.com"
                            className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border text-[13px] font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                            value={currentAgency.agency_email || ''}
                            onChange={e => setCurrentAgency({ ...currentAgency, agency_email: e.target.value })}
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="flex-1 py-3.5 bg-white dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400 border utilitarian-border rounded-2xl hover:bg-slate-50 transition-all active:scale-95"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex-[2] py-3.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            <Save size={16} strokeWidth={2.5} /> Sincronizar Operador
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center px-2">
                <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Unidades Registradas</h3>
                    <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider">
                        {agencies.length} Agencia{agencies.length === 1 ? '' : 's'} en Red
                    </p>
                </div>
                <button
                    onClick={startCreate}
                    className="px-5 py-2.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                    <Plus size={14} strokeWidth={3} /> Alta Nueva
                </button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center p-12 text-primary animate-pulse">
                    <Loader2 size={32} className="animate-spin mb-4" />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {agencies.map(agency => (
                        <div
                            key={agency.agency_id}
                            className="p-6 bg-white/50 dark:bg-slate-900/40 rounded-[32px] border utilitarian-border hover:bg-white dark:hover:bg-slate-800 hover:border-primary/40 transition-all group relative overflow-hidden shadow-sm hover:shadow-xl"
                        >
                            {/* Visual Hint */}
                            <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />

                            <div className="flex justify-between items-start">
                                <div className="space-y-3">
                                    <div>
                                        <h4 className="text-base font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1 group-hover:underline decoration-primary/30 underline-offset-4 decoration-2">
                                            {agency.agency_name}
                                        </h4>
                                        <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-slate-400">
                                            <Hash size={10} /> {agency.agency_id.split('-')[0]}
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-4">
                                        <a href={agency.agency_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-black text-primary hover:underline flex items-center gap-1.5 uppercase tracking-widest">
                                            <Globe size={12} /> Portal Web
                                        </a>
                                        <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-widest">
                                            <Clock size={12} className="text-primary" /> {agency.agency_timezone.split('/').pop()?.replace('_', ' ')}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => startEdit(agency)}
                                        className="p-3 text-slate-300 hover:text-primary hover:bg-primary/5 rounded-2xl transition-all border utilitarian-border bg-white dark:bg-slate-800 shadow-sm"
                                        title="Modificar parámetros"
                                    >
                                        <Edit2 size={16} strokeWidth={2.5} />
                                    </button>
                                    <button
                                        onClick={() => setAgencyToDelete(agency.agency_id)}
                                        className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all border utilitarian-border bg-white dark:bg-slate-800 shadow-sm"
                                        title="Eliminar del sistema"
                                    >
                                        <Trash2 size={16} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {agencies.length === 0 && (
                        <div className="text-center py-16 text-slate-400 bg-slate-50/50 dark:bg-slate-900/20 rounded-[40px] border border-dashed utilitarian-border">
                            <Building2 size={48} className="mx-auto mb-4 opacity-10" />
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-1">Sin Operadores Definidos</p>
                            <p className="text-[10px] font-bold opacity-60">Inicie la red creando una agencia base.</p>
                        </div>
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={!!agencyToDelete}
                title="¿Remover Operador de Tránsito?"
                message="Esta operación eliminará la identidad corporativa de la red. Las rutas vinculadas podrían requerir reasignación manual."
                confirmText="Confirmar Eliminación"
                onConfirm={handleDelete}
                onCancel={() => setAgencyToDelete(null)}
                isDestructive={true}
            />
        </div>
    );
};

const Loader2 = ({ size, className }: { size: number, className?: string }) => (
    <div className={clsx("animate-spin text-primary", className)} style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    </div>
);

export default AgencyManager;
