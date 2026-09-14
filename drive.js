const { google } = require('googleapis');
const { Readable } = require('stream');

const FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1ySHv_JrWU3wCLWgWtypi52vhU4ztp4I';

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

async function listUploads() {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/json' and trashed=false`,
    fields: 'files(id, name, createdTime, modifiedTime)',
    orderBy: 'createdTime desc',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  return res.data.files || [];
}

async function saveUpload(nombre, data) {
  const drive = getDrive();
  const stream = Readable.from([JSON.stringify(data)]);
  const res = await drive.files.create({
    requestBody: { name: nombre, mimeType: 'application/json', parents: [FOLDER_ID] },
    media: { mimeType: 'application/json', body: stream },
    fields: 'id, name, createdTime',
    supportsAllDrives: true
  });
  return res.data;
}

async function getUpload(fileId) {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' }
  );
  return JSON.parse(res.data);
}

async function deleteUpload(fileId) {
  const drive = getDrive();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

async function getLatest() {
  const files = await listUploads();
  const sf = files.find(f => f.name.startsWith('salud-financiera_'));
  if (!sf) return null;
  return await getUpload(sf.id);
}

async function saveChat(nombre, data) {
  const drive = getDrive();
  const stream = Readable.from([JSON.stringify(data)]);
  const res = await drive.files.create({
    requestBody: { name: nombre, mimeType: 'application/json', parents: [FOLDER_ID] },
    media: { mimeType: 'application/json', body: stream },
    fields: 'id, name, createdTime',
    supportsAllDrives: true
  });
  return res.data;
}

async function updateChat(fileId, data) {
  const drive = getDrive();
  const stream = Readable.from([JSON.stringify(data)]);
  const res = await drive.files.update({
    fileId,
    requestBody: { mimeType: 'application/json' },
    media: { mimeType: 'application/json', body: stream },
    fields: 'id, name, modifiedTime',
    supportsAllDrives: true
  });
  return res.data;
}

async function listChats() {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name contains 'chat-' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  return res.data.files || [];
}

// Todos los archivos de chat de los 4 módulos, de todos los usuarios/agencias.
// listChats() (name contains 'chat-') agarra chat-sf-*, globalnum-chat-*,
// adlens-chat-*, mkt-chat-* — pero al Global Num viejo (saveCurrentChat) lo
// guarda como "globalnum-<timestamp>.json" sin "chat-", así que se suma
// aparte. Nunca toca globalnum-latest.json (son los datos, no un chat).
async function listAllChatFiles() {
  const drive = getDrive();
  const [porChat, globalnumViejo] = await Promise.all([
    drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name contains 'chat-' and trashed=false`,
      fields: 'files(id, name, createdTime)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    }),
    drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name contains 'globalnum-' and not name contains 'latest' and not name contains 'chat-' and trashed=false`,
      fields: 'files(id, name, createdTime)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    })
  ]);
  const byId = new Map();
  for (const f of [...(porChat.data.files || []), ...(globalnumViejo.data.files || [])]) byId.set(f.id, f);
  return [...byId.values()];
}

async function getChat(fileId) {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' }
  );
  return JSON.parse(res.data);
}

async function deleteChat(fileId) {
  const drive = getDrive();
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch(e) {
    // Fallback: move to trash if permanent delete fails
    await drive.files.update({ fileId, supportsAllDrives: true, requestBody: { trashed: true } });
  }
}

// ── MARKETING INTEL ──────────────────────────────────────────────────────────
async function getMarketing() {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = 'marketing-intel.json' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  const files = res.data.files || [];
  if (!files.length) return null;
  return await getUpload(files[0].id);
}

