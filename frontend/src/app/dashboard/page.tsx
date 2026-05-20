"use client";

import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [ultimaSesion, setUltimaSesion] = useState<Sesion | null>(null);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [loadingSesiones, setLoadingSesiones] = useState(true);

  useEffect(() => {
    if (!user) return;

    const cargarUltimaSesion = async () => {
      try {
        const sesionesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/sesiones`, {
          credentials: 'include'
        });
        const sesiones = await sesionesRes.json();

        if (Array.isArray(sesiones) && sesiones.length > 0) {
          // Buscar la última sesión con archivos (ya vienen ordenadas por created_at DESC)
          for (const sesion of sesiones) {
            const archivosRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/sesiones/${sesion.id}/archivos`, {
              credentials: 'include'
            });
            const archivos = await archivosRes.json();

            if (Array.isArray(archivos) && archivos.length > 0) {
              setUltimaSesion(sesion);

              // Cargar conversaciones de esta sesión
              const convRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/conversaciones/sesion/${sesion.id}`, {
                credentials: 'include'
              });
              const convs = await convRes.json();
              setConversaciones(Array.isArray(convs) ? convs : []);

              // Redirigir automáticamente al chat de la última sesión
              router.push(`/sesion/${sesion.id}/chat`);
              break;
            }
          }
        }
      } catch (err) {
        console.error('Error al cargar sesiones:', err);
      } finally {
        setLoadingSesiones(false);
      }
    };

    cargarUltimaSesion();
  }, [user]);

  if (loading || loadingSesiones) return (
    <div className="min-h-screen bg-primary flex items-center justify-center">
      <p className="text-muted text-sm">Cargando...</p>
    </div>
  );
  if (!user) return null;

  const handleContinuarAnalisis = () => {
    if (ultimaSesion) {
      router.push(`/sesion/${ultimaSesion.id}/chat`);
    }
  };

  const handleSeleccionarConversacion = (convId: number) => {
    if (ultimaSesion) {
      router.push(`/sesion/${ultimaSesion.id}/chat?conv=${convId}`);
    }
  };

  return (
    <div className="container">
      {/* Sidebar */}
      <Sidebar activeSection="dashboard" />

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <Header
          sessionBadge="Dashboard"
          userName={user.nombre}
          userRole="Admin"
        />

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto px-8 py-12">
          <div className="mb-12">
            <p className="section-label mb-3 block">Panel Principal</p>
            <h1 className="text-4xl font-semibold text-white mb-2">
              Bienvenido, {user.nombre}
            </h1>
            <p className="text-lg text-muted max-w-2xl">
              Sistema de análisis conversacional de datos comerciales.
            </p>
          </div>

          {ultimaSesion ? (
            <>
              {/* Tarjeta de sesión activa */}
              <div className="card bg-gradient-to-br from-accent-primary/10 to-accent-secondary/5 border-accent-primary/20 p-8 mb-8">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted mb-1">Última sesión activa</p>
                    <h2 className="text-2xl font-semibold text-white mb-2">
                      {ultimaSesion.nombre_sesion || `Sesión #${ultimaSesion.id}`}
                    </h2>
                    <p className="text-secondary text-base mb-6 max-w-lg">
                      Tenés {conversaciones.length} conversacion{conversaciones.length !== 1 ? 'es' : 'es'} sobre estos datos.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleContinuarAnalisis}
                        className="btn-primary"
                      >
                        Continuar análisis
                      </button>
                      <button
                        onClick={() => router.push(`/sesion/${ultimaSesion.id}/archivos`)}
                        className="px-5 py-3 rounded-xl text-sm font-medium text-secondary border border-white/20 hover:bg-white/10 transition-all"
                      >
                        Actualizar datos
                      </button>
                    </div>
                  </div>
                  <div className="w-20 h-20 rounded-2xl bg-accent-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-5xl">📊</span>
                  </div>
                </div>
              </div>

              {/* Conversaciones recientes */}
              {conversaciones.length > 0 && (
                <div>
                  <p className="section-label text-subtle mb-4 block">Conversaciones recientes</p>
                  <div className="grid gap-3">
                    {conversaciones.slice(0, 5).map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => handleSeleccionarConversacion(conv.id)}
                        className="flex items-center justify-between p-4 rounded-xl bg-tertiary border border-subtle hover:border-accent-primary/30 transition-all text-left"
                      >
                        <div>
                          <p className="text-white font-medium">
                            {conv.nombre || `Conversación #${conv.id}`}
                          </p>
                          <p className="text-sm text-muted mt-1">
                            {new Date(conv.created_at).toLocaleDateString("es-PY", {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <span className="text-muted">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* No hay sesión activa - mostrar botón para crear */
            <div className="card bg-gradient-to-br from-accent-primary/10 to-accent-secondary/5 border-accent-primary/20 p-8">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">Comenzar nuevo análisis</h2>
                  <p className="text-secondary text-base mb-6 max-w-lg">
                    Subí tus archivos Excel para comenzar a analizar los datos cruzados entre ERP, DNIT y Marketing.
                  </p>
                  <button
                    onClick={() => router.push("/sesion/nueva")}
                    className="btn-primary"
                  >
                    <span className="text-2xl leading-none">+</span>
                    Cargar datos
                  </button>
                </div>
                <div className="w-20 h-20 rounded-2xl bg-accent-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-5xl">📊</span>
                </div>
              </div>
            </div>
          )}

          {/* Sección de logout */}
          <div className="mt-8 flex items-center gap-4">
            <button
              onClick={logout}
              className="text-sm text-muted hover:text-white transition-colors border border-white/20 px-4 py-2 rounded-lg hover:bg-white/10"
            >
              Cerrar sesión
            </button>
          </div>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
