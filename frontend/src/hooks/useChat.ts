"use client";

import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

export interface Mensaje {
  id: number;
  rol: "user" | "assistant";
  contenido: string;
  grafico_json: object | null;
  created_at: string;
}

export interface Conversacion {
  id: number;
  sesion_id: number;
  usuario_id: number;
  nombre: string | null;
  created_at: string;
}

export function useChat(sesionId: number, convId?: number | null) {
  const [conversacion, setConversacion] = useState<Conversacion | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Crear o cargar la conversación activa de la sesión
  const iniciarConversacion = useCallback(async () => {
    try {
      if (convId && convId > 0) {
        // Cargar la conversación específica por ID
        const res = await api.get<Conversacion>(`/conversaciones/${convId}`);
        setConversacion(res.data);
        // Cargar historial
        const histRes = await api.get<Mensaje[]>(`/conversaciones/${convId}/mensajes`);
        setMensajes(histRes.data);
      } else {
        // Buscar si ya existe una conversación para esta sesión
        const res = await api.get<Conversacion[]>(`/conversaciones/sesion/${sesionId}`);
        if (res.data.length > 0) {
          const conv = res.data[0]; // la más reciente
          setConversacion(conv);
          // Cargar historial
          const histRes = await api.get<Mensaje[]>(`/conversaciones/${conv.id}/mensajes`);
          setMensajes(histRes.data);
        } else {
          // Crear nueva conversación
          const nueva = await api.post<Conversacion>("/conversaciones", { sesion_id: sesionId });
          setConversacion(nueva.data);
        }
      }
    } catch (err) {
      console.error('[useChat] error al iniciar conversacion:', err);
      setError("No se pudo iniciar la conversación");
    }
  }, [sesionId, convId]);

  useEffect(() => { iniciarConversacion(); }, [iniciarConversacion]);

  const enviarMensaje = async (contenido: string) => {
    if (!conversacion || !contenido.trim()) return;
    setEnviando(true);

    // Agregar mensaje del usuario optimistamente (aparece inmediatamente)
    const msgUsuario: Mensaje = {
      id: Date.now(),
      rol: "user",
      contenido,
      grafico_json: null,
      created_at: new Date().toISOString(),
    };
    setMensajes((prev) => [...prev, msgUsuario]);

    try {
      const res = await api.post(`/conversaciones/${conversacion.id}/mensajes`, {
        contenido,
      });
      console.log('[useChat] respuesta completa:', res.data);
      console.log('[useChat] grafico_json recibido:', res.data.grafico_json);
      const { respuesta, grafico_json, mensaje_id } = res.data;

      const msgAsistente: Mensaje = {
        id: mensaje_id,
        rol: "assistant",
        contenido: respuesta,
        grafico_json: grafico_json ?? null,
        created_at: new Date().toISOString(),
      };
      setMensajes((prev) => [...prev, msgAsistente]);
    } catch {
      setError("Error al enviar el mensaje");
      // Remover el mensaje optimista si falló
      setMensajes((prev) => prev.filter((m) => m.id !== msgUsuario.id));
    } finally {
      setEnviando(false);
    }
  };

  const nuevaConversacion = async () => {
    try {
      const nueva = await api.post<Conversacion>("/conversaciones", { sesion_id: sesionId });
      setConversacion(nueva.data);
      setMensajes([]);
    } catch {
      setError("No se pudo crear nueva conversación");
    }
  };

  return { conversacion, mensajes, enviando, error, enviarMensaje, nuevaConversacion };
}
