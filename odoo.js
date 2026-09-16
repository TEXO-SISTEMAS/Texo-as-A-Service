// ── ODOO ──────────────────────────────────────────────────────────────────────
// Conector JSON-RPC a la API externa de Odoo (https://www.odoo.com/documentation/
// 18.0/developer/reference/external_api.html). Pensado para traer datos de Odoo
// hacia acá — arranca en modo diagnóstico (resolver un menú al modelo técnico
// que muestra) y de ahí se suman las funciones de sincronización reales.
//
// Variables de entorno requeridas:
//   ODOO_URL       — ej. https://texo.odoo.com (sin barra al final)
//   ODOO_DB        — nombre de la base, ej. texo-produccion-20230408
//   ODOO_USERNAME  — login/email del usuario dueño de la API key
//   ODOO_API_KEY   — API key generada en Odoo (Mi Perfil → Seguridad de la
//                    Cuenta → Claves API) — reemplaza a la contraseña

// .trim() defensivo — un espacio o salto de línea de más al pegar la API key
// en Vercel alcanza para que Odoo rechace la autenticación sin avisar por qué.
const ODOO_URL      = (process.env.ODOO_URL || '').trim().replace(/\/+$/, '');
const ODOO_DB       = (process.env.ODOO_DB || '').trim();
const ODOO_USERNAME = (process.env.ODOO_USERNAME || '').trim();
const ODOO_API_KEY  = (process.env.ODOO_API_KEY || '').trim();

let _odooUid = null;

async function odooRpc(service, method, args) {
  if (!ODOO_URL) throw new Error('Falta la variable de entorno ODOO_URL');
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: Math.floor(Math.random() * 1e9),
    }),
  });
  if (!r.ok) throw new Error(`Odoo respondió HTTP ${r.status}`);
  const json = await r.json();
  if (json.error) {
    const data = json.error.data || {};
    throw new Error(data.message || json.error.message || 'Error desconocido de Odoo');
  }
  return json.result;
}

// Autentica una sola vez y cachea el uid en memoria (se pierde entre cold
// starts de la función serverless, que es exactamente lo que queremos: nunca
// arrastrar una sesión vencida).
async function odooAuthenticate() {
  if (_odooUid) return _odooUid;
  if (!ODOO_DB || !ODOO_USERNAME || !ODOO_API_KEY) {
    throw new Error('Faltan variables de entorno de Odoo (ODOO_DB, ODOO_USERNAME, ODOO_API_KEY)');
  }
  const uid = await odooRpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}]);
  if (!uid) throw new Error('Odoo rechazó la autenticación — revisá ODOO_USERNAME y ODOO_API_KEY');
  _odooUid = uid;
  return uid;
}

async function odooExecuteKw(model, method, args = [], kwargs = {}) {
  const uid = await odooAuthenticate();
  return odooRpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs]);
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Prueba la autenticación por XML-RPC (el otro protocolo que expone la API
// externa de Odoo, /xmlrpc/2/common) en paralelo a JSON-RPC — algunas
// instancias de Odoo Online habilitan uno sí y el otro no, aunque ambos
// respondan igual a llamadas públicas como version(). Parser mínimo a mano
// (sin agregar dependencias) para esta única llamada.
async function odooXmlRpcAuthenticate(login) {
  if (!ODOO_URL || !ODOO_DB || !login || !ODOO_API_KEY) return { skipped: true };
  const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${xmlEscape(ODOO_DB)}</string></value></param>
    <param><value><string>${xmlEscape(login)}</string></value></param>
    <param><value><string>${xmlEscape(ODOO_API_KEY)}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;
  let text;
  try {
    const r = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body,
    });
    text = await r.text();
    if (!r.ok) return { httpStatus: r.status, raw: text.slice(0, 500) };
  } catch (e) {
    return { fetchError: e.message };
  }
  const faultMatch = text.match(/<name>faultString<\/name>\s*<value><string>([\s\S]*?)<\/string>/);
  if (faultMatch) return { fault: faultMatch[1] };
  const intMatch = text.match(/<int>(\d+)<\/int>/);
  if (intMatch) return { uid: Number(intMatch[1]) };
  const boolMatch = text.match(/<boolean>(\d)<\/boolean>/);
  if (boolMatch) return { uid: boolMatch[1] === '1' };
  return { unparsed: text.slice(0, 500) };
}

