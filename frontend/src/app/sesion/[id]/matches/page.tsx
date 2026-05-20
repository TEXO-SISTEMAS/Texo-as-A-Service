"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useMatches } from "@/hooks/useMatches";
import SeccionMatches from "@/components/SeccionMatches";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function MatchesPage({ params }: { params: { id: string } }) {
  const sesionId = Number(params.id);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { matches, loading, cruzando, error, dudososPendientes, ejecutarCruce, actualizarMatch } = useMatches(sesionId);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-primary flex items-center justify-center">
      <p className="text-muted text-sm">Cargando...</p>
    </div>
  );
  if (!user) return null;

  const automaticos     = matches.filter((m) => m.estado === "auto_confirmado");
  const dudosos         = matches.filter((m) => m.estado === "dudoso");
  const sinMatch        = matches.filter((m) => m.estado === "sin_match");
  const corregidos      = matches.filter((m) => m.estado === "corregido");
  const hayMatches      = matches.length > 0;
  const puedeIrAlChat   = hayMatches && dudososPendientes === 0;

  return (
    <div className="container">
      {/* Sidebar */}
      <Sidebar sesionId={sesionId} activeSection="matches" />

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <Header
          sessionBadge="Revisión de Matches"
          sessionNumber={`Sesión #${sesionId}`}
          userName={user.nombre}
          userRole="Admin"
        />

        <main className="flex-1 overflow-y-auto px-8 py-12">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-6 py-4 mb-8">
              <p className="text-danger font-medium">{error}</p>
            </div>
          )}

          {/* Estado inicial: no hay matches aún */}
          {!hayMatches && (
            <div className="card bg-gradient-to-br from-accent-primary/10 to-accent-secondary/5 border-accent-primary/20 p-10">
              <div>
                <p className="section-label mb-2 block">Estado del Cruce</p>
                <p className="text-white font-semibold text-lg">No se ejecutó el cruce de datos todavía</p>
                <p className="text-secondary text-base mt-2 max-w-xl">
                  El motor analizará los archivos subidos en 3 capas: match exacto → fuzzy → semántico.
                </p>
              </div>
              <button
                onClick={ejecutarCruce}
                disabled={cruzando}
                className="btn-primary mt-6"
              >
                {cruzando && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {cruzando ? "Cruzando datos..." : "Ejecutar cruce de datos"}
              </button>
            </div>
          )}

          {hayMatches && (
            <>
              {/* Semáforo resumen */}
              <div className="flex items-center gap-4 mb-8">
                <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-lg px-4 py-2">
                  <span className="text-lg">✓</span>
                  <span className="text-sm font-semibold text-success">{automaticos.length + corregidos.length}</span>
                </div>
                <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-lg px-4 py-2">
                  <span className="text-lg">⚠</span>
                  <span className="text-sm font-semibold text-warning">{dudosos.length}</span>
                </div>
                <div className="flex items-center gap-2 bg-danger/10 border border-danger/30 rounded-lg px-4 py-2">
                  <span className="text-lg">✗</span>
                  <span className="text-sm font-semibold text-danger">{sinMatch.length}</span>
                </div>
                <button
                  onClick={ejecutarCruce}
                  disabled={cruzando}
                  className="ml-2 text-sm text-secondary hover:text-white transition-colors border border-white/20 hover:border-white/40
                             rounded-lg px-4 py-2 disabled:opacity-40"
                >
                  {cruzando ? "Recalculando..." : "↺ Recalcular"}
                </button>
              </div>

              {/* Dudosos primero — requieren acción */}
              <SeccionMatches
                titulo="⚠  Matches dudosos — requieren tu confirmación"
                color="#f59e0b"
                bgHeader="rgba(245, 158, 11, 0.08)"
                matches={dudosos}
                emptyMsg="No hay matches dudosos. ¡Podés continuar al chat!"
                onConfirmar={(id) => actualizarMatch(id, { estado: "auto_confirmado" })}
                onRechazar={(id) => actualizarMatch(id, { estado: "sin_match" })}
              />

              <SeccionMatches
                titulo="✓  Matches automáticos"
                color="#10b981"
                bgHeader="rgba(16, 185, 129, 0.08)"
                matches={[...automaticos, ...corregidos]}
                emptyMsg="No hay matches automáticos aún."
                onDeshacer={(id) => actualizarMatch(id, { estado: "dudoso" })}
              />

              <SeccionMatches
                titulo="✗  Sin match"
                color="#ef4444"
                bgHeader="rgba(239, 68, 68, 0.08)"
                matches={sinMatch}
                emptyMsg="Todas las empresas pudieron cruzarse."
              />
            </>
          )}

          {/* Footer de acción */}
          <div className="mt-8 pt-8 border-t border-light flex flex-col items-start gap-4 mb-8">
            {dudososPendientes > 0 && (
              <div className="bg-warning/10 border border-warning/30 rounded-xl px-6 py-4">
                <p className="text-warning font-medium text-base">
                  Quedan {dudososPendientes} match{dudososPendientes > 1 ? "es" : ""} dudoso{dudososPendientes > 1 ? "s" : ""} por resolver.
                </p>
              </div>
            )}
            <button
              onClick={() => router.push(`/sesion/${sesionId}/chat`)}
              disabled={!puedeIrAlChat}
              className="btn-primary disabled:opacity-40 py-4 px-8"
            >
              Ir al chat con IA →
            </button>
          </div>

          <Footer />
        </main>
      </div>
    </div>
  );
}
