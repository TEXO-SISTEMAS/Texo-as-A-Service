"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import DropZone from "@/components/DropZone";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import api from "@/lib/api";
import type { ArchivoSubido } from "@/hooks/useSesion";

const FUENTES = [
  { tipo: "erp" as const,            label: "ERP",       descripcion: "Datos de facturación: nombre cliente, monto, fecha, producto" },
  { tipo: "dnit" as const,           label: "DNIT",      descripcion: "Posicionamiento: nombre empresa, RUC, categoría, ranking" },
  { tipo: "adlens" as const,         label: "Adlens",    descripcion: "Base de datos Adlens: anunciante, rubro, cluster, puntajes", esGrupo: true },
];

export default function ActualizarArchivosPage({ params }: { params: { id: string } }) {
  const sesionId = Number(params.id);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [archivos, setArchivos] = useState<Record<string, ArchivoSubido>>({});
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cruzando, setCruzando] = useState(false);

  // Cargar archivos ya existentes en esta sesión
  useEffect(() => {
    if (!sesionId) return;
    api.get<ArchivoSubido[]>(`/sesiones/${sesionId}/archivos`)
      .then(res => {
        const mapa: Record<string, ArchivoSubido> = {};
        res.data.forEach(a => { mapa[a.fuente_tipo] = a; });
        setArchivos(mapa);
      })
      .catch(() => setError("No se pudieron cargar los archivos existentes"));
  }, [sesionId]);

  const handleFile = async (fuenteTipo: string, file: File) => {
    setUploadingTipo(fuenteTipo);
    setError("");
    const formData = new FormData();
    formData.append("fuente_tipo", fuenteTipo);
    formData.append("file", file);
    try {
      const res = await api.post<ArchivoSubido>(
        `/sesiones/${sesionId}/archivos`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setArchivos(prev => ({ ...prev, [fuenteTipo]: res.data }));
    } catch {
      setError(`Error al subir archivo ${fuenteTipo}`);
    } finally {
      setUploadingTipo(null);
    }
  };

  const handleCruzar = async () => {
    setCruzando(true);
    setError("");
    try {
      await api.post(`/sesiones/${sesionId}/cruzar`);
      router.push(`/sesion/${sesionId}/matches`);
    } catch {
      setError("Error al ejecutar el cruce de datos");
      setCruzando(false);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-primary flex items-center justify-center">
      <p className="text-muted text-sm">Cargando...</p>
    </div>
  );
  if (!user) return null;

  const tieneArchivos = Object.keys(archivos).length > 0;

  return (
    <div className="container">
      <Sidebar sesionId={sesionId} activeSection="upload" />

      <div className="main-content">
        <Header
          sessionBadge="Actualizar Datos"
          sessionNumber={`Sesión #${sesionId}`}
          userName={user.nombre}
          userRole="Admin"
        />

        <main className="flex-1 overflow-y-auto px-8 py-12">
          <p className="section-label mb-3 block">Gestión de Datos</p>
          <h1 className="text-3xl font-semibold text-white mb-2">Actualizar archivos</h1>
          <p className="text-base text-muted mb-10 max-w-2xl">
            Reemplazá uno o más archivos. Las conversaciones existentes se mantienen.
            Al confirmar se volverá a ejecutar el cruce de datos con los archivos nuevos.
          </p>

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-6 py-4 mb-8">
              <p className="text-danger font-medium">{error}</p>
            </div>
          )}

          <p className="section-label text-subtle mb-4 block">Fuentes de datos</p>
          <div className="grid grid-cols-3 gap-6 mb-10">
            {FUENTES.map((f) => {
              if (f.esGrupo) {
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

          <div className="flex flex-col items-start gap-4 pt-8 border-t border-light">
            <div className="flex gap-3">
              <button
                onClick={handleCruzar}
                disabled={!tieneArchivos || cruzando}
                className="btn-primary disabled:opacity-40 py-4 px-8"
              >
                {cruzando ? "Cruzando datos..." : "Confirmar y revisar matches →"}
              </button>
              <button
                onClick={() => router.push(`/sesion/${sesionId}/chat`)}
                className="px-6 py-4 rounded-xl text-sm font-medium text-secondary border border-white/20 hover:bg-white/10 transition-all"
              >
                Volver al chat
              </button>
            </div>
            {!tieneArchivos && (
              <p className="text-sm text-subtle">Subí al menos un archivo para continuar.</p>
            )}
          </div>

          <Footer />
        </main>
      </div>
    </div>
  );
}
