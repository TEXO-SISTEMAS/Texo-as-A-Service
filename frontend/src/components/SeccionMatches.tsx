"use client";

import { Match } from "@/hooks/useMatches";
import MatchRow from "./MatchRow";

interface Props {
  titulo: string;
  color: string;
  bgHeader: string;
  matches: Match[];
  emptyMsg: string;
  onConfirmar?: (id: number) => void;
  onRechazar?: (id: number) => void;
  onDeshacer?: (id: number) => void;
}

export default function SeccionMatches({
  titulo, color, bgHeader, matches, emptyMsg,
  onConfirmar, onRechazar, onDeshacer,
}: Props) {
  return (
    <div
      className="rounded-2xl overflow-hidden mb-6 border border-border shadow-lg"
      style={{ borderLeftColor: color, borderLeftWidth: "4px" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ background: bgHeader }}
      >
        <span className="text-base font-bold tracking-tight" style={{ color }}>{titulo}</span>
        <span className="text-sm font-bold bg-white/10 text-secondary rounded-full px-4 py-1.5">
          {matches.length}
        </span>
      </div>

      {/* Filas */}
      {matches.length === 0 ? (
        <p className="px-6 py-4 text-sm text-muted">{emptyMsg}</p>
      ) : (
        <div className="divide-y divide-border/30">
          {matches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              onConfirmar={onConfirmar ? () => onConfirmar(m.id) : undefined}
              onRechazar={onRechazar ? () => onRechazar(m.id) : undefined}
              onDeshacer={onDeshacer ? () => onDeshacer(m.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
