import React, { useState } from 'react';
import { X, Plus, Trash2, Wand2 } from 'lucide-react';
import { clsx } from 'clsx';
import { formatTimeInput } from '../utils/TimeUtils';

interface AutoTripsModalProps {
    isOpen: boolean;
    onClose: () => void;
    serviceId: string; // Passed from parent
    totalTravelTime: number; // In seconds
    onGenerate: (config: AutoTripsConfig) => void;
}

export interface AutoTripsConfig {
    trips: string[]; // Array of start times "HH:MM:SS"
}

interface TimeRange {
    id: string;
    start_time: string;
    end_time: string;
    value: number; // Interval (min) or Num Buses
}

const AutoTripsModal: React.FC<AutoTripsModalProps> = ({
    isOpen,
    onClose,
    serviceId,
    totalTravelTime,
    onGenerate
}) => {
    const [mode, setMode] = useState<'interval' | 'buses'>('interval');
    const [ranges, setRanges] = useState<TimeRange[]>([
        { id: '1', start_time: '06:00:00', end_time: '09:00:00', value: 15 }
    ]);

    if (!isOpen) return null;

    const addRange = () => {
        setRanges([
            ...ranges,
            { id: Math.random().toString(36).substr(2, 9), start_time: '09:00:00', end_time: '12:00:00', value: mode === 'interval' ? 15 : 2 }
        ]);
    };

    const removeRange = (id: string) => {
        setRanges(ranges.filter(r => r.id !== id));
    };

    const updateRange = (id: string, field: keyof TimeRange, val: any) => {
        setRanges(ranges.map(r => r.id === id ? { ...r, [field]: val } : r));
    };

    const generateTimes = () => {
        const generatedTimes: string[] = [];

        ranges.forEach(range => {
            const startPoints = range.start_time.split(':').map(Number);
            const endPoints = range.end_time.split(':').map(Number);

            // Handle optional seconds
            const startH = startPoints[0] || 0;
            const startM = startPoints[1] || 0;
            const startS = startPoints[2] || 0;

            const endH = endPoints[0] || 0;
            const endM = endPoints[1] || 0;
            const endS = endPoints[2] || 0;

            let currentSeconds = (startH * 3600) + (startM * 60) + startS;
            const endSeconds = (endH * 3600) + (endM * 60) + endS;

            let intervalSeconds = 0;

            if (mode === 'interval') {
                intervalSeconds = range.value * 60;
            } else {
                // By Buses: Interval = TotalTravelTime / NumBuses
                if (range.value <= 0) return;
                intervalSeconds = totalTravelTime / range.value;
            }

            if (intervalSeconds <= 0) return;

            while (currentSeconds <= endSeconds) {
                // Format to HH:MM:SS
                const h = Math.floor(currentSeconds / 3600);
                const m = Math.floor((currentSeconds % 3600) / 60);
                const s = Math.floor(currentSeconds % 60);

                const formatted = [h, m, s]
                    .map(v => v.toString().padStart(2, '0'))
                    .join(':');

                generatedTimes.push(formatted);
                currentSeconds += intervalSeconds;
            }
        });

        // Deduplicate and sort
        const uniqueTimes = Array.from(new Set(generatedTimes)).sort();

        onGenerate({
            trips: uniqueTimes
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Wand2 className="text-blue-600" size={20} />
                        Auto Generate Trips <span className="text-sm font-normal text-gray-500 ml-2">for {serviceId}</span>
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Settings */}
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Generation Mode</label>
                            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                <button
                                    onClick={() => setMode('interval')}
                                    className={clsx(
                                        "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                                        mode === 'interval' ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                                    )}
                                >
                                    By Interval
                                </button>
                                <button
                                    onClick={() => setMode('buses')}
                                    className={clsx(
                                        "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                                        mode === 'buses' ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                                    )}
                                >
                                    By Buses
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Ranges */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2">
                            <span>Time Ranges</span>
                            <span className="text-gray-500 font-normal text-xs">
                                {mode === 'buses' && `Base Travel Time: ${Math.round(totalTravelTime / 60)} min`}
                            </span>
                        </div>

                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {ranges.map((range) => (
                                <div key={range.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <div className="grid grid-cols-2 gap-2 flex-1">
                                        <div>
                                            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">From</label>
                                            <input
                                                type="text"
                                                placeholder="HH:MM:SS"
                                                maxLength={8}
                                                value={range.start_time}
                                                onChange={(e) => updateRange(range.id, 'start_time', e.target.value)}
                                                onBlur={(e) => updateRange(range.id, 'start_time', formatTimeInput(e.target.value))}
                                                className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-gray-100 font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">To</label>
                                            <input
                                                type="text"
                                                placeholder="HH:MM:SS"
                                                maxLength={8}
                                                value={range.end_time}
                                                onChange={(e) => updateRange(range.id, 'end_time', e.target.value)}
                                                onBlur={(e) => updateRange(range.id, 'end_time', formatTimeInput(e.target.value))}
                                                className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-gray-100 font-mono"
                                            />
                                        </div>
                                    </div>

                                    <div className="w-32">
                                        <label className="text-xs text-blue-600 dark:text-blue-400 block mb-1 font-medium">
                                            {mode === 'interval' ? 'Interval (min)' : 'Num Buses'}
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={range.value}
                                            onChange={(e) => updateRange(range.id, 'value', parseInt(e.target.value) || 0)}
                                            className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-gray-900 dark:text-gray-100 font-mono"
                                        />
                                    </div>

                                    <button
                                        onClick={() => removeRange(range.id)}
                                        className="mt-5 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addRange}
                            className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                        >
                            <Plus size={16} /> Add Time Range
                        </button>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={generateTimes}
                        className="px-6 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center gap-2"
                    >
                        <Wand2 size={16} /> Generate Trips
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AutoTripsModal;
