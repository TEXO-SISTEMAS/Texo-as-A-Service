const XLSX = require('xlsx');

const ORDEN_MES = [
  'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'
];

const AGENCIAS_EBITDA = ['BRICK','NASTA','ROGER','LUPE','OMD','AMPLIFY'];

function num(v) {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

function normalizeArena(a) {
  if (!a) return 'OTRO';
  const s = a.toString().trim().toUpperCase();
  if (s.includes('DISTRIBUC') || s === 'DC' || s === 'CD') return 'DC';
  if (s.includes('CREAC') || s === 'CC') return 'CC';
  if (s.includes('TRADE')) return 'TRADE';
  if (s === 'BI') return 'BI';
  return s.slice(0, 30);
}

function parseBdIngreso(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }).slice(1);

  const agencias = {};
  const periodos = {};
  const clientes = {};
  const arenas   = {};

  for (const r of rows) {
    if (!r[0]) continue;
    if ((r[5] || '').toString().toUpperCase() === 'ANULADO') continue;

    const ag  = (r[0]  || '').toString().trim();
    const per = (r[11] || '').toString().trim().toUpperCase();
    const cli = (r[10] || r[9] || '').toString().trim();
    const are = normalizeArena(r[19]);
    const sub = (r[20] || '').toString().trim();
    const fac = num(r[13]);
    const rev = num(r[17]);
    const cos = num(r[15]);

    if (!agencias[ag]) agencias[ag] = { fac:0, rev:0, cos:0, tx:0 };
    agencias[ag].fac += fac; agencias[ag].rev += rev;
    agencias[ag].cos += cos; agencias[ag].tx++;

    const mes = ORDEN_MES.find(m => per.includes(m)) || per;
    if (!periodos[mes]) periodos[mes] = { fac:0, rev:0 };
    periodos[mes].fac += fac; periodos[mes].rev += rev;

    if (cli) {
      const cliKey = cli.slice(0, 60);
      if (!clientes[cliKey]) clientes[cliKey] = { fac:0, rev:0 };
      clientes[cliKey].fac += fac; clientes[cliKey].rev += rev;
    }

    if (!arenas[are]) arenas[are] = { fac:0, rev:0, subArenas:{} };
    arenas[are].fac += fac; arenas[are].rev += rev;
    if (sub) {
      if (!arenas[are].subArenas[sub]) arenas[are].subArenas[sub] = 0;
      arenas[are].subArenas[sub] += fac;
    }
  }

  const totFac = Object.values(agencias).reduce((s,d) => s+d.fac, 0);
  const totRev = Object.values(agencias).reduce((s,d) => s+d.rev, 0);
  const totTx  = Object.values(agencias).reduce((s,d) => s+d.tx,  0);

  const agList = Object.entries(agencias)
    .map(([nombre, d]) => ({
      nombre,
      facturacion:  Math.round(d.fac),
      revenue:      Math.round(d.rev),
      margen:       d.fac > 0 ? +(d.rev/d.fac).toFixed(4) : 0,
      transacciones: d.tx,
    }))
    .sort((a,b) => b.facturacion - a.facturacion);

  const periodosList = ORDEN_MES
    .filter(m => periodos[m])
    .map(m => ({
      mes: m,
      facturacion: Math.round(periodos[m].fac),
      revenue:     Math.round(periodos[m].rev),
    }));

  const topClientes = Object.entries(clientes)
    .filter(([n]) => n.length > 1)
    .map(([nombre, d]) => ({
      nombre,
      facturacion: Math.round(d.fac),
      revenue:     Math.round(d.rev),
      pct:         totFac > 0 ? +(d.fac/totFac).toFixed(4) : 0,
    }))
    .sort((a,b) => b.facturacion - a.facturacion)
    .slice(0, 20);

  const arenasList = Object.entries(arenas)
    .map(([nombre, d]) => ({
      nombre,
      facturacion: Math.round(d.fac),
      revenue:     Math.round(d.rev),
      margen:      d.fac > 0 ? +(d.rev/d.fac).toFixed(4) : 0,
      pct_fac:     totFac > 0 ? +(d.fac/totFac).toFixed(4) : 0,
      topSubArenas: Object.entries(d.subArenas)
        .sort((a,b) => b[1]-a[1]).slice(0,5)
        .map(([nombre, fac]) => ({ nombre, facturacion: Math.round(fac) })),
    }))
    .sort((a,b) => b.facturacion - a.facturacion);

  return {
    totales: {
      facturacion:  Math.round(totFac),
      revenue:      Math.round(totRev),
      margen:       totFac > 0 ? +(totRev/totFac).toFixed(4) : 0,
      transacciones: totTx,
    },
    agencias: agList,
    periodos: periodosList,
    topClientes,
    arenas: arenasList,
  };
}

function parseSarEbitda(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const empresas = [];

  for (const r of rows.slice(6)) {
    if (!r[0]) continue;
    const label = r[0].toString().trim().toUpperCase();
    const isEmpresa = AGENCIAS_EBITDA.some(a => label === a);
    if (!isEmpresa) continue;

    const fac   = num(r[1]);
    const rev   = num(r[2]);
    const rrhh  = num(r[5]);
    const com   = num(r[6]);
    const adm   = num(r[7]);
    const ebit  = num(r[8]);
    const sin3  = num(r[10]);
    const pers  = num(r[11]);
    const perc  = num(r[12]);

    empresas.push({
      empresa:        r[0].toString().trim(),
      facturacion:    Math.round(fac),
      revenue:        Math.round(rev),
      margen_rev:     fac > 0 ? +(rev/fac).toFixed(4) : 0,
      rrhh:           Math.round(rrhh),
      comerciales:    Math.round(com),
      admin:          Math.round(adm),
      ebitda:         Math.round(ebit),
      ebitda_sin3709: Math.round(sin3),
      margen_ebitda:  rev > 0 ? +(ebit/rev).toFixed(4) : 0,
      personas:       Math.round(pers),
      percapita:      Math.round(perc),
    });
  }

  return empresas;
}

function detectPeriodo(agencias) {
  if (!agencias.length) return '';
  const meses = agencias.periodos ? agencias.periodos.map(p => p.mes) : [];
  if (!meses.length) return '';
  const primero = meses[0];
  const ultimo  = meses[meses.length - 1];
  return primero === ultimo ? primero : `${primero} – ${ultimo}`;
}

function parseIngresos(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const wsBd  = wb.Sheets['BD INGRESO'];
  const wsSar = wb.Sheets['SUB ARENAS REPORT (3)'];

  if (!wsBd) throw new Error('Hoja "BD INGRESO" no encontrada. Verificá que el archivo sea el Detalle de Ingresos correcto.');

  const bd     = parseBdIngreso(wsBd);
  const ebitda = parseSarEbitda(wsSar);

  const meses  = bd.periodos.map(p => p.mes);
  const periodo = meses.length === 0 ? '' :
    meses.length === 1 ? meses[0] :
    `${meses[0]} – ${meses[meses.length - 1]}`;

  return {
    tipo:         'ingresos',
    periodo,
    fecha_carga:  new Date().toISOString(),
    totales:      bd.totales,
    agencias:     bd.agencias,
    periodos:     bd.periodos,
    topClientes:  bd.topClientes,
    arenas:       bd.arenas,
    ebitda,
  };
}

module.exports = { parseIngresos };
