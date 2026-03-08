import React, { useState } from 'react';
import { Upload, AlertCircle, CheckCircle, X, Download, Loader2, Database, Info, FileSpreadsheet } from 'lucide-react';
import { API_URL } from '../config';
import clsx from 'clsx';

interface ExternalLoadPanelProps {
    onClose: () => void;
    onImportSuccess?: () => void | Promise<void>;
}

const ExternalLoadPanel: React.FC<ExternalLoadPanelProps> = ({ onClose, onImportSuccess }) => {
    const [files, setFiles] = useState<{
        stops: File | null;
        routes: File | null;
        itineraries: File | null;
    }>({
        stops: null,
        routes: null,
        itineraries: null
    });

    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState<string>('');
    const [errors, setErrors] = useState<any[]>([]);

    const templates: Record<'stops' | 'routes' | 'itineraries', { fileName: string; content: string; label: string }> = {
        stops: {
            label: 'Nodos de Red',
            fileName: 'Paradas_plantilla.csv',
            content: [
                'stop_code,stop_name,latitude,longitude,Type',
                'S001,Terminal Centro,-25.4284,-49.2733,Comercial',
                'S002,Parada Norte,-25.4210,-49.2655,Comercial'
            ].join('\n')
        },
        routes: {
            label: 'Trazados y Rutas',
            fileName: 'Rutas_plantilla.csv',
            content: [
                'route_id,route_name,direction,sequence,stop_code,accumulate_distance',
                '101,Linea Centro-Norte,0,1,S001,0.000',
                '101,Linea Centro-Norte,0,2,S002,1.275'
            ].join('\n')
        },
        itineraries: {
            label: 'Despacho y Horarios',
            fileName: 'Itinerario_plantilla.csv',
            content: [
                'service_id,trip_id,event_type,route_id,start_time,end_time,from_stop,to_stop,direction,bus',
                'WKD,T_101_080000,1,101,08:00:00,08:12:00,S001,S002,0,BUS01'
            ].join('\n')
        }
    };

    const handleDownloadTemplate = (type: 'stops' | 'routes' | 'itineraries') => {
        const template = templates[type];
        const blob = new Blob([template.content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = template.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleFileChange = (type: keyof typeof files) => (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFiles(prev => ({ ...prev, [type]: e.target.files![0] }));
            if (status !== 'uploading') {
                setStatus('idle');
                setMessage('');
                setErrors([]);
            }
        }
    };

    const handleUpload = async () => {
        if (!files.stops && !files.routes && !files.itineraries) {
            setMessage("Se requiere al menos un archivo para iniciar el proceso.");
            setStatus('error');
            return;
        }

        setStatus('uploading');
        setMessage("Sincronizando con el servidor de infraestructura...");
        setErrors([]);

        const formData = new FormData();
        if (files.stops) formData.append('stops', files.stops);
        if (files.routes) formData.append('routes', files.routes);
        if (files.itineraries) formData.append('itineraries', files.itineraries);

        try {
            const res = await fetch(`${API_URL}/gtfs/structured`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setStatus('success');
                setMessage(data.message || "¡Sincronización de red exitosa!");
                if (onImportSuccess) {
                    await onImportSuccess();
                }
            } else {
                setStatus('error');
                setMessage(data.error || "Fallo en la validación de integridad.");
                if (data.errors && Array.isArray(data.errors)) {
                    setErrors(data.errors);
                }
            }
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMessage(`Error de comunicación: ${err.message}`);
        }
    };

    return (
        <div className="absolute top-0 right-0 h-full w-[420px] bg-white dark:bg-slate-900 border-l utilitarian-border shadow-[0_0_50px_rgba(0,0,0,0.2)] z-50 flex flex-col animate-in slide-in-from-right duration-500 ease-out-expo">
            
            {/* Tactical Header */}
            <div className="p-8 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
                            <Database size={20} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-lg font-display font-black text-slate-900 dark:text-white uppercase tracking-tight">Sincronización CSV</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white border utilitarian-border"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                    Alta masiva de infraestructura mediante archivos estructurados.
                </p>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                
                {/* Tactical Warning */}
                <div className="p-4 bg-amber-500/5 dark:bg-amber-500/10 border-2 border-dashed border-amber-500/30 rounded-2xl flex items-start gap-3">
                    <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">Protocolo de Distancia</p>
                        <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 leading-relaxed uppercase tracking-tighter">
                            Usar siempre <span className="underline decoration-2">km</span> con 3 decimales, separador punto. Ej: 4.520
                        </p>
                    </div>
                </div>

                {/* File Upload Grid */}
                <div className="space-y-6">
                    {(['stops', 'routes', 'itineraries'] as const).map((type) => (
                        <div key={type} className="space-y-3 group">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em] flex items-center gap-2">
                                    <FileSpreadsheet size={14} className="text-primary/50" />
                                    {templates[type].label}
                                </label>
                                <button
                                    onClick={() => handleDownloadTemplate(type)}
                                    className="text-[9px] font-black text-primary hover:underline uppercase tracking-widest flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                                >
                                    <Download size={12} /> Plantilla
                                </button>
                            </div>
                            
                            <div className={clsx(
                                "relative border-2 border-dashed rounded-[24px] overflow-hidden transition-all duration-300",
                                files[type] 
                                    ? "bg-emerald-500/5 border-emerald-500/50" 
                                    : "bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-white dark:hover:bg-slate-800"
                            )}>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange(type)}
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    id={`file-${type}`}
                                />
                                <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
                                    {files[type] ? (
                                        <div className="animate-in zoom-in-95 duration-300">
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mx-auto mb-2">
                                                <CheckCircle size={24} strokeWidth={2.5} />
                                            </div>
                                            <p className="text-[12px] font-black text-slate-900 dark:text-white truncate max-w-[280px]">{files[type]?.name}</p>
                                            <p className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-1">
                                                {(files[type]!.size / 1024).toFixed(1)} KB • Preparado
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border utilitarian-border flex items-center justify-center text-slate-300 transition-transform group-hover:-translate-y-1 shadow-sm">
                                                <Upload size={20} />
                                            </div>
                                            <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">Vincular Archivo CSV</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Arrastre o haga clic para sincronizar</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tactical Status & Reports */}
                {status !== 'idle' && (
                    <div className={clsx(
                        "rounded-[28px] p-6 border-2 animate-in fade-in slide-in-from-bottom-4 duration-500",
                        status === 'success' ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" :
                        status === 'error' ? "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400" :
                        "bg-primary/5 border-primary/20 text-primary"
                    )}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={clsx(
                                "p-2 rounded-xl text-white shadow-lg",
                                status === 'success' ? "bg-emerald-500" :
                                status === 'error' ? "bg-red-500" : "bg-primary"
                            )}>
                                {status === 'uploading' && <Loader2 size={16} className="animate-spin" />}
                                {status === 'success' && <CheckCircle size={16} strokeWidth={2.5} />}
                                {status === 'error' && <AlertCircle size={16} strokeWidth={2.5} />}
                            </div>
                            <span className="text-xs font-black uppercase tracking-widest">{message}</span>
                        </div>

                        {errors.length > 0 && (
                            <div className="space-y-2 mt-4 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                                <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 flex items-center gap-2">
                                    <Info size={12} /> Informe de Conflictos
                                </div>
                                {errors.map((err, i) => (
                                    <div key={i} className="bg-white/50 dark:bg-slate-900/50 p-3 rounded-xl border border-red-500/10 text-[11px] font-bold leading-relaxed flex gap-3">
                                        <span className="text-red-500 font-mono shrink-0">L{err.row}</span>
                                        <span className="text-slate-600 dark:text-slate-300">{err.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Interaction Footer */}
            <div className="p-8 border-t utilitarian-border bg-slate-50 dark:bg-slate-800/30">
                <button
                    onClick={handleUpload}
                    disabled={status === 'uploading'}
                    className={clsx(
                        "w-full py-5 rounded-[20px] font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-3",
                        status === 'uploading'
                            ? "bg-slate-300 text-white cursor-not-allowed"
                            : "bg-primary text-white hover:scale-[1.02] active:scale-95 shadow-primary/20 hover:shadow-primary/40"
                    )}
                >
                    {status === 'uploading' ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            Procesando Red...
                        </>
                    ) : (
                        <>
                            <Database size={18} strokeWidth={2.5} />
                            Iniciar Sincronización
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default ExternalLoadPanel;
