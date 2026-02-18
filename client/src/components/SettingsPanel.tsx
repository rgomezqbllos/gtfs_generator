
import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, MapPin } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import AgencyManager from './AgencyManager';
import MapManager from './MapManager';
import { useSettings } from '../context/SettingsContext';
import { clsx } from 'clsx';

interface SettingsPanelProps {
    onClose: () => void;
    currentViewState: {
        longitude: number;
        latitude: number;
        zoom: number;
    };
}

import { API_URL } from '../config';

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, currentViewState }) => {
    const { defaultLocation, setDefaultLocation } = useSettings();
    const [activeTab, setActiveTab] = useState<'general' | 'agency' | 'map'>('general');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    // General Settings State
    const [cityName, setCityName] = useState(defaultLocation.cityName);
    const [lat, setLat] = useState(defaultLocation.latitude);
    const [lng, setLng] = useState(defaultLocation.longitude);
    const [zoom, setZoom] = useState(defaultLocation.zoom);

    // Sync context to local state
    useEffect(() => {
        setCityName(defaultLocation.cityName);
        setLat(defaultLocation.latitude);
        setLng(defaultLocation.longitude);
        setZoom(defaultLocation.zoom);
    }, [defaultLocation]);

    const handleSaveLocation = () => {
        const newLocation = {
            cityName,
            latitude: Number(lat),
            longitude: Number(lng),
            zoom: Number(zoom)
        };
        setDefaultLocation(newLocation);
        alert('Default location saved!');
    };

    const handleUseCurrentLocation = () => {
        setLat(Number(currentViewState.latitude.toFixed(6)));
        setLng(Number(currentViewState.longitude.toFixed(6)));
        setZoom(Number(currentViewState.zoom.toFixed(2)));
    };

    const handleResetDatabase = async () => {
        setIsResetting(true);
        try {
            const res = await fetch(`${API_URL}/admin/reset`, {
                method: 'POST'
            });

            if (res.ok) {
                alert('Database has been reset successfully. The page will now reload.');
                window.location.reload();
            } else {
                const data = await res.json();
                alert(`Failed to reset database: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error resetting database:', error);
            alert('Error connecting to server.');
        } finally {
            setIsResetting(false);
            setShowResetConfirm(false);
        }
    };

    return (
        <div className="absolute top-0 right-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden z-30 flex flex-col transition-colors duration-300">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Settings</h2>
                <button
                    onClick={onClose}
                    className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition-colors"
                >
                    ✕
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-800">
                <button
                    onClick={() => setActiveTab('general')}
                    className={clsx(
                        "flex-1 py-3 text-sm font-medium transition-colors relative",
                        activeTab === 'general'
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                >
                    General
                    {activeTab === 'general' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('agency')}
                    className={clsx(
                        "flex-1 py-3 text-sm font-medium transition-colors relative",
                        activeTab === 'agency'
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                >
                    Agency
                    {activeTab === 'agency' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('map')}
                    className={clsx(
                        "flex-1 py-3 text-sm font-medium transition-colors relative",
                        activeTab === 'map'
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                >
                    Online Maps
                    {activeTab === 'map' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400" />
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                {activeTab === 'general' && (
                    <div className="space-y-8 fade-in animate-in duration-300">
                        {/* Map Location */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                                <MapPin size={16} className="text-blue-500" /> Default Location
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">City Name</label>
                                    <input
                                        type="text"
                                        value={cityName}
                                        onChange={(e) => setCityName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Latitude</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={lat}
                                            onChange={(e) => setLat(Number(e.target.value))}
                                            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Longitude</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={lng}
                                            onChange={(e) => setLng(Number(e.target.value))}
                                            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Zoom Level</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={zoom}
                                        onChange={(e) => setZoom(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={handleUseCurrentLocation}
                                        className="flex-1 py-2 px-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                    >
                                        Snap to Map
                                    </button>
                                    <button
                                        onClick={handleSaveLocation}
                                        className="flex-1 py-2 px-3 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors shadow-sm"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div>
                            <h3 className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <AlertTriangle size={16} /> Danger Zone
                            </h3>
                            <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/50 rounded-xl p-4">
                                <p className="text-xs text-red-600/80 dark:text-red-400/80 mb-3 leading-relaxed">
                                    Irreversible action. Deletes all stops, routes, and trips.
                                </p>
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    disabled={isResetting}
                                    className="w-full py-2 bg-white dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-bold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors text-sm flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    {isResetting ? 'Resetting...' : 'Clear Database'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'agency' && (
                    <div className="fade-in animate-in duration-300">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50 mb-6">
                            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                                Manage the Transit Agencies for this GTFS feed. Multiple agencies can be supported.
                            </p>
                        </div>
                        <AgencyManager />
                    </div>
                )}

                {activeTab === 'map' && (
                    <div className="fade-in animate-in duration-300">
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50 mb-6">
                            <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
                                Download maps for offline routing. Requires Docker to be running on the host machine.
                            </p>
                        </div>
                        <MapManager />
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={showResetConfirm}
                title="Clear Database?"
                message="Are you sure you want to delete ALL data? This will remove all routes, stops, segments, and shapes. This action cannot be undone."
                confirmText="Yes, Clear Everything"
                onConfirm={handleResetDatabase}
                onCancel={() => setShowResetConfirm(false)}
            />
        </div>
    );
};

export default SettingsPanel;