async function saveMarketing(data) {
  const drive = getDrive();
  // Eliminar archivo anterior si existe
  try {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = 'marketing-intel.json' and trashed=false`,
      fields: 'files(id)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    for (const f of (res.data.files || [])) {
      try { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }); } catch(e) {}
    }
  } catch(e) {}

  const stream = Readable.from([JSON.stringify(data)]);
  const result = await drive.files.create({
    requestBody: { name: 'marketing-intel.json', mimeType: 'application/json', parents: [FOLDER_ID] },
    media: { mimeType: 'application/json', body: stream },
    fields: 'id, name, createdTime',
    supportsAllDrives: true
  });
  return result.data;
}

// ── GENERIC MARKETING INTEL (por tipo) ───────────────────────────────────────
async function getMarketingIntel(tipo) {
  const filename = `marketing-${tipo}.json`;
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = '${filename}' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  const files = res.data.files || [];
  if (!files.length) return null;
  return await getUpload(files[0].id);
}

async function saveMarketingIntel(tipo, data) {
  const filename = `marketing-${tipo}.json`;
  const drive = getDrive();
  try {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = '${filename}' and trashed=false`,
      fields: 'files(id)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    for (const f of (res.data.files || [])) {
      try { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }); } catch(e) {}
    }
  } catch(e) {}
  const stream = Readable.from([JSON.stringify(data)]);
  const result = await drive.files.create({
    requestBody: { name: filename, mimeType: 'application/json', parents: [FOLDER_ID] },
    media: { mimeType: 'application/json', body: stream },
    fields: 'id, name, createdTime',
    supportsAllDrives: true
  });
  return result.data;
}

// ── USUARIOS PERMITIDOS ───────────────────────────────────────────────────────
async function getUsuarios() {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = 'usuarios-permitidos.json' and trashed=false`,
    fields: 'files(id)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  const files = res.data.files || [];
  if (!files.length) return { usuarios: [] };
  return await getUpload(files[0].id);
}

async function saveUsuarios(data) {
  const drive = getDrive();
  try {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = 'usuarios-permitidos.json' and trashed=false`,
      fields: 'files(id)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    for (const f of (res.data.files || [])) {
      try { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }); } catch(e) {}
    }
  } catch(e) {}
  const stream = Readable.from([JSON.stringify(data)]);
  await drive.files.create({
    requestBody: { name: 'usuarios-permitidos.json', mimeType: 'application/json', parents: [FOLDER_ID] },
    media: { mimeType: 'application/json', body: stream },
    fields: 'id',
    supportsAllDrives: true
  });
}

// ── GLOBAL NUM ────────────────────────────────────────────────────────────────
async function getLatestGlobalnum() {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = 'globalnum-latest.json' and trashed=false`,
    fields: 'files(id)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  const files = res.data.files || [];
  if (!files.length) return null;
  return await getUpload(files[0].id);
}

async function saveGlobalnum(data) {
  const drive = getDrive();
  try {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = 'globalnum-latest.json' and trashed=false`,
      fields: 'files(id)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    for (const f of (res.data.files || [])) {
      try { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }); } catch(e) {}
    }
  } catch(e) {}
  const stream = Readable.from([JSON.stringify(data)]);
  await drive.files.create({
    requestBody: { name: 'globalnum-latest.json', mimeType: 'application/json', parents: [FOLDER_ID] },
    media: { mimeType: 'application/json', body: stream },
    fields: 'id',
    supportsAllDrives: true
  });
}

// ── ARCHIVO GENÉRICO POR NOMBRE (usage logs, etc.) ───────────────────────────
async function getFileByName(filename) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = '${filename}' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  const files = res.data.files || [];
  if (!files.length) return null;
  return await getUpload(files[0].id);
}

async function saveFileByName(filename, data) {
  const drive = getDrive();
  try {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name = '${filename}' and trashed=false`,
      fields: 'files(id)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    for (const f of (res.data.files || [])) {
      try { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }); } catch(e) {}
    }
  } catch(e) {}
  const stream = Readable.from([JSON.stringify(data)]);
  const result = await drive.files.create({
    requestBody: { name: filename, mimeType: 'application/json', parents: [FOLDER_ID] },
    media: { mimeType: 'application/json', body: stream },
    fields: 'id, name, createdTime',
    supportsAllDrives: true
  });
  return result.data;
}

async function listFilesByPrefix(prefix) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/json' and name contains '${prefix}' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'name desc',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  return res.data.files || [];
}

module.exports = { listUploads, saveUpload, getUpload, deleteUpload, getLatest, saveChat, updateChat, listChats, listAllChatFiles, getChat, deleteChat, getMarketing, saveMarketing, getMarketingIntel, saveMarketingIntel, getUsuarios, saveUsuarios, getLatestGlobalnum, saveGlobalnum, getFileByName, saveFileByName, listFilesByPrefix };
