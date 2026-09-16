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

module.exports = { odooExecuteKw, odooAuthenticate, odooResolveMenu, odooDiag, odooModelFields };
