import React from 'react';
import {
    Route as RouteIcon,
    Settings,
    MousePointer2,
    Bus,
    CalendarDays,
    Sun,
    Moon,
    Download,
    Upload,
    Database,
    PlayCircle,
    List,
    GitBranch,
    LogOut,
    Shield,
    ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';
import ExportModal from '../ExportModal';
import ImportModal from '../ImportModal';
import { useEditor } from '../../context/EditorContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

const Sidebar: React.FC = () => {
    const { mode, setMode, activePanel, setActivePanel } = useEditor();
    const { theme, setTheme } = useTheme();
    const { user, logout, isSuperAdmin, isTenantAdmin, activeProject } = useAuth();
    const [isExportOpen, setIsExportOpen] = React.useState(false);
    const [isImportOpen, setIsImportOpen] = React.useState(false);

    const userInitials = user?.username
        ? user.username.substring(0, 2).toUpperCase()
        : (user?.email ? user.email.substring(0, 2).toUpperCase() : 'US');

    const roleText = isSuperAdmin ? 'Super Admin' : (isTenantAdmin ? 'Tenant Admin' : 'Operador');

    const MENU_ITEMS = [
        {
            id: 'select',
            label: 'Editor de Mapa',
            icon: MousePointer2,
            active: mode === 'idle' && activePanel === 'none',
            onClick: () => {
                setMode('idle');
                setActivePanel('none');
            }
        },
        {
            id: 'stops_catalog',
            label: 'Catálogo de Paradas',
            icon: List,
            active: activePanel === 'stops_catalog',
            onClick: () => setActivePanel('stops_catalog')
        },
        {
            id: 'segments_catalog',
            label: 'Catálogo de Aristas',
            icon: GitBranch,
            active: activePanel === 'segments_catalog',
            onClick: () => setActivePanel('segments_catalog')
        },
        {
            id: 'routes',
            label: 'Rutas y Trazados',
            icon: RouteIcon,
            active: activePanel === 'routes' || activePanel === 'routes_catalog',
            onClick: () => setActivePanel('routes_catalog')
        },
        {
            id: 'calendar',
            label: 'Calendarios de Servicio',
            icon: CalendarDays,
            active: activePanel === 'calendar',
            onClick: () => setActivePanel(activePanel === 'calendar' ? 'none' : 'calendar')
        },
        {
            id: 'empty_segments',
            label: 'Tramos en Vacío',
            icon: RouteIcon,
            active: activePanel === 'empty_segments',
            onClick: () => setActivePanel(activePanel === 'empty_segments' ? 'none' : 'empty_segments')
        },
        {
            id: 'simulation',
            label: 'Motor de Simulación',
            icon: PlayCircle,
            active: activePanel === 'simulation',
            onClick: () => setActivePanel(activePanel === 'simulation' ? 'none' : 'simulation')
        },
        {
            id: 'settings',
            label: 'Ajustes del Proyecto',
            icon: Settings,
            active: activePanel === 'settings',
            onClick: () => setActivePanel(activePanel === 'settings' ? 'none' : 'settings')
        },
        {
            id: 'external_load',
            label: 'Sincronización DB',
            icon: Database,
            active: activePanel === 'external_load',
            onClick: () => setActivePanel(activePanel === 'external_load' ? 'none' : 'external_load')
        }
    ];

    if (isSuperAdmin || isTenantAdmin) {
        MENU_ITEMS.push({
            id: 'admin_panel',
            label: 'Centro de Control',
            icon: Shield,
            active: activePanel === 'admin_panel',
            onClick: () => setActivePanel(activePanel === 'admin_panel' ? 'none' : 'admin_panel')
        });
    }

    return (
        <aside className="group relative z-[70] flex h-full w-[80px] flex-col items-center bg-[#0f172a] border-r utilitarian-border transition-[width] duration-500 ease-out-expo hover:w-72 shadow-[20px_0_50px_rgba(0,0,0,0.2)]">
            
            {/* High-End Branding Area */}
            <div className="flex h-24 w-full items-center px-6 mb-2 border-b utilitarian-border bg-slate-950/20 backdrop-blur-md">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary text-white shadow-lg shadow-primary/20 ring-1 ring-white/10 ring-inset">
                    <Bus size={20} strokeWidth={2.5} />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0f172a] animate-pulse" />
                </div>
                <div className="ml-5 overflow-hidden opacity-0 transition-all duration-300 group-hover:opacity-100 flex-1">
                    <h1 className="whitespace-nowrap text-[15px] font-display font-black text-white tracking-widest leading-none uppercase">GTFS PRO</h1>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1.5">
                        <span className="w-1 h-1 bg-slate-500 rounded-full" /> {activeProject?.name || 'Local'}
                    </p>
                </div>
            </div>

            {/* Tactical Navigation Menu */}
            <nav className="flex w-full flex-1 flex-col gap-1.5 px-4 overflow-y-auto custom-scrollbar-sidebar py-6">
                {MENU_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        onClick={item.onClick}
                        className={clsx(
                            "group/item relative flex h-11 w-full items-center rounded-xl transition-all duration-300 outline-none active:scale-95",
                            item.active
                                ? "bg-primary/10 text-white shadow-inner ring-1 ring-primary/20"
                                : "text-slate-400 hover:text-white hover:bg-white/5"
                        )}
                        title={item.label}
                    >
                        {item.active && (
                            <div className="absolute right-[-16px] top-1/2 -translate-y-1/2 w-1.5 h-6 bg-primary rounded-l-full shadow-[0_0_15px_var(--primary)]" />
                        )}
                        <div className="flex h-11 w-[48px] shrink-0 items-center justify-center">
                            <item.icon 
                                size={19} 
                                strokeWidth={item.active ? 2.5 : 2} 
                                className={clsx(
                                    "transition-all duration-300",
                                    item.active ? "text-primary scale-110 drop-shadow-[0_0_8px_rgba(37,99,235,0.4)]" : "group-hover/item:scale-110"
                                )} 
                            />
                        </div>
                        <span className={clsx(
                            "ml-3 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 group-hover:opacity-100 text-[12px] font-black uppercase tracking-widest",
                            item.active ? "text-white" : "text-slate-400 group-hover/item:text-white"
                        )}>
                            {item.label}
                        </span>
                    </button>
                ))}
            </nav>

            {/* System Controls */}
            <div className="w-full px-4 pt-6 border-t utilitarian-border flex flex-col gap-1.5 pb-4 bg-slate-950/10">
                <button
                    onClick={() => setIsImportOpen(true)}
                    className="flex h-11 w-full items-center rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all duration-300 group/btn"
                    title="Vincular Datos"
                >
                    <div className="flex h-11 w-[48px] shrink-0 items-center justify-center">
                        <Upload size={18} className="group-hover/btn:-translate-y-0.5 transition-transform" />
                    </div>
                    <span className="ml-3 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 text-[11px] font-bold uppercase tracking-widest">
                        Vincular GTFS
                    </span>
                </button>

                <button
                    onClick={() => setIsExportOpen(true)}
                    className="flex h-11 w-full items-center rounded-xl text-slate-400 hover:text-primary hover:bg-primary/5 transition-all duration-300 group/btn"
                    title="Suministro de Datos"
                >
                    <div className="flex h-11 w-[48px] shrink-0 items-center justify-center">
                        <Download size={18} className="group-hover/btn:translate-y-0.5 transition-transform" />
                    </div>
                    <span className="ml-3 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 text-[11px] font-bold uppercase tracking-widest">
                        Suministrar GTFS
                    </span>
                </button>

                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="flex h-11 w-full items-center rounded-xl text-slate-400 hover:text-amber-400 hover:bg-amber-500/5 transition-all duration-300"
                    title="Modo Visual"
                >
                    <div className="flex h-11 w-[48px] shrink-0 items-center justify-center">
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </div>
                    <span className="ml-3 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 text-[11px] font-bold uppercase tracking-widest">
                        {theme === 'dark' ? 'Modo Diurno' : 'Modo Nocturno'}
                    </span>
                </button>
            </div>

            {/* Operator Authority Area */}
            <div className="w-full px-4 pb-8 pt-6 border-t utilitarian-border flex flex-col gap-4 bg-slate-950/20">
                <div className="flex items-center px-1">
                    <div className="relative h-10 w-10 shrink-0 rounded-xl bg-slate-800 border utilitarian-border flex items-center justify-center text-primary font-display font-black text-[13px] shadow-lg ring-1 ring-white/5">
                        {userInitials}
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#0f172a]" />
                    </div>
                    <div className="ml-4 overflow-hidden opacity-0 transition-all duration-300 group-hover:opacity-100 flex-1">
                        <p className="whitespace-nowrap text-[13px] font-black text-white leading-none uppercase tracking-tight">{user?.username || 'Usuario'}</p>
                        <p className="whitespace-nowrap text-[9px] text-slate-500 font-black uppercase tracking-[0.15em] mt-1.5">{roleText}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0" />
                </div>

                <button
                    onClick={logout}
                    className="flex h-11 w-full items-center rounded-xl text-red-500/80 hover:bg-red-500/10 hover:text-red-400 transition-all duration-300 group/logout"
                    title="Finalizar Sesión"
                >
                    <div className="flex h-11 w-[48px] shrink-0 items-center justify-center">
                        <LogOut size={16} className="group-hover/logout:-translate-x-1 transition-transform" strokeWidth={2.5} />
                    </div>
                    <span className="ml-3 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 text-[10px] font-black uppercase tracking-[0.2em]">
                        Finalizar Sesión
                    </span>
                </button>
            </div>

            <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
            <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />

            {/* Custom Sidebar Scrollbar Styles */}
            <style>{`
                .custom-scrollbar-sidebar::-webkit-scrollbar {
                    width: 0px;
                }
                .group:hover .custom-scrollbar-sidebar::-webkit-scrollbar {
                    width: 3px;
                }
                .custom-scrollbar-sidebar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar-sidebar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar-sidebar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </aside>
    );
};

export default Sidebar;
