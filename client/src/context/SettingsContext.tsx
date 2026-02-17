import React, { createContext, useContext, useState, type ReactNode } from 'react';

export interface DefaultLocation {
    latitude: number;
    longitude: number;
    zoom: number;
    cityName: string;
}

interface SettingsContextProps {
    defaultLocation: DefaultLocation;
    setDefaultLocation: (location: DefaultLocation) => void;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

const DEFAULT_LOCATION: DefaultLocation = {
    latitude: 40.7128,
    longitude: -74.0060,
    zoom: 12,
    cityName: 'New York'
};

const STORAGE_KEY = 'gtfs-gen-default-location';

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [defaultLocation, setDefaultLocationState] = useState<DefaultLocation>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load default location settings', e);
        }
        return DEFAULT_LOCATION;
    });

    const setDefaultLocation = (location: DefaultLocation) => {
        setDefaultLocationState(location);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
        } catch (e) {
            console.error('Failed to save default location settings', e);
        }
    };

    return (
        <SettingsContext.Provider value={{ defaultLocation, setDefaultLocation }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
