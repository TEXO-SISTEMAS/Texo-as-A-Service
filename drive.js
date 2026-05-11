const { google } = require('googleapis');

const FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1ySHv_JrWU3wCLWgWtypi52vhU4ztp4I';

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return auth;
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

// ── LISTAR archivos JSON en la carpeta ──────────────────────────────────────
async function listUploads() {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/json' and trashed=false`,
    fields: 'files(id, name, createdTime, modifiedTime)',
    orderBy: 'createdTime desc'
  });
  return res.data.files || [];
}

// ── GUARDAR JSON en Drive ───────────────────────────────────────────────────
async function saveUpload(nombre, data) {
  const drive = getDrive();
  const { Readable } = require('stream');
  const content = JSON.stringify(data);
  const stream = Readable.from([content]);

  const res = await drive.files.create({
    requestBody: {
      name: nombre,
      mimeType: 'application/json',
      parents: [FOLDER_ID]
    },
    media: {
      mimeType: 'application/json',
      body: stream
    },
    fields: 'id, name, createdTime'
  });
  return res.data;
}

// ── LEER archivo por ID ─────────────────────────────────────────────────────
async function getUpload(fileId) {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  );
  return JSON.parse(res.data);
}

// ── ELIMINAR archivo ────────────────────────────────────────────────────────
async function deleteUpload(fileId) {
  const drive = getDrive();
  await drive.files.delete({ fileId });
}

// ── OBTENER ÚLTIMO archivo ──────────────────────────────────────────────────
async function getLatest() {
  const files = await listUploads();
  if (!files.length) return null;
  return await getUpload(files[0].id);
}

module.exports = { listUploads, saveUpload, getUpload, deleteUpload, getLatest };