// Diagnóstico de conexión: separa "¿el endpoint JSON-RPC responde?" (no
// necesita credenciales — common.version() es público en toda instancia
// Odoo) de "¿las credenciales son correctas?" (authenticate), para no tener
// que adivinar en cuál de los dos pasos está el problema.
async function odooDiag(loginOverride) {
  const rawKey = process.env.ODOO_API_KEY || '';
  const rawUser = process.env.ODOO_USERNAME || '';
  const loginTried = (loginOverride || ODOO_USERNAME || '').trim();
  const envCheck = {
    ODOO_URL: ODOO_URL || null,
    ODOO_DB: ODOO_DB || null,
    ODOO_USERNAME: ODOO_USERNAME || null,
    ODOO_USERNAME_had_whitespace: rawUser !== ODOO_USERNAME,
    ODOO_API_KEY_set: !!ODOO_API_KEY,
    ODOO_API_KEY_length: ODOO_API_KEY.length,
    ODOO_API_KEY_had_whitespace: rawKey !== ODOO_API_KEY,
    ODOO_API_KEY_preview: ODOO_API_KEY ? `${ODOO_API_KEY.slice(0, 4)}…${ODOO_API_KEY.slice(-4)}` : null,
    login_tried: loginTried,
  };

  let version = null, versionError = null;
  try { version = await odooRpc('common', 'version', []); }
  catch (e) { versionError = e.message; }

  // db.list() no necesita credenciales — si responde, confirma (o descarta)
  // el nombre exacto de la base sin tener que adivinar. Algunas instancias
  // de Odoo Online lo deshabilitan por seguridad; si tira error, no es un
  // problema, solo no aporta este dato puntual.
  let dbList = null, dbListError = null, dbNameMatches = null;
  try {
    dbList = await odooRpc('db', 'list', []);
    dbNameMatches = Array.isArray(dbList) ? dbList.includes(ODOO_DB) : null;
  } catch (e) { dbListError = e.message; }

  let uid = null, authError = null;
  if (ODOO_DB && loginTried && ODOO_API_KEY) {
    try { uid = await odooRpc('common', 'authenticate', [ODOO_DB, loginTried, ODOO_API_KEY, {}]); }
    catch (e) { authError = e.message; }
  }

  const xmlrpc = await odooXmlRpcAuthenticate(loginTried);

  return {
    envCheck, version, versionError,
    dbList, dbListError, dbNameMatches,
    jsonrpc_uid: uid,
    jsonrpc_authResult: uid === false ? 'Odoo devolvió false (usuario/API key/DB incorrectos)' : (uid ? 'OK' : null),
    authError,
    xmlrpc,
  };
}

