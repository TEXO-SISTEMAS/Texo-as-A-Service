"use client";

import { useParams } from "next/navigation";
import { useRef } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import type { AgenciaEjecutiva, Insight } from "@/hooks/useDashboard";

function formatGs(value: number): string {
  if (value >= 1_000_000_000) return `Gs. ${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `Gs. ${(value / 1_000_000).toFixed(1)}M`;
  return `Gs. ${value.toLocaleString()}`;
}

function scoreColor(s: number) {
  if (s >= 7) return { text: "text-emerald-400", border: "border-emerald-400/30", bg: "bg-emerald-400/10" };
  if (s >= 4) return { text: "text-amber-400",   border: "border-amber-400/30",   bg: "bg-amber-400/10"   };
  return          { text: "text-red-400",         border: "border-red-400/30",     bg: "bg-red-400/10"     };
}

function estadoStyles(tipo: AgenciaEjecutiva["estado_tipo"]) {
  switch (tipo) {
    case "sana":        return { dot: "bg-emerald-400", badge: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" };
    case "dependencia": return { dot: "bg-amber-400",   badge: "bg-amber-400/10   text-amber-400   border-amber-400/20"   };
    case "alerta":      return { dot: "bg-orange-400",  badge: "bg-orange-400/10  text-orange-400  border-orange-400/20"  };
    case "critico":     return { dot: "bg-red-400",     badge: "bg-red-400/10     text-red-400     border-red-400/20"     };
  }
}

function insightStyles(tipo: Insight["tipo"]) {
  switch (tipo) {
    case "riesgo":      return { border: "border-l-red-400",     label: "RIESGO",      labelColor: "text-red-400",     icon: "⚠" };
    case "tension":     return { border: "border-l-violet-400",  label: "TENSIÓN",     labelColor: "text-violet-400",  icon: "⚡" };
    case "oportunidad": return { border: "border-l-emerald-400", label: "OPORTUNIDAD", labelColor: "text-emerald-400", icon: "↑" };
    case "anomalia":    return { border: "border-l-amber-400",   label: "ANOMALÍA",    labelColor: "text-amber-400",   icon: "!" };
    case "prioridad":   return { border: "border-l-orange-400",  label: "PRIORIDAD",   labelColor: "text-orange-400",  icon: "→" };
    default:            return { border: "border-l-blue-400",    label: "INSIGHT",     labelColor: "text-blue-400",    icon: "💡" };
  }
}

const JOURNEY = [
  { key: "veredicto",   num: "1", label: "Estado",    question: "¿Estamos sanos?",              color: "text-amber-400",   border: "border-amber-400/30",   bg: "bg-amber-400/10"   },
  { key: "preguntas",   num: "2", label: "Riesgo",     question: "¿Quién depende demasiado?",    color: "text-red-400",     border: "border-red-400/30",     bg: "bg-red-400/10"     },
  { key: "preguntas",   num: "3", label: "Potencial",  question: "¿Quién tiene mejor margen?",   color: "text-emerald-400", border: "border-emerald-400/30", bg: "bg-emerald-400/10" },
  { key: "insights",    num: "4", label: "Actuar",     question: "¿Qué necesita atención?",      color: "text-blue-400",    border: "border-blue-400/30",    bg: "bg-blue-400/10"    },
];

const CARD_STYLES = {
  salud:        { accent: "text-amber-400",   border: "border-amber-400/20",   label: "Estado general",  icon: "◎" },
  riesgo:       { accent: "text-red-400",     border: "border-red-400/20",     label: "Riesgo",          icon: "⚠" },
  potencial:    { accent: "text-emerald-400", border: "border-emerald-400/20", label: "Potencial",       icon: "↑" },
  intervencion: { accent: "text-orange-400",  border: "border-orange-400/20",  label: "Dónde intervenir",icon: "→" },
};

export default function DashboardPage() {
  const params   = useParams();
  const sesionId = params.id as string;
  const { data, loading, error } = useDashboard(sesionId);

  const refVeredicto = useRef<HTMLDivElement>(null);
  const refPreguntas = useRef<HTMLDivElement>(null);
  const refAgencias  = useRef<HTMLDivElement>(null);
  const refInsights  = useRef<HTMLDivElement>(null);

  const refs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    veredicto: refVeredicto,
    preguntas: refPreguntas,
    agencias:  refAgencias,
    insights:  refInsights,
  };

  const scrollTo = (key: string) =>
    refs[key]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-slate-400 text-sm">Cargando dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  const salud = data?.salud_ejecutiva;

  if (!salud) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-slate-500 text-sm">Sin datos. Cargá un archivo ERP para ver la salud financiera.</div>
      </div>
    );
  }

  const sc = scoreColor(salud.score_grupal);

  return (
    <div className="h-screen bg-[#0d1117] flex flex-col overflow-hidden">

      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#0d1117]/80 backdrop-blur flex-shrink-0">
        <div className="px-8 py-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-widest mb-0.5">Texo as a Service</div>
            <h1 className="text-lg font-semibold text-white tracking-tight">Salud Financiera</h1>
          </div>
          <div className={`text-xs font-medium px-3 py-1.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
            Score {salud.score_grupal} / 10
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 pb-24 space-y-5">

          {/* ── ORIENT HERO ─────────────────────────────────────────── */}
          <div className="bg-[#1a1f2e] border border-white/[0.07] rounded-2xl p-6">
            <div className="flex items-start justify-between gap-6 mb-6">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                  <span className="text-[11px] text-slate-400 tracking-widest uppercase font-medium">
                    Salud Financiera · Grupo Texo · 2025
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight leading-snug mb-2">
                  Tu tablero de<br />
                  <span className="text-violet-400">decisiones ejecutivas</span>
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
                  Traduce los datos financieros del grupo en respuestas claras: si estamos bien,
                  dónde está el riesgo, quién crece y qué necesita atención. Sin tablas, sin jerga.
                </p>
              </div>
              <div className={`flex-shrink-0 text-center border rounded-2xl px-5 py-4 ${sc.border} ${sc.bg}`}>
                <div className={`text-4xl font-bold leading-none mb-1 ${sc.text}`}>
                  {salud.score_grupal}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">/ 10 · Score grupal</div>
              </div>
            </div>

            {/* Journey map */}
            <div>
              <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-3 font-medium">
                Así se recorre este tablero →
              </div>
              <div className="grid grid-cols-4 gap-2 relative">
                <div className="absolute top-4 left-[12.5%] right-[12.5%] h-px bg-white/[0.06]" />
                {JOURNEY.map((step) => (
                  <button
                    key={step.num}
                    onClick={() => scrollTo(step.key)}
                    className="flex flex-col items-center text-center px-1 group"
                  >
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold mb-2 relative z-10 transition-opacity group-hover:opacity-70 ${step.color} ${step.border} ${step.bg}`}>
                      {step.num}
                    </div>
                    <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${step.color}`}>
                      {step.label}
                    </div>
                    <div className="text-[11px] text-slate-500 leading-tight">
                      {step.question}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── VEREDICTO ───────────────────────────────────────────── */}
          <div ref={refVeredicto} className="scroll-mt-4 bg-[#1a1f2e] border border-white/[0.07] rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-gradient-to-b from-amber-400 to-amber-400/20" />
            <div className={`text-[10px] font-semibold uppercase tracking-widest mb-1 ${sc.text}`}>
              Estado general del grupo
            </div>
            <div className="text-xs text-slate-500 mb-2">¿Estamos sanos?</div>
            <div className={`text-xl font-bold leading-snug mb-3 ${sc.text}`}>
              {salud.cuatro_preguntas.salud.respuesta}
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
              {salud.veredicto}
            </p>
            <div className={`absolute right-6 top-1/2 -translate-y-1/2 text-6xl font-bold opacity-[0.06] ${sc.text}`}>
              {salud.score_grupal}
            </div>
          </div>

          {/* ── CUATRO PREGUNTAS ────────────────────────────────────── */}
          <div ref={refPreguntas} className="scroll-mt-4 grid grid-cols-2 gap-3">
            {(["salud", "riesgo", "potencial", "intervencion"] as const).map((key) => {
              const q  = salud.cuatro_preguntas[key];
              const cs = CARD_STYLES[key];
              return (
                <button
                  key={key}
                  onClick={() => scrollTo(key === "salud" ? "veredicto" : key === "intervencion" ? "insights" : "agencias")}
                  className={`text-left bg-[#1a1f2e] border ${cs.border} rounded-xl p-4 hover:bg-white/[0.03] transition-colors group`}
                >
                  <div className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${cs.accent}`}>
                    {cs.icon} {cs.label}
                  </div>
                  <div className="text-xs text-slate-500 mb-2 leading-snug">{q.pregunta}</div>
                  <div className={`text-base font-bold leading-snug ${cs.accent}`}>{q.respuesta}</div>
                  <div className="text-xs text-slate-500 mt-1.5 leading-snug line-clamp-2">{q.detalle}</div>
                </button>
              );
            })}
          </div>

          {/* ── AGENCIAS ────────────────────────────────────────────── */}
          <div ref={refAgencias} className="scroll-mt-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-sm font-semibold text-white">Resumen por agencia</div>
              <div className="text-xs text-slate-500">
                {salud.agencias.length} agencias · margen promedio {(salud.agencias.reduce((s, a) => s + a.margen_pct, 0) / salud.agencias.length).toFixed(1)}%
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {salud.agencias.map((ag) => {
                const es = estadoStyles(ag.estado_tipo);
                return (
                  <div
                    key={ag.nombre}
                    className="bg-[#1a1f2e] border border-white/[0.07] rounded-xl px-5 py-4 flex items-center gap-4"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${es.dot}`} />

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">{ag.nombre}</div>
                      {ag.concentracion_pct >= 50 && (
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {ag.concentracion_pct.toFixed(0)}% concentrado en {ag.cliente_top}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-semibold text-white">{formatGs(ag.revenue)}</div>
                      <div className="text-xs text-slate-500">revenue</div>
                    </div>

                    <div className="text-right w-16">
                      <div className={`text-sm font-bold ${ag.margen_pct >= 10 ? "text-emerald-400" : ag.margen_pct >= 5 ? "text-amber-400" : "text-red-400"}`}>
                        {ag.margen_pct.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-500">margen</div>
                    </div>

                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${es.badge}`}>
                      {ag.estado}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── INSIGHTS ────────────────────────────────────────────── */}
          {salud.insights.length > 0 && (
            <div ref={refInsights} className="scroll-mt-4">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-sm font-semibold text-white">Tensiones · Insights · Prioridades</div>
                <div className="text-xs text-slate-500">Lo que los números no dicen solos</div>
              </div>
              <div className="flex flex-col gap-2">
                {salud.insights.map((ins, i) => {
                  const is = insightStyles(ins.tipo);
                  return (
                    <div
                      key={i}
                      className={`bg-[#1a1f2e] border border-white/[0.07] border-l-2 ${is.border} rounded-xl p-4 flex gap-3`}
                    >
                      <div className="text-base leading-none mt-0.5 flex-shrink-0">{is.icon}</div>
                      <div>
                        <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${is.labelColor}`}>
                          {is.label}
                        </div>
                        <div className="text-sm font-semibold text-white mb-1.5 leading-snug">
                          {ins.titulo}
                        </div>
                        <div className="text-xs text-slate-400 leading-relaxed">{ins.texto}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
