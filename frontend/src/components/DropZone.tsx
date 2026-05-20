"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { ArchivoSubido } from "@/hooks/useSesion";

interface Props {
  fuenteTipo: "erp" | "dnit" | "adlens_base" | "inversion_en_medios";
  label: string;
  descripcion: string;
  archivo: ArchivoSubido | null;
  uploading: boolean;
  onFile: (file: File) => void;
  esMultiples?: boolean; // Para mostrar layout compacto cuando hay múltiples
}

const FUENTE_BADGE: Record<string, string> = {
  erp:                 "bg-accent-primary/20 text-accent-primary",
  dnit:                "bg-warning/20 text-warning",
  adlens_base:         "bg-danger/20 text-danger",
  inversion_en_medios: "bg-danger/20 text-danger",
};

const FUENTE_BORDER: Record<string, string> = {
  erp:                 "hover:border-accent-primary/50 hover:bg-accent-primary/5",
  dnit:                "hover:border-warning/50 hover:bg-warning/5",
  adlens_base:         "hover:border-danger/50 hover:bg-danger/5",
  inversion_en_medios: "hover:border-danger/50 hover:bg-danger/5",
};

export default function DropZone({ fuenteTipo, label, descripcion, archivo, uploading, onFile, esMultiples = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  const columna = archivo?.columnas_detectadas_json?.columna_nombre_empresa;
  const errorIA = archivo?.columnas_detectadas_json?.error;

  // Clase dinámica de la zona de drop según estado
  let dropClass = `border-light bg-white/4 ${FUENTE_BORDER[fuenteTipo]}`;
  if (dragging) dropClass = "border-accent-primary bg-accent-primary/10";
  else if (archivo) dropClass = "border-success/50 bg-success/5";

  if (esMultiples) {
    // Layout compacto para Adlens (2 archivos)
    return (
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl px-4 py-3 text-center cursor-pointer transition-all
                    flex items-center justify-between gap-3 ${dropClass}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleChange}
        />

        <div className="flex items-center gap-3 flex-1">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
          {archivo && (
            <span className="text-sm text-white truncate">{archivo.nombre_archivo}</span>
          )}
        </div>

        {uploading ? (
          <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin shrink-0" />
        ) : archivo ? (
          <svg className="w-5 h-5 text-success shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <span className="text-sm text-accent-primary shrink-0">+ Subir</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Badge de fuente */}
      <span className={`self-start text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg ${FUENTE_BADGE[fuenteTipo]}`}>
        {label}
      </span>
      <p className="text-sm text-muted leading-relaxed">{descripcion}</p>

      {/* Zona de drop */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all min-h-[140px]
                    flex flex-col items-center justify-center gap-3 ${dropClass}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleChange}
        />

        {uploading ? (
          <>
            <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-secondary">Procesando con IA...</p>
          </>
        ) : archivo ? (
          <>
            <svg className="w-7 h-7 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex flex-col items-center gap-1">
              <p className="text-base font-medium text-white truncate max-w-full px-2">{archivo.nombre_archivo}</p>
              {columna ? (
                <p className="text-sm text-muted">
                  Columna detectada: <span className="text-warning font-medium">{columna}</span>
                </p>
              ) : errorIA ? (
                <p className="text-sm text-warning">IA no disponible — verificar manualmente</p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <svg className="w-10 h-10 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-muted">
              Arrastrá un Excel o{" "}
              <span className="font-semibold text-accent-primary">hacé click</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
