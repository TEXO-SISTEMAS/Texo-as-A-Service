"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/login", { email, password });

      // Verificar si el usuario tiene sesiones con archivos
      const sesionesRes = await api.get<Array<{ id: number; nombre_sesion: string; created_at: string }>>("/sesiones");
      const sesiones = sesionesRes.data;

      if (sesiones.length > 0) {
        // Buscar la última sesión que tenga archivos subidos
        for (const sesion of sesiones) {
          const archivosRes = await api.get(`/sesiones/${sesion.id}/archivos`);
          if (Array.isArray(archivosRes.data) && archivosRes.data.length > 0) {
            // Tiene archivos, ir directo al chat
            router.push(`/sesion/${sesion.id}/chat`);
            return;
          }
        }
      }

      // No tiene sesiones con archivos, ir a subir archivos
      router.push("/sesion/nueva");
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setError(axiosError.response?.data?.detail ?? "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-executive mb-5 shadow-lg">
            <span className="text-3xl">📊</span>
          </div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">Texo as a Service</h1>
          <p className="text-base text-muted mt-2">Análisis conversacional de datos comerciales</p>
        </div>

        {/* Card */}
        <div className="bg-tertiary border border-subtle rounded-2xl p-10 shadow-lg">
          <div className="mb-6">
            <p className="section-label mb-2 block">Acceso al Sistema</p>
            <h2 className="text-xl font-semibold text-white">Iniciar sesión</h2>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-secondary uppercase tracking-wider">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-white/4 border border-light rounded-xl px-4 py-3.5 text-base text-white placeholder-subtle
                           focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 transition-all"
                placeholder="usuario@empresa.com"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-secondary uppercase tracking-wider">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-white/4 border border-light rounded-xl px-4 py-3.5 text-base text-white placeholder-subtle
                           focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 transition-all"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3">
                <p className="text-danger font-medium text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 btn-primary justify-center py-4"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-subtle mt-8">
          Aplicación local — los datos nunca salen del servidor.
        </p>

        {/* Footer branding */}
        <div className="mt-8 text-center">
          <p className="text-xs" style={{ color: "#4b5563", fontWeight: 500, letterSpacing: "0.03em" }}>
            DANILO SOSA | TEXO SISTEMAS
          </p>
        </div>
      </div>
    </main>
  );
}
