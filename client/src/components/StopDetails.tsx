import * as React from 'react';
import type { Stop } from '../types';
import { X, Save, Trash2, MapPin } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface StopDetailsProps {
    stop: Stop;
    onClose: () => void;
    onUpdate: (updatedStop: Stop) => void;
    onDelete: (stopId: string) => Promise<void>;
}

const StopDetails: React.FC<StopDetailsProps> = ({ stop, onClose, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [formData, setFormData] = React.useState({ ...stop });
    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

    React.useEffect(() => {
        setFormData({ ...stop });
    }, [stop]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`http://localhost:3000/api/stops/${stop.stop_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                onUpdate(formData);
                setIsEditing(false);
            } else {
                alert('Failed to update stop');
            }
        } catch (err) {
            console.error(err);
            alert('Network error');
        }
    };

    const handleDeleteClick = () => {
        setConfirmOpen(true);
        setErrorMsg(null);
    };

    const handleConfirmDelete = async () => {
        try {
            await onDelete(stop.stop_id);
            setConfirmOpen(false);
            onClose();
        } catch (err: unknown) {
            // Error is caught from MapEditor's delete function or we can handle it here if we pass the raw fetch
            // But MapEditor usually just updates state. 
            // Better: `onDelete` returns promise, if it fails we catch it.
            // Actually, we’ll assume `onDelete` handles the fetch and throws if error regarding dependency?
            // “Cannot delete...” error usually comes from server 409.
            // So `onDelete` should probably throw or return status. 
            console.error('Delete failed:', err);
            // If the parent throws with a message, we show it. 
            setErrorMsg((err as Error).message || 'Failed to delete');
            // Keep modal open but in “error mode”?
            // Actually ConfirmModal handles “isError”.
        }
    };

    return (
        <>
            <div className="absolute top-4 left-4 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-30 flex flex-col max-h-[80vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
                <div className="bg-gray-100 dark:bg-gray-900 p-3 flex justify-between items-center border-b border-gray-200 dark:border-gray-700 sticky top-0">
                    <div className="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-200">
                        <MapPin size={18} />
                        {isEditing ? 'Edit Stop' : 'Stop Details'}
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 text-gray-800 dark:text-gray-200">
                    {isEditing ? (
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Name</label>
                                <input
                                    className="w-full border p-2 rounded bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={formData.stop_name}
                                    onChange={e => setFormData({ ...formData, stop_name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Code</label>
                                    <input
                                        className="w-full border p-2 rounded bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        value={formData.stop_code || ''}
                                        onChange={e => setFormData({ ...formData, stop_code: e.target.value })}
                                        placeholder="Auto-gen"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Lat</label>
                                    <input
                                        type="number" step="any"
                                        className="w-full border p-2 rounded bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        value={formData.stop_lat}
                                        onChange={e => setFormData({ ...formData, stop_lat: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Lon</label>
                                    <input
                                        type="number" step="any"
                                        className="w-full border p-2 rounded bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        value={formData.stop_lon}
                                        onChange={e => setFormData({ ...formData, stop_lon: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Type</label>
                                <select
                                    className="w-full border p-2 rounded bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={formData.node_type || 'regular'}
                                    onChange={e => setFormData({ ...formData, node_type: e.target.value })}
                                >
                                    <option value="regular">Regular Stop</option>
                                    <option value="station">Station</option>
                                    <option value="commercial">Commercial</option>
                                    <option value="checkpoint">Checkpoint</option>
                                    <option value="parking">Parking</option>
                                </select>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-2 border rounded flex-1 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
                                <button type="submit" className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex-1 flex items-center justify-center gap-2">
                                    <Save size={16} /> Save
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-xl font-bold dark:text-white">{stop.stop_name}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{stop.node_type || 'Regular Stop'}</p>
                            </div>

                            <div className="text-sm bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700">
                                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
                                    <span className="text-gray-500 dark:text-gray-400 font-semibold">ID:</span>
                                    <span className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all" title={stop.stop_id}>{stop.stop_id}</span>

                                    <span className="text-gray-500 dark:text-gray-400 font-semibold">Code:</span>
                                    <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{stop.stop_code || 'N/A'}</span>

                                    <span className="text-gray-500 dark:text-gray-400 font-semibold">Loc:</span>
                                    <span className="text-gray-700 dark:text-gray-300">{stop.stop_lat.toFixed(6)}, {stop.stop_lon.toFixed(6)}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex-1 transition-colors"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={handleDeleteClick}
                                    className="px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/50 flex-1 flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Trash2 size={16} /> Delete
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmOpen}
                title={errorMsg ? "Cannot Delete Stop" : "Delete Stop?"}
                message={errorMsg || "Are you sure you want to delete this stop? This action cannot be undone."}
                onConfirm={handleConfirmDelete}
                onCancel={() => {
                    setConfirmOpen(false);
                    setErrorMsg(null);
                }}
                isError={!!errorMsg}
                confirmText="Delete"
                cancelText="Cancel"
            />
        </>
    );
};

export default StopDetails;
