import React, { useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, X } from 'lucide-react';
import { API_URL } from '../config';

interface ExternalLoadPanelProps {
    onClose: () => void;
    onImportSuccess?: () => void | Promise<void>;
}

const ExternalLoadPanel: React.FC<ExternalLoadPanelProps> = ({ onClose, onImportSuccess }) => {
    const [files, setFiles] = useState<{
        stops: File | null;
        routes: File | null;
        itineraries: File | null;
    }>({
        stops: null,
        routes: null,
        itineraries: null
    });

    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState<string>('');
    const [errors, setErrors] = useState<any[]>([]);

    const handleFileChange = (type: keyof typeof files) => (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFiles(prev => ({ ...prev, [type]: e.target.files![0] }));
            // Reset status on new file
            if (status !== 'uploading') {
                setStatus('idle');
                setMessage('');
                setErrors([]);
            }
        }
    };

    const handleUpload = async () => {
        if (!files.stops && !files.routes && !files.itineraries) {
            setMessage("Please select at least one file to upload.");
            setStatus('error');
            return;
        }

        setStatus('uploading');
        setMessage("Uploading and processing files...");
        setErrors([]);

        const formData = new FormData();
        if (files.stops) formData.append('stops', files.stops);
        if (files.routes) formData.append('routes', files.routes);
        if (files.itineraries) formData.append('itineraries', files.itineraries);

        try {
            const res = await fetch(`${API_URL}/gtfs/structured`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setStatus('success');
                setMessage(data.message || "Import completed successfully!");
                if (onImportSuccess) {
                    await onImportSuccess();
                }
                // Clear files? Maybe not, so user sees what they sent.
            } else {
                setStatus('error');
                setMessage(data.error || "Import failed with errors.");
                if (data.errors && Array.isArray(data.errors)) {
                    setErrors(data.errors);
                }
            }
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setMessage(`Network error: ${err.message}`);
        }
    };

    return (
        <div className="absolute top-0 right-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl z-30 flex flex-col transition-transform duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2">
                    <Upload className="text-blue-600" size={20} />
                    <h2 className="font-bold text-gray-800 dark:text-gray-100">External Load</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                    <X size={20} className="text-gray-500" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Upload structured CSV files to build your network.
                </p>

                {/* File Inputs */}
                <div className="space-y-4">

                    {/* Stops */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Stops (Paradas.csv)
                        </label>
                        <div className={`border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center transition-colors ${files.stops ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-gray-300 dark:border-gray-700 hover:border-blue-400'}`}>
                            <input
                                type="file"
                                accept=".csv, text/csv, application/vnd.ms-excel, text/x-csv, text/plain"
                                onChange={handleFileChange('stops')}
                                className="hidden"
                                id="file-stops"
                            />
                            <label htmlFor="file-stops" className="cursor-pointer w-full flex flex-col items-center gap-1">
                                {files.stops ? (
                                    <>
                                        <CheckCircle size={20} className="text-green-600" />
                                        <span className="text-xs font-semibold text-green-700 dark:text-green-400 truncate w-full text-center">{files.stops.name}</span>
                                        <span className="text-xs text-gray-500">{(files.stops.size / 1024).toFixed(1)} KB</span>
                                    </>
                                ) : (
                                    <>
                                        <FileText size={20} className="text-gray-400" />
                                        <span className="text-xs text-blue-600 font-medium">Click to upload</span>
                                    </>
                                )}
                            </label>
                        </div>
                    </div>

                    {/* Routes */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Routes (Rutas.csv)
                        </label>
                        <div className={`border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center transition-colors ${files.routes ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-gray-300 dark:border-gray-700 hover:border-blue-400'}`}>
                            <input
                                type="file"
                                accept=".csv, text/csv, application/vnd.ms-excel, text/x-csv, text/plain"
                                onChange={handleFileChange('routes')}
                                className="hidden"
                                id="file-routes"
                            />
                            <label htmlFor="file-routes" className="cursor-pointer w-full flex flex-col items-center gap-1">
                                {files.routes ? (
                                    <>
                                        <CheckCircle size={20} className="text-green-600" />
                                        <span className="text-xs font-semibold text-green-700 dark:text-green-400 truncate w-full text-center">{files.routes.name}</span>
                                        <span className="text-xs text-gray-500">{(files.routes.size / 1024).toFixed(1)} KB</span>
                                    </>
                                ) : (
                                    <>
                                        <FileText size={20} className="text-gray-400" />
                                        <span className="text-xs text-blue-600 font-medium">Click to upload</span>
                                    </>
                                )}
                            </label>
                        </div>
                    </div>

                    {/* Itineraries */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Itineraries (Itinerario.csv)
                        </label>
                        <div className={`border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center transition-colors ${files.itineraries ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-gray-300 dark:border-gray-700 hover:border-blue-400'}`}>
                            <input
                                type="file"
                                accept=".csv, text/csv, application/vnd.ms-excel, text/x-csv, text/plain"
                                onChange={handleFileChange('itineraries')}
                                className="hidden"
                                id="file-itineraries"
                            />
                            <label htmlFor="file-itineraries" className="cursor-pointer w-full flex flex-col items-center gap-1">
                                {files.itineraries ? (
                                    <>
                                        <CheckCircle size={20} className="text-green-600" />
                                        <span className="text-xs font-semibold text-green-700 dark:text-green-400 truncate w-full text-center">{files.itineraries.name}</span>
                                        <span className="text-xs text-gray-500">{(files.itineraries.size / 1024).toFixed(1)} KB</span>
                                    </>
                                ) : (
                                    <>
                                        <FileText size={20} className="text-gray-400" />
                                        <span className="text-xs text-blue-600 font-medium">Click to upload</span>
                                    </>
                                )}
                            </label>
                        </div>
                    </div>

                </div>

                {/* Status & Errors */}
                {status !== 'idle' && (
                    <div className={`rounded-lg p-3 text-sm ${status === 'success' ? 'bg-green-100 text-green-800' :
                        status === 'error' ? 'bg-red-100 text-red-800' :
                            'bg-blue-100 text-blue-800'
                        }`}>
                        <div className="flex items-center gap-2 font-medium">
                            {status === 'uploading' && <span className="animate-spin text-lg">⏳</span>}
                            {status === 'success' && <CheckCircle size={16} />}
                            {status === 'error' && <AlertCircle size={16} />}
                            {message}
                        </div>

                        {errors.length > 0 && (
                            <div className="mt-2 pl-6 space-y-1 max-h-40 overflow-y-auto">
                                <p className="font-bold underline">Validation Errors:</p>
                                {errors.map((err, i) => (
                                    <div key={i} className="text-xs">
                                        Row {err.row} ({err.file}): {err.message}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <button
                    onClick={handleUpload}
                    disabled={status === 'uploading'}
                    className={`w-full py-2.5 rounded-lg font-bold text-white shadow-lg transition-all ${status === 'uploading'
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/30 active:scale-95'
                        }`}
                >
                    {status === 'uploading' ? 'Processing...' : 'Start Import'}
                </button>
            </div>
        </div>
    );
};

export default ExternalLoadPanel;
