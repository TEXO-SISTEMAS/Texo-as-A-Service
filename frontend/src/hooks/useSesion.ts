"use client";

import { useState } from "react";
import api from "@/lib/api";

export interface ArchivoSubido {
  id: number;
  fuente_tipo: string;
  nombre_archivo: string;
  columnas_detectadas_json: {
    columna_nombre_empresa: string | null;
    otras_columnas?: Record<string, string>;
    error?: string;
  } | null;
}

export interface Sesion {
  id: number;
  nombre_sesion: string;
}

export function useSesion() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [archivos, setArchivos] = useState<Record<string, ArchivoSubido>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const crearSesion = async (nombre: string) => {
    setLoading(true);
    try {
      const res = await api.post<Sesion>("/sesiones", { nombre_sesion: nombre });
      setSesion(res.data);
      return res.data;
    } catch {
      setError("No se pudo crear la sesión");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const subirArchivo = async (
    sesionId: number,
    fuenteTipo: string,
    file: File
  ): Promise<ArchivoSubido | null> => {
    const formData = new FormData();
    formData.append("fuente_tipo", fuenteTipo);
    formData.append("file", file);

    try {
      const res = await api.post<ArchivoSubido>(
        `/sesiones/${sesionId}/archivos`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setArchivos((prev) => ({ ...prev, [fuenteTipo]: res.data }));
      return res.data;
    } catch {
      setError(`Error al subir archivo ${fuenteTipo}`);
      return null;
    }
  };

  return { sesion, archivos, loading, error, crearSesion, subirArchivo };
}
