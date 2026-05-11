const XLSX = require('xlsx');

// Agencias que tienen hoja SALUD individual
const AGENCIAS = ['BRICK', 'NASTA', 'LUPE', 'OMD', 'ROGER'];

/**
 * Busca un valor numérico en la hoja buscando la fila que contenga el label dado
 * en la columna A (o B), y devuelve el valor de la columna B (índice 1).
 */
function getRowValue(rows, labelPart, colIndex = 1) {
  for (const row of rows) {
    const cell = row[0];
    if (cell && String(cell).includes(labelPart)) {
      const val = row[colIndex];
      return typeof val === 'number' ? val : parseFloat(val) || 0;
    }
  }
  return 0;
}

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  return rows;
}

/**
 * Extrae datos de una hoja SALUD_XXXX.
 * Las hojas tienen estructura: col B = "con 3709", col W-ish = "sin 3709"
 * Fila 1 (índice 0): headers
 * Las filas de datos empiezan desde la fila 2 (índice 2+)
 */
function extractAgencia(ws, nombre) {
  const rows = parseSheet(ws);

  // Encontrar fila de MONTO 3709 (suele estar en fila 1, cerca de col U-V)
  let monto3709 = 0;
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (row[i] && String(row[i]).includes('MONTO 3709')) {
        monto3709 = parseFloat(row[i + 1]) || 0;
        break;
      }
    }
    if (monto3709) break;
  }

  // Helper para buscar valor en columna B (índice 1) = con 3709
  const v = (label) => getRowValue(rows, label, 1);

  // Helper para buscar valor en columnas CC / DC de la vista CON 3709
  // Las columnas de sub-arenas CC empiezan aprox en col D (índice 3)
  // Orden: ACTI/PROD, ASESORIAS, BRANDING, CREATIVIDAD, ESTRATEGIAS, OTRAS INNOV, PR/INFLUENCER, SOCIAL MEDIA, TOTAL CC, %CC
  function getSubArena(labelFila, colOffset) {
    for (const row of rows) {
      if (row[0] && String(row[0]).includes(labelFila)) {
        return typeof row[colOffset] === 'number' ? row[colOffset] : 0;
      }
    }
    return 0;
  }

  // Facturación con 3709
  const facturacion_total  = v('FACTURACION');
  // Revenue
  const revenue_total      = v('REVENUE');
  // Costos
  const costos_total       = v('COSTO');
  // EBITDA operating con 3709
  const ebitda             = v('OPERATING EBITDA');
  // Egresos
  const gastos_rrhh        = v('GASTOS RRHH');
  const gastos_comerciales = v('GASTOS COMERCIALES');
  const gastos_admin       = v('GASTOS ADMINISTRATIVOS');
  const total_egresos      = v('TOTAL GENERAL');
  // Per cápita
  const percapita_ebitda   = v('PERCAPITA');
  const cantidad_personas  = v('PERSONAS PROMEDIOS');

  // EBITDA sin 3709: buscamos la col ~23 (índice 22) en la fila OPERATING EBITDA
  let ebitda_sin3709 = 0;
  for (const row of rows) {
    if (row[0] && String(row[0]).includes('OPERATING EBITDA')) {
      // Col W (índice ~22) suele ser el valor sin 3709
      for (let i = 20; i < Math.min(row.length, 30); i++) {
        if (typeof row[i] === 'number' && row[i] !== ebitda) {
          ebitda_sin3709 = row[i];
          break;
        }
      }
      break;
    }
  }

  // Facturación sin 3709
  let facturacion_sin3709 = facturacion_total - monto3709;

  // Sub-arenas CC (col indices 3..10 en fila FACTURACION)
  // ACTI=3, ASESORIAS=4, BRANDING=5, CREATIVIDAD=6, ESTRATEGIAS=7, OTRAS=8, PR=9, SOCIAL=10
  function ccVal(label, idx) {
    return getSubArena(label, idx);
  }

  const cc_activacion_prod    = ccVal('FACTURACION', 3);
  const cc_asesorias          = ccVal('FACTURACION', 4);
  const cc_branding           = ccVal('FACTURACION', 5);
  const cc_creatividad        = ccVal('FACTURACION', 6);
  const cc_estrategias        = ccVal('FACTURACION', 7);
  const cc_otras_innovaciones = ccVal('FACTURACION', 8);
  const cc_pr_influencer      = ccVal('FACTURACION', 9);
  const cc_social_media       = ccVal('FACTURACION', 10);
  const facturacion_cc        = ccVal('FACTURACION', 11); // TOTAL CC

  // DC (col 13=OFF, 14=ON, 15=PERFORMANCE, 16=TOTAL DC)
  const dc_off         = ccVal('FACTURACION', 13);
  const dc_on          = ccVal('FACTURACION', 14);
  const dc_performance = ccVal('FACTURACION', 15);
  const facturacion_dc = ccVal('FACTURACION', 16);

  // Revenue CC / DC
  const revenue_cc = ccVal('REVENUE', 11);
  const revenue_dc = ccVal('REVENUE', 16);

  // % CC y DC de facturación
  const facturacion_pct_cc = facturacion_total > 0 ? facturacion_cc / facturacion_total : 0;
  const facturacion_pct_dc = facturacion_total > 0 ? facturacion_dc / facturacion_total : 0;

  return {
    nombre,
    facturacion_total,
    facturacion_cc,
    facturacion_dc,
    facturacion_pct_cc,
    facturacion_pct_dc,
    revenue_total,
    revenue_cc,
    revenue_dc,
    costos_total,
    ebitda,
    ebitda_sin3709,
    gastos_rrhh,
    gastos_comerciales,
    gastos_admin,
    total_egresos,
    percapita_ebitda,
    cantidad_personas,
    monto3709,
    cc_creatividad,
    cc_activacion_prod,
    cc_social_media,
    cc_pr_influencer,
    cc_asesorias,
    cc_otras_innovaciones,
    cc_branding,
    cc_estrategias,
    dc_off,
    dc_on,
    dc_performance
  };
}

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const resultado = {
    fecha_corte: '',
    agencias: []
  };

  // Intentar extraer fecha de corte del sheet CONSOLIDADO AGENCIAS
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

  // Parsear cada hoja SALUD XXXX
  for (const agencia of AGENCIAS) {
    const sheetName = `SALUD ${agencia}`;
    const ws = wb.Sheets[sheetName];
    if (ws) {
      try {
        const data = extractAgencia(ws, agencia);
        resultado.agencias.push(data);
      } catch (e) {
        console.error(`Error parseando ${sheetName}:`, e.message);
      }
    }
  }

  return resultado;
}

module.exports = { parseExcel };
