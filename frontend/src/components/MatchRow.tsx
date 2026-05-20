"use client";

import { Match } from "@/hooks/useMatches";

interface Props {
  match: Match;
  onConfirmar?: () => void;
  onRechazar?: () => void;
  onDeshacer?: () => void;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const cls = pct >= 85
    ? "bg-success/10 text-success border-success/30"
    : pct >= 60
    ? "bg-warning/10 text-warning border-warning/30"
    : "bg-danger/10 text-danger border-danger/30";
  return (
    <span className={`text-sm font-bold border rounded-lg px-2 py-1 ${cls}`}>
      {pct}%
    </span>
  );
}

export default function MatchRow({ match, onConfirmar, onRechazar, onDeshacer }: Props) {
  const nombres = [
    match.fuente1_nombre && { fuente: "ERP",       nombre: match.fuente1_nombre },
    match.fuente2_nombre && { fuente: "DNIT",      nombre: match.fuente2_nombre },
    match.fuente3_nombre && { fuente: "Marketing", nombre: match.fuente3_nombre },
  ].filter(Boolean) as { fuente: string; nombre: string }[];

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border/50 last:border-0 flex-wrap">
      {/* Nombres */}
      <div className="flex items-center gap-3 flex-wrap flex-1">
        {nombres.map((n) => (
          <span key={n.fuente} className="flex items-center gap-2 bg-panel border border-border rounded-lg px-3 py-2 text-sm text-white">
            <span className="text-xs font-bold text-gold uppercase tracking-wider">{n.fuente}</span>
            {n.nombre}
          </span>
        ))}
        <ScoreBadge score={match.score} />
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 shrink-0">
        {match.estado === "dudoso" && (
          <>
            <button
              onClick={onConfirmar}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-green/10 text-green border border-green/30 hover:bg-green/20 transition-colors"
            >
              ✓ Misma empresa
            </button>
            <button
              onClick={onRechazar}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-coral/10 text-coral border border-coral/30 hover:bg-coral/20 transition-colors"
            >
              ✗ Son distintas
            </button>
          </>
        )}
        {match.estado === "auto_confirmado" && (
          <button
            onClick={onDeshacer}
            className="text-sm px-4 py-2 rounded-lg bg-surface border border-border text-gray-400 hover:text-white hover:border-white/30 transition-colors"
          >
            Deshacer
          </button>
        )}
        {match.estado === "corregido" && (
          <span className="text-sm text-gray-400 italic">Corregido manualmente</span>
        )}
        {match.estado === "sin_match" && onConfirmar && (
          <button
            onClick={onConfirmar}
            className="text-sm px-4 py-2 rounded-lg bg-surface border border-border text-gray-400 hover:text-white transition-colors"
          >
            Asignar
          </button>
        )}
      </div>
    </div>
  );
}
