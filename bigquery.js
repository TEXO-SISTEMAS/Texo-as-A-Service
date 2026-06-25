// bigquery.js — Conexión a BigQuery (proyecto adlenslooker) para alimentar el dashboard AdLens.
// Lee las mismas tablas que usa el Looker, así los números son idénticos.
//
// Credenciales (en orden de preferencia):
//   1. process.env.GCP_SA_KEY       → contenido JSON de la service account (string). Usar en Render.
//   2. process.env.GCP_SA_KEY_FILE  → ruta a un archivo .json local (para desarrollo).
//   3. Application Default Credentials (gcloud auth) si nada de lo anterior está seteado.

const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'adlenslooker';
const DATASET    = process.env.GCP_DATASET    || 'adlensmedios';
const T_MEDIOS   = 'tablamaterializada_medios';
const T_ADLENS   = 'tablamaterializada_adlens';

// Carga las credenciales de la service account desde env, de forma robusta.
// Preferencia: GCP_SA_KEY_B64 (base64 del JSON — a prueba de saltos/comillas) > GCP_SA_KEY (JSON crudo) > archivo.
function loadCredentials() {
  let raw = process.env.GCP_SA_KEY_B64 || process.env.GCP_SA_KEY;
  if (!raw) return null;
  raw = raw.trim();
  // Quitar comillas externas si el entorno las agregó
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  // Autodetectar: si no parece JSON ("{"), asumir base64 y decodificar
  if (!raw.startsWith('{')) {
    try { raw = Buffer.from(raw, 'base64').toString('utf8').trim(); } catch (_) {}
  }
  const creds = JSON.parse(raw);
  // Reparar private_key si los saltos llegaron como "\n" literales
  if (creds.private_key && creds.private_key.includes('\\n')) {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return creds;
}

let _client = null;
function client() {
  if (_client) return _client;
  const opts = { projectId: PROJECT_ID };
  const creds = loadCredentials();
  if (creds) {
    opts.credentials = creds;
  } else if (process.env.GCP_SA_KEY_FILE) {
    opts.keyFilename = process.env.GCP_SA_KEY_FILE;
  }
  _client = new BigQuery(opts);
  return _client;
}

const fq = (table) => `\`${PROJECT_ID}.${DATASET}.${table}\``;

async function query(sql) {
  const [rows] = await client().query({ query: sql, location: 'US' });
  return rows;
}

// Devuelve los nombres de columna reales de una tabla (para inspección).
async function getColumns(table) {
  const sql = `
    SELECT column_name, data_type
    FROM \`${PROJECT_ID}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name = '${table}'
    ORDER BY ordinal_position`;
  return query(sql);
}

// ── Constantes de presentación (deben coincidir con el frontend) ───────────────
const CLUSTER_NOMBRES = {
  0:'Emergentes o rezagadas', 1:'Operativas con potencial',
  2:'Creativas y comprometidas', 3:'Líderes consistentes', 4:'En transición',
};
const CLUSTER_COLORS = { 0:'#64748b', 1:'#0ea5b0', 2:'#8b5cf6', 3:'#16a34a', 4:'#d4900a' };
const MES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const r2 = n => Math.round(n*100)/100;
const r1 = n => Math.round(n*10)/10;

// Construye el JSON del dashboard AdLens leyendo directo de BigQuery (mismas tablas que el Looker).
async function buildAdlensData() {
  const A = fq(T_ADLENS), M = fq(T_MEDIOS);

  // 1) Filas por empresa (tabla adlens) — una por anunciante
  const adlensRows = await query(`
    SELECT anunciante, rubroprincipal,
           Cluster, tipodecluster, npuntajetotal,
           rangodeinversion AS rango,
           SAFE_CAST(facturacion AS FLOAT64) AS facturacion,
           Cultura, ejecucion AS Ejecucion, Estructura, Competitividad, inversion AS Inversion,
           formulapc1 AS pc1, formulapc2 AS pc2
    FROM ${A}
    WHERE anunciante IS NOT NULL`);

  // 2) Breakdowns de medios (inner join con anunciantes del adlens) — por GS (guaraníes)
  const innerJoin = `JOIN (SELECT DISTINCT anunciante FROM ${A} WHERE anunciante IS NOT NULL) a USING (anunciante)`;
  const [medioRows, grupoRows, agenciaRows, sectorRows, mesRows, anunMediosRows] = await Promise.all([
    query(`SELECT Medio AS k, SUM(GS) AS v FROM ${M} ${innerJoin} WHERE Medio IS NOT NULL GROUP BY Medio ORDER BY v DESC`),
    query(`SELECT GrupoEmpresarial AS k, SUM(GS) AS v FROM ${M} ${innerJoin} WHERE GrupoEmpresarial IS NOT NULL GROUP BY GrupoEmpresarial ORDER BY v DESC`),
    query(`SELECT Agencia AS k, SUM(GS) AS v FROM ${M} ${innerJoin} WHERE Agencia IS NOT NULL GROUP BY Agencia ORDER BY v DESC`),
    query(`SELECT Scetor AS k, SUM(GS) AS v FROM ${M} ${innerJoin} WHERE Scetor IS NOT NULL GROUP BY Scetor ORDER BY v DESC`),
    query(`SELECT EXTRACT(MONTH FROM MES) AS k, SUM(GS) AS v FROM ${M} ${innerJoin} WHERE A__O = 2024 AND MES IS NOT NULL GROUP BY k ORDER BY k`),
    query(`SELECT COUNT(DISTINCT m.anunciante) AS n FROM ${M} m ${innerJoin.replace('USING (anunciante)','USING (anunciante)')} `),
  ]);

  // ── Empresas → mapa
  const empresaMap = {};
  const anunciantes = {};   // nombre → inversión USD (solo > 0)
  let totalInversion = 0, sumRango = 0, sumFact = 0, totalPuntaje = 0, countPuntaje = 0;
  for (const row of adlensRows) {
    const nombre = (row.anunciante || '').toString().trim();
    if (!nombre) continue;
    const rango = +row.rango || 0;
    const invUsd = Math.round(rango * 1000);
    const punt = +row.npuntajetotal || 0;
    if (punt > 0) { totalPuntaje += punt; countPuntaje++; }
    sumRango += rango;
    sumFact  += (+row.facturacion || 0);
    empresaMap[nombre] = {
      rubro: row.rubroprincipal || '',
      cluster: row.Cluster != null ? parseInt(row.Cluster) : null,
      tipo_cluster: row.tipodecluster != null ? String(row.tipodecluster) : '',
      puntaje_total: punt,
      inversion_usd: invUsd,
      pc1: row.pc1 != null ? +row.pc1 : null,
      pc2: row.pc2 != null ? +row.pc2 : null,
      scores: {
        Cultura: +row.Cultura || 0, Ejecucion: +row.Ejecucion || 0,
        Estructura: +row.Estructura || 0, Competitividad: +row.Competitividad || 0,
        Inversion: +row.Inversion || 0,
      },
    };
    if (invUsd > 0) { anunciantes[nombre] = invUsd; totalInversion += invUsd; }
  }
  const mmi = countPuntaje > 0 ? r1(totalPuntaje / countPuntaje) : 0;
  const anunciantesConInversion = Object.keys(anunciantes).length;
  const totalAnunciantes = (anunMediosRows[0] && +anunMediosRows[0].n) || Object.keys(empresaMap).length;
  const investBilling = sumFact > 0 ? r1((sumRango / sumFact) * 100) : 0;

  // ── Detectar escala de scores (0-1 fracción vs 0-100)
  const scoreScale = (() => {
    const vals = adlensRows.map(r => +r.Cultura || 0).filter(v => v > 0);
    const max = vals.length ? Math.max(...vals) : 0;
    return max <= 1.5 ? 100 : 1;   // si vienen como fracción 0-1, multiplicar ×100
  })();

  // ── Clusters
  const clusterBuckets = {};
  for (let i=0;i<=4;i++) clusterBuckets[i] = { id:i, nombre:CLUSTER_NOMBRES[i], color:CLUSTER_COLORS[i],
    cantidad:0, inversion:0, scores_sum:{Cultura:0,Ejecucion:0,Estructura:0,Competitividad:0,Inversion:0} };
  for (const [nombre, e] of Object.entries(empresaMap)) {
    const c = e.cluster; if (c==null || !clusterBuckets[c]) continue;
    clusterBuckets[c].cantidad++;
    clusterBuckets[c].inversion += anunciantes[nombre] || 0;
    for (const d of ['Cultura','Ejecucion','Estructura','Competitividad','Inversion']) clusterBuckets[c].scores_sum[d] += e.scores[d] || 0;
  }
  const clusters = Object.values(clusterBuckets).map(c => {
    const scores = {};
    for (const [d,val] of Object.entries(c.scores_sum)) scores[d] = c.cantidad>0 ? r1((val/c.cantidad)*scoreScale) : 0;
    return { id:c.id, nombre:c.nombre, color:c.color, cantidad:c.cantidad, inversion:Math.round(c.inversion),
      share: totalInversion>0 ? r2(c.inversion/totalInversion*100) : 0, scores };
  });

  // ── Scores globales
  const dims = ['Cultura','Ejecucion','Estructura','Competitividad','Inversion'];
  const scores_globales = {};
  for (const d of dims) {
    const vals = Object.values(empresaMap).map(e=>e.scores[d]).filter(v=>v>0);
    scores_globales[d] = vals.length ? r1((vals.reduce((s,v)=>s+v,0)/vals.length)*scoreScale) : 0;
  }

  // ── Rankings
  const sorted = Object.entries(anunciantes).sort((a,b)=>b[1]-a[1]);
  const maxEntry = sorted[0] || ['—', 0];
  const top_anunciantes = sorted.slice(0,15).map(([nombre,inv]) => ({
    nombre, inversion:Math.round(inv), share:r2(inv/totalInversion*100),
    cluster:empresaMap[nombre]?.cluster??null, tipo_cluster:empresaMap[nombre]?.tipo_cluster||'', rubro:empresaMap[nombre]?.rubro||'',
  }));

  // ── Breakdowns de medios (share relativo a su propio total)
  const mkList = (rows, keyName, n) => {
    const tot = rows.reduce((s,r)=>s+(+r.v||0),0) || 1;
    return rows.slice(0, n||rows.length).map(r => ({ [keyName]:(r.k||'').toString(), inversion:Math.round(+r.v||0), share:r2((+r.v||0)/tot*100) }));
  };
  const media_mix = mkList(medioRows, 'medio');
  const por_grupo_empresarial = mkList(grupoRows, 'grupo', 8);
  const por_agencia = mkList(agenciaRows, 'agencia', 12);
  const por_sector = mkList(sectorRows, 'sector', 12);

  const mesMap = {}; mesRows.forEach(r => { mesMap[+r.k] = +r.v||0; });
  const estacionalidad = Array.from({length:12}, (_,i) => ({ mes:i+1, nombre:MES_NOMBRES[i], inversion:Math.round(mesMap[i+1]||0) }));

  // ── Scatter
  const scatter_data = Object.entries(empresaMap)
    .filter(([_,e]) => e.pc1 != null && e.pc2 != null && (e.pc1 !== 0 || e.pc2 !== 0))
    .map(([nombre,e]) => ({ nombre, pc1:e.pc1, pc2:e.pc2, cluster:e.cluster, inversion:Math.round(anunciantes[nombre]||0) }));

  // ── Empresas lista
  const empresas_lista = Object.entries(empresaMap)
    .filter(([_,e]) => e.puntaje_total > 0)
    .map(([nombre,e]) => ({ nombre, rubro:e.rubro, cluster:e.cluster, tipo_cluster:e.tipo_cluster,
      puntaje_total:e.puntaje_total, scores:e.scores, inversion:Math.round(anunciantes[nombre]||0) }));

  return {
    resumen: {
      total_inversion_usd: Math.round(totalInversion),
      total_facturacion: Math.round(sumFact * 1000),
      invest_billing: investBilling,
      total_anunciantes: totalAnunciantes,
      anunciantes_con_inversion: anunciantesConInversion,
      market_maturity_index: mmi,
      total_empresas_base: Object.keys(empresaMap).length,
      max_inversion: Math.round(maxEntry[1]),
      max_anunciante: maxEntry[0],
      ano: 2024,
    },
    media_mix, top_anunciantes, por_grupo_empresarial, por_agencia, por_sector,
    estacionalidad, clusters, scores_globales, scatter_data, empresas_lista,
    fuente: 'bigquery',
    generado_en: new Date().toISOString(),
  };
}

module.exports = { client, query, getColumns, buildAdlensData, fq, PROJECT_ID, DATASET, T_MEDIOS, T_ADLENS };
