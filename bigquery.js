// bigquery.js — Conexión a BigQuery (proyecto adlenslooker) para alimentar el dashboard AdLens.
// Lee las mismas tablas que usa el Looker, así los números son idénticos.
//
// Credenciales (en orden de preferencia):
//   1. process.env.GCP_SA_KEY       → contenido JSON de la service account (string). Usar en Render.
//   2. process.env.GCP_SA_KEY_FILE  → ruta a un archivo .json local (para desarrollo).
//   3. Application Default Credentials (gcloud auth) si nada de lo anterior está seteado.

const { BigQuery } = require('@google-cloud/bigquery');
const CORRECTIONS = require('./name_corrections');

function fixName(raw)     { const s = (raw||'').toString().trim(); return CORRECTIONS.anunciantes[s] || s; }
function fixRubro(raw)    { const s = (raw||'').toString().trim(); return CORRECTIONS.rubros[s]      || s; }
function fixAgencia(raw)  { const s = (raw||'').toString().trim(); return CORRECTIONS.agencias[s]    || s; }
function fixMedio(raw)    { const s = (raw||'').toString().trim(); return CORRECTIONS.medios[s]      || s; }

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'adlenslooker';
const DATASET    = process.env.GCP_DATASET    || 'adlensmedios';
const T_MEDIOS   = 'tablamaterializada_medios';
const T_ADLENS   = 'tablamaterializada_adlens';
const T_RADA     = 'tablamaterializada_rada';

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

  // 1) Filas por empresa (tabla adlens) — una por anunciante + sub-métricas numéricas
  const adlensRows = await query(`
    SELECT anunciante, rubroprincipal,
           Cluster, tipodecluster, npuntajetotal,
           rangodeinversion AS rango,
           SAFE_CAST(facturacion AS FLOAT64) AS facturacion,
           Cultura, ejecucion AS Ejecucion, Estructura, Competitividad, inversion AS Inversion,
           formulapc1 AS pc1, formulapc2 AS pc2,
           nconrespectoalmarketingylapublicidadesunaempresa AS sm_vanguardia_mkt,
           nlaempresatrabajaenconstrucciondemarcas AS sm_construccion_marca,
           ncomoseproyectalaempresa_ AS sm_largo_plazo,
           nquetanimportanteeslaestrategiadetumarca__ AS sm_importancia_estrategia,
           neldepartamentodemarketingtieneunpresupuestoanualdefinido AS sm_presupuesto_definido,
           ntienelaempresaundepartamentodecompras AS sm_tiene_dpto_compras,
           \`_ntienelaempresaareademarketing\` AS sm_tiene_area_mkt,
           ntamanodelaempresa_ AS sm_tamano_empresa,
           ndecuantaspersonasestaconstituidalaestructurademarketingdelaempresa AS sm_tamano_dpto_mkt,
           nlaempresacuentaconundepartamentoencargadodemarketingdigital AS sm_tiene_dpto_digital,
           nquetanimportanteeseldisenoylacreatividad_ AS sm_diseno_creatividad,
           nlamarcaempresasedestacaporinnovarenpublicidad AS sm_innovacion,
           quetandesconfiadaeslaempresa AS sm_confianza,
           nafinidaddelaempresaconserviciosdecomunicacionesdemarketing_ AS sm_afinidad_mkt,
           nsumarcasson AS sm_liderazgo_marcas,
           nenqueestadiodelbrandfunnelseencuentralamarca AS sm_brand_funnel,
           nqueporcentajedemarketsharetienelamarca AS sm_market_share,
           nlaempresainvierteeninvestigacionestrategiaoserviciosdeconsultoria AS sm_investigacion,
           nlaempresainvierteendigital AS sm_inv_digital,
           nlaempresainvierteenresearch AS sm_inv_research,
           nlaempresainvierteenpdv AS sm_inv_pdv,
           inversionenpdv2024 AS pdv2024,
           agenciatrade
    FROM ${A}
    WHERE anunciante IS NOT NULL`);

  // 2) Breakdowns de medios (inner join con anunciantes del adlens) — por GS (guaraníes)
  const innerJoin = `JOIN (SELECT DISTINCT anunciante FROM ${A} WHERE anunciante IS NOT NULL) a USING (anunciante)`;
  const R = fq(T_RADA);
  const [medioRows, grupoRows, agenciaRows, sectorRows, mesRows, anunMediosRows, factRows, mmiRows, anunRangoRows, evolucionRows, mmiClusterRows, clusterGrupoRows, rubroRows, clusterAgenciaRows, radaDimRows, radaMetricRows, evolucionDetalleRows, estacionalidadDetalleRows, mediosDetalleRows] = await Promise.all([
    query(`SELECT Medio AS k, SUM(RANGODEINVERSION) AS v FROM ${M} ${innerJoin} WHERE Medio IS NOT NULL GROUP BY Medio ORDER BY v DESC`),
    query(`SELECT GrupoEmpresarial AS k, SUM(RANGODEINVERSION) AS v FROM ${M} ${innerJoin} WHERE GrupoEmpresarial IS NOT NULL GROUP BY GrupoEmpresarial ORDER BY v DESC`),
    query(`SELECT Agencia AS k, SUM(RANGODEINVERSION) AS v FROM ${M} ${innerJoin} WHERE Agencia IS NOT NULL GROUP BY Agencia ORDER BY v DESC`),
    query(`SELECT Scetor AS k, SUM(RANGODEINVERSION) AS v FROM ${M} ${innerJoin} WHERE Scetor IS NOT NULL GROUP BY Scetor ORDER BY v DESC`),
    query(`SELECT EXTRACT(MONTH FROM MES) AS k, ROUND(SUM(RANGODEINVERSION),0) AS v FROM ${M} m ${innerJoin} WHERE MES IS NOT NULL GROUP BY k ORDER BY k`),
    query(`SELECT COUNT(DISTINCT m.anunciante) AS n FROM ${M} m ${innerJoin.replace('USING (anunciante)','USING (anunciante)')} `),
    // Facturación: igual que el Looker (SUM de facturacion sobre el inner join, repetida por fila de medios)
    query(`SELECT SUM(SAFE_CAST(a.facturacion AS FLOAT64)) AS v FROM ${M} m JOIN ${A} a USING(anunciante)`),
    // Market Maturity Index global: AVG(Score) blend medios × rada
    query(`SELECT AVG(r.Score) AS v FROM ${M} m JOIN ${R} r USING(anunciante) WHERE r.Score IS NOT NULL`),
    // Top anunciantes: SUM(RANGODEINVERSION) de medios por anunciante
    query(`SELECT m.anunciante AS k, SUM(RANGODEINVERSION) AS v FROM ${M} m ${innerJoin} WHERE m.anunciante IS NOT NULL GROUP BY m.anunciante ORDER BY v DESC`),
    // Evolución de inversiones: SUM(RANGODEINVERSION) por año inner join
    query(`SELECT A__O AS k, ROUND(SUM(RANGODEINVERSION),0) AS v FROM ${M} m ${innerJoin} WHERE A__O IS NOT NULL GROUP BY A__O ORDER BY A__O ASC`),
    // MMI por cluster: AVG(Score) blend medios × rada filtrado por cluster (igual al Looker)
    query(`SELECT a.Cluster AS k, ROUND(AVG(r.Score)*100, 1) AS v FROM ${M} m JOIN ${A} a USING(anunciante) JOIN ${R} r USING(anunciante) WHERE r.Score IS NOT NULL AND a.Cluster IS NOT NULL GROUP BY a.Cluster`),
    // Participación por cluster: SUM(RANGODEINVERSION) cruzado cluster × GrupoEmpresarial
    query(`SELECT a.Cluster AS cluster, m.GrupoEmpresarial AS grupo, ROUND(SUM(m.RANGODEINVERSION),2) AS v FROM ${M} m JOIN ${A} a USING(anunciante) WHERE a.Cluster IS NOT NULL AND m.GrupoEmpresarial IS NOT NULL GROUP BY a.Cluster, m.GrupoEmpresarial ORDER BY a.Cluster ASC, v DESC`),
    // Inversión por rubroprincipal (sector): JOIN medios × adlens, top 10 DESC
    query(`SELECT a.rubroprincipal AS k, ROUND(SUM(m.RANGODEINVERSION),2) AS v FROM ${M} m JOIN ${A} a USING(anunciante) WHERE a.rubroprincipal IS NOT NULL GROUP BY a.rubroprincipal ORDER BY v DESC LIMIT 10`),
    // Participación por cluster × Agencia
    query(`SELECT a.Cluster AS cluster, m.Agencia AS agencia, ROUND(SUM(m.RANGODEINVERSION),2) AS v FROM ${M} m JOIN ${A} a USING(anunciante) WHERE a.Cluster IS NOT NULL AND m.Agencia IS NOT NULL GROUP BY a.Cluster, m.Agencia ORDER BY a.Cluster ASC, v DESC`),
    // Termómetro: AVG Score por Dimension (formato largo: anunciante, Dimension, Score)
    query(`SELECT Dimension, ROUND(AVG(Score),4) AS avg_score, COUNT(*) AS n FROM ${R} WHERE Dimension IS NOT NULL GROUP BY Dimension ORDER BY Dimension`).catch(()=>[]),
    // Sub-métricas del Termómetro: AVG de cada columna numérica de la tabla adlens
    query(`SELECT
      ROUND(AVG(nconrespectoalmarketingylapublicidadesunaempresa),2) AS vanguardia_mkt,
      ROUND(AVG(nlaempresatrabajaenconstrucciondemarcas),2) AS construccion_marca,
      ROUND(AVG(ncomoseproyectalaempresa_),2) AS largo_plazo,
      ROUND(AVG(nquetanimportanteeslaestrategiadetumarca__),2) AS importancia_estrategia,
      ROUND(AVG(neldepartamentodemarketingtieneunpresupuestoanualdefinido),2) AS presupuesto_definido,
      ROUND(AVG(ntienelaempresaundepartamentodecompras),2) AS tiene_dpto_compras,
      ROUND(AVG(\`_ntienelaempresaareademarketing\`),2) AS tiene_area_mkt,
      ROUND(AVG(ntamanodelaempresa_),2) AS tamano_empresa,
      ROUND(AVG(ndecuantaspersonasestaconstituidalaestructurademarketingdelaempresa),2) AS tamano_dpto_mkt,
      ROUND(AVG(nlaempresacuentaconundepartamentoencargadodemarketingdigital),2) AS tiene_dpto_digital,
      ROUND(AVG(nquetanimportanteeseldisenoylacreatividad_),2) AS diseno_creatividad,
      ROUND(AVG(nlamarcaempresasedestacaporinnovarenpublicidad),2) AS innovacion,
      ROUND(AVG(quetandesconfiadaeslaempresa),2) AS confianza,
      ROUND(AVG(nafinidaddelaempresaconserviciosdecomunicacionesdemarketing_),2) AS afinidad_mkt,
      ROUND(AVG(nsumarcasson),2) AS liderazgo_marcas,
      ROUND(AVG(nenqueestadiodelbrandfunnelseencuentralamarca),2) AS brand_funnel,
      ROUND(AVG(nqueporcentajedemarketsharetienelamarca),2) AS market_share,
      ROUND(AVG(nlaempresainvierteeninvestigacionestrategiaoserviciosdeconsultoria),2) AS investigacion,
      ROUND(AVG(nlaempresainvierteendigital),2) AS inv_digital,
      ROUND(AVG(nlaempresainvierteenresearch),2) AS inv_research,
      ROUND(AVG(nlaempresainvierteenpdv),2) AS inv_pdv
    FROM ${A} WHERE anunciante IS NOT NULL`).catch(()=>[]),
    // Evolución detalle: inversión por anunciante × año (cluster/rubro se enriquece client-side)
    query(`SELECT m.anunciante AS nombre, A__O AS k, ROUND(SUM(RANGODEINVERSION),0) AS v FROM ${M} m ${innerJoin} WHERE A__O IS NOT NULL GROUP BY m.anunciante, A__O ORDER BY A__O`).catch(()=>[]),
    // Estacionalidad detalle: inversión por anunciante × mes (cluster/rubro se enriquece client-side)
    query(`SELECT m.anunciante AS nombre, EXTRACT(MONTH FROM MES) AS k, ROUND(SUM(RANGODEINVERSION),0) AS v FROM ${M} m ${innerJoin} WHERE MES IS NOT NULL GROUP BY m.anunciante, EXTRACT(MONTH FROM MES) ORDER BY k`).catch(()=>[]),
    // Medios detalle: inversión por anunciante × grupo × medio × vehículo (para filtros del tab Medios)
    query(`SELECT m.anunciante AS nombre, GRUPODEMEDIOS AS gm, MEDIO AS medio, VEHICULO AS vehiculo, ROUND(SUM(RANGODEINVERSION),0) AS v FROM ${M} m ${innerJoin} WHERE MEDIO IS NOT NULL GROUP BY m.anunciante, GRUPODEMEDIOS, MEDIO, VEHICULO`).catch(()=>[]),
  ]);
  const facturacionLooker = (factRows[0] && Math.round(+factRows[0].v)) || 0;
  const mmi = mmiRows[0] && mmiRows[0].v != null ? r1(+mmiRows[0].v * 100) : 0;
  const mmiByCluster = {};
  mmiClusterRows.forEach(r => { mmiByCluster[+r.k] = +r.v; });

  // ── Empresas → mapa
  const empresaMap = {};
  const anunciantes = {};   // nombre → inversión USD (solo > 0)
  let totalInversion = 0, sumRango = 0, sumFact = 0, totalPuntaje = 0, countPuntaje = 0;
  for (const row of adlensRows) {
    const nombre = fixName(row.anunciante);
    if (!nombre) continue;
    const rango = +row.rango || 0;
    const invUsd = Math.round(rango * 1000);
    const punt = +row.npuntajetotal || 0;
    if (punt > 0) { totalPuntaje += punt; countPuntaje++; }
    sumRango += rango;
    sumFact  += (+row.facturacion || 0);
    empresaMap[nombre] = {
      rubro: fixRubro(row.rubroprincipal),
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
      share: totalInversion>0 ? r2(c.inversion/totalInversion*100) : 0, scores,
      mmi: mmiByCluster[c.id] ?? null };
  });

  // ── Scores globales
  const dims = ['Cultura','Ejecucion','Estructura','Competitividad','Inversion'];
  const scores_globales = {};
  for (const d of dims) {
    const vals = Object.values(empresaMap).map(e=>e.scores[d]).filter(v=>v>0);
    scores_globales[d] = vals.length ? r1((vals.reduce((s,v)=>s+v,0)/vals.length)*scoreScale) : 0;
  }

  // ── Rankings — usa SUM(RANGODEINVERSION) de medios (igual al Looker)
  // maxEntry para hero card usa adlens (inversion USD)
  const sortedByAdlens = Object.entries(anunciantes).sort((a,b)=>b[1]-a[1]);
  const maxEntry = sortedByAdlens[0] || ['—', 0];

  // top_anunciantes usa SUM(RANGODEINVERSION) de medios (igual al Looker)
  const totalRangoMedios = anunRangoRows.reduce((s,r)=>s+(+r.v||0),0);
  const top_anunciantes = anunRangoRows.map(r => {
    const nombre = fixName(r.k);
    return {
      nombre, rango_medios: r2(+r.v||0),
      share: totalRangoMedios > 0 ? r2((+r.v||0) / totalRangoMedios * 100) : 0,
      cluster: empresaMap[nombre]?.cluster ?? null,
      tipo_cluster: empresaMap[nombre]?.tipo_cluster || '',
      rubro: empresaMap[nombre]?.rubro || '',
      inversion: anunciantes[nombre] || 0,
    };
  });

  // ── Breakdowns de medios (share relativo a su propio total)
  const mkList = (rows, keyName, n, fixFn) => {
    const tot = rows.reduce((s,r)=>s+(+r.v||0),0) || 1;
    return rows.slice(0, n||rows.length).map(r => ({ [keyName]: fixFn ? fixFn(r.k) : (r.k||'').toString(), inversion:Math.round(+r.v||0), share:r2((+r.v||0)/tot*100) }));
  };
  const media_mix = mkList(medioRows, 'medio', null, fixMedio);
  const por_grupo_empresarial = mkList(grupoRows, 'grupo', 8);
  const por_agencia = mkList(agenciaRows, 'agencia', 12, fixAgencia);
  const por_sector = mkList(sectorRows, 'sector', 12);

  const mesMap = {}; mesRows.forEach(r => { mesMap[+r.k] = +r.v||0; });
  const estacionalidad = Array.from({length:12}, (_,i) => ({ mes:i+1, nombre:MES_NOMBRES[i], inversion:Math.round(mesMap[i+1]||0) }));

  // ── Scatter
  const scatter_data = Object.entries(empresaMap)
    .filter(([_,e]) => e.pc1 != null && e.pc2 != null && (e.pc1 !== 0 || e.pc2 !== 0))
    .map(([nombre,e]) => ({ nombre, pc1:e.pc1, pc2:e.pc2, cluster:e.cluster, tipo_cluster:e.tipo_cluster,
      inversion:Math.round(anunciantes[nombre]||0),
      share: totalInversion>0 ? r2((anunciantes[nombre]||0)/totalInversion*100) : 0 }));

  // ── Empresas lista — aplicar scoreScale igual que clusters
  const empresas_lista = Object.entries(empresaMap)
    .filter(([_,e]) => e.puntaje_total > 0)
    .map(([nombre,e]) => {
      const scaledScores = {};
      for (const [d,v] of Object.entries(e.scores)) scaledScores[d] = r1(v * scoreScale);
      return { nombre, rubro:e.rubro, cluster:e.cluster, tipo_cluster:e.tipo_cluster,
        puntaje_total: r1(e.puntaje_total * scoreScale),
        scores: scaledScores, inversion:Math.round(anunciantes[nombre]||0) };
    });

  // ── Sub-métricas por empresa (para filtro en Termómetro)
  const SM_KEYS = ['vanguardia_mkt','construccion_marca','largo_plazo','importancia_estrategia',
    'presupuesto_definido','tiene_dpto_compras','tiene_area_mkt','tamano_empresa','tamano_dpto_mkt',
    'tiene_dpto_digital','diseno_creatividad','innovacion','confianza','afinidad_mkt',
    'liderazgo_marcas','brand_funnel','market_share','investigacion','inv_digital','inv_research','inv_pdv'];
  const submetricas_por_empresa = {};
  for (const row of adlensRows) {
    if (!row.anunciante) continue;
    const sm = {};
    for (const k of SM_KEYS) {
      const v = row[`sm_${k}`];
      sm[k] = v != null ? +v : null;
    }
    submetricas_por_empresa[row.anunciante] = sm;
  }

  // ── Trade data (inversionenpdv2024 + agenciatrade)
  const tradePorEmpresa = {};
  for (const row of adlensRows) {
    const nombre = fixName(row.anunciante);
    if (!nombre || tradePorEmpresa[nombre]) continue;
    tradePorEmpresa[nombre] = {
      pdv: row.pdv2024 != null ? +row.pdv2024 : 0,
      agencia: (row.agenciatrade || 'OTROS').toString().trim(),
    };
  }
  const tradeAgencias = {}, tradeClusters = {};
  let tradeTotalPdv = 0;
  for (const emp of empresas_lista) {
    const t = tradePorEmpresa[emp.nombre] || { pdv: 0, agencia: 'OTROS' };
    tradeTotalPdv += t.pdv;
    tradeAgencias[t.agencia] = (tradeAgencias[t.agencia] || 0) + t.pdv;
    const cl = emp.cluster ?? -1;
    if (cl >= 0) tradeClusters[cl] = (tradeClusters[cl] || 0) + t.pdv;
  }
  const trade_data = {
    total_pdv: r2(tradeTotalPdv),
    avg_pdv: empresas_lista.length > 0 ? r2(tradeTotalPdv / empresas_lista.length) : 0,
    n_anunciantes: empresas_lista.length,
    por_agencia: Object.entries(tradeAgencias)
      .map(([ag, v]) => ({ agencia: ag, v: r2(v), pct: tradeTotalPdv > 0 ? r2(v / tradeTotalPdv * 100) : 0 }))
      .sort((a, b) => b.v - a.v),
    por_cluster: Object.entries(tradeClusters)
      .map(([cl, v]) => ({ cluster: +cl, v: r2(v), pct: tradeTotalPdv > 0 ? r2(v / tradeTotalPdv * 100) : 0 }))
      .sort((a, b) => a.cluster - b.cluster),
    top_anunciantes: empresas_lista
      .map(e => ({ nombre: e.nombre, cluster: e.cluster, pdv: (tradePorEmpresa[e.nombre] || {}).pdv || 0, agencia: (tradePorEmpresa[e.nombre] || {}).agencia || 'OTROS' }))
      .filter(e => e.pdv > 0)
      .sort((a, b) => b.pdv - a.pdv),
  };

  return {
    resumen: {
      total_inversion_usd: Math.round(totalInversion),
      total_facturacion: facturacionLooker,
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
    evolucion: evolucionRows.map(r => ({ ano: +r.k, inversion: +r.v })),
    evolucion_detalle: evolucionDetalleRows.map(r => ({ nombre: fixName(r.nombre || r.anunciante), ano: +r.k, v: +r.v })),
    estacionalidad_detalle: estacionalidadDetalleRows.map(r => ({ nombre: fixName(r.nombre || r.anunciante), mes: +r.k, v: +r.v })),
    medios_detalle: mediosDetalleRows.map(r => ({ nombre: fixName(r.nombre), gm: r.gm||'', medio: fixMedio(r.medio||''), vehiculo: (r.vehiculo||'').toString().trim(), v: +r.v })),
    cluster_grupo: clusterGrupoRows.map(r => ({ cluster: +r.cluster, grupo: r.grupo, v: +r.v })),
    cluster_agencia: clusterAgenciaRows.map(r => ({ cluster: +r.cluster, agencia: fixAgencia(r.agencia), v: +r.v })),
    rada_dims: radaDimRows.map(r => ({ dimension: r.Dimension, avg: +r.avg_score, n: +r.n })),
    submetricas: radaMetricRows[0] || null,
    submetricas_por_empresa,
    trade_data,
    por_rubro: (() => { const tot = rubroRows.reduce((s,r)=>s+(+r.v||0),0)||1; return rubroRows.map(r=>({ rubro:fixRubro(r.k), inversion:+r.v, share:r2((+r.v/tot)*100) })); })(),
    fuente: 'bigquery',
    generado_en: new Date().toISOString(),
  };
}

module.exports = { client, query, getColumns, buildAdlensData, fq, PROJECT_ID, DATASET, T_MEDIOS, T_ADLENS };
