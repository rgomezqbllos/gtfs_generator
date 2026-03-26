import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../config";
import {
  Shield,
  Users,
  Database,
  Plus,
  Trash2,
  MapPin,
  Globe,
  CheckCircle2,
  RefreshCw,
  Pencil,
  Lock,
  Mail,
  AlertCircle,
} from "lucide-react";
import { clsx } from "clsx";
import ConfirmModal from "./ConfirmModal";

import { MapHub } from "./MapHub";

export const AdminPanel: React.FC = () => {
  const { token, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<"projects" | "users" | "maps">(
    "projects",
  );
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [maps, setMaps] = useState<any[]>([]);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  // New project form
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newProjectRegion, setNewProjectRegion] = useState("");

  // New user form
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"operations" | "admin">("operations");
  const [assigningUser, setAssigningUser] = useState<any | null>(null);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orphanedUsers, setOrphanedUsers] = useState<any>(null);
  const [cleanupConfirm, setCleanupConfirm] = useState(false);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMaps = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/maps`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMaps(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
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
      fetchMaps();
    }
  }, [token]);

  const handleCreateProject = async () => {
    if (!newProjectName || !newProjectRegion) return;

    try {
      const res = await fetch(`${API_URL}/admin/projects`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDesc,
          map_instance_id: newProjectRegion,
        }),
      });
      if (res.ok) {
        setNewProjectName("");
        setNewProjectDesc("");
        fetchProjects();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/projects/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchProjects();
        setProjectToDelete(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateUser = async () => {
    if (!isSuperAdmin) {
      alert("Solo SuperAdmin puede crear usuarios");
      return;
    }
    if (!newUserName || !newUserEmail || !newUserPassword) {
      alert("Completa username, email y password");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail)) {
      alert("Email inválido");
      return;
    }
    if (newUserPassword.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewUserName("");
        setNewUserEmail("");
        setNewUserPassword("");
        setNewUserRole("operations");
        fetchUsers();
        alert(data.message || "Usuario creado correctamente");
        return;
      }
      alert(`Error: ${data.error || `HTTP ${res.status} — No se pudo crear el usuario`}`);
    } catch (e) {
      console.error(e);
      alert("Error de conexión al crear usuario");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAuth = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/admin/maintenance/sync-auth`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      alert(data.message || "Sincronización completada");
      fetchUsers();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckOrphaned = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/maintenance/orphaned-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setOrphanedUsers(data);
    } catch (e) {
      console.error(e);
      alert("Error al verificar usuarios huérfanos");
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupOrphaned = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/maintenance/cleanup-orphaned`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${data.message}\n\nEliminados:\n${data.deletedUsers?.join("\n") || "Ninguno"}`);
        setOrphanedUsers(null);
        setCleanupConfirm(false);
        fetchUsers();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error al limpiar usuarios");
    } finally {
      setLoading(false);
    }
  };

  const handleAssignProject = async (userId: string, projectId: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/user-projects`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          project_id: projectId,
          role: "editor",
        }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveProject = async (userId: string, projectId: string) => {
    try {
      const res = await fetch(
        `${API_URL}/admin/user-projects/${userId}/${projectId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        fetchUsers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditUser = async () => {
    if (!editingUser || !editEmail) return;

    // Validations
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail)) {
      alert("Email inválido");
      return;
    }

    if (editPassword && editPassword.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/users/${editingUser.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: editingUser.username,
          email: editEmail,
          password: editPassword || undefined,
        }),
      });
      if (res.ok) {
        setEditingUser(null);
        setEditEmail("");
        setEditPassword("");
        fetchUsers();
        alert("Usuario actualizado correctamente");
      } else {
        const error = await res.json();
        alert(`Error: ${error.error || "No se pudo actualizar el usuario"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error al actualizar usuario");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setUserToDelete(null);
        fetchUsers();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error || "No se pudo eliminar el usuario"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error al eliminar usuario");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-background-light dark:bg-background-dark flex flex-col animate-in fade-in duration-700 ease-out-expo">
      {/* Header Section */}
      <div className="border-b utilitarian-border px-8 py-12 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
                <Shield size={24} strokeWidth={2.5} />
              </div>
              <h1 className="text-4xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
                Centro de Control
              </h1>
            </div>
            <p className="text-slate-500 dark:text-slate-400 font-medium max-w-xl text-balance">
              Administración global de infraestructura cartográfica y acceso de
              usuarios Enterprise.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-12 flex gap-1 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("users")}
            className={clsx(
              "flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === "users"
                ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white",
            )}
          >
            <Users size={16} />
            Usuarios
          </button>
          <button
            onClick={() => setActiveTab("projects")}
            className={clsx(
              "flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === "projects"
                ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white",
            )}
          >
            <Database size={16} />
            Proyectos
          </button>
          <button
            onClick={() => setActiveTab("maps")}
            className={clsx(
              "flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === "maps"
                ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white",
            )}
          >
            <Globe size={16} />
            Map Hub
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto custom-scrollbar p-8">
        <div className="max-w-7xl mx-auto pb-20">
          {activeTab === "projects" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Create Project Form */}
              <div className="lg:col-span-1">
                <div className="glass-panel p-8 rounded-2xl border border-white/20 dark:border-slate-800">
                  <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-6">
                    Nuevo Proyecto
                  </h2>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Nombre del Proyecto
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Montevideo Central"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border utilitarian-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Descripción
                      </label>
                      <textarea
                        placeholder="Alcance y región operativa..."
                        value={newProjectDesc}
                        onChange={(e) => setNewProjectDesc(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border utilitarian-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 h-24 resize-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Seleccionar Mapa (Hub)
                      </label>
                      <select
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border utilitarian-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
                        value={newProjectRegion}
                        onChange={(e) => setNewProjectRegion(e.target.value)}
                      >
                        <option value="">-- Seleccionar Mapa --</option>
                        {maps
                          .filter((m) => m.status === "ready")
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1 italic">
                        Solo se muestran mapas con estado "Ready".
                      </p>
                    </div>

                    <button
                      onClick={handleCreateProject}
                      className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:scale-[1.02] active:scale-95 transition-all font-bold text-xs uppercase tracking-widest shadow-xl shadow-primary/20"
                    >
                      <Plus size={16} strokeWidth={3} />
                      Inicializar Proyecto
                    </button>
                  </div>
                </div>
              </div>

              {/* Project List */}
              <div className="lg:col-span-2 space-y-4">
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-6">
                  Sistemas Activos
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map((p, idx) => (
                    <div
                      key={p.id}
                      style={{ animationDelay: `${idx * 50}ms` }}
                      className="group relative bg-white dark:bg-slate-800/40 border utilitarian-border p-6 rounded-2xl hover:border-primary/50 transition-all animate-in fade-in slide-in-from-right-4"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          <Globe size={20} />
                        </div>
                        <button
                          onClick={() => setProjectToDelete(p.id)}
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white mb-1">
                        {p.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mb-4 line-clamp-2">
                        {p.description || "Sin descripción técnica"}
                      </p>

                      <div className="flex flex-col gap-2 mt-auto">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          <MapPin size={10} />
                          {p.map_name || "Sin mapa asociado"}
                        </div>
                        <div
                          className={clsx(
                            "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest",
                            p.routing_engine_url
                              ? "text-emerald-500"
                              : "text-amber-500",
                          )}
                        >
                          <CheckCircle2 size={10} />
                          {p.routing_engine_url
                            ? `Motor listo${p.map_base_port ? ` :${p.map_base_port}` : ""}`
                            : p.map_status
                              ? `Mapa ${String(p.map_status).toUpperCase()}`
                              : "Sin motor routing"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Create User Form */}
              <div className="lg:col-span-1">
                <div className="glass-panel p-8 rounded-2xl border border-white/20 dark:border-slate-800">
                  <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-6">
                    Registrar Usuario
                  </h2>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Username
                      </label>
                      <input
                        type="text"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border utilitarian-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Email corporativo
                      </label>
                      <input
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border utilitarian-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Password temporal
                      </label>
                      <input
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border utilitarian-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Rol del Usuario
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setNewUserRole("operations")}
                          className={clsx(
                            "flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border",
                            newUserRole === "operations"
                              ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                              : "bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-primary/50"
                          )}
                        >
                          Operations
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewUserRole("admin")}
                          className={clsx(
                            "flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border",
                            newUserRole === "admin"
                              ? "bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20"
                              : "bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-amber-500/50"
                          )}
                        >
                          Admin
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 italic">
                        {newUserRole === "admin"
                          ? "Admin: acceso al Centro de Control (Mapas, Proyectos, Usuarios)"
                          : "Operations: acceso a proyectos asignados y editor de mapas"}
                      </p>
                    </div>
                    <button
                      onClick={handleCreateUser}
                      className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:scale-[1.02] active:scale-95 transition-all font-bold text-xs uppercase tracking-widest shadow-xl shadow-primary/20"
                    >
                      <Plus size={16} strokeWidth={3} />
                      Registrar Usuario
                    </button>
                  </div>
                </div>
              </div>

              {/* User List */}
              <div className="lg:col-span-2">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                    Staff de Operaciones
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCheckOrphaned}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300 transition-all rounded-xl border border-amber-300 dark:border-amber-700 disabled:opacity-50"
                      title="Detectar usuarios en BD pero no en Keycloak"
                    >
                      <AlertCircle size={14} />
                      {orphanedUsers ? "Mostrar Huérfanos" : "Detectar Huérfanos"}
                    </button>
                    <button
                      onClick={handleSyncAuth}
                      disabled={syncing}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-all rounded-xl border utilitarian-border disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={clsx(syncing && "animate-spin")} />
                      {syncing ? "Sincronizando..." : "Sincronizar Auth"}
                    </button>
                  </div>
                </div>
                <div className="border utilitarian-border rounded-2xl overflow-hidden bg-white dark:bg-slate-900/30">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 dark:bg-slate-800/40 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 border-b utilitarian-border">
                        <th className="px-6 py-4">Identidad</th>
                        <th className="px-6 py-4">Proyectos Asignados</th>
                        <th className="px-6 py-4 text-center">Rol de Sistema</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y utilitarian-border">
                      {users.map((u, idx) => (
                        <tr
                          key={u.id}
                          style={{ animationDelay: `${idx * 40}ms` }}
                          className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all animate-in fade-in slide-in-from-left-4"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-surface-dark border utilitarian-border flex items-center justify-center text-primary font-bold text-xs">
                                {u.username.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 dark:text-white text-sm">
                                  {u.username}
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  {u.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2 items-center">
                              {(u.projects || []).map((p: any) => (
                                <div
                                  key={p.id}
                                  className="group/badge flex items-center gap-2 px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg text-[10px] font-bold uppercase tracking-tight"
                                >
                                  {p.name}
                                  <button
                                    onClick={() =>
                                      handleRemoveProject(u.id, p.id)
                                    }
                                    className="hover:text-red-500 transition-colors opacity-0 group-hover/badge:opacity-100"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              ))}

                              <div className="relative">
                                <button
                                  onClick={() => setAssigningUser(u)}
                                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-primary transition-all border border-transparent hover:border-primary/20 hover:scale-110 active:scale-95"
                                >
                                  <Plus size={14} strokeWidth={3} />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-widest text-slate-500 rounded-full border utilitarian-border">
                              {u.role || "Operador"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingUser(u);
                                  setEditEmail(u.email);
                                  setEditPassword("");
                                }}
                                className="p-2 text-slate-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-blue-500/10"
                                title="Editar usuario"
                              >
                                <Pencil size={16} />
                              </button>
                              {isSuperAdmin && u.username !== 'superadmin' && (
                                <button
                                  onClick={() => setUserToDelete(u.id)}
                                  className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10"
                                  title="Eliminar usuario"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "maps" && <MapHub />}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!projectToDelete}
        title="Eliminar Proyecto"
        message="¿Estás completamente seguro de eliminar este proyecto? Se perderán todos los datos vinculados de paradas, rutas y segmentos cartográficos. Esta operación es irreversible."
        onConfirm={() =>
          projectToDelete && handleDeleteProject(projectToDelete)
        }
        onCancel={() => setProjectToDelete(null)}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={!!userToDelete}
        title="Dar de Baja Usuario"
        message={`¿Eliminar a ${users.find((u) => u.id === userToDelete)?.username || "este usuario"}? Esta acción es irreversible.`}
        onConfirm={() =>
          userToDelete && handleDeleteUser(userToDelete)
        }
        onCancel={() => setUserToDelete(null)}
        isDestructive={true}
      />

      {/* Orphaned Users Modal */}
      {orphanedUsers && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300"
            onClick={() => !cleanupConfirm && setOrphanedUsers(null)}
          />
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[32px] shadow-[0_0_50px_rgba(0,0,0,0.3)] border utilitarian-border overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b utilitarian-border bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle size={24} className="text-amber-600 dark:text-amber-400" />
                <h3 className="text-base font-display font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  Usuarios Huérfanos
                </h3>
              </div>
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mt-1">
                En BD pero no en Keycloak
              </p>
            </div>

            <div className="p-8">
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {orphanedUsers.totalInDb}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      En BD
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {orphanedUsers.totalInKeycloak}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      En Keycloak
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {orphanedUsers.orphanedCount}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                      Huérfanos
                    </div>
                  </div>
                </div>
              </div>

              {orphanedUsers.orphanedCount > 0 ? (
                <>
                  <div className="mb-6 max-h-[40vh] overflow-y-auto custom-scrollbar">
                    <div className="space-y-2">
                      {orphanedUsers.orphaned.map((user: any) => (
                        <div
                          key={user.id}
                          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border utilitarian-border flex justify-between items-center"
                        >
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white text-sm">
                              {user.username}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {user.email}
                            </div>
                          </div>
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                            HUÉRFANO
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!cleanupConfirm ? (
                    <>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-6 italic">
                        Estos usuarios están en la base de datos pero no existen en Keycloak. Probablemente fueron
                        eliminados de Keycloak manualmente o perdidos en una migración. Puedes limpiarlos de la BD.
                      </p>
                      <div className="space-y-3">
                        <button
                          onClick={() => setCleanupConfirm(true)}
                          disabled={loading}
                          className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors"
                        >
                          {loading ? "Limpiando..." : `🗑️ Limpiar ${orphanedUsers.orphanedCount} Usuario${orphanedUsers.orphanedCount > 1 ? "s" : ""}`}
                        </button>
                        <button
                          onClick={() => setOrphanedUsers(null)}
                          disabled={loading}
                          className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                        <p className="text-sm font-bold text-red-700 dark:text-red-300">
                          ⚠️ Confirmar eliminación
                        </p>
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-2">
                          Se eliminarán permanentemente {orphanedUsers.orphanedCount} usuario{orphanedUsers.orphanedCount > 1 ? "s" : ""} de la base de datos. Esta acción no se puede deshacer.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <button
                          onClick={handleCleanupOrphaned}
                          disabled={loading}
                          className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
                        >
                          {loading ? "Eliminando..." : "✓ Confirmar Eliminación"}
                        </button>
                        <button
                          onClick={() => setCleanupConfirm(false)}
                          disabled={loading}
                          className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors disabled:opacity-50"
                        >
                          Volver
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
                  <p className="text-slate-600 dark:text-slate-400 font-bold">
                    ✅ No hay usuarios huérfanos
                  </p>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Todos los usuarios en BD existen en Keycloak
                  </p>
                  <button
                    onClick={() => setOrphanedUsers(null)}
                    className="mt-6 py-4 px-8 rounded-2xl font-black uppercase tracking-widest text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Editor Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300"
            onClick={() => setEditingUser(null)}
          />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[32px] shadow-[0_0_50px_rgba(0,0,0,0.3)] border utilitarian-border overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-base font-display font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1">
                Editar Usuario
              </h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                {editingUser.username}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <Mail size={12} />
                  Email Corporativo
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border utilitarian-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <Lock size={12} />
                  Nueva Contraseña (opcional)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Dejar vacío para no cambiar"
                  className={clsx(
                    "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border rounded-xl text-sm outline-none focus:ring-2",
                    editPassword
                      ? editPassword.length < 8
                        ? "border-red-300 focus:ring-red-500/20"
                        : "border-green-300 focus:ring-green-500/20"
                      : "utilitarian-border focus:ring-primary/20"
                  )}
                />
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-slate-500 italic">
                    {editPassword
                      ? editPassword.length < 8
                        ? "Mínimo 8 caracteres requeridos"
                        : "Contraseña válida"
                      : "Si dejas vacío, no se modificará la contraseña"}
                  </p>
                  {editPassword && (
                    <span
                      className={clsx(
                        "text-[9px] font-bold",
                        editPassword.length < 8 ? "text-red-500" : "text-green-500"
                      )}
                    >
                      {editPassword.length < 8 ? "✗" : "✓"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 pt-0 space-y-3">
              <button
                onClick={handleEditUser}
                disabled={loading || !editEmail}
                className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading ? "Guardando..." : "Guardar Cambios"}
              </button>
              <button
                onClick={() => setEditingUser(null)}
                disabled={loading}
                className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Assigner Modal Override */}
      {assigningUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300"
            onClick={() => setAssigningUser(null)}
          />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[32px] shadow-[0_0_50px_rgba(0,0,0,0.3)] border utilitarian-border overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b utilitarian-border bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-base font-display font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1">
                Asignar Proyectos
              </h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                Usuario: {assigningUser.username}
              </p>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                {projects.filter(
                  (proj) =>
                    !(assigningUser.projects || []).some(
                      (up: any) => up.id === proj.id,
                    ),
                ).length === 0 ? (
                  <div className="py-12 text-center text-slate-400 uppercase tracking-widest text-[10px] font-black">
                    No hay proyectos disponibles
                  </div>
                ) : (
                  projects
                    .filter(
                      (proj) =>
                        !(assigningUser.projects || []).some(
                          (up: any) => up.id === proj.id,
                        ),
                    )
                    .map((proj) => (
                      <button
                        key={proj.id}
                        onClick={() => {
                          handleAssignProject(assigningUser.id, proj.id);
                          setAssigningUser(null);
                        }}
                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border utilitarian-border hover:border-primary hover:bg-white dark:hover:bg-slate-800 transition-all group"
                      >
                        <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">
                          {proj.name}
                        </span>
                        <Plus
                          size={14}
                          className="text-slate-300 group-hover:text-primary transition-colors"
                        />
                      </button>
                    ))
                )}
              </div>
            </div>

            <div className="p-6 pt-0">
              <button
                onClick={() => setAssigningUser(null)}
                className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
