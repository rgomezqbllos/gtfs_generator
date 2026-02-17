import * as React from 'react';
import { X, Check, Bus, Save, Building2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { Route } from '../types';

interface RouteCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void; // Trigger refresh
    routeToEdit?: Route | null;
}

const API_URL = 'http://localhost:3000/api';

const ROUTE_TYPES = [
    { value: 0, label: 'Tram / Streetcar' },
    { value: 1, label: 'Subway / Metro' },
    { value: 2, label: 'Rail' },
    { value: 3, label: 'Bus' },
    { value: 4, label: 'Ferry' },
    { value: 5, label: 'Cable Tram' },
    { value: 6, label: 'Aerial Lift' },
    { value: 7, label: 'Funicular' },
    { value: 11, label: 'Trolleybus' },
    { value: 12, label: 'Monorail' },
];

const RouteCreationModal: React.FC<RouteCreationModalProps> = ({ isOpen, onClose, onCreated, routeToEdit }) => {
    const isEditMode = !!routeToEdit;

    const [formData, setFormData] = React.useState<Partial<Route>>({
        route_short_name: '',
        route_long_name: '',
        route_type: 3, // Bus
        route_color: '1337ec',
        route_text_color: 'FFFFFF',
        agency_name: '',
        route_desc: '',
        route_url: '',
        route_sort_order: undefined
    });

    const [loading, setLoading] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<'basic' | 'advanced'>('basic');
    const [agencies, setAgencies] = React.useState<{ agency_id: string; agency_name: string }[]>([]);

    React.useEffect(() => {
        if (isOpen) {
            fetchAgencies();
            if (routeToEdit) {
                setFormData(routeToEdit);
            } else {
                // Reset defaults
                setFormData({
                    route_short_name: '',
                    route_long_name: '',
                    route_type: 3,
                    route_color: '1337ec',
                    route_text_color: 'FFFFFF',
                    agency_name: '',
                    agency_id: '',
                    route_desc: '',
                    route_url: '',
                    route_sort_order: undefined
                });
            }
            setActiveTab('basic');
        }
    }, [isOpen, routeToEdit]);

    const fetchAgencies = async () => {
        try {
            const res = await fetch(`${API_URL}/agency`);
            if (res.ok) {
                const data = await res.json();
                setAgencies(Array.isArray(data) ? data : [data]);
            }
        } catch (err) {
            console.error('Failed to fetch agencies', err);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!formData.route_short_name || !formData.route_long_name) {
            alert("Please fill in required fields (Short Name, Long Name)");
            return;
        }

        setLoading(true);
        try {
            const url = isEditMode
                ? `${API_URL}/routes/${routeToEdit.route_id}`
                : `${API_URL}/routes`;

            const method = isEditMode ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                onCreated();
                onClose();
            } else {
                alert(`Failed to ${isEditMode ? 'update' : 'create'} route`);
            }
        } catch (err) {
            console.error(err);
            alert("Error saving route");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl border border-gray-200 dark:border-gray-700 overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-400">
                            <Bus size={20} />
                        </div>
                        {isEditMode ? 'Edit Route' : 'Create New Route'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <button
                        onClick={() => setActiveTab('basic')}
                        className={clsx(
                            "flex-1 py-3 text-sm font-bold border-b-2 transition-colors",
                            activeTab === 'basic'
                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
                        )}
                    >
                        Basic Info
                    </button>
                    <button
                        onClick={() => setActiveTab('advanced')}
                        className={clsx(
                            "flex-1 py-3 text-sm font-bold border-b-2 transition-colors",
                            activeTab === 'advanced'
                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
                        )}
                    >
                        Advanced Details
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5 overflow-y-auto">
                    {activeTab === 'basic' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="grid grid-cols-4 gap-4">
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Short Name *</label>
                                    <input
                                        autoFocus={!isEditMode}
                                        type="text"
                                        placeholder="101"
                                        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono font-bold"
                                        value={formData.route_short_name}
                                        onChange={e => setFormData({ ...formData, route_short_name: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-3">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Long Name *</label>
                                    <input
                                        type="text"
                                        placeholder="Downtown Express"
                                        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        value={formData.route_long_name}
                                        onChange={e => setFormData({ ...formData, route_long_name: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Agency</label>
                                <div className="relative">
                                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <select
                                        className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none"
                                        value={formData.agency_id || ''}
                                        onChange={e => setFormData({ ...formData, agency_id: e.target.value, agency_name: agencies.find(a => a.agency_id === e.target.value)?.agency_name })}
                                    >
                                        <option value="">-- Select Agency --</option>
                                        {agencies.map(a => (
                                            <option key={a.agency_id} value={a.agency_id}>
                                                {a.agency_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Route Type</label>
                                    <select
                                        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        value={formData.route_type}
                                        onChange={e => setFormData({ ...formData, route_type: Number(e.target.value) })}
                                    >
                                        {ROUTE_TYPES.map(t => (
                                            <option key={t.value} value={t.value}>{t.label} ({t.value})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Sort Order</label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 1"
                                        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        value={formData.route_sort_order || ''}
                                        onChange={e => setFormData({ ...formData, route_sort_order: parseInt(e.target.value) || undefined })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'advanced' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Colors */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Route Color</label>
                                    <div className="flex gap-3 items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <div className="relative w-10 h-10 rounded-lg overflow-hidden shadow-sm border border-black/10">
                                            <input
                                                type="color"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                value={`#${formData.route_color}`}
                                                onChange={e => setFormData({ ...formData, route_color: e.target.value.substring(1) })}
                                            />
                                            <div className="w-full h-full" style={{ backgroundColor: `#${formData.route_color}` }} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs text-gray-400 mb-0.5">Background</div>
                                            <div className="font-mono font-bold text-gray-700 dark:text-gray-300">#{formData.route_color}</div>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Text Color</label>
                                    <div className="flex gap-3 items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <div className="relative w-10 h-10 rounded-lg overflow-hidden shadow-sm border border-black/10">
                                            <input
                                                type="color"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                value={`#${formData.route_text_color}`}
                                                onChange={e => setFormData({ ...formData, route_text_color: e.target.value.substring(1) })}
                                            />
                                            <div className="w-full h-full border border-gray-200" style={{ backgroundColor: `#${formData.route_text_color}` }} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs text-gray-400 mb-0.5">Text</div>
                                            <div className="font-mono font-bold text-gray-700 dark:text-gray-300">#{formData.route_text_color}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Preview */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex justify-center items-center gap-4">
                                <span className="text-xs font-bold text-gray-400 uppercase">Preview:</span>
                                <div
                                    className="px-4 py-1.5 rounded-full font-bold shadow-sm"
                                    style={{
                                        backgroundColor: `#${formData.route_color}`,
                                        color: `#${formData.route_text_color}`
                                    }}
                                >
                                    {formData.route_short_name || '101'}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Route URL</label>
                                <input
                                    type="url"
                                    placeholder="https://"
                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                                    value={formData.route_url || ''}
                                    onChange={e => setFormData({ ...formData, route_url: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Description</label>
                                <textarea
                                    rows={3}
                                    placeholder="Route description..."
                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm resize-none"
                                    value={formData.route_desc || ''}
                                    onChange={e => setFormData({ ...formData, route_desc: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 mt-auto">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className={clsx(
                            "px-6 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center gap-2",
                            loading && "opacity-70 cursor-wait"
                        )}
                    >
                        {loading ? 'Saving...' : (
                            <>
                                {isEditMode ? <Save size={18} /> : <Check size={18} />}
                                {isEditMode ? 'Save Changes' : 'Create Route'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RouteCreationModal;
