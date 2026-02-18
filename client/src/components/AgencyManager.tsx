import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Building2, Globe, Clock, Languages, Phone, Mail, X } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { COMMON_TIMEZONES } from '../utils/TimeUtils';

interface Agency {
    agency_id: string;
    agency_name: string;
    agency_url: string;
    agency_timezone: string;
    agency_lang?: string;
    agency_phone?: string;
    agency_email?: string;
}

import { API_URL } from '../config';

const AgencyManager: React.FC = () => {
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [loading, setLoading] = useState(false);

    // Edit/Create State
    const [isEditing, setIsEditing] = useState(false);
    const [currentAgency, setCurrentAgency] = useState<Partial<Agency>>({});

    // Delete State
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
            alert('Please fill in required fields (Name, URL, Timezone)');
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

            if (!res.ok) throw new Error('Failed to save');

            await fetchAgencies();
            setIsEditing(false);
            setCurrentAgency({});
        } catch (err) {
            console.error(err);
            alert('Error saving agency');
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
                alert(data.error || 'Failed to delete agency');
            } else {
                await fetchAgencies();
            }
        } catch (err) {
            console.error(err);
            alert('Error deleting agency');
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
            agency_timezone: 'America/Mexico_City',
            agency_lang: 'en'
        });
        setIsEditing(true);
    };

    if (isEditing) {
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white">
                        {currentAgency.agency_id ? 'Edit Agency' : 'Add New Agency'}
                    </h3>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Building2 size={12} /> Agency Name *
                        </label>
                        <input
                            type="text"
                            placeholder="My Transit Agency"
                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100"
                            value={currentAgency.agency_name || ''}
                            onChange={e => setCurrentAgency({ ...currentAgency, agency_name: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Globe size={12} /> Agency URL *
                        </label>
                        <input
                            type="text"
                            placeholder="https://example.com"
                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100"
                            value={currentAgency.agency_url || ''}
                            onChange={e => setCurrentAgency({ ...currentAgency, agency_url: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Clock size={12} /> Timezone *
                        </label>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Clock size={12} /> Timezone *
                        </label>
                        <select
                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100"
                            value={currentAgency.agency_timezone || ''}
                            onChange={e => setCurrentAgency({ ...currentAgency, agency_timezone: e.target.value })}
                        >
                            <option value="">Select Timezone...</option>
                            {/* Dynamic Timezones */}
                            {COMMON_TIMEZONES.map(tz => (
                                <option key={tz} value={tz}>{tz}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                <Languages size={12} /> Language
                            </label>
                            <input
                                type="text"
                                placeholder="en"
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100"
                                value={currentAgency.agency_lang || ''}
                                onChange={e => setCurrentAgency({ ...currentAgency, agency_lang: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                <Phone size={12} /> Phone
                            </label>
                            <input
                                type="text"
                                placeholder="555-0123"
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100"
                                value={currentAgency.agency_phone || ''}
                                onChange={e => setCurrentAgency({ ...currentAgency, agency_phone: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Mail size={12} /> Email
                        </label>
                        <input
                            type="email"
                            placeholder="contact@agency.com"
                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100"
                            value={currentAgency.agency_email || ''}
                            onChange={e => setCurrentAgency({ ...currentAgency, agency_email: e.target.value })}
                        />
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="flex-1 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/20"
                        >
                            Save Agency
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {agencies.length} Agenc{agencies.length === 1 ? 'y' : 'ies'} Found
                </p>
                <button
                    onClick={startCreate}
                    className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition flex items-center gap-1"
                >
                    <Plus size={14} /> Add Agency
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            ) : (
                <div className="space-y-3">
                    {agencies.map(agency => (
                        <div
                            key={agency.agency_id}
                            className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all group relative"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        {agency.agency_name}
                                        {/* Tag for ID if useful for debugging, maybe hidden generally */}
                                    </h4>
                                    <a href={agency.agency_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline block mt-0.5">
                                        {agency.agency_url}
                                    </a>
                                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                        <Clock size={10} /> {agency.agency_timezone}
                                    </p>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => startEdit(agency)}
                                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => setAgencyToDelete(agency.agency_id)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {agencies.length === 0 && (
                        <div className="text-center py-8 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                            No agencies defined.
                            <br />
                            <span className="text-xs">Create one to start building routes.</span>
                        </div>
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={!!agencyToDelete}
                title="Delete Agency?"
                message="Are you sure you want to delete this agency? This action cannot be undone."
                confirmText="Delete"
                onConfirm={handleDelete}
                onCancel={() => setAgencyToDelete(null)}
            />
        </div>
    );
};

export default AgencyManager;
