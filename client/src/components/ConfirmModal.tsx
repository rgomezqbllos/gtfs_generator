import * as React from 'react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    isError?: boolean; // If true, only show "Close" or similar, or just style differently
    isDestructive?: boolean;
    confirmText?: string;
    cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen, title, message, onConfirm, onCancel, isError, isDestructive, confirmText = "Confirm", cancelText = "Cancel"
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
                <h3 className={`text-lg font-bold mb-2 ${isError || isDestructive ? 'text-red-600' : 'text-gray-800'}`}>{title}</h3>
                <p className="text-gray-600 mb-6">{message}</p>

                <div className="flex justify-end gap-3">
                    {!isError && (
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 rounded border hover:bg-gray-100"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={isError ? onCancel : onConfirm}
                        className={`px-4 py-2 rounded text-white ${isError || isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isError ? 'Close' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
