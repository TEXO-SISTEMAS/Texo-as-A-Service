const XLSX = require('xlsx');

const AGENCIAS = ['BRICK', 'NASTA', 'LUPE', 'OMD', 'ROGER'];

// Índices de columna según estructura real del Excel
const C = {
  LABEL:    0,
  TOTAL:    1,   // POA 2026 c/ 3709
  DC_OFF:   3,
  DC_ON:    4,
  DC_PERF:  5,
  DC_TOT:   6,
  CC_ACTIV: 9,
  CC_ASES:  10,
  CC_BRAND: 11,
  CC_CREAT: 12,
  CC_ESTR:  13,
  CC_OTRAS: 14,
  CC_PR:    15,
  CC_SOC:   16,
  CC_TOT:   17,
  SIN3709:  21,  // TOTAL s/3709 (también donde está monto3709 en fila 0)
};

function num(row, col) {
  if (!row) return 0;
  const v = row[col];
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

function findRow(rows, labelPart) {
  const needle = labelPart.toUpperCase();
  for (const row of rows) {
    if (row[C.LABEL] && String(row[C.LABEL]).toUpperCase().includes(needle)) return row;
  }
  return null;
}

function extractAgencia(ws, nombre) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Fila 0: [20]="MONTO 3709" [21]=valor
  let monto3709 = 0;
  const r0 = rows[0] || [];
  for (let i = 0; i < r0.length - 1; i++) {
    if (r0[i] && String(r0[i]).includes('3709') && typeof r0[i + 1] === 'number') {
      monto3709 = r0[i + 1];
      break;
    }
  }

  const facRow   = findRow(rows, 'FACTURACION');
  const costoRow = findRow(rows, 'COSTO');
  const revRow   = findRow(rows, 'REVENUE');
  const rrhhRow  = findRow(rows, 'GASTOS RRHH');
  const comRow   = findRow(rows, 'GASTOS COMERCIALES');
  const adminRow = findRow(rows, 'GASTOS ADMINISTRATIVOS');
  const totRow   = findRow(rows, 'TOTAL GENERAL');
  const ebitdaRow = findRow(rows, 'OPERATING EBITDA');
  const percapRow = findRow(rows, 'PERCAPITA');
  const persRow   = findRow(rows, 'PERSONAS PROMEDIOS');

  const fac_tot = num(facRow, C.TOTAL);
  const fac_cc  = num(facRow, C.CC_TOT);
  const fac_dc  = num(facRow, C.DC_TOT);

  return {
    nombre,
    facturacion_total:     fac_tot,
    facturacion_cc:        fac_cc,
    facturacion_dc:        fac_dc,
    facturacion_pct_cc:    fac_tot > 0 ? fac_cc / fac_tot : 0,
    facturacion_pct_dc:    fac_tot > 0 ? fac_dc / fac_tot : 0,
    revenue_total:         num(revRow,   C.TOTAL),
    revenue_cc:            num(revRow,   C.CC_TOT),
    revenue_dc:            num(revRow,   C.DC_TOT),
    costos_total:          num(costoRow, C.TOTAL),
    ebitda:                num(ebitdaRow, C.TOTAL),
    ebitda_sin3709:        num(ebitdaRow, C.SIN3709),
    gastos_rrhh:           num(rrhhRow,  C.TOTAL),
    gastos_comerciales:    num(comRow,   C.TOTAL),
    gastos_admin:          num(adminRow, C.TOTAL),
    total_egresos:         num(totRow,   C.TOTAL),
    percapita_ebitda:      num(percapRow, C.TOTAL),
    cantidad_personas:     num(persRow,  C.TOTAL),
    monto3709,
    ebitda_dc:             num(ebitdaRow, C.DC_TOT),
    ebitda_cc:             num(ebitdaRow, C.CC_TOT),
    cc_activacion_prod:    num(facRow, C.CC_ACTIV),
    cc_asesorias:          num(facRow, C.CC_ASES),
    cc_branding:           num(facRow, C.CC_BRAND),
    cc_creatividad:        num(facRow, C.CC_CREAT),
    cc_estrategias:        num(facRow, C.CC_ESTR),
    cc_otras_innovaciones: num(facRow, C.CC_OTRAS),
    cc_pr_influencer:      num(facRow, C.CC_PR),
    cc_social_media:       num(facRow, C.CC_SOC),
    dc_off:                num(facRow, C.DC_OFF),
    dc_on:                 num(facRow, C.DC_ON),
    dc_performance:        num(facRow, C.DC_PERF),
    aporte_innovacion:     num(facRow, C.CC_OTRAS) + num(facRow, C.CC_PR) + num(facRow, C.CC_SOC),
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
          resultado.fecha_corte = String(cell);
          break;
        }
      }
      if (resultado.fecha_corte) break;
    }
  }

  for (const agencia of AGENCIAS) {
    const ws = wb.Sheets[`SALUD ${agencia}`];
    if (ws) {
      try { resultado.agencias.push(extractAgencia(ws, agencia)); }
      catch (e) { console.error(`Error parseando SALUD ${agencia}:`, e.message); }
    }
  }

  return resultado;
}

module.exports = { parseExcel };
