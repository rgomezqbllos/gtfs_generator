import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Plus, X, Trash2, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface Calendar {
    service_id: string;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
    start_date: string;
    end_date: string;
}

const DAYS = [
    { key: 'monday', label: 'M' },
    { key: 'tuesday', label: 'T' },
    { key: 'wednesday', label: 'W' },
    { key: 'thursday', label: 'T' },
    { key: 'friday', label: 'F' },
    { key: 'saturday', label: 'S' },
    { key: 'sunday', label: 'S' }
];

const API_URL = 'http://localhost:3000/api';

const CalendarManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [calendars, setCalendars] = useState<Calendar[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [originalServiceId, setOriginalServiceId] = useState<string | null>(null); // Track original ID for renaming
    const [currentCalendar, setCurrentCalendar] = useState<Partial<Calendar>>({
        service_id: '',
        monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0,
        start_date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10).replace(/-/g, '')
    });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchCalendars();
    }, []);

    const fetchCalendars = async () => {
        try {
            const res = await fetch(`${API_URL}/calendar`);
            const data = await res.json();
            setCalendars(data);
        } catch (err) {
            console.error('Failed to fetch calendars', err);
        }
    };

    const handleDelete = async (service_id: string) => {
        if (!confirm(`Delete calendar ${service_id}?`)) return;
        try {
            const res = await fetch(`${API_URL}/calendar/${service_id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchCalendars();
            } else {
                alert('Failed to delete');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSave = async () => {
        setError(null);
        if (!currentCalendar.service_id || !currentCalendar.start_date || !currentCalendar.end_date) {
            setError('Missing required fields');
            return;
        }

        try {
            // Determine if we are updating (PUT) or creating (POST)
            // If isEditing is true, we use PUT to the ORIGINAL service_id

            const url = isEditing && originalServiceId
                ? `${API_URL}/calendar/${originalServiceId}`
                : `${API_URL}/calendar`;

            const res = await fetch(url, {
                method: isEditing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentCalendar)
            });

            if (res.ok) {
                setIsEditing(false);
                setOriginalServiceId(null);
                setCurrentCalendar({
                    service_id: '',
                    monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0,
                    start_date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                    end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10).replace(/-/g, '')
                });
                fetchCalendars();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to save');
            }
        } catch (err) {
            console.error(err);
            setError('Network error');
        }
    };

    const openEdit = (cal: Calendar) => {
        setCurrentCalendar({ ...cal });
        setOriginalServiceId(cal.service_id);
        setIsEditing(true);
    };

    const openNew = () => {
        setIsEditing(false);
        setOriginalServiceId(null);
        setCurrentCalendar({
            service_id: '',
            monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0,
            start_date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
            end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10).replace(/-/g, '')
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 transition-colors">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 transition-colors">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <CalendarIcon className="w-6 h-6 text-blue-600" />
                            Service Calendars
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage operating days and date ranges for services.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* List Sidebar */}
                    <div className="w-1/3 border-r border-gray-100 dark:border-gray-700 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/30 p-4 space-y-3 transition-colors">
                        <button
                            onClick={openNew}
                            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium mb-4"
                        >
                            <Plus className="w-4 h-4" /> New Calendar
                        </button>

                        {calendars.map(cal => (
                            <div
                                key={cal.service_id}
                                onClick={() => openEdit(cal)}
                                className={clsx(
                                    "p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md",
                                    currentCalendar.service_id === cal.service_id && isEditing
                                        ? "bg-white dark:bg-gray-700 border-blue-500 ring-1 ring-blue-500 shadow-sm"
                                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                )}
                            >
                                <div className="flex justify-between items-start">
                                    <span className="font-bold text-gray-800 dark:text-gray-200">{cal.service_id}</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(cal.service_id); }}
                                        className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex gap-1 mt-2">
                                    {DAYS.map(day => (
                                        <span key={day.key} className={clsx(
                                            "w-5 h-5 flex items-center justify-center text-[10px] rounded font-bold transition-colors",
                                            // @ts-ignore
                                            cal[day.key] === 1
                                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                                : "bg-gray-100 text-gray-300 dark:bg-gray-700 dark:text-gray-500"
                                        )}>
                                            {day.label}
                                        </span>
                                    ))}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex justify-between font-mono">
                                    <span>{cal.start_date}</span>
                                    <span>→</span>
                                    <span>{cal.end_date}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Editor Area */}
                    <div className="flex-1 p-8 overflow-y-auto bg-white dark:bg-gray-800 transition-colors">
                        <div className="max-w-lg mx-auto space-y-6">
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-2">
                                {isEditing ? `Edit ${currentCalendar.service_id}` : 'Create New Calendar'}
                            </h4>

                            {error && (
                                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 px-4 py-3 rounded border border-red-200 dark:border-red-800 text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service ID</label>
                                <input
                                    type="text"
                                    value={currentCalendar.service_id}
                                    onChange={e => setCurrentCalendar({ ...currentCalendar, service_id: e.target.value })}
                                    disabled={false}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                                    placeholder="e.g., WEEKDAY-01"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Unique identifier for this service schedule.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Operating Days</label>
                                <div className="flex gap-2">
                                    {DAYS.map(day => (
                                        <label key={day.key} className="flex-1 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="peer sr-only"
                                                // @ts-ignore
                                                checked={currentCalendar[day.key] === 1}
                                                // @ts-ignore
                                                onChange={e => setCurrentCalendar({ ...currentCalendar, [day.key]: e.target.checked ? 1 : 0 })}
                                            />
                                            <div className="h-10 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 peer-checked:bg-blue-600 peer-checked:text-white peer-checked:border-blue-600 flex items-center justify-center font-semibold text-sm transition-all hover:bg-gray-50 dark:hover:bg-gray-600 peer-checked:hover:bg-blue-700">
                                                {day.label}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                                    <input
                                        type="text"
                                        value={currentCalendar.start_date}
                                        onChange={e => setCurrentCalendar({ ...currentCalendar, start_date: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        placeholder="YYYYMMDD"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                                    <input
                                        type="text"
                                        value={currentCalendar.end_date}
                                        onChange={e => setCurrentCalendar({ ...currentCalendar, end_date: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        placeholder="YYYYMMDD"
                                    />
                                </div>
                            </div>

                            <div className="pt-6 flex gap-3">
                                <button
                                    onClick={handleSave}
                                    className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg shadow hover:bg-blue-700 transition-all font-medium flex items-center justify-center gap-2"
                                >
                                    <Check className="w-4 h-4" /> Save Calendar
                                </button>
                                {isEditing && (
                                    <button
                                        onClick={openNew}
                                        className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>

                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CalendarManager;
