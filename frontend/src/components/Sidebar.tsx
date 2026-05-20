"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

interface Sesion {
  id: number;
  usuario_id: number;
  nombre_sesion: string | null;
  created_at: string;
}

interface Conversacion {
  id: number;
  sesion_id: number;
  usuario_id: number;
  nombre: string | null;
  created_at: string;
}

interface SidebarProps {
  activeSection?: "chat" | "matches" | "dashboard" | "upload";
  sesionId?: number;
}

export default function Sidebar({ activeSection = "chat", sesionId }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuth();
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNombre, setEditingNombre] = useState("");
  const [loading, setLoading] = useState(false);

  // Cargar conversaciones de la sesión activa
  const cargarConversaciones = (merge = false) => {
    if (!sesionId) return;

    if (!merge) setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/conversaciones/sesion/${sesionId}`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        const nuevas = Array.isArray(data) ? data : [];
        if (merge) {
          // Merge inteligente: solo actualiza lo que cambió
          setConversaciones(prev =>
            nuevas.map(nueva => {
              const existente = prev.find(p => p.id === nueva.id);
              return existente?.nombre === nueva.nombre ? existente : nueva;
            })
          );
        } else {
          setConversaciones(nuevas);
        }
        if (!merge) setLoading(false);
      })
      .catch((err) => {
        console.error('[sidebar] error al cargar conversaciones:', err);
        if (!merge) setLoading(false);
      });
  };

  useEffect(() => {
    cargarConversaciones();
  }, [sesionId]);

  // Eliminar conversación
  const handleEliminarConversacion = async (convId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar esta conversación?")) return;

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/conversaciones/${convId}`, {
        method: "DELETE",
        credentials: 'include',
      });
      setConversaciones(prev => prev.filter(c => c.id !== convId));
    } catch (err) {
      console.error("Error al eliminar:", err);
    }
  };

  // Iniciar edición inline
  const handleDobleClick = (conv: Conversacion) => {
    setEditingId(conv.id);
    setEditingNombre(conv.nombre || `Conversación #${conv.id}`);
  };

  // Guardar edición
  const handleGuardarNombre = async () => {
    if (!editingId) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/conversaciones/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: editingNombre }),
        credentials: 'include',
      });

      if (res.ok) {
        setConversaciones(prev =>
          prev.map(c => c.id === editingId ? { ...c, nombre: editingNombre } : c)
        );
      }
    } catch (err) {
      console.error("Error al actualizar:", err);
    }

    setEditingId(null);
    setEditingNombre("");
  };

  // Navegar a conversación
  const handleSeleccionar = (convId: number) => {
    router.push(`/sesion/${sesionId}/chat?conv=${convId}`);
  };

  // Nueva conversación en la sesión actual
  const handleNuevaConversacion = async () => {
    if (!sesionId) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/conversaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesion_id: sesionId }),
        credentials: 'include',
      });
      const nueva = await res.json();
      router.push(`/sesion/${sesionId}/chat?conv=${nueva.id}`);
    } catch (err) {
      console.error("Error al crear conversación:", err);
    }
  };

  return (
    <aside className="sidebar">
      {/* Header con logo */}
      <div className="sidebar-header">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-executive flex items-center justify-center">
            <span className="text-lg">📊</span>
          </div>
          <span className="text-lg font-semibold text-white tracking-tight">Texo as a Service</span>
        </div>
        <p className="text-sm text-muted ml-11">Análisis Inteligente</p>
      </div>

      {/* Botón Nueva conversación */}
      {sesionId && (
        <div className="px-4 py-5 border-b border-subtle">
          <button
            onClick={handleNuevaConversacion}
            className="btn-primary w-full justify-center"
          >
            <span>➕</span>
            Nueva conversación
          </button>
        </div>
      )}

      {/* Historial de conversaciones */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {sesionId ? (
          <>
            <div className="section-label mb-3 px-2 block">Conversaciones</div>

            {loading && (
              <div className="text-muted text-sm px-2 py-3">Cargando...</div>
            )}

            {!loading && conversaciones.length === 0 && (
              <div className="text-muted text-sm px-2 py-3">
                No hay conversaciones en esta sesión
              </div>
            )}

            {conversaciones.map((conv) => {
              const isActive = pathname.includes(`conv=${conv.id}`);

              return (
                <div
                  key={conv.id}
                  onClick={() => handleSeleccionar(conv.id)}
                  className={`group flex items-center justify-between p-3.5 mb-1.5 rounded-lg transition-all cursor-pointer
                    ${isActive
                      ? "bg-blue-500/10 border border-blue-500/20"
                      : "bg-transparent border border-transparent hover:bg-white/5 hover:border-white/10"
                    }`}
                >
                  {editingId === conv.id ? (
                    <input
                      type="text"
                      value={editingNombre}
                      onChange={(e) => setEditingNombre(e.target.value)}
                      onBlur={handleGuardarNombre}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleGuardarNombre();
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setEditingNombre("");
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="w-full bg-transparent text-white border border-blue-500 rounded px-2 py-0.5 outline-none text-sm"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-secondary leading-relaxed truncate">
                      {conv.nombre || `Conversación #${conv.id}`}
                    </span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDobleClick(conv);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                      title="Renombrar"
                    >
                      <span className="text-sm text-secondary">✏️</span>
                    </button>
                    <button
                      onClick={(e) => handleEliminarConversacion(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-danger/20 rounded transition-all"
                      title="Eliminar conversación"
                    >
                      <span className="text-sm text-danger">🗑</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <div className="section-label mb-3 px-2 block">Menú</div>
            <Link
              href="/dashboard"
              className={`flex items-center gap-3 px-3 py-3 text-sm rounded-lg transition-all mb-1
                ${pathname === '/dashboard' ? 'bg-white/10 text-white' : 'text-muted hover:bg-white/5 hover:text-white'}`}
            >
              <span>🎯</span>
              Dashboard
            </Link>
          </>
        )}
      </div>

      {/* Navegación footer */}
      <nav className="px-4 py-5 border-t border-subtle">
        {sesionId && (
          <Link
            href={`/sesion/${sesionId}/matches`}
            className="flex items-center gap-3 px-3 py-3 text-sm text-muted
                       hover:text-white hover:bg-white/40 rounded-lg transition-all mb-1"
          >
            <span>📈</span>
            Ver matches
          </Link>
        )}

        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 py-3 text-sm text-muted
                     hover:text-white hover:bg-white/40 rounded-lg transition-all mb-1"
        >
          <span>🎯</span>
          Dashboard
        </Link>

        <Link
          href="/ruc"
          className="flex items-center gap-3 px-3 py-3 text-sm text-muted
                     hover:text-white hover:bg-white/40 rounded-lg transition-all mb-1"
        >
          <span>🔍</span>
          Enriquecer RUC
        </Link>

        {sesionId && (
          <Link
            href={`/sesion/${sesionId}/archivos`}
            className="flex items-center gap-3 px-3 py-3 text-sm text-muted
                       hover:text-white hover:bg-white/40 rounded-lg transition-all"
          >
            <span>📤</span>
            Actualizar datos
          </Link>
        )}

        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-3 text-sm text-muted
                     hover:text-danger hover:bg-danger/10 rounded-lg transition-all w-full text-left"
        >
          <span>🚪</span>
          Cerrar sesión
        </button>
      </nav>
    </aside>
  );
}