// Resuelve un menú de Odoo (el número que aparece en la URL como menu_id=XXX)
// hasta el modelo técnico real que muestra esa pantalla, más la lista de
// campos disponibles — para no tener que adivinar de qué tabla traer los datos.
async function odooResolveMenu(menuId) {
  const [menu] = await odooExecuteKw('ir.ui.menu', 'read', [[Number(menuId)], ['name', 'action']]);
  if (!menu) throw new Error(`No se encontró el menú ${menuId} en Odoo`);
  if (!menu.action) return { menu, action: null, model: null, fields: null };

  const [actionModel, actionId] = menu.action.split(',');
  const [action] = await odooExecuteKw(actionModel, 'read', [[Number(actionId)], ['name', 'res_model', 'domain', 'context']]);
  const model = action?.res_model || null;

  let fields = null;
  if (model) {
    const fieldsRaw = await odooExecuteKw(model, 'fields_get', [], { attributes: ['string', 'type'] });
    fields = Object.entries(fieldsRaw)
      .map(([name, def]) => ({ name, label: def.string, type: def.type }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return { menu, action, model, fields };
}

// Campos + un par de registros de muestra de un modelo conocido — para
// modelos custom (como "inversion.medios") donde ya sabemos el nombre técnico
// (por ejemplo, leído directo de la URL de Odoo con ?debug=1) y no hace falta
// pasar por ir.ui.menu/ir.actions.act_window (que pide permisos extra).
async function odooModelFields(model, sampleLimit = 3) {
  const fieldsRaw = await odooExecuteKw(model, 'fields_get', [], { attributes: ['string', 'type', 'relation', 'required'] });
  const fields = Object.entries(fieldsRaw)
    .map(([name, def]) => ({ name, label: def.string, type: def.type, relation: def.relation || null, required: !!def.required }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let sample = null, sampleError = null;
  try {
    sample = await odooExecuteKw(model, 'search_read', [[]], { limit: sampleLimit });
  } catch (e) { sampleError = e.message; }

  return { model, count: fields.length, fields, sample, sampleError };
}

// Lista los estados reales que puede tener inversion.medios (selection del
// campo) + cuántos registros de 2026 hay en cada uno — para decidir con datos
// reales qué estados incluir/excluir del sync, en vez de adivinar.
async function odooEstadosInversionMedios() {
  const domain = [['fecha_desde', '>=', '2026-01-01'], ['fecha_desde', '<', '2027-01-01']];
  const fieldDef = await odooExecuteKw('inversion.medios', 'fields_get', [['state']], { attributes: ['string', 'selection'] });
  const selection = fieldDef.state?.selection || [];
  const groups = await odooExecuteKw('inversion.medios', 'read_group', [domain, ['state'], ['state']]);
  const conteoPorEstado = {};
  for (const g of groups) conteoPorEstado[g.state] = g['state_count'] ?? g['__count'] ?? 0;
  return { selection, conteoPorEstado };
}

// ── SINCRONIZACIÓN: INVERSIÓN DE MEDIOS ───────────────────────────────────────
// Modelo real: "inversion.medios" (custom, confirmado sep 2026). Mapeo de
// compañía -> agencia confirmado a mano con Danilo; las que no aparecen en
// este mapa (TEXO S.A. = holding sin inversión propia; PROJECT SOCIEDAD
// ANONIMA = pendiente de aclarar por qué está separada de MEDIABRAND, por
// ahora se excluye) simplemente se descartan al sincronizar.
const GN_AGENCIA_MAP = {
  'PUBLICITARIA NASTA SA': 'NASTA',
  'BRICK SA': 'BRICK',
  'ENE S.A.': 'LUPE',
  'MEDIABRAND S.A.': 'OMD',
  'LA MEDIA DE LUPE S.A.': 'ROGER',
};

const GN_MES_LABEL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function gnNormalizarMedio(tipo) {
  if (!tipo) return 'OTROS';
  const t = String(tipo).toUpperCase();
  if (t.includes('TV') && t.includes('CABLE')) return 'TV CABLE';
  if (t.includes('TV')) return 'TV ABIERTA';
  if (t.includes('RADIO')) return 'RADIO';
  if (t.includes('DIGITAL')) return 'DIGITAL';
  if (t.includes('PRENSA')) return 'PRENSA';
  if (t.includes('VIA') || t.includes('PUBLICA')) return 'VIA PUBLICA';
  return 'OTROS';
}

// "2026-03-24 21:10:55" o "2026-03-24" → {anio, nMes, mes}. Parseo por string,
// no por Date(), para no arrastrar corrimientos de huso horario.
function gnParseFecha(str) {
  if (!str || typeof str !== 'string' || str.length < 7) return null;
  const anio = parseInt(str.slice(0, 4), 10);
  const nMes = parseInt(str.slice(5, 7), 10);
  if (!anio || !nMes || nMes < 1 || nMes > 12) return null;
  return { anio, nMes, mes: GN_MES_LABEL[nMes - 1] };
}

const m2o = (v) => (Array.isArray(v) && v.length > 1) ? v[1] : null;

// Trae TODAS las inversion.medios confirmadas de Odoo, paginado, y las
// transforma al mismo shape de "fila cruda" que ya usa el resto del módulo
// (agencia/cliente/medio/tipo/grupo/canal/nMes/mes/anio/moneda/importe/
// comision/invGs/comGs/invUsd/comUsd) — mismos nombres que gnParsearEnBrowser
// en public/index.html, para no tener que tocar el render del lado cliente.
async function odooFetchInversionMedios({ pageSize = 2000, onProgress } = {}) {
  const domain = [['fecha_desde', '>=', '2026-01-01'], ['fecha_desde', '<', '2027-01-01']];
  const fields = [
    'company_id', 'partner_id', 'tipo_medio_id', 'grupo_id', 'canal_id',
    'fecha_desde', 'create_date', 'currency_id', 'es_moneda_extranjera',
    'monto_negociado', 'valor_comision',
    'total_monto_negociado_pyg', 'valor_comision_pyg',
    'total_monto_negociado_ext', 'valor_comision_ext',
  ];

  const rawRows = [];
  let offset = 0, total = null, skippedCompania = 0, skippedFecha = 0, usoFallbackCreateDate = 0;
  const skippedPorCompania = {}, aniosDetectados = {};
  for (;;) {
    const page = await odooExecuteKw('inversion.medios', 'search_read', [domain], {
      fields, limit: pageSize, offset, order: 'id asc',
    });
    if (total === null) {
      total = await odooExecuteKw('inversion.medios', 'search_count', [domain]);
    }
    for (const r of page) {
      // Odoo devuelve algunos nombres de compañía con un espacio final
      // (ej. "BRICK SA ") — sin el trim() no matcheaban contra el mapa y se
      // descartaban por error miles de filas válidas.
      const companiaRaw = m2o(r.company_id);
      const companiaNombre = companiaRaw ? companiaRaw.trim() : companiaRaw;
      const agencia = GN_AGENCIA_MAP[companiaNombre];
      if (!agencia) {
        skippedCompania++;
        const key = companiaNombre || '(sin compañía)';
        skippedPorCompania[key] = (skippedPorCompania[key] || 0) + 1;
        continue;
      }

      const fechaDesdeParsed = gnParseFecha(r.fecha_desde);
      const fecha = fechaDesdeParsed || gnParseFecha(r.create_date);
      if (!fecha) { skippedFecha++; continue; } // sin fecha no se puede ubicar en el calendario
      if (!fechaDesdeParsed) usoFallbackCreateDate++;
      aniosDetectados[fecha.anio] = (aniosDetectados[fecha.anio] || 0) + 1;

      const tipoLabel = m2o(r.tipo_medio_id) || '';
      rawRows.push({
        agencia,
        cliente: m2o(r.partner_id) || '—',
        medio: gnNormalizarMedio(tipoLabel),
        tipo: tipoLabel || '—',
        grupo: m2o(r.grupo_id) || '—',
        canal: m2o(r.canal_id) || '—',
        nMes: fecha.nMes, mes: fecha.mes, anio: fecha.anio,
        moneda: m2o(r.currency_id),
        importe: r.monto_negociado || 0,
        comision: r.valor_comision || 0,
        invGs: r.total_monto_negociado_pyg || 0,
        comGs: r.valor_comision_pyg || 0,
        invUsd: r.es_moneda_extranjera ? (r.total_monto_negociado_ext || 0) : 0,
        comUsd: r.es_moneda_extranjera ? (r.valor_comision_ext || 0) : 0,
      });
    }
    offset += page.length;
    if (onProgress) onProgress({ offset, total });
    if (page.length < pageSize || offset >= total) break;
  }
  return { rawRows, total, skippedCompania, skippedFecha, skippedPorCompania, usoFallbackCreateDate, aniosDetectados };
}

// Agrega rawRows al mismo shape que ya guarda /api/save-globalnum — mismo
// cálculo que gnRecomputeFromRawRows() en public/index.html (por agencia,
// medio, cliente, canal, mes, semestre, trimestre) para que la pestaña
// "09 · Inversión de Medios" no necesite ningún cambio de frontend.
function buildGnDataset(rawRows) {
  let totalInversion = 0, totalComision = 0;
  const clientesSet = new Set(), agenciasSet = new Set();
  const porMes = Array.from({ length: 12 }, (_, i) => ({ mes: GN_MES_LABEL[i], nMes: i + 1, inversion: 0, comision: 0 }));
  const porAgencia = {}, porMedio = {}, porCliente = {}, porCanal = {};

  for (const r of rawRows) {
    totalInversion += r.invGs; totalComision += r.comGs;
    clientesSet.add(r.cliente); agenciasSet.add(r.agencia);
    if (r.nMes >= 1 && r.nMes <= 12) { porMes[r.nMes - 1].inversion += r.invGs; porMes[r.nMes - 1].comision += r.comGs; }
    (porAgencia[r.agencia] ??= { inversion: 0, comision: 0 });
    porAgencia[r.agencia].inversion += r.invGs; porAgencia[r.agencia].comision += r.comGs;
    (porMedio[r.medio] ??= { inversion: 0, comision: 0 });
    porMedio[r.medio].inversion += r.invGs; porMedio[r.medio].comision += r.comGs;
    (porCliente[r.cliente] ??= { inversion: 0, comision: 0 });
    porCliente[r.cliente].inversion += r.invGs; porCliente[r.cliente].comision += r.comGs;
    const cKey = r.grupo && r.grupo !== '—' ? r.grupo : r.canal;
    (porCanal[cKey] ??= { inversion: 0, comision: 0 });
    porCanal[cKey].inversion += r.invGs; porCanal[cKey].comision += r.comGs;
  }

  const sumRange = (arr, a, b) => arr.slice(a, b).reduce((acc, m) => ({ inversion: acc.inversion + m.inversion, comision: acc.comision + m.comision }), { inversion: 0, comision: 0 });
  const s1 = sumRange(porMes, 0, 6), s2 = sumRange(porMes, 6, 12);
  const q1 = sumRange(porMes, 0, 3), q2 = sumRange(porMes, 3, 6), q3 = sumRange(porMes, 6, 9), q4 = sumRange(porMes, 9, 12);
  const toArr = (obj) => Object.entries(obj).map(([nombre, d]) => ({ nombre, ...d, pct: totalInversion > 0 ? d.inversion / totalInversion : 0 })).sort((a, b) => b.inversion - a.inversion);

  const mesesConDatos = porMes.filter(m => m.inversion > 0);
  const anios = [...new Set(rawRows.map(r => r.anio))].sort();
  const periodo = mesesConDatos.length
    ? `${mesesConDatos[0].mes} – ${mesesConDatos[mesesConDatos.length - 1].mes}${anios.length ? ' ' + anios.join('-') : ''}`
    : '';

  // tipoCambio: promedio ponderado real de las filas en moneda extranjera —
  // no un valor fijo. Solo para el KPI "Comisión en USD" del dashboard.
  const extRows = rawRows.filter(r => r.invUsd > 0);
  const sumExtGs = extRows.reduce((s, r) => s + r.invGs, 0);
  const sumExtUsd = extRows.reduce((s, r) => s + r.invUsd, 0);
  const tipoCambio = sumExtUsd > 0 ? Math.round(sumExtGs / sumExtUsd) : 6000;

  return {
    periodo, tipoCambio,
    totales: { inversion: Math.round(totalInversion), comision: Math.round(totalComision), clientes: clientesSet.size, agencias: agenciasSet.size },
    semestres: [{ label: 'S1 · Ene–Jun', ...s1 }, { label: 'S2 · Jul–Dic', ...s2 }],
    trimestres: [{ label: 'Q1 · Ene–Mar', ...q1 }, { label: 'Q2 · Abr–Jun', ...q2 }, { label: 'Q3 · Jul–Sep', ...q3 }, { label: 'Q4 · Oct–Dic', ...q4 }],
    porMes,
    agencias: toArr(porAgencia), medios: toArr(porMedio),
    topClientes: toArr(porCliente).slice(0, 10), canales: toArr(porCanal).slice(0, 10),
    rawRows,
  };
}

// Trae de Odoo + arma el dataset completo — no guarda en Drive (eso lo hace
// odooSyncAndSave, reusando drive.saveGlobalnum() para no duplicar esa lógica).
async function odooSyncInversionMedios(opts) {
  const { rawRows, total, skippedCompania, skippedFecha, skippedPorCompania, usoFallbackCreateDate, aniosDetectados } = await odooFetchInversionMedios(opts);
  const dataset = buildGnDataset(rawRows);
  return {
    dataset,
    meta: {
      totalEnOdoo: total,
      filasUsadas: rawRows.length,
      descartadasPorCompania: skippedCompania,
      descartadasPorFecha: skippedFecha,
      companiasDescartadas: skippedPorCompania,
      usoFallbackCreateDate,
      aniosDetectados,
    },
  };
}

// Mismo algoritmo de compresión que gnCompressRows() en public/index.html —
// diccionario de strings repetidas en vez de guardarlas enteras en cada fila.
// Necesario para que loadLatestGn() en el cliente (que ya sabe descomprimir
// data.detalle) pueda leer esto sin cambios de frontend.
function gnCompressRowsServer(rows) {
  if (!rows || !rows.length) return null;
  const dict = (arr, val) => { let i = arr.indexOf(val); if (i < 0) { i = arr.length; arr.push(val); } return i; };
  const ags = [], cls = [], mds = [], tis = [], grs = [], cas = [], mos = [];
  const data = rows.map(r => [
    dict(ags, r.agencia), dict(cls, r.cliente), dict(mds, r.medio),
    dict(tis, r.tipo), dict(grs, r.grupo), dict(cas, r.canal),
    r.nMes, r.anio || 0, dict(mos, r.moneda || '—'),
    Math.round(r.invGs), Math.round(r.comGs),
    Math.round((r.invUsd || 0) * 100) / 100,
    Math.round((r.comUsd || 0) * 100) / 100,
    Math.round((r.importe || 0) * 10000) / 10000,
    Math.round((r.comision || 0) * 10000) / 10000,
  ]);
  return { ags, cls, mds, tis, grs, cas, mos, data };
}

// Archivo propio en Drive — separado de globalnum-latest.json (el Excel 2025)
// para que sincronizar con Odoo nunca pise esos datos. La pestaña "2026" del
// frontend lee de acá.
const ODOO_GN_FILENAME = 'globalnum-odoo-2026.json';

// Sincroniza y guarda en Drive, en su propio archivo (ODOO_GN_FILENAME).
async function odooSyncAndSave(drive, opts) {
  const { dataset, meta } = await odooSyncInversionMedios(opts);
  const { rawRows, ...rest } = dataset;
  const toSave = { ...rest, detalle: gnCompressRowsServer(rawRows), sincronizado_desde: 'odoo', sincronizado_en: new Date().toISOString() };
  await drive.saveFileByName(ODOO_GN_FILENAME, toSave);
  return { meta, periodo: dataset.periodo, totales: dataset.totales };
}

module.exports = {
  odooExecuteKw, odooAuthenticate, odooResolveMenu, odooDiag, odooModelFields,
  odooFetchInversionMedios, odooSyncInversionMedios, odooSyncAndSave, GN_AGENCIA_MAP,
  ODOO_GN_FILENAME, odooEstadosInversionMedios,
};
