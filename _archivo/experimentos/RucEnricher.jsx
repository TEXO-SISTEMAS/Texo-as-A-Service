// RucEnricher.jsx
// Componente para el chat de JARVIS con flujo async + polling.
//
// Uso:
//   import RucEnricher from './RucEnricher';
//   <RucEnricher apiBase="http://localhost:8000" onFinish={(stats) => console.log(stats)} />

import { useState, useRef, useEffect, useCallback } from "react";

const POLL_MS = 2000;

const Icon = ({ n, size = 16 }) => {
  const paths = {
    upload:   "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
    file:     "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
    x:        "M18 6L6 18M6 6l12 12",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    check:    "M20 6L9 17l-5-5",
    alert:    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    spin:     "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83",
    table:    "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 1 1 2 2v4M9 3v18m0 0h10a2 2 0 0 1 2-2V9M9 21H5a2 2 0 0 0-2-2V9m0 0h18",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      <path d={paths[n]} />
    </svg>
  );
};

const ST = { IDLE: 0, PREVIEW: 1, UPLOADING: 2, PROCESSING: 3, DONE: 4, ERROR: 5 };

export default function RucEnricher({ apiBase = "http://localhost:8000", onFinish }) {
  const [step, setStep]       = useState(ST.IDLE);
  const [archivos, setArch]   = useState([]);
  const [columnas, setCols]   = useState([]);
  const [prevRows, setPrev]   = useState([]);
  const [colSel, setColSel]   = useState("");
  const [jobInfo, setJobInfo] = useState({ progress: 0, procesadas: 0, total: 0 });
  const [stats, setStats]     = useState(null);
  const [error, setError]     = useState("");
  const [dlUrl, setDlUrl]     = useState(null);
  const pollRef               = useRef(null);
  const fileRef               = useRef();
  const jobIdRef              = useRef(null);

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current); };
  useEffect(() => () => stopPoll(), []);

  const startPolling = useCallback((id) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${apiBase}/api/ruc/status/${id}`);
        const data = await res.json();
        setJobInfo({ progress: data.progress || 0, procesadas: data.procesadas || 0, total: data.total || 0 });
        if (data.status === "done") {
          stopPoll();
          setStats(data.stats || {});
          const dl   = await fetch(`${apiBase}/api/ruc/download/${id}`);
          const blob = await dl.blob();
          setDlUrl(URL.createObjectURL(blob));
          setStep(ST.DONE);
          onFinish?.(data.stats);
          fetch(`${apiBase}/api/ruc/job/${id}`, { method: "DELETE" }).catch(() => {});
        } else if (data.status === "error") {
          stopPoll();
          setError(data.error || "Error en el procesamiento");
          setStep(ST.ERROR);
        }
      } catch {
        stopPoll();
        setError("Se perdió la conexión con el servidor");
        setStep(ST.ERROR);
      }
    }, POLL_MS);
  }, [apiBase, onFinish]);

  const onFiles = useCallback(async (files) => {
    const validos = Array.from(files).filter(f => /\.(xlsx|xls)$/i.test(f.name));
    if (!validos.length) return;
    setArch(validos); setError("");
    const form = new FormData();
    form.append("file", validos[0]);
    try {
      const res  = await fetch(`${apiBase}/api/ruc/preview`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al leer archivo");
      setCols(data.columnas); setPrev(data.preview);
      setColSel(data.columnas.find(c => /raz[oó]n|social|empresa|nombre|cliente/i.test(c)) || "");
      setStep(ST.PREVIEW);
    } catch (e) { setError(e.message); setStep(ST.ERROR); }
  }, [apiBase]);

  const procesar = useCallback(async () => {
    if (!colSel) return;
    setStep(ST.UPLOADING);
    const form = new FormData();
    archivos.forEach(f => form.append("files", f));
    form.append("col_razon_social", colSel);
    try {
      const res  = await fetch(`${apiBase}/api/ruc/enriquecer`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error del servidor");
      jobIdRef.current = data.job_id;
      setJobInfo({ progress: 0, procesadas: 0, total: data.total || 0 });
      setStep(ST.PROCESSING);
      startPolling(data.job_id);
    } catch (e) { setError(e.message); setStep(ST.ERROR); }
  }, [apiBase, archivos, colSel, startPolling]);

  const reset = () => {
    stopPoll();
    setStep(ST.IDLE); setArch([]); setCols([]); setPrev([]);
    setColSel(""); setJobInfo({ progress: 0, procesadas: 0, total: 0 });
    setStats(null); setError(""); setDlUrl(null);
  };

  return (
    <div style={S.card}>
      <div style={S.hdr}>
        <Icon n="table" size={14} />
        <span style={S.htitle}>Enriquecedor de RUC</span>
        <span style={S.badge}>DNIT · turuc.com.py</span>
      </div>

      {step === ST.IDLE && (
        <div style={S.drop}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple hidden
            onChange={e => onFiles(e.target.files)} />
          <Icon n="upload" size={26} />
          <p style={S.dm}>Arrastrá los Excel o hacé click</p>
          <p style={S.ds}>Soporta múltiples archivos .xlsx / .xls</p>
        </div>
      )}

      {step === ST.PREVIEW && (
        <>
          <div style={S.chips}>
            {archivos.map((f, i) => (
              <span key={i} style={S.chip}><Icon n="file" size={11} />{f.name}</span>
            ))}
          </div>
          <label style={S.lbl}>Columna con la razón social</label>
          <select value={colSel} onChange={e => setColSel(e.target.value)} style={S.sel}>
            <option value="">— Elegir —</option>
            {columnas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {colSel && prevRows.length > 0 && (
            <div style={S.prev}>
              {prevRows.slice(0, 4).map((r, i) => (
                <div key={i} style={S.pr}>
                  <span style={{ color: "var(--color-text-tertiary)", fontSize: 11, minWidth: 12 }}>{i + 1}</span>
                  <span style={{ fontSize: 13 }}>{r[colSel] || "—"}</span>
                </div>
              ))}
            </div>
          )}
          <div style={S.acts}>
            <button style={S.bs} onClick={reset}>Cancelar</button>
            <button style={{ ...S.bp, opacity: colSel ? 1 : 0.45 }} disabled={!colSel} onClick={procesar}>
              Buscar RUC →
            </button>
          </div>
        </>
      )}

      {step === ST.UPLOADING && (
        <div style={S.ctr}>
          <Spin /><p style={S.pt}>Subiendo archivos...</p>
        </div>
      )}

      {step === ST.PROCESSING && (
        <div>
          <div style={S.ctr}><Spin /><p style={S.pt}>Consultando turuc.com.py...</p></div>
          <div style={S.barBg}><div style={{ ...S.barFill, width: `${jobInfo.progress}%` }} /></div>
          <div style={S.pr2}>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {jobInfo.procesadas} / {jobInfo.total} filas
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              {Number(jobInfo.progress).toFixed(0)}%
            </span>
          </div>
          <p style={{ ...S.ds, textAlign: "center", marginTop: 8 }}>
            ~{Math.max(1, Math.ceil(jobInfo.total * 0.5 / 60))} min estimado
          </p>
        </div>
      )}

      {step === ST.DONE && stats && (
        <>
          <div style={S.srow}>
            <SBox icon="check" color="#16a34a" label="AUTO"    n={stats.AUTO    || 0} t={jobInfo.total} />
            <SBox icon="alert" color="#d97706" label="Revisar" n={stats.REVISAR || 0} t={jobInfo.total} />
            <SBox icon="x"     color="#dc2626" label="Sin RUC" n={(stats.NO_MATCH || 0) + (stats.NO_ENCONTRADO || 0)} t={jobInfo.total} />
          </div>
          <p style={{ ...S.ds, textAlign: "center", margin: "8px 0 12px" }}>
            {jobInfo.total} filas · {archivos.length} archivo{archivos.length > 1 ? "s" : ""}
          </p>
          <div style={S.acts}>
            <button style={S.bs} onClick={reset}>Nuevo proceso</button>
            <a href={dlUrl} download="resultado_ruc.xlsx" style={S.bdl}>
              <Icon n="download" size={13} />Descargar Excel
            </a>
          </div>
        </>
      )}

      {step === ST.ERROR && (
        <div style={S.err}>
          <Icon n="alert" size={14} />
          <span style={{ flex: 1 }}>{error}</span>
          <button style={S.bl} onClick={reset}>Reintentar</button>
        </div>
      )}
    </div>
  );
}

function SBox({ icon, color, label, n, t }) {
  const p = t > 0 ? Math.round(n / t * 100) : 0;
  return (
    <div style={{ flex: 1, background: "var(--color-background-tertiary)", borderRadius: 8,
      padding: "11px 8px", textAlign: "center", border: `1px solid ${color}22`,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ color }}><Icon n={icon} size={14} /></span>
      <span style={{ fontSize: 20, fontWeight: 700, color }}>{n}</span>
      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{p}%</span>
    </div>
  );
}

function Spin() {
  return (
    <>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ display: "inline-block", animation: "_spin 1s linear infinite",
        color: "var(--color-text-info)" }}>
        <Icon n="spin" size={22} />
      </span>
    </>
  );
}

const S = {
  card:   { background: "var(--color-background-secondary)", border: "1px solid var(--color-border-secondary)",
    borderRadius: 12, padding: "14px 16px", maxWidth: 460, fontFamily: "var(--font-sans)", color: "var(--color-text-primary)" },
  hdr:    { display: "flex", alignItems: "center", gap: 7, marginBottom: 12, color: "var(--color-text-info)" },
  htitle: { fontWeight: 500, fontSize: 14 },
  badge:  { marginLeft: "auto", background: "var(--color-background-tertiary)", borderRadius: 5,
    padding: "1px 7px", fontSize: 11, color: "var(--color-text-tertiary)" },
  drop:   { border: "2px dashed var(--color-border-secondary)", borderRadius: 10, padding: "22px 16px",
    textAlign: "center", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    color: "var(--color-text-tertiary)" },
  dm:     { margin: 0, fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" },
  ds:     { margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" },
  chips:  { display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 },
  chip:   { display: "flex", alignItems: "center", gap: 4, background: "var(--color-background-tertiary)",
    borderRadius: 5, padding: "3px 8px", fontSize: 12, color: "var(--color-text-secondary)" },
  lbl:    { display: "block", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 5 },
  sel:    { width: "100%", background: "var(--color-background-primary)", border: "1px solid var(--color-border-secondary)",
    borderRadius: 7, color: "var(--color-text-primary)", padding: "7px 10px", fontSize: 13, outline: "none" },
  prev:   { background: "var(--color-background-tertiary)", borderRadius: 7, padding: "8px 10px", marginTop: 10, marginBottom: 12 },
  pr:     { display: "flex", alignItems: "center", gap: 8, padding: "3px 0",
    borderBottom: "1px solid var(--color-border-tertiary)", fontSize: 13 },
  acts:   { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 },
  bp:     { background: "var(--color-background-info)", color: "#fff", border: "none",
    borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  bs:     { background: "transparent", color: "var(--color-text-secondary)",
    border: "1px solid var(--color-border-secondary)", borderRadius: 7,
    padding: "8px 12px", fontSize: 13, cursor: "pointer" },
  bdl:    { display: "flex", alignItems: "center", gap: 6, background: "var(--color-background-success)",
    color: "#fff", textDecoration: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 500 },
  bl:     { background: "none", border: "none", color: "var(--color-text-info)", cursor: "pointer", fontSize: 12, padding: 0 },
  ctr:    { textAlign: "center", padding: "14px 0" },
  pt:     { color: "var(--color-text-info)", fontSize: 13, margin: "8px 0 4px" },
  barBg:  { height: 6, background: "var(--color-background-tertiary)", borderRadius: 3, overflow: "hidden", marginTop: 14 },
  barFill:{ height: "100%", background: "var(--color-background-info)", borderRadius: 3, transition: "width .5s ease" },
  pr2:    { display: "flex", justifyContent: "space-between", marginTop: 5 },
  srow:   { display: "flex", gap: 8 },
  err:    { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
    background: "var(--color-background-danger)", borderRadius: 8,
    padding: "10px 12px", color: "var(--color-text-danger)", fontSize: 13 },
};
