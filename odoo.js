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

const ODOO_URL      = (process.env.ODOO_URL || '').replace(/\/+$/, '');
const ODOO_DB       = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY  = process.env.ODOO_API_KEY;

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

// Diagnóstico de conexión: separa "¿el endpoint JSON-RPC responde?" (no
// necesita credenciales — common.version() es público en toda instancia
// Odoo) de "¿las credenciales son correctas?" (authenticate), para no tener
// que adivinar en cuál de los dos pasos está el problema.
async function odooDiag() {
  const envCheck = {
    ODOO_URL: ODOO_URL || null,
    ODOO_DB: ODOO_DB || null,
    ODOO_USERNAME: ODOO_USERNAME || null,
    ODOO_API_KEY_set: !!ODOO_API_KEY,
    ODOO_API_KEY_length: ODOO_API_KEY ? ODOO_API_KEY.length : 0,
  };

  let version = null, versionError = null;
  try { version = await odooRpc('common', 'version', []); }
  catch (e) { versionError = e.message; }

  let uid = null, authError = null;
  if (ODOO_DB && ODOO_USERNAME && ODOO_API_KEY) {
    try { uid = await odooRpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}]); }
    catch (e) { authError = e.message; }
  }

  return { envCheck, version, versionError, uid, authResult: uid === false ? 'Odoo devolvió false (usuario/API key/DB incorrectos)' : (uid ? 'OK' : null), authError };
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

module.exports = { odooExecuteKw, odooAuthenticate, odooResolveMenu, odooDiag };
