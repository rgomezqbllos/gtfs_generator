import React, { createContext, useContext, useState, type ReactNode } from 'react';

export type InteractionMode = 'idle' | 'add_stop' | 'add_segment' | 'add_empty_segment';
type ElementType = 'stop' | 'segment' | null;
type PanelType = 'none' | 'routes' | 'routes_catalog' | 'settings' | 'calendar' | 'trips' | 'empty_segments' | 'external_load' | 'simulation';

interface PickingState {
    isActive: boolean;
    type: 'segment' | 'stop' | null;
    onPick: ((id: string) => void) | null;
}

interface EditorContextProps {
    mode: InteractionMode;
    setMode: (mode: InteractionMode) => void;
    selectedElementId: string | null;
    selectedElementType: ElementType;
    selectElement: (type: ElementType, id: string | null) => void;
    clearSelection: () => void;
    activePanel: PanelType;
    setActivePanel: (panel: PanelType) => void;

    // Picking Mode
    pickingState: PickingState;
    startPicking: (type: 'segment' | 'stop', onPick: (id: string) => void) => void;
    cancelPicking: () => void;
}

const EditorContext = createContext<EditorContextProps | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [mode, setMode] = useState<InteractionMode>('idle');
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [selectedElementType, setSelectedElementType] = useState<ElementType>(null);
    const [activePanel, setActivePanel] = useState<PanelType>('none');

    const [pickingState, setPickingState] = useState<PickingState>({
        isActive: false,
        type: null,
        onPick: null
    });

    const selectElement = (type: ElementType, id: string | null) => {
        setSelectedElementType(type);
        setSelectedElementId(id);
    };

    const clearSelection = () => {
        setSelectedElementId(null);
        setSelectedElementType(null);
    };

    const startPicking = (type: 'segment' | 'stop', onPick: (id: string) => void) => {
        setPickingState({
            isActive: true,
            type,
            onPick
        });
        setMode('idle'); // Ensure other modes are off
    };

    const cancelPicking = () => {
        setPickingState({
            isActive: false,
            type: null,
            onPick: null
        });
    };

    return (
        <EditorContext.Provider
            value={{
                mode,
                setMode,
                selectedElementId,
                selectedElementType,
                selectElement,
                clearSelection,
                activePanel,
                setActivePanel,
                pickingState,
                startPicking,
                cancelPicking
            }}
        >
            {children}
        </EditorContext.Provider>
    );
};

export const useEditor = () => {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error('useEditor must be used within an EditorProvider');
    }
    return context;
};
