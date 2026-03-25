import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Keycloak from 'keycloak-js';

// Setup Keycloak instance
// In a real app, these values would come from environment variables.
const keycloakConfig = {
    url: `${window.location.protocol}//${window.location.hostname}:8080`,
    realm: 'gtfs',
    clientId: 'gtfs-client'
};

const keycloak = new Keycloak(keycloakConfig);

export interface UserProfile {
    id: string;
    username: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    roles: string[];
}

export interface Project {
    id: string;
    name: string;
    map_center_lat: number;
    map_center_lon: number;
    routing_engine_url: string;
    user_role?: string;
}

interface AuthContextType {
    isAuthenticated: boolean;
    isInitialized: boolean;
    token: string | null;
    user: UserProfile | null;
    myProjects: Project[];
    activeProject: Project | null;
    setActiveProject: (p: Project) => void;
    login: () => void;
    logout: () => void;
    isSuperAdmin: boolean;
    isTenantAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
    isAuthenticated: false,
    isInitialized: false,
    token: null,
    user: null,
    myProjects: [],
    activeProject: null,
    setActiveProject: () => { },
    login: () => { },
    logout: () => { },
    isSuperAdmin: false,
    isTenantAdmin: false,
});

// We keep a reference to original fetch to avoid infinite loops
const originalFetch = window.fetch;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [myProjects, setMyProjects] = useState<Project[]>([]);
    const [activeProject, setActiveProject] = useState<Project | null>(null);
    const activeProjectRef = React.useRef<Project | null>(activeProject);
    activeProjectRef.current = activeProject; // Synchronous update during render

    // Patch global fetch to include Authorization and X-Project-Id headers
    useEffect(() => {
        window.fetch = async (...args) => {
            let [resource, config] = args;
            config = config || {};
            const isApi = typeof resource === 'string' && resource.includes('/api/');

            if (isApi) {
                config.headers = {
                    ...config.headers,
                } as any;

                if (keycloak.token) {
                    (config.headers as any)['Authorization'] = `Bearer ${keycloak.token}`;
                }

                // Active project injection using synchronously updated ref
                if (activeProjectRef.current) {
                    (config.headers as any)['X-Project-Id'] = activeProjectRef.current.id;
                }
            }
            return originalFetch(resource, config);
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, []); // Only run once on mount!
    useEffect(() => {
        const initKeycloak = async () => {
            try {
                const authenticated = await keycloak.init({
                    onLoad: 'login-required', // Forces login immediately
                    checkLoginIframe: false,
                    enableLogging: true,
                    silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
                });

                setIsAuthenticated(authenticated);
                setIsInitialized(true);

                if (authenticated) {
                    setToken(keycloak.token || null);
                    if (keycloak.tokenParsed) {
                        setUser({
                            id: keycloak.tokenParsed.sub || '',
                            username: keycloak.tokenParsed.preferred_username || '',
                            email: keycloak.tokenParsed.email,
                            firstName: keycloak.tokenParsed.given_name,
                            lastName: keycloak.tokenParsed.family_name,
                            roles: keycloak.realmAccess?.roles || [],
                        });
                    }

                    // SuperAdmin skips project fetch — they only manage infrastructure
                    const roles = keycloak.realmAccess?.roles || [];
                    const isAdmin = roles.includes('admin');

                    if (!isAdmin) {
                        try {
                            const res = await originalFetch('/api/projects/my', {
                                headers: { 'Authorization': `Bearer ${keycloak.token}` }
                            });
                            const projects = await res.json();
                            if (Array.isArray(projects)) {
                                setMyProjects(projects);
                                if (projects.length > 0) {
                                    setActiveProject(projects[0]);
                                }
                            } else {
                                console.error('API did not return an array of projects:', projects);
                            }
                        } catch (e) {
                            console.error('Failed to load user projects', e);
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to initialize Keycloak', error);
                setIsInitialized(true);
            }
        };

        initKeycloak();

        // Token refresh mechanism
        keycloak.onTokenExpired = () => {
            keycloak.updateToken(30).then((refreshed) => {
                if (refreshed) {
                    setToken(keycloak.token || null);
                }
            }).catch(() => {
                console.error('Failed to refresh token');
                keycloak.logout();
            });
        };
    }, []);

    const login = () => keycloak.login();
    const logout = () => keycloak.logout({
        redirectUri: window.location.origin
    });

    // Show a loading screen until Keycloak responds
    if (!isInitialized) {
        return (
            <div className="flex items-center justify-center h-screen w-full bg-[#0f111a]">
                <div className="text-white text-xl font-semibold animate-pulse">
                    Autenticando de forma segura...
                </div>
            </div>
        );
    }

    const isSuperAdmin = user?.roles.includes('admin') || false;
    const isTenantAdmin = Array.isArray(myProjects) ? myProjects.some(p => p.user_role === 'admin') : false;

    // If authenticated but no projects assigned (and not admin), they are an orphan user
    if (isAuthenticated && myProjects.length === 0 && !isSuperAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-screen w-full bg-[#0f111a]">
                <div className="text-white text-xl font-semibold mb-4">
                    Tu cuenta no tiene proyectos asignados o no hay proyectos creados.
                </div>
                <div className="text-gray-400 text-sm mb-6">Contacta al administrador para que te asigne un proyecto.</div>
                <button onClick={logout} className="px-4 py-2 bg-red-600 rounded text-white">Cerrar Sesión</button>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ isAuthenticated, isInitialized, token, user, myProjects, activeProject, setActiveProject, login, logout, isSuperAdmin, isTenantAdmin }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
