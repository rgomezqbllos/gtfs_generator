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
    LogOut
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
    const { user, logout, isSuperAdmin, isTenantAdmin } = useAuth();
    const [isExportOpen, setIsExportOpen] = React.useState(false);
    const [isImportOpen, setIsImportOpen] = React.useState(false);

    const userInitials = user?.username
        ? user.username.substring(0, 2).toUpperCase()
        : (user?.email ? user.email.substring(0, 2).toUpperCase() : 'US');

    const roleText = isSuperAdmin ? 'SuperAdmin' : (isTenantAdmin ? 'TenantAdmin' : 'Operador');

    const MENU_ITEMS = [
        {
            id: 'select',
            label: 'Select / Edit',
            icon: MousePointer2,
            active: mode === 'idle' && activePanel === 'none',
            onClick: () => {
                setMode('idle');
                setActivePanel('none');
            }
        },
        {
            id: 'stops_catalog',
            label: 'Catálogo de Nodos',
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
            label: 'Routes',
            icon: RouteIcon,
            active: activePanel === 'routes' || activePanel === 'routes_catalog',
            onClick: () => setActivePanel('routes_catalog')
        },
        {
            id: 'calendar',
            label: 'Calendars',
            icon: CalendarDays,
            active: activePanel === 'calendar',
            onClick: () => setActivePanel(activePanel === 'calendar' ? 'none' : 'calendar')
        },
        {
            id: 'empty_segments',
            label: 'Empty Segments',
            icon: RouteIcon, // Reusing RouteIcon or maybe another one? User said "below calendar".
            active: activePanel === 'empty_segments',
            onClick: () => setActivePanel(activePanel === 'empty_segments' ? 'none' : 'empty_segments')
        },
        {
            id: 'simulation',
            label: 'Simulación',
            icon: PlayCircle,
            active: activePanel === 'simulation',
            onClick: () => setActivePanel(activePanel === 'simulation' ? 'none' : 'simulation')
        },
        {
            id: 'settings',
            label: 'Settings',
            icon: Settings,
            active: activePanel === 'settings',
            onClick: () => setActivePanel(activePanel === 'settings' ? 'none' : 'settings')
        },
        {
            id: 'external_load',
            label: 'External Load',
            icon: Database,
            active: activePanel === 'external_load',
            onClick: () => setActivePanel(activePanel === 'external_load' ? 'none' : 'external_load')
        }
    ];

    if (isSuperAdmin || isTenantAdmin) {
        MENU_ITEMS.push({
            id: 'admin_panel',
            label: 'Panel Control',
            icon: Settings, // or another lucide icon, Settings is fine
            active: activePanel === 'admin_panel',
            onClick: () => setActivePanel(activePanel === 'admin_panel' ? 'none' : 'admin_panel')
        });
    }

    return (
        <aside className="group relative z-20 flex h-full w-20 flex-col items-center bg-[#1a1e2e] py-6 transition-all duration-300 hover:w-64 shadow-2xl">
            {/* Logo Section */}
            <div className="mb-10 flex w-full items-center px-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1337ec] text-white shadow-lg shadow-blue-900/50">
                    <Bus size={24} />
                </div>
                <div className="ml-4 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <h1 className="whitespace-nowrap text-lg font-bold text-white tracking-tight">GTFS Gen</h1>
                    <p className="text-xs text-slate-400 font-medium">Enterprise v2.0</p>
                </div>
            </div>

            {/* Navigation Menu (Scrollable) */}
            <nav className="flex w-full flex-1 flex-col gap-2 px-3 overflow-y-auto no-scrollbar py-2">
                {MENU_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        onClick={item.onClick}
                        className={clsx(
                            "flex min-h-[48px] h-12 w-full items-center rounded-lg px-3 transition-all duration-200",
                            item.active
                                ? "bg-[#1337ec] text-white shadow-md shadow-blue-900/20"
                                : "text-slate-400 hover:bg-white/10 hover:text-white"
                        )}
                        title={item.label}
                    >
                        <item.icon size={22} className={clsx(
                            "shrink-0",
                            item.active ? "text-white" : ""
                        )} />
                        <span className="ml-4 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 font-medium text-sm">
                            {item.label}
                        </span>
                    </button>
                ))}
            </nav>

            {/* Theme & Extras */}
            <div className="w-full px-3 mb-2 space-y-2 shrink-0 pt-4 border-t border-[#2d3248]">
                <button
                    onClick={() => setIsImportOpen(true)}
                    className="flex min-h-[48px] h-12 w-full items-center rounded-lg px-3 text-slate-400 hover:bg-white/10 hover:text-white transition-all duration-200"
                    title="Import GTFS"
                >
                    <Upload size={22} className="shrink-0" />
                    <span className="ml-4 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 font-medium text-sm">
                        Import GTFS
                    </span>
                </button>

                <button
                    onClick={() => setIsExportOpen(true)}
                    className="flex min-h-[48px] h-12 w-full items-center rounded-lg px-3 text-slate-400 hover:bg-white/10 hover:text-white transition-all duration-200"
                    title="Export GTFS"
                >
                    <Download size={22} className="shrink-0" />
                    <span className="ml-4 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 font-medium text-sm">
                        Export GTFS
                    </span>
                </button>

                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="flex min-h-[48px] h-12 w-full items-center rounded-lg px-3 text-slate-400 hover:bg-white/10 hover:text-white transition-all duration-200"
                    title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                >
                    {theme === 'dark' ? <Sun size={22} className="shrink-0" /> : <Moon size={22} className="shrink-0" />}
                    <span className="ml-4 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 font-medium text-sm">
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </span>
                </button>
            </div>

            <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
            <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />

            {/* User Profile Section */}
            <div className="mt-6 flex flex-col w-full border-t border-[#2d3248] p-3 shadow-inner">
                <div className="flex w-full items-center rounded-lg px-1 py-1 text-slate-400 transition-colors">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-[#1337ec] to-blue-400 flex items-center justify-center text-white font-bold tracking-widest shadow-lg shadow-blue-500/20">
                        {userInitials}
                    </div>
                    <div className="ml-3 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex-1">
                        <p className="whitespace-nowrap text-sm font-medium text-white leading-tight">{user?.username || 'Usuario'}</p>
                        <p className="whitespace-nowrap text-xs text-blue-300">{roleText}</p>
                    </div>
                </div>

                <button
                    onClick={logout}
                    className="mt-3 flex h-10 w-full items-center rounded-lg px-2 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
                    title="Cerrar Sesión"
                >
                    <LogOut size={20} className="shrink-0" />
                    <span className="ml-4 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 font-medium text-sm">
                        Cerrar Sesión
                    </span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
