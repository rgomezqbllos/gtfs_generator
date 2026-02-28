import React from 'react';
import {
    MapPin,
    Route as RouteIcon,
    Settings,
    MousePointer2,
    PlusCircle,
    Bus,
    UserCircle2,
    CalendarDays,
    Sun,
    Moon,
    Download,
    Upload,
    Database,
    PlayCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import ExportModal from '../ExportModal';
import ImportModal from '../ImportModal';
import { useEditor } from '../../context/EditorContext';
import { useTheme } from '../../context/ThemeContext';

const Sidebar: React.FC = () => {
    const { mode, setMode, activePanel, setActivePanel } = useEditor();
    const [isExportOpen, setIsExportOpen] = React.useState(false);
    const [isImportOpen, setIsImportOpen] = React.useState(false);

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
            id: 'add_stop',
            label: 'Add Stops',
            icon: MapPin,
            active: mode === 'add_stop',
            onClick: () => {
                setMode('add_stop');
                setActivePanel('none');
            }
        },
        {
            id: 'add_segment',
            label: 'Connect Stops',
            icon: PlusCircle,
            active: mode === 'add_segment',
            onClick: () => {
                setMode('add_segment');
                setActivePanel('none');
            }
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

    const { theme, setTheme } = useTheme();

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

            {/* Navigation Menu */}
            <nav className="flex w-full flex-1 flex-col gap-2 px-3">
                {MENU_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        onClick={item.onClick}
                        className={clsx(
                            "flex h-12 w-full items-center rounded-lg px-3 transition-all duration-200",
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

            {/* Theme Toggle */}
            <div className="w-full px-3 mb-2 space-y-2">
                <button
                    onClick={() => setIsImportOpen(true)}
                    className="flex h-12 w-full items-center rounded-lg px-3 text-slate-400 hover:bg-white/10 hover:text-white transition-all duration-200"
                    title="Import GTFS"
                >
                    <Upload size={22} className="shrink-0" />
                    <span className="ml-4 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 font-medium text-sm">
                        Import GTFS
                    </span>
                </button>

                <button
                    onClick={() => setIsExportOpen(true)}
                    className="flex h-12 w-full items-center rounded-lg px-3 text-slate-400 hover:bg-white/10 hover:text-white transition-all duration-200"
                    title="Export GTFS"
                >
                    <Download size={22} className="shrink-0" />
                    <span className="ml-4 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 font-medium text-sm">
                        Export GTFS
                    </span>
                </button>

                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="flex h-12 w-full items-center rounded-lg px-3 text-slate-400 hover:bg-white/10 hover:text-white transition-all duration-200"
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
            <div className="mt-6 flex w-full border-t border-white/10 p-3">
                <div className="flex w-full items-center rounded-lg px-1 py-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-[#1337ec]/20 flex items-center justify-center border border-[#1337ec]/30 text-[#1337ec]">
                        <UserCircle2 size={20} />
                    </div>
                    <div className="ml-3 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <p className="whitespace-nowrap text-sm font-medium text-white">Alex Rivera</p>
                        <p className="whitespace-nowrap text-xs text-slate-400">Project Admin</p>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
