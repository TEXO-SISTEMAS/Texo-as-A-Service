const XLSX = require('xlsx');

const MES_NUM = { Ene:1, Feb:2, Mar:3, Abr:4, May:5, Jun:6, Jul:7, Ago:8, Sep:9, Oct:10, Nov:11, Dic:12 };
const MES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Normaliza el tipo de medio a categoría limpia
function normalizarMedio(tipo) {
  if (!tipo) return 'OTROS';
  const t = String(tipo).toUpperCase().trim();
  if (t.includes('TV') && t.includes('CABLE')) return 'TV CABLE';
  if (t.includes('TV')) return 'TV ABIERTA';
  if (t.includes('RADIO')) return 'RADIO';
  if (t.includes('DIGITAL')) return 'DIGITAL';
  if (t.includes('PRENSA')) return 'PRENSA';
  if (t.includes('VIA') || t.includes('PUBLICA')) return 'VIA PUBLICA';
  return 'OTROS';
}

function parseGlobalnum(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets['CUBO'];
  if (!ws) throw new Error('Hoja CUBO no encontrada');

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // Fila 0 = headers: Agencia, Cliente, Medio, Tipo(original), Grupo/Proveedor, Canal, Comisión%, Año, Mes, NºMes, Fecha, Moneda, Importe, Comisión, FilaOrigen, ImporteGs, ComisiónGs
  const H = rows[0];
  const iAgencia   = H.indexOf('Agencia');
  const iCliente   = H.indexOf('Cliente');
  const iMedio     = H.indexOf('Medio');
  const iTipo      = H.indexOf('Tipo (original)');
  const iGrupo     = H.indexOf('Grupo / Proveedor');
  const iCanal     = H.indexOf('Canal');
  const iComPct    = H.indexOf('Comisión %');
  const iMes       = H.indexOf('Mes');
  const iNMes      = H.indexOf('Nº Mes');
  const iImporteGs = H.indexOf('Importe Gs');
  const iComGs     = H.indexOf('Comisión Gs');

  // Acumuladores
  let totalInversion = 0;
  let totalComision  = 0;
  const clientesSet  = new Set();
  const agenciasSet  = new Set();

  // Por mes [0..11]
  const porMes = Array.from({length:12}, (_,i) => ({ mes: MES_LABEL[i], nMes: i+1, inversion: 0, comision: 0 }));

  // Por agencia
  const porAgencia = {};

  // Por medio
  const porMedio = {};

  // Por cliente (top)
  const porCliente = {};

  // Por canal/proveedor
  const porCanal = {};

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[iAgencia]) continue;

    const agencia  = String(r[iAgencia]).trim();
    const cliente  = r[iCliente] ? String(r[iCliente]).trim() : '—';
    const medio    = normalizarMedio(r[iMedio] || r[iTipo]);
    const canal    = r[iCanal]  ? String(r[iCanal]).trim()  : '—';
    const grupo    = r[iGrupo]  ? String(r[iGrupo]).trim()  : '—';
    const nMes     = typeof r[iNMes] === 'number' ? r[iNMes] : (MES_NUM[r[iMes]] || 0);
    const inv      = parseFloat(r[iImporteGs]) || 0;
    const com      = parseFloat(r[iComGs])     || 0;

    if (nMes < 1 || nMes > 12) continue;

    totalInversion += inv;
    totalComision  += com;
    clientesSet.add(cliente);
    agenciasSet.add(agencia);

    // Mes
    porMes[nMes - 1].inversion += inv;
    porMes[nMes - 1].comision  += com;

    // Agencia
    if (!porAgencia[agencia]) porAgencia[agencia] = { inversion: 0, comision: 0 };
    porAgencia[agencia].inversion += inv;
    porAgencia[agencia].comision  += com;

    // Medio
    if (!porMedio[medio]) porMedio[medio] = { inversion: 0, comision: 0 };
    porMedio[medio].inversion += inv;
    porMedio[medio].comision  += com;

    // Cliente
    if (!porCliente[cliente]) porCliente[cliente] = { inversion: 0, comision: 0 };
    porCliente[cliente].inversion += inv;
    porCliente[cliente].comision  += com;

    // Canal
    const canalKey = grupo !== '—' ? grupo : canal;
    if (!porCanal[canalKey]) porCanal[canalKey] = { inversion: 0, comision: 0 };
    porCanal[canalKey].inversion += inv;
    porCanal[canalKey].comision  += com;
  }

  // Semestres
  const s1 = porMes.slice(0,6).reduce((a,m) => ({ inversion: a.inversion+m.inversion, comision: a.comision+m.comision }), { inversion:0, comision:0 });
  const s2 = porMes.slice(6,12).reduce((a,m) => ({ inversion: a.inversion+m.inversion, comision: a.comision+m.comision }), { inversion:0, comision:0 });

  // Trimestres
  const q1 = porMes.slice(0,3).reduce((a,m)  => ({ inversion: a.inversion+m.inversion, comision: a.comision+m.comision }), { inversion:0, comision:0 });
  const q2 = porMes.slice(3,6).reduce((a,m)  => ({ inversion: a.inversion+m.inversion, comision: a.comision+m.comision }), { inversion:0, comision:0 });
  const q3 = porMes.slice(6,9).reduce((a,m)  => ({ inversion: a.inversion+m.inversion, comision: a.comision+m.comision }), { inversion:0, comision:0 });
  const q4 = porMes.slice(9,12).reduce((a,m) => ({ inversion: a.inversion+m.inversion, comision: a.comision+m.comision }), { inversion:0, comision:0 });

  // Top clientes
  const topClientes = Object.entries(porCliente)
    .map(([nombre, d]) => ({ nombre, ...d, pct: totalInversion > 0 ? d.inversion / totalInversion : 0 }))
    .sort((a,b) => b.inversion - a.inversion)
    .slice(0, 15);

  // Agencias array
  const agencias = Object.entries(porAgencia)
    .map(([nombre, d]) => ({ nombre, ...d, pct: totalInversion > 0 ? d.inversion / totalInversion : 0 }))
    .sort((a,b) => b.inversion - a.inversion);

  // Medios array
  const medios = Object.entries(porMedio)
    .map(([nombre, d]) => ({ nombre, ...d, pct: totalInversion > 0 ? d.inversion / totalInversion : 0 }))
    .sort((a,b) => b.inversion - a.inversion);

  // Canales top 10
  const canales = Object.entries(porCanal)
    .map(([nombre, d]) => ({ nombre, ...d }))
    .sort((a,b) => b.inversion - a.inversion)
    .slice(0, 10);

  // Meses con datos (último mes con inversión > 0)
  const mesesConDatos = porMes.filter(m => m.inversion > 0);
  const periodo = mesesConDatos.length > 0
    ? `${mesesConDatos[0].mes} – ${mesesConDatos[mesesConDatos.length-1].mes} 2025`
    : '2025';

  return {
    periodo,
    totales: { inversion: totalInversion, comision: totalComision, clientes: clientesSet.size, agencias: agenciasSet.size },
    semestres: [
      { label: 'S1 · Ene–Jun', meses: 'Ene–Jun', ...s1 },
      { label: 'S2 · Jul–Dic', meses: 'Jul–Dic', ...s2 },
    ],
    trimestres: [
      { label: 'Q1 · Ene–Mar', ...q1 },
      { label: 'Q2 · Abr–Jun', ...q2 },
      { label: 'Q3 · Jul–Sep', ...q3 },
      { label: 'Q4 · Oct–Dic', ...q4 },
    ],
    porMes,
    agencias,
    medios,
    topClientes,
    canales,
  };
}

module.exports = { parseGlobalnum };
