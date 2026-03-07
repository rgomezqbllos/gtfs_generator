import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import { LogOut } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

// We fetch Geofabrik regions dynamically now instead of a hardcoded list

export const AdminPanel: React.FC = () => {
    const { token, isSuperAdmin, isTenantAdmin, myProjects, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<'projects' | 'users'>('users');
    const [projects, setProjects] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

    // New project form
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [newProjectRegion, setNewProjectRegion] = useState('');
    const [customRegionUrl, setCustomRegionUrl] = useState('');
    const [geofabrikRegions, setGeofabrikRegions] = useState<any[]>([]);

    // New user form
    const [newUserName, setNewUserName] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');

    const fetchProjects = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/projects`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setProjects(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (token) {
            fetchProjects();
            fetchUsers();
        }
    }, [token]);

    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/admin/geofabrik`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data && data.features) {
                    const regions = data.features.map((f: any) => ({
                        id: f.properties.id,
                        name: f.properties.name,
                        url: f.properties.urls.pbf,
                        lat: f.geometry && f.geometry.coordinates[0]?.[0]?.[1],
                        lon: f.geometry && f.geometry.coordinates[0]?.[0]?.[0]
                    })).sort((a: any, b: any) => a.name.localeCompare(b.name));
                    setGeofabrikRegions(regions);
                }
            })
            .catch(console.error);
    }, []);

    const handleCreateProject = async () => {
        if (!newProjectName) return;
        
        let regionData = geofabrikRegions.find(r => r.id === newProjectRegion);
        let finalUrl = customRegionUrl || regionData?.url || undefined;
        let finalId = newProjectRegion || (customRegionUrl ? newProjectName.toLowerCase().replace(/[^a-z0-9]/g, '-') : undefined);
        
        try {
            const res = await fetch(`${API_URL}/admin/projects`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    name: newProjectName, 
                    description: newProjectDesc,
                    region_id: finalId,
                    region_url: finalUrl,
                    map_center_lat: regionData?.lat,
                    map_center_lon: regionData?.lon
                })
            });
            
            if (res.ok) {
                setNewProjectName('');
                setNewProjectDesc('');
                setNewProjectRegion('');
                setCustomRegionUrl('');
                fetchProjects();
                alert(`¡Proyecto creado exitosamente! OSRM se está configurando en segundo plano para ${finalId || 'la región'}.`);
            } else {
                const data = await res.json();
                alert(data.error || 'Error al crear proyecto');
            }
        } catch (e: any) {
            console.error(e);
            alert('Error de conexión al crear proyecto: ' + e.message);
        }
    };

    const handleDeleteProject = (id: string) => {
        setProjectToDelete(id);
    };

    const confirmDeleteProject = async () => {
        if (!projectToDelete) return;
        try {
            await fetch(`${API_URL}/admin/projects/${projectToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchProjects();
        } catch (e) {
            console.error(e);
        } finally {
            setProjectToDelete(null);
        }
    };

    const handleAssignUser = async (userId: string, projectId: string) => {
        await fetch(`${API_URL}/admin/user-projects`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId, project_id: projectId, role: 'editor' })
        });
        fetchUsers();
    };

    const handleUnassignUser = async (userId: string, projectId: string) => {
        await fetch(`${API_URL}/admin/user-projects/${userId}/${projectId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchUsers();
    };

    const handleCreateUser = async () => {
        if (!newUserName || !newUserEmail || !newUserPassword) return;
        try {
            const res = await fetch(`${API_URL}/admin/users`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: newUserName,
                    email: newUserEmail,
                    password: newUserPassword
                })
            });
            if (res.ok) {
                setNewUserName('');
                setNewUserEmail('');
                setNewUserPassword('');
                fetchUsers();
                alert('¡Usuario creado en el sistema y listo para ser asignado!');
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to create user');
            }
        } catch (e) {
            console.error(e);
            alert('Error connecting to server');
        }
    };

    const handleDeleteUser = async (id: string, username: string) => {
        if (username === 'admin') {
            alert('Cannot delete the builtin admin account');
            return;
        }
        if (!confirm(`¿Eliminar al usuario ${username} permanentemente de Keycloak y de la base de datos?`)) return;
        try {
            const res = await fetch(`${API_URL}/admin/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchUsers();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete user');
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Only allow Admin or TenantAdmin role
    if (!isSuperAdmin && !isTenantAdmin) {
        return <div className="p-8 text-white">Acceso denegado. Requiere rol de administrador.</div>;
    }

    // A TenantAdmin only manages projects they actually have admin rights to
    const adminActionableProjects = isSuperAdmin ? projects : myProjects.filter(p => p.user_role === 'admin');

    return (
        <div className="flex-1 p-8 overflow-y-auto bg-[#0f111a] text-white">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">🛠️ Panel de Administración {isSuperAdmin ? '(SuperAdmin)' : '(TenantAdmin)'}</h1>
                <button
                    onClick={logout}
                    className="flex items-center gap-2 bg-red-600/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-lg font-medium hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/10"
                    title="Cerrar Sesión"
                >
                    <LogOut size={20} />
                    <span>Cerrar Sesión</span>
                </button>
            </div>

            <div className="flex border-b border-[#2d3248] mb-8">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-3 font-semibold ${activeTab === 'users' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    👥 Catálogo de Usuarios
                </button>
                <button
                    onClick={() => setActiveTab('projects')}
                    className={`px-6 py-3 font-semibold ${activeTab === 'projects' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    🏢 Catálogo de Proyectos
                </button>
            </div>

            {activeTab === 'projects' && (
                <section className="mb-12 bg-[#1a1d2d] p-6 rounded-lg border border-[#2d3248] animate-fade-in">
                    <h2 className="text-2xl font-semibold mb-4 text-[#bfbfff]">Gestión de Proyectos</h2>

                    {isSuperAdmin && (
                        <div className="flex gap-4 mb-6">
                            <input
                                type="text"
                                placeholder="Nombre de la red..."
                                value={newProjectName}
                                onChange={e => setNewProjectName(e.target.value)}
                                className="p-2 rounded bg-[#0f111a] border border-[#2d3248] text-white flex-1 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <input
                                type="text"
                                placeholder="Descripción"
                                value={newProjectDesc}
                                onChange={e => setNewProjectDesc(e.target.value)}
                                className="p-2 rounded bg-[#0f111a] border border-[#2d3248] text-white flex-1 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <div className="flex flex-col gap-2 flex-1">
                                <select
                                    value={newProjectRegion}
                                    onChange={e => {
                                        setNewProjectRegion(e.target.value);
                                        if (e.target.value) setCustomRegionUrl('');
                                    }}
                                    className="p-2 rounded bg-[#0f111a] border border-[#2d3248] text-white focus:outline-none focus:border-blue-500 transition-colors"
                                    title="Busca y elige entre las 500+ regiones de Geofabrik"
                                >
                                    <option value="">🗺️ Seleccionar Región Mapas (Geofabrik)</option>
                                    {geofabrikRegions.map(r => (
                                        <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    placeholder="O ingresa un URL Custom .osm.pbf (ej. BBBike)"
                                    value={customRegionUrl}
                                    onChange={e => {
                                        setCustomRegionUrl(e.target.value);
                                        if (e.target.value) setNewProjectRegion('');
                                    }}
                                    className="p-2 rounded bg-[#0f111a] border border-[#2d3248] text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                                />
                            </div>
                            <button onClick={handleCreateProject} className="bg-blue-600 px-6 py-2 rounded text-white font-medium hover:bg-blue-500 shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                                Crear Proyecto
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects.map(p => (
                            <div key={p.id} className="p-5 rounded-xl bg-gradient-to-br from-[#272b40] to-[#1f2335] shadow-lg border border-[#3f465c] hover:border-blue-500/50 transition-colors group">
                                <h3 className="text-xl font-bold text-[#bfbfff]">{p.name}</h3>
                                <p className="text-sm text-gray-400 mb-4">{p.description || 'Sin descripción'}</p>
                                {isSuperAdmin && (
                                    <button onClick={() => handleDeleteProject(p.id)} className="text-red-400 hover:text-red-300 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                        Eliminar Proyecto
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {activeTab === 'users' && (
                <section className="bg-[#1a1d2d] p-0 rounded-lg border border-[#2d3248] overflow-hidden animate-fade-in shadow-xl">
                    <div className="p-6 bg-[#212638] border-b border-[#2d3248]">
                        <h2 className="text-2xl font-semibold mb-4 text-[#bfbfff]">Directorio de Usuarios</h2>

                        {isSuperAdmin && (
                            <div className="flex gap-4 mb-6">
                                <input
                                    type="text"
                                    placeholder="Username"
                                    value={newUserName}
                                    onChange={e => setNewUserName(e.target.value)}
                                    className="p-2 rounded bg-[#0f111a] border border-[#2d3248] text-white flex-1 focus:outline-none focus:border-emerald-500 transition-colors"
                                />
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={newUserEmail}
                                    onChange={e => setNewUserEmail(e.target.value)}
                                    className="p-2 rounded bg-[#0f111a] border border-[#2d3248] text-white flex-1"
                                />
                                <input
                                    type="password"
                                    placeholder="Contraseña Temporal"
                                    value={newUserPassword}
                                    onChange={e => setNewUserPassword(e.target.value)}
                                    className="p-2 rounded bg-[#0f111a] border border-[#2d3248] text-white flex-1 focus:outline-none focus:border-emerald-500 transition-colors"
                                />
                                <button onClick={handleCreateUser} className="bg-emerald-600 px-6 py-2 rounded text-white font-medium hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">
                                    Crear Usuario
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="p-6 bg-[#1a1d2d]">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-[#2d3248] text-gray-400">
                                    <th className="py-3 px-4 font-normal">Usuario</th>
                                    <th className="py-3 px-4 font-normal">Email</th>
                                    <th className="py-3 px-4 font-normal">Proyectos Asignados</th>
                                    <th className="py-3 px-4 font-normal text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} className="border-b border-[#2d3248] last:border-0 hover:bg-[#272b40]/50 transition-colors">
                                        <td className="py-4 px-4 font-medium">{u.username}</td>
                                        <td className="py-4 px-4 text-gray-400">{u.email}</td>
                                        <td className="py-4 px-4">
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {u.projects?.map((up: any) => (
                                                    <span key={up.id} className="flex items-center gap-1 bg-blue-900/50 text-blue-200 text-xs px-2 py-1 rounded-full border border-blue-800">
                                                        {up.name}
                                                        <button onClick={() => handleUnassignUser(u.id, up.id)} className="hover:text-red-400 ml-1">×</button>
                                                    </span>
                                                ))}
                                            </div>
                                            <select
                                                className="text-xs bg-[#0f111a] border border-[#2d3248] rounded p-1 text-gray-300 hover:border-blue-400 transition-colors focus:outline-none"
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        handleAssignUser(u.id, e.target.value);
                                                        e.target.value = '';
                                                    }
                                                }}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>+ Asignar a...</option>
                                                {adminActionableProjects.filter(p => !u.projects?.some((up: any) => up.id === p.id)).map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            {isSuperAdmin && (
                                                <button
                                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                                    className="text-red-400 hover:text-red-300 text-sm font-medium"
                                                    disabled={u.username === 'admin'}
                                                    title={u.username === 'admin' ? "Cannot delete builtin admin" : "Eliminar usuario permanentemente"}
                                                >
                                                    Eliminar
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="py-8 text-center text-gray-500">Ningún usuario sincronizado. Los usuarios deben loguearse al menos una vez para aparecer aquí.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <ConfirmModal
                isOpen={!!projectToDelete}
                title="Eliminar Proyecto"
                message="¿Estás seguro de que deseas eliminar este proyecto y todos sus datos relacionados? Esta acción no se puede deshacer."
                isDestructive={true}
                confirmText="Sí, Eliminar"
                onConfirm={confirmDeleteProject}
                onCancel={() => setProjectToDelete(null)}
            />
        </div>
    );
};
