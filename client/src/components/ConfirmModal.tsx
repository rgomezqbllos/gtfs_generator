import * as React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
    isError?: boolean; 
    isDestructive?: boolean;
    confirmText?: string;
    cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen, title, message, onConfirm, onCancel, isError, isDestructive, confirmText = "Confirmar", cancelText = "Cancelar"
}) => {
    if (!isOpen) return null;

    const isAlert = isError || isDestructive;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 animate-in fade-in duration-300">
            {/* Tactical Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
                onClick={onCancel}
            />
            
            {/* Modal Matrix Body */}
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.6)] border utilitarian-border overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-500 ease-out-expo">
                
                {/* Protocol Hierarchy Header */}
                <div className={clsx(
                    "h-2 w-full",
                    isAlert ? "bg-red-500" : "bg-primary"
                )} />

                <div className="p-12">
                    <div className="flex flex-col items-center text-center gap-8">
                        
                        <div className={clsx(
                            "w-20 h-20 rounded-[28px] flex items-center justify-center shadow-2xl transition-all duration-700",
                            isAlert 
                                ? "bg-red-500/10 text-red-500 shadow-red-500/20 rotate-12" 
                                : "bg-primary/10 text-primary shadow-primary/20 -rotate-12"
                        )}>
                            {isAlert ? <ShieldAlert size={40} strokeWidth={2.5} /> : <ShieldCheck size={40} strokeWidth={2.5} />}
                        </div>
                        
                        <div className="space-y-4">
                            <h3 className="text-2xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight">
                                {title}
                            </h3>
                            <div className="text-[14px] font-bold leading-relaxed text-slate-500 dark:text-slate-400 uppercase tracking-widest px-4">
                                {message}
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                        {!isError && (
                            <button
                                onClick={onCancel}
                                className="w-full sm:w-auto px-10 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all order-2 sm:order-1"
                            >
                                {cancelText}
                            </button>
                        )}
                        <button
                            onClick={isError ? onCancel : onConfirm}
                            className={clsx(
                                "w-full sm:w-auto px-12 py-5 rounded-[22px] text-[11px] font-black uppercase tracking-[0.25em] text-white shadow-2xl transition-all hover:scale-105 active:scale-95 order-1 sm:order-2",
                                isAlert 
                                    ? "bg-red-600 shadow-red-600/30 hover:bg-red-500" 
                                    : "bg-primary shadow-primary/30 hover:bg-primary/90"
                            )}
                        >
                            {isError ? 'Cerrar Protocolo' : confirmText}
                        </button>
                    </div>
                </div>

                {/* Tactical Detail Overlay */}
                <div className="absolute top-8 right-8 pointer-events-none opacity-20">
                     <div className="flex items-center gap-2">
                        <span className="text-[8px] font-mono font-black vertical-text uppercase tracking-widest text-slate-400">
                             AUTHORIZATION REQUIRED
                        </span>
                     </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
