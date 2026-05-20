"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POLL_MS = 2000;

const FUENTES = [
  { tipo: "erp",                 label: "ERP",                 necesitaRUC: false },
  { tipo: "adlens_base",         label: "Adlens Base",         necesitaRUC: false },
  { tipo: "inversion_en_medios", label: "Inversión en Medios", necesitaRUC: false },
];

interface FileInfo {
  file: File;
  columnas: string[];
  colRazon: string;
  colRuc: string;
  loadingPreview: boolean;
}

interface JobArchivo {
  nombre: string;
  fuente_tipo: string;
  total: number;
  done: boolean;
  stats: Record<string, number>;
  no_encontrados: { nombre: string; razon_api: string; similitud: number; resultado: string }[];
}

interface JobStatus {
  status: "processing" | "done" | "error";
  progress: number;
  procesadas: number;
  total: number;
  archivos: JobArchivo[];
  error?: string;
}

type Paso = "upload" | "processing" | "done" | "error";

export default function RucPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [archivos, setArchivos] = useState<Partial<Record<string, FileInfo>>>({});
  const [paso, setPaso] = useState<Paso>("upload");
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [sesionId, setSesionId] = useState<number | null>(null);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/sesiones`, { credentials: "include" })
      .then(r => r.json())
      .then(async (sesiones) => {
        if (!Array.isArray(sesiones)) return;
        for (const s of sesiones) {
          const r2 = await fetch(`${API}/sesiones/${s.id}/archivos`, { credentials: "include" });
          const arcs = await r2.json();
          if (Array.isArray(arcs) && arcs.length > 0) {
            setSesionId(s.id);
            return;
          }
        }
      })
      .catch(() => {});
  }, [user]);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };
  useEffect(() => () => stopPoll(), []);

  const startPolling = useCallback((id: string) => {
    stopPoll();
    let fallos = 0;
    const MAX_FALLOS = 5;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/ruc/status/${id}`, { credentials: "include" });
        const data: JobStatus = await res.json();
        fallos = 0;
        setJobStatus(data);
        if (data.status === "done") {
          stopPoll();
          setPaso("done");
        } else if (data.status === "error") {
          stopPoll();
          setErrorMsg(data.error || "Error en el procesamiento");
          setPaso("error");
        }
      } catch {
        fallos++;
        if (fallos >= MAX_FALLOS) {
          stopPoll();
          setErrorMsg("Se perdió la conexión con el servidor");
          setPaso("error");
        }
      }
    }, POLL_MS);
  }, []);

  const handleDrop = async (tipo: string, file: File) => {
    setArchivos(prev => ({
      ...prev,
      [tipo]: { file, columnas: [], colRazon: "", colRuc: "", loadingPreview: true },
    }));
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API}/api/ruc/preview`, { method: "POST", body: form, credentials: "include" });
      const data = await res.json();
      setArchivos(prev => ({
        ...prev,
        [tipo]: {
          file,
          columnas: data.columnas || [],
          colRazon: data.col_empresa_sugerida || "",
          colRuc: data.col_ruc_sugerida || "",
          loadingPreview: false,
        },
      }));
    } catch {
      setArchivos(prev => ({ ...prev, [tipo]: undefined }));
      setErrorMsg(`Error al leer ${file.name}`);
    }
  };

  const handleEnriquecer = async () => {
    const entradas = Object.entries(archivos).filter(([, v]) => v != null) as [string, FileInfo][];
    if (!entradas.length) return;
    setErrorMsg("");
    setPaso("processing");

    const form = new FormData();
    const fuentes: string[] = [];
    const colsRazon: string[] = [];
    const colsRuc: string[] = [];

    for (const [tipo, info] of entradas) {
      form.append("files", info.file);
      fuentes.push(tipo);
      colsRazon.push(info.colRazon);
      colsRuc.push(info.colRuc);
    }
    form.append("fuentes", JSON.stringify(fuentes));
    form.append("cols_razon", JSON.stringify(colsRazon));
    form.append("cols_ruc", JSON.stringify(colsRuc));

    try {
      const res = await fetch(`${API}/api/ruc/enriquecer`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error del servidor");
      jobIdRef.current = data.job_id;
      startTimeRef.current = Date.now();
      setJobStatus({ status: "processing", progress: 0, procesadas: 0, total: data.total, archivos: [] });
      startPolling(data.job_id);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Error al iniciar el proceso");
      setPaso("error");
    }
  };

  const handleDescargar = async () => {
    if (!jobIdRef.current) return;
    const res = await fetch(`${API}/api/ruc/download/${jobIdRef.current}`, { credentials: "include" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "archivos_ruc.zip";
    a.click();
    URL.revokeObjectURL(url);
    fetch(`${API}/api/ruc/job/${jobIdRef.current}`, { method: "DELETE", credentials: "include" }).catch(() => {});
  };

  const resetear = () => {
    stopPoll();
    setArchivos({});
    setPaso("upload");
    setJobStatus(null);
    setErrorMsg("");
    jobIdRef.current = null;
  };

  if (authLoading) return (
    <div className="min-h-screen bg-primary flex items-center justify-center">
      <p className="text-muted text-sm">Cargando...</p>
    </div>
  );
  if (!user) return null;

  const tieneFuentes = Object.keys(archivos).length > 0;

  return (
    <div className="container">
      <Sidebar activeSection="upload" />

      <div className="main-content">
        <Header
          sessionBadge="Enriquecimiento RUC"
          sessionNumber="turuc.com.py"
          userName={user.nombre}
          userRole="Admin"
        />

        <main className="flex-1 overflow-y-auto px-8 py-12">
          <p className="section-label mb-3 block">Datos · RUC</p>
          <h1 className="text-3xl font-semibold text-white mb-2">Enriquecer archivos con RUC</h1>
          <p className="text-base text-muted mb-10 max-w-2xl">
            Subí los Excel de ERP, Adlens Base o Inversión en Medios. El sistema buscará el RUC
            de cada empresa en turuc.com.py y lo agregará como columna al archivo.
          </p>

          {errorMsg && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-6 py-4 mb-8">
              <p className="text-danger font-medium">{errorMsg}</p>
            </div>
          )}

          {/* ── PASO 1: Upload ── */}
          {paso === "upload" && (
            <>
              <div className="grid grid-cols-1 gap-4 mb-10">
                {FUENTES.map(f => (
                  <FuenteCard
                    key={f.tipo}
                    fuente={f}
                    info={archivos[f.tipo] ?? null}
                    onDrop={(file) => handleDrop(f.tipo, file)}
                    onRemove={() => setArchivos(prev => { const n = { ...prev }; delete n[f.tipo]; return n; })}
                    onChange={(campo, val) =>
                      setArchivos(prev => ({
                        ...prev,
                        [f.tipo]: { ...prev[f.tipo]!, [campo]: val },
                      }))
                    }
                  />
                ))}
              </div>

              <div className="flex flex-col items-start gap-4 pt-8 border-t border-light">
                <button
                  onClick={handleEnriquecer}
                  disabled={!tieneFuentes}
                  className="btn-primary disabled:opacity-40 py-4 px-8"
                >
                  Enriquecer con RUC →
                </button>
                {!tieneFuentes && (
                  <p className="text-sm text-subtle">Subí al menos un archivo para continuar.</p>
                )}
              </div>
            </>
          )}

          {/* ── PASO 2: Procesando ── */}
          {paso === "processing" && jobStatus && (
            <div className="card p-8 max-w-xl">
              <p className="text-white font-semibold text-lg mb-6">Consultando turuc.com.py...</p>
              <div className="w-full bg-white/10 rounded-full h-2 mb-3">
                <div
                  className="bg-accent-primary h-2 rounded-full transition-all duration-500"
                  style={{ width: `${jobStatus.progress}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-muted mb-6">
                <span>{jobStatus.procesadas} / {jobStatus.total} filas</span>
                <span>{jobStatus.progress.toFixed(0)}%</span>
              </div>
              {jobStatus.archivos.map(a => (
                <div key={a.nombre} className="flex items-center gap-3 py-2 border-t border-subtle">
                  <span className={`text-sm ${a.done ? "text-success" : "text-muted"}`}>
                    {a.done ? "✓" : "⏳"}
                  </span>
                  <span className="text-sm text-secondary truncate">{a.nombre}</span>
                  {a.done && <span className="text-xs text-muted ml-auto">{a.total} filas</span>}
                </div>
              ))}
              <p className="text-xs text-subtle mt-4">
                {(() => {
                  if (!startTimeRef.current || jobStatus.progress <= 0) return "Calculando tiempo...";
                  const elapsed = (Date.now() - startTimeRef.current) / 1000;
                  const remaining = elapsed * (100 - jobStatus.progress) / jobStatus.progress;
                  if (remaining < 60) return `~${Math.ceil(remaining)}s restantes · No cierres esta página`;
                  return `~${Math.ceil(remaining / 60)} min restantes · No cierres esta página`;
                })()}
              </p>
            </div>
          )}

          {/* ── PASO 3: Resultados ── */}
          {paso === "done" && jobStatus && (
            <>
              <div className="space-y-4 mb-10">
                {jobStatus.archivos.map(a => {
                  const auto = (a.stats.AUTO || 0) + (a.stats.RUC_COMPLETADO || 0);
                  const revisar = a.stats.REVISAR || 0;
                  const sinRuc = (a.stats.NO_MATCH || 0) + (a.stats.NO_ENCONTRADO || 0) + (a.stats.SIN_DATO || 0);
                  const expandido = expandidos[a.nombre] ?? false;
                  const pendientes = a.no_encontrados.length;

                  return (
                    <div key={a.nombre} className="card p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-white font-semibold">{a.nombre}</p>
                          <p className="text-xs text-muted mt-0.5">{a.total} filas · {a.fuente_tipo.toUpperCase()}</p>
                        </div>
                        <div className="flex gap-3">
                          <Stat color="success" label="Con RUC" value={auto} />
                          {revisar > 0 && <Stat color="warning" label="Revisar" value={revisar} />}
                          {sinRuc > 0 && <Stat color="danger" label="Sin RUC" value={sinRuc} />}
                        </div>
                      </div>

                      {pendientes > 0 && (
                        <>
                          <button
                            onClick={() => setExpandidos(p => ({ ...p, [a.nombre]: !expandido }))}
                            className="text-sm text-secondary hover:text-white transition-colors mb-3 flex items-center gap-2"
                          >
                            <span>{expandido ? "▾" : "▸"}</span>
                            {pendientes} nombre{pendientes > 1 ? "s" : ""} sin RUC confirmado
                          </button>

                          {expandido && (
                            <div className="bg-white/4 rounded-lg overflow-hidden">
                              <div className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-subtle text-xs text-muted font-medium">
                                <span>Nombre en archivo</span>
                                <span>Mejor coincidencia API</span>
                                <span>Similitud</span>
                              </div>
                              {a.no_encontrados.map((n, i) => (
                                <div key={i} className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-subtle/50 text-sm">
                                  <span className="text-white truncate">{n.nombre}</span>
                                  <span className="text-muted truncate">{n.razon_api || "—"}</span>
                                  <span className={n.similitud >= 60 ? "text-warning" : "text-danger"}>
                                    {n.similitud > 0 ? `${n.similitud}%` : "—"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3 pt-8 border-t border-light">
                <button onClick={handleDescargar} className="btn-primary py-4 px-8">
                  Descargar ZIP con archivos enriquecidos
                </button>
                {sesionId && (
                  <button
                    onClick={() => router.push(`/sesion/${sesionId}/archivos`)}
                    className="px-6 py-4 rounded-xl text-sm font-medium text-secondary border border-white/20 hover:bg-white/10 transition-all"
                  >
                    Ir a Actualizar Datos →
                  </button>
                )}
                <button
                  onClick={resetear}
                  className="px-6 py-4 rounded-xl text-sm font-medium text-subtle border border-white/10 hover:bg-white/5 transition-all"
                >
                  Nuevo proceso
                </button>
              </div>
            </>
          )}

          {/* ── Error ── */}
          {paso === "error" && (
            <div className="card p-8 max-w-xl">
              <p className="text-danger font-medium mb-4">{errorMsg}</p>
              <button onClick={resetear} className="btn-primary">Reintentar</button>
            </div>
          )}

          <Footer />
        </main>
      </div>
    </div>
  );
}

// ── Componente por fuente ─────────────────────────────────────

interface FuenteCardProps {
  fuente: { tipo: string; label: string; necesitaRUC: boolean };
  info: FileInfo | null;
  onDrop: (f: File) => void;
  onRemove: () => void;
  onChange: (campo: string, val: string) => void;
}

function FuenteCard({ fuente, info, onDrop, onRemove, onChange }: FuenteCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onDrop(file);
  };

  return (
    <div className="bg-tertiary border border-subtle rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-lg bg-accent-primary/20 text-accent-primary">
          {fuente.label}
        </span>
        {fuente.necesitaRUC && (
          <span className="text-xs text-muted">Completará dígito verificador del RUC existente</span>
        )}
        {!fuente.necesitaRUC && (
          <span className="text-xs text-muted">Buscará RUC por nombre de empresa en turuc.com.py</span>
        )}
      </div>

      {!info ? (
        <div
          className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center cursor-pointer
                     hover:border-accent-primary/40 hover:bg-white/2 transition-all"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDragDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={e => { if (e.target.files?.[0]) onDrop(e.target.files[0]); }}
          />
          <p className="text-sm text-secondary">Arrastrá o hacé click para subir</p>
          <p className="text-xs text-subtle mt-1">.xlsx / .xls</p>
        </div>
      ) : info.loadingPreview ? (
        <div className="py-4 text-center text-sm text-muted">Leyendo columnas...</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white truncate max-w-xs">{info.file.name}</span>
            <button onClick={onRemove} className="text-xs text-danger hover:text-danger/80 transition-colors">
              Quitar
            </button>
          </div>

          {!fuente.necesitaRUC && (
            <ColDropdown
              label="Columna de empresa / razón social"
              value={info.colRazon}
              opciones={info.columnas}
              onChange={v => onChange("colRazon", v)}
            />
          )}

          {fuente.necesitaRUC && (
            <ColDropdown
              label="Columna de RUC (sin dígito verificador)"
              value={info.colRuc}
              opciones={info.columnas}
              onChange={v => onChange("colRuc", v)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ColDropdown({ label, value, opciones, onChange }: {
  label: string; value: string; opciones: string[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };

  const DROPDOWN_MAX_H = 240;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const list = open && rect ? createPortal(
    <div
      style={{
        position: "fixed",
        top: rect.bottom + 4 + DROPDOWN_MAX_H > window.innerHeight
          ? rect.top - DROPDOWN_MAX_H - 4
          : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      }}
      className="bg-[#1a1f2e] border border-white/20 rounded-lg shadow-xl max-h-60 overflow-y-auto"
    >
      <div
        onMouseDown={(e) => { e.preventDefault(); onChange(""); setOpen(false); }}
        className="px-3 py-2 text-sm text-subtle hover:bg-white/10 cursor-pointer"
      >
        — Elegir columna —
      </div>
      {opciones.map(c => (
        <div
          key={c}
          onMouseDown={(e) => { e.preventDefault(); onChange(c); setOpen(false); }}
          className={`px-3 py-2 text-sm cursor-pointer transition-colors
            ${value === c ? "bg-accent-primary/20 text-accent-primary" : "text-white hover:bg-white/10"}`}
        >
          {c}
        </div>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapRef}>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between border border-white/20 rounded-lg px-3 py-2
                   text-sm text-white bg-white/5 hover:bg-white/10 transition-all focus:outline-none
                   focus:border-accent-primary"
      >
        <span className={value ? "text-white" : "text-subtle"}>{value || "— Elegir columna —"}</span>
        <span className="text-muted text-xs ml-2">{open ? "▲" : "▼"}</span>
      </button>
      {list}
    </div>
  );
}

function Stat({ color, label, value }: { color: string; label: string; value: number }) {
  const cls: Record<string, string> = {
    success: "bg-success/10 border-success/30 text-success",
    warning: "bg-warning/10 border-warning/30 text-warning",
    danger:  "bg-danger/10 border-danger/30 text-danger",
  };
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg border text-center ${cls[color] ?? ""}`}>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
