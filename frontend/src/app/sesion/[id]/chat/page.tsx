"use client";

import { useRef, useEffect, useState, KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import MensajeChat from "@/components/MensajeChat";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const SUGERENCIAS = [
  "¿Cuáles son las empresas con mayor facturación?",
  "Mostrá un gráfico comparando inversión en marketing vs facturación",
  "¿Qué empresas aparecen en las 3 fuentes?",
  "¿Cuáles están en DNIT pero no facturaron nada?",
];

export default function ChatPage({ params }: { params: { id: string } }) {
  const sesionId = Number(params.id);
  const router = useRouter();
  const searchParams = useSearchParams();
  const convIdParam = searchParams.get('conv');
  const convId = convIdParam ? Number(convIdParam) : null;
  const { user, loading: authLoading } = useAuth();
  const { mensajes, enviando, error, enviarMensaje, nuevaConversacion } = useChat(sesionId, convId);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  // Escuchar sugerencias desde Sidebar
  useEffect(() => {
    const handleSuggestion = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setInput(customEvent.detail);
      textareaRef.current?.focus();
    };
    window.addEventListener("suggestion-select", handleSuggestion);
    return () => window.removeEventListener("suggestion-select", handleSuggestion);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const handleInput = () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    };
    textarea.addEventListener("input", handleInput);
    return () => textarea.removeEventListener("input", handleInput);
  }, []);

  if (authLoading) return (
    <div className="min-h-screen bg-primary flex items-center justify-center">
      <p className="text-muted text-sm">Cargando...</p>
    </div>
  );
  if (!user) return null;

  const handleEnviar = async () => {
    const texto = input.trim();
    if (!texto || enviando) return;
    setInput("");
    await enviarMensaje(texto);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  return (
    <div className="container">
      {/* Sidebar */}
      <Sidebar sesionId={sesionId} activeSection="chat" />

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <Header
          sessionBadge="Chat con IA"
          sessionNumber={`Sesión #${sesionId}`}
          userName={user.nombre}
          userRole="Admin"
        />

        {/* Chat Body */}
        <div className="chat-body">
          <div className="chat-messages">
            {mensajes.length === 0 && (
              <div className="empty-state">
                <div className="welcome-icon">💬</div>
                <h1 className="welcome-title">Bienvenido, {user.nombre}</h1>
              </div>
            )}

            {mensajes.map((m) => (
              <MensajeChat key={m.id} mensaje={m} />
            ))}

            {/* Indicador de escritura */}
            {enviando && (
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-accent-primary/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                  </svg>
                </div>
                <div className="bg-tertiary border border-subtle rounded-2xl rounded-tl-sm px-5 py-4">
                  <div className="flex gap-1.5 items-center h-5">
                    <div className="w-2 h-2 bg-accent-primary rounded-full animate-bounce [animation-delay:0ms]" />
                    <div className="w-2 h-2 bg-accent-primary rounded-full animate-bounce [animation-delay:150ms]" />
                    <div className="w-2 h-2 bg-accent-primary rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="input-section">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 mb-4">
              <p className="text-danger font-medium text-sm">{error}</p>
            </div>
          )}
          <div className="input-wrapper">
            <div className="input-container">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribí tu pregunta... (Enter para enviar, Shift+Enter para nueva línea)"
                rows={1}
                disabled={enviando}
                className="text-input"
              />
              <button
                onClick={handleEnviar}
                disabled={!input.trim() || enviando}
                className="send-btn"
              >
                <span style={{ fontSize: 18 }}>➤</span>
              </button>
            </div>
            <p className="input-note">
              Los datos nunca salen del servidor local.
            </p>
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
