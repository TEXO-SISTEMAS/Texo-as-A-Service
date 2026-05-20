"use client";

import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

export interface Match {
  id: number;
  sesion_id: number;
  entidad_id: number | null;
  fuente1_nombre: string | null;
  fuente2_nombre: string | null;
  fuente3_nombre: string | null;
  score: number | null;
  estado: "auto_confirmado" | "dudoso" | "sin_match" | "corregido";
  corregido_por_usuario: boolean;
}

export function useMatches(sesionId: number) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [cruzando, setCruzando] = useState(false);
  const [error, setError] = useState("");
  const [yaIniciado, setYaIniciado] = useState(false);

  const cargar = useCallback(async (): Promise<Match[]> => {
    setLoading(true);
    try {
      const res = await api.get<Match[]>(`/matches/sesion/${sesionId}`);
      setMatches(res.data);
      return res.data;
    } catch {
      setError("No se pudieron cargar los matches");
      return [];
    } finally {
      setLoading(false);
    }
  }, [sesionId]);

  const ejecutarCruce = useCallback(async () => {
    if (cruzando) return; // Evitar doble ejecución
    setCruzando(true);
    setError("");
    try {
      await api.post(`/sesiones/${sesionId}/cruzar`);
      await cargar();
    } catch {
      setError("Error al ejecutar el cruce de datos");
    } finally {
      setCruzando(false);
    }
  }, [sesionId, cargar, cruzando]);

  // Al montar: carga matches y, si no hay ninguno, dispara el cruce automáticamente
  useEffect(() => {
    let cancelado = false;

    cargar().then((data) => {
      if (!cancelado && data.length === 0) {
        ejecutarCruce();
      }
    });

    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionId]);

  const actualizarMatch = async (
    matchId: number,
    cambios: { estado?: string; entidad_id?: number }
  ) => {
    try {
      const res = await api.patch<Match>(`/matches/${matchId}`, cambios);
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? res.data : m))
      );
    } catch {
      setError("Error al actualizar el match");
    }
  };

  const dudososPendientes = matches.filter((m) => m.estado === "dudoso").length;

  return {
    matches,
    loading,
    cruzando,
    error,
    dudososPendientes,
    ejecutarCruce,
    actualizarMatch,
    recargar: cargar,
  };
}
