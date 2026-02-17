
import React, { useState, useEffect } from 'react';
import { X, Save, MapPin } from 'lucide-react';

interface StopCreationModalProps {
    isOpen: boolean;
    lat: number;
    lon: number;
    onClose: () => void;
    onSave: (data: { stop_name: string; stop_code: string }) => void;
}

const StopCreationModal: React.FC<StopCreationModalProps> = ({ isOpen, lat, lon, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');

    useEffect(() => {
        if (isOpen) {
            setName('');
            setCode('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ stop_name: name, stop_code: code });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-96 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 dark:text-white">
                        <MapPin className="text-blue-600" size={20} />
                        Add New Stop
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stop Name</label>
                        <input
                            type="text"
                            required
                            className="w-full border dark:border-gray-600 rounded p-2 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. Central Station"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Stop Code <span className="text-xs text-gray-500 font-normal">(Optional)</span>
                        </label>
                        <input
                            type="text"
                            className="w-full border dark:border-gray-600 rounded p-2 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. CS-001"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">If empty, a code will be auto-generated.</p>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded text-sm text-gray-600 dark:text-gray-400">
                        <p><strong>Location:</strong> {lat.toFixed(6)}, {lon.toFixed(6)}</p>
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
                        >
                            <Save size={18} />
                            Create Stop
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StopCreationModal;
