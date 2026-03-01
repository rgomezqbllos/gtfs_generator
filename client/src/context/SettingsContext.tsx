import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { API_URL } from '../config';

export interface DefaultLocation {
    latitude: number;
    longitude: number;
    zoom: number;
    cityName: string;
}

interface SettingsContextProps {
    defaultLocation: DefaultLocation;
    setDefaultLocation: (location: DefaultLocation) => void;
    isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

const DEFAULT_LOCATION: DefaultLocation = {
    latitude: 4.6097, // Bogota as a better default for this project context
    longitude: -74.0817,
    zoom: 12,
    cityName: 'Bogotá'
};

const STORAGE_KEY = 'gtfs-gen-default-location';

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [defaultLocation, setDefaultLocationState] = useState<DefaultLocation>(DEFAULT_LOCATION);
    const [isLoading, setIsLoading] = useState(true);

    // Initial Load from server
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch(`${API_URL}/admin/settings`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.defaultLocation) {
                        setDefaultLocationState(data.defaultLocation);
                    } else {
                        // Fallback to localStorage if no server setting yet
                        const saved = localStorage.getItem(STORAGE_KEY);
                        if (saved) setDefaultLocationState(JSON.parse(saved));
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch settings from server, using local defaults', e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const setDefaultLocation = async (location: DefaultLocation) => {
        setDefaultLocationState(location);
        // Save to LocalStorage for offline/instant feel
        localStorage.setItem(STORAGE_KEY, JSON.stringify(location));

        // Save to Server
        try {
            await fetch(`${API_URL}/admin/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'defaultLocation', value: location })
            });
        } catch (e) {
            console.error('Failed to sync settings to server', e);
        }
    };

    return (
        <SettingsContext.Provider value={{ defaultLocation, setDefaultLocation, isLoading }}>
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
