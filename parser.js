const XLSX = require('xlsx');

const AGENCIAS = ['BRICK', 'NASTA', 'LUPE', 'OMD', 'ROGER'];

function getRowValue(rows, labelPart, colIndex = 1) {
  for (const row of rows) {
    const cell = row[0];
    if (cell && String(cell).toUpperCase().includes(labelPart.toUpperCase())) {
      const val = row[colIndex];
      return typeof val === 'number' ? val : parseFloat(val) || 0;
    }
  }
  return 0;
}

function extractAgencia(ws, nombre) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const v = (label) => getRowValue(rows, label, 1);

  function ccVal(label, idx) {
    for (const row of rows) {
      if (row[0] && String(row[0]).toUpperCase().includes(label.toUpperCase())) {
        return typeof row[idx] === 'number' ? row[idx] : 0;
      }
    }
    return 0;
  }

  // Monto 3709
  let monto3709 = 0;
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (row[i] && String(row[i]).includes('3709')) {
        if (typeof row[i+1] === 'number') { monto3709 = row[i+1]; break; }
      }
    }
    if (monto3709) break;
  }

  const ebitda = v('OPERATING EBITDA');

  // EBITDA sin 3709 — buscar segunda columna numérica en esa fila
  let ebitda_sin3709 = 0;
  for (const row of rows) {
    if (row[0] && String(row[0]).toUpperCase().includes('OPERATING EBITDA')) {
      for (let i = 20; i < Math.min(row.length, 35); i++) {
        if (typeof row[i] === 'number' && row[i] !== ebitda) {
          ebitda_sin3709 = row[i]; break;
        }
      }
      break;
    }
  }

  const facturacion_total  = v('FACTURACION');
  const facturacion_cc     = ccVal('FACTURACION', 11);
  const facturacion_dc     = ccVal('FACTURACION', 16);
  const revenue_total      = v('REVENUE');
  const revenue_cc         = ccVal('REVENUE', 11);
  const revenue_dc         = ccVal('REVENUE', 16);

  return {
    nombre,
    facturacion_total,
    facturacion_cc,
    facturacion_dc,
    facturacion_pct_cc: facturacion_total > 0 ? facturacion_cc / facturacion_total : 0,
    facturacion_pct_dc: facturacion_total > 0 ? facturacion_dc / facturacion_total : 0,
    revenue_total,
    revenue_cc,
    revenue_dc,
    costos_total:       v('COSTO'),
    ebitda,
    ebitda_sin3709,
    gastos_rrhh:        v('GASTOS RRHH'),
    gastos_comerciales: v('GASTOS COMERCIALES'),
    gastos_admin:       v('GASTOS ADMINISTRATIVOS'),
    total_egresos:      v('TOTAL GENERAL'),
    percapita_ebitda:   v('PERCAPITA'),
    cantidad_personas:  v('PERSONAS PROMEDIOS'),
    monto3709,
    cc_creatividad:        ccVal('FACTURACION', 6),
    cc_activacion_prod:    ccVal('FACTURACION', 3),
    cc_social_media:       ccVal('FACTURACION', 10),
    cc_pr_influencer:      ccVal('FACTURACION', 9),
    cc_asesorias:          ccVal('FACTURACION', 4),
    cc_otras_innovaciones: ccVal('FACTURACION', 8),
    cc_branding:           ccVal('FACTURACION', 5),
    cc_estrategias:        ccVal('FACTURACION', 7),
    dc_off:                ccVal('FACTURACION', 13),
    dc_on:                 ccVal('FACTURACION', 14),
    dc_performance:        ccVal('FACTURACION', 15),
  };
}

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const resultado = { fecha_corte: '', agencias: [] };

  const consolidado = wb.Sheets['CONSOLIDADO AGENCIAS'];
  if (consolidado) {
    const rows = XLSX.utils.sheet_to_json(consolidado, { header: 1, defval: null });
    for (const row of rows) {
      for (const cell of row) {
        if (cell && String(cell).toUpperCase().includes('CORTE')) {
          resultado.fecha_corte = String(cell); break;
        }
      }
      if (resultado.fecha_corte) break;
    }
  }

  for (const agencia of AGENCIAS) {
    const ws = wb.Sheets[`SALUD ${agencia}`];
    if (ws) {
      try { resultado.agencias.push(extractAgencia(ws, agencia)); }
      catch(e) { console.error(`Error parseando SALUD ${agencia}:`, e.message); }
    }
  }

  return resultado;
}

module.exports = { parseExcel };
