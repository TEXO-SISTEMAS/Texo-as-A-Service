"use client";

import dynamic from "next/dynamic";
import { Mensaje } from "@/hooks/useChat";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  mensaje: Mensaje;
}

export default function MensajeChat({ mensaje }: Props) {
  const esUsuario = mensaje.rol === "user";

  console.log('[grafico] mensaje:', mensaje);
  console.log('[grafico] grafico_json:', mensaje.grafico_json);

  return (
    <div className={`flex mb-4 ${esUsuario ? "justify-end" : "justify-start"}`}>
      {/* Avatar IA */}
      {!esUsuario && (
        <div className="w-9 h-9 rounded-full bg-accent-primary/20 flex items-center justify-center shrink-0 mr-3 mt-0.5">
          <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
          </svg>
        </div>
      )}

      <div
        className={`
          px-5 py-4 text-base leading-relaxed whitespace-pre-wrap break-words
          ${mensaje.grafico_json ? "w-full max-w-3xl" : "max-w-[72%]"}
          ${esUsuario
            ? "bg-gradient-executive text-white rounded-2xl rounded-tr-sm shadow-md"
            : "bg-tertiary text-secondary rounded-2xl rounded-tl-sm border border-subtle shadow-md"
          }
        `}
      >
        {mensaje.contenido}

        {/* Gráfico Plotly con tema oscuro */}
        {mensaje.grafico_json && (
          <div className="mt-4 rounded-xl overflow-hidden border border-accent-primary/30 shadow-lg" style={{ width: '100%', minWidth: '400px' }}>
            <Plot
              data={(mensaje.grafico_json as { data: Plotly.Data[] }).data}
              layout={{
                ...(mensaje.grafico_json as { layout: Partial<Plotly.Layout> }).layout,
                autosize: true,
                paper_bgcolor: "#121829",
                plot_bgcolor: "#121829",
                margin: { l: 120, r: 20, t: 50, b: 50 },
                font: { color: "#c5cad4", family: "-apple-system, Inter, system-ui, sans-serif", size: 13 },
                xaxis: {
                  ...(mensaje.grafico_json as { layout: { xaxis?: object } }).layout?.xaxis,
                  gridcolor: "#2d3548",
                  linecolor: "#2d3548",
                  tickcolor: "#4b5563",
                  tickfont: { color: "#c5cad4" },
                },
                yaxis: {
                  ...(mensaje.grafico_json as { layout: { yaxis?: object } }).layout?.yaxis,
                  gridcolor: "#2d3548",
                  linecolor: "#2d3548",
                  tickcolor: "#4b5563",
                  tickfont: { color: "#c5cad4" },
                },
                title: {
                  ...(typeof (mensaje.grafico_json as { layout: { title?: unknown } }).layout?.title === "string"
                    ? { text: (mensaje.grafico_json as { layout: { title: string } }).layout.title }
                    : (mensaje.grafico_json as { layout: { title?: object } }).layout?.title ?? {}),
                  font: { color: "#ffffff", size: 16 },
                },
              }}
              style={{ width: '100%', minWidth: '400px' }}
              config={{ responsive: true, displayModeBar: false }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
