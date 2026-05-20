"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSesion } from "@/hooks/useSesion";
import DropZone from "@/components/DropZone";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import api from "@/lib/api";

const FUENTES = [
  { tipo: "erp" as const,            label: "ERP",       descripcion: "Datos de facturación: nombre cliente, monto, fecha, producto" },
  { tipo: "dnit" as const,           label: "DNIT",      descripcion: "Posicionamiento: nombre empresa, RUC, categoría, ranking" },
  { tipo: "adlens" as const,         label: "Adlens",    descripcion: "Base de datos Adlens: anunciante, rubro, cluster, puntajes", esGrupo: true },
];

export default function NuevaSesionPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { sesion, archivos, error, crearSesion, subirArchivo } = useSesion();
  const [nombreSesion, setNombreSesion] = useState("");
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  // Si ya existe una sesión con archivos, redirigir directamente a actualizarla
  useEffect(() => {
    if (!user) return;
    api.get<{ id: number; nombre_sesion: string }[]>("/sesiones")
      .then(async res => {
        const sesiones = res.data;
        if (!Array.isArray(sesiones) || sesiones.length === 0) return;
        for (const s of sesiones) {
          const archivosRes = await api.get<{ id: number }[]>(`/sesiones/${s.id}/archivos`);
          if (archivosRes.data.length > 0) {
            router.replace(`/sesion/${s.id}/archivos`);
            return;
          }
        }
      })
      .catch(() => {});
  }, [user]);

  if (authLoading) return (
    <div className="min-h-screen bg-primary flex items-center justify-center">
      <p className="text-muted text-sm">Cargando...</p>
    </div>
  );
  if (!user) return null;

  const puedeConfirmar = Object.keys(archivos).length > 0;

  const handleCrearSesion = async () => {
    if (!nombreSesion.trim()) return;
    setCreando(true);
    await crearSesion(nombreSesion.trim());
    setCreando(false);
  };

  const handleFile = async (fuenteTipo: string, file: File) => {
    let sesionActual = sesion;
    if (!sesionActual) {
      const nombre = nombreSesion.trim() || `Sesión ${new Date().toLocaleDateString("es-PY")}`;
      sesionActual = await crearSesion(nombre);
      if (!sesionActual) return;
    }
    setUploadingTipo(fuenteTipo);
    await subirArchivo(sesionActual.id, fuenteTipo, file);
    setUploadingTipo(null);
  };

  const handleConfirmar = () => {
    if (sesion) router.push(`/sesion/${sesion.id}/matches`);
  };

  return (
    <div className="container">
      {/* Sidebar */}
      <Sidebar activeSection="upload" />

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <Header
          sessionBadge="Importar Datos"
          sessionNumber={sesion ? `Sesión #${sesion.id}` : "Excel → JARVIS"}
          userName={user.nombre}
          userRole="Admin"
        />

        <main className="flex-1 overflow-y-auto px-8 py-12">
          <p className="section-label mb-3 block">Carga de Datos</p>
          <h1 className="text-3xl font-semibold text-white mb-2">Nueva sesión de análisis</h1>
          <p className="text-base text-muted mb-10 max-w-2xl">
            Subí los archivos Excel de cada fuente. La IA detectará automáticamente qué columna contiene el nombre del cliente.
          </p>

          {/* Nombre de sesión */}
          <div className="bg-tertiary border border-subtle rounded-xl p-6 mb-10">
            <label className="block text-sm font-medium text-secondary mb-3">Nombre de la sesión (opcional)</label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Ej: Análisis Trimestre 1, Auditoría 2024..."
                value={nombreSesion}
                onChange={(e) => setNombreSesion(e.target.value)}
                disabled={!!sesion}
                className="flex-1 bg-white/4 border border-light rounded-lg px-4 py-3 text-base text-white
                           placeholder-subtle focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20
                           disabled:opacity-50 transition-all"
              />
              {!sesion && (
                <button
                  onClick={handleCrearSesion}
                  disabled={!nombreSesion.trim() || creando}
                  className="btn-primary disabled:opacity-40 py-3 px-6"
                >
                  {creando ? "Creando..." : "Crear sesión"}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-6 py-4 mb-8">
              <p className="text-danger font-medium">{error}</p>
            </div>
          )}

          {/* Drop zones */}
          <p className="section-label text-subtle mb-4 block">Fuentes de datos disponibles</p>
          <div className="grid grid-cols-3 gap-6 mb-10">
            {FUENTES.map((f) => {
              if (f.esGrupo) {
                // Adlens: 2 zonas de carga (adlens_base e inversion_en_medios)
                return (
                  <div key={f.tipo} className="flex flex-col gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-danger/20 text-danger self-start">
                      {f.label}
                    </span>
                    <p className="text-sm text-muted leading-relaxed">{f.descripcion}</p>
                    <div className="flex flex-col gap-2">
                      <DropZone
                        fuenteTipo="adlens_base"
                        label="Adlens_base"
                        descripcion=""
                        archivo={archivos["adlens_base"] ?? null}
                        uploading={uploadingTipo === "adlens_base"}
                        onFile={(file) => handleFile("adlens_base", file)}
                        esMultiples
                      />
                      <DropZone
                        fuenteTipo="inversion_en_medios"
                        label="Inversión en Medios"
                        descripcion=""
                        archivo={archivos["inversion_en_medios"] ?? null}
                        uploading={uploadingTipo === "inversion_en_medios"}
                        onFile={(file) => handleFile("inversion_en_medios", file)}
                        esMultiples
                      />
                    </div>
                  </div>
                );
              }
              return (
                <DropZone
                  key={f.tipo}
                  fuenteTipo={f.tipo}
                  label={f.label}
                  descripcion={f.descripcion}
                  archivo={archivos[f.tipo] ?? null}
                  uploading={uploadingTipo === f.tipo}
                  onFile={(file) => handleFile(f.tipo, file)}
                />
              );
            })}
          </div>

          {/* Footer de acción */}
          <div className="flex flex-col items-start gap-4 pt-8 border-t border-light">
            <button
              onClick={handleConfirmar}
              disabled={!puedeConfirmar}
              className="btn-primary disabled:opacity-40 py-4 px-8"
            >
              Confirmar y continuar al cruce de datos →
            </button>
            {!puedeConfirmar && (
              <p className="text-sm text-subtle">Subí al menos un archivo para continuar.</p>
            )}
          </div>

          <Footer />
        </main>
      </div>
    </div>
  );
}
