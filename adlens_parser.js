const xlsx = require('xlsx');

const CLUSTER_NOMBRES = {
  0: 'Emergentes o rezagadas',
  1: 'Operativas con potencial',
  2: 'Creativas y comprometidas',
  3: 'Líderes consistentes',
  4: 'En transición',
};

const CLUSTER_COLORS = {
  0: '#64748b',
  1: '#0ea5b0',
  2: '#8b5cf6',
  3: '#16a34a',
  4: '#d4900a',
};

const MES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function safe(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function norm(s) {
  return (s || '').toString().trim().toUpperCase();
}

function getMes(val) {
  if (!val) return 0;
  if (val instanceof Date) return val.getMonth() + 1;
  if (typeof val === 'number') {
    try {
      const d = xlsx.SSF.parse_date_code(val);
      return d ? d.m : 0;
    } catch { return 0; }
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getMonth() + 1;
  return 0;
}

function parseAdlens(mediosBuffer, adlensBuffer) {
  // ── ADLENS BASE ───────────────────────────────────────────────────────────────
  const adlensWb = xlsx.read(adlensBuffer, { type: 'buffer' });
  const adlensRows = xlsx.utils.sheet_to_json(adlensWb.Sheets['Sheet1'] || adlensWb.Sheets[adlensWb.SheetNames[0]], { defval: null });

  const empresaMap = {};
  let totalPuntaje = 0, countPuntaje = 0;

  for (const row of adlensRows) {
    const nombre = norm(row['anunciante']);
    if (!nombre) continue;
    const puntaje = safe(row['puntaje total']);
    if (puntaje > 0) { totalPuntaje += puntaje; countPuntaje++; }
    empresaMap[nombre] = {
      rubro: row['rubro principal'] || '',
      agencia_trade: row['central de medios'] || '',
      cluster: row['Cluster'] != null ? parseInt(row['Cluster']) : null,
      tipo_cluster: row['Tipo de Cluster'] || '',
      puntaje_total: puntaje,
      scores: {
        Cultura:        safe(row['Cultura']),
        Ejecucion:      safe(row['Ejecución']),
        Estructura:     safe(row['Estructura']),
        Competitividad: safe(row['Competitividad']),
        Inversion:      safe(row['Inversión']),
      },
    };
  }

  const mmi = countPuntaje > 0 ? Math.round((totalPuntaje / countPuntaje) * 10) / 10 : 0;

  // ── MEDIOS ────────────────────────────────────────────────────────────────────
  const mediosWb = xlsx.read(mediosBuffer, { type: 'buffer', cellDates: true });
  const sheetName = mediosWb.SheetNames.includes('2024') ? '2024' : mediosWb.SheetNames[0];
  const mediosRows = xlsx.utils.sheet_to_json(mediosWb.Sheets[sheetName], { defval: null });

  let totalInversion = 0;
  const anunciantes = {};
  const medios      = {};
  const grupos      = {};
  const agencias    = {};
  const sectores    = {};
  const meses       = {};

  for (const row of mediosRows) {
    const usd = safe(row['(US$)']);
    if (!usd) continue;

    const anunciante = norm(row['anunciante']);
    const medio      = norm(row['Medio']);
    const grupo      = norm(row['Grupo Empresarial']);
    const agencia    = norm(row['Agência'] || row['Agencia'] || row['AGENCIA']);
    const setor      = (row['Setor'] || '').toString().trim();
    const mes        = getMes(row['MES']);

    totalInversion += usd;

    if (anunciante) { anunciantes[anunciante] = (anunciantes[anunciante] || 0) + usd; }
    if (medio)      { medios[medio]           = (medios[medio]           || 0) + usd; }
    if (grupo)      { grupos[grupo]            = (grupos[grupo]            || 0) + usd; }
    if (agencia)    { agencias[agencia]        = (agencias[agencia]        || 0) + usd; }
    if (setor)      { sectores[setor]          = (sectores[setor]          || 0) + usd; }
    if (mes >= 1 && mes <= 12) { meses[mes]   = (meses[mes]              || 0) + usd; }
  }

  // ── CLUSTERS ──────────────────────────────────────────────────────────────────
  const clusterBuckets = {};
  for (let i = 0; i <= 4; i++) {
    clusterBuckets[i] = { id: i, nombre: CLUSTER_NOMBRES[i], color: CLUSTER_COLORS[i], cantidad: 0, inversion: 0, scores_sum: { Cultura:0, Ejecucion:0, Estructura:0, Competitividad:0, Inversion:0 } };
  }

  for (const [nombre, emp] of Object.entries(empresaMap)) {
    const c = emp.cluster;
    if (c == null || !clusterBuckets[c]) continue;
    clusterBuckets[c].cantidad++;
    clusterBuckets[c].inversion += anunciantes[nombre] || 0;
    for (const dim of ['Cultura','Ejecucion','Estructura','Competitividad','Inversion']) {
      clusterBuckets[c].scores_sum[dim] += emp.scores[dim] || 0;
    }
  }

  const clusters = Object.values(clusterBuckets).map(c => {
    const scores = {};
    for (const [dim, val] of Object.entries(c.scores_sum)) {
      scores[dim] = c.cantidad > 0 ? Math.round((val / c.cantidad) * 1000) / 10 : 0;
    }
    return { id: c.id, nombre: c.nombre, color: c.color, cantidad: c.cantidad, inversion: Math.round(c.inversion), share: totalInversion > 0 ? Math.round(c.inversion / totalInversion * 10000) / 100 : 0, scores };
  });

  // ── SCORES GLOBALES ───────────────────────────────────────────────────────────
  const dims = ['Cultura','Ejecucion','Estructura','Competitividad','Inversion'];
  const scores_globales = {};
  for (const dim of dims) {
    const vals = Object.values(empresaMap).map(e => e.scores[dim]).filter(v => v > 0);
    scores_globales[dim] = vals.length > 0 ? Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*1000)/10 : 0;
  }

  // ── RANKINGS ──────────────────────────────────────────────────────────────────
  const top_anunciantes = Object.entries(anunciantes)
    .sort((a,b) => b[1]-a[1]).slice(0,15)
    .map(([nombre, inv]) => ({
      nombre,
      inversion: Math.round(inv),
      share: Math.round(inv/totalInversion*10000)/100,
      cluster: empresaMap[nombre]?.cluster ?? null,
      tipo_cluster: empresaMap[nombre]?.tipo_cluster || '',
      rubro: empresaMap[nombre]?.rubro || '',
    }));

  const media_mix = Object.entries(medios)
    .sort((a,b) => b[1]-a[1])
    .map(([medio, inv]) => ({ medio, inversion: Math.round(inv), share: Math.round(inv/totalInversion*10000)/100 }));

  const por_grupo = Object.entries(grupos)
    .sort((a,b) => b[1]-a[1]).slice(0,8)
    .map(([grupo, inv]) => ({ grupo, inversion: Math.round(inv), share: Math.round(inv/totalInversion*10000)/100 }));

  const por_agencia = Object.entries(agencias)
    .sort((a,b) => b[1]-a[1]).slice(0,12)
    .map(([agencia, inv]) => ({ agencia, inversion: Math.round(inv), share: Math.round(inv/totalInversion*10000)/100 }));

  const por_sector = Object.entries(sectores)
    .sort((a,b) => b[1]-a[1]).slice(0,12)
    .map(([sector, inv]) => ({ sector, inversion: Math.round(inv), share: Math.round(inv/totalInversion*10000)/100 }));

  const estacionalidad = Array.from({length:12},(_,i) => ({
    mes: i+1, nombre: MES_NOMBRES[i], inversion: Math.round(meses[i+1]||0)
  }));

  return {
    resumen: {
      total_inversion_usd: Math.round(totalInversion),
      total_anunciantes: Object.keys(anunciantes).length,
      market_maturity_index: mmi,
      total_empresas_base: Object.keys(empresaMap).length,
      ano: 2024,
    },
    media_mix,
    top_anunciantes,
    por_grupo_empresarial: por_grupo,
    por_agencia,
    por_sector,
    estacionalidad,
    clusters,
    scores_globales,
    generado_en: new Date().toISOString(),
  };
}

module.exports = { parseAdlens };
