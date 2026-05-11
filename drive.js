const { google } = require('googleapis');
const { Readable } = require('stream');

const FOLDER_NAME = 'salud-financiera-data';
let cachedFolderId = null;

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

async function getFolderId() {
  if (cachedFolderId) return cachedFolderId;
  const drive = getDrive();
  const search = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });
  if (search.data.files && search.data.files.length > 0) {
    cachedFolderId = search.data.files[0].id;
    console.log('Carpeta encontrada:', cachedFolderId);
    return cachedFolderId;
  }
  const folder = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  });
  cachedFolderId = folder.data.id;
  console.log('Carpeta creada:', cachedFolderId);
  return cachedFolderId;
}

async function listUploads() {
  const drive = getDrive();
  const folderId = await getFolderId();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/json' and trashed=false`,
    fields: 'files(id, name, createdTime, modifiedTime)',
    orderBy: 'createdTime desc'
  });
  return res.data.files || [];
}

async function saveUpload(nombre, data) {
  const drive = getDrive();
  const folderId = await getFolderId();
  const stream = Readable.from([JSON.stringify(data)]);
  const res = await drive.files.create({
    requestBody: { name: nombre, mimeType: 'application/json', parents: [folderId] },
    media: { mimeType: 'application/json', body: stream },
    fields: 'id, name, createdTime'
  });
  return res.data;
}

async function getUpload(fileId) {
  const drive = getDrive();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  return JSON.parse(res.data);
}

async function deleteUpload(fileId) {
  const drive = getDrive();
  await drive.files.delete({ fileId });
}

async function getLatest() {
  const files = await listUploads();
  if (!files.length) return null;
  return await getUpload(files[0].id);
}

module.exports = { listUploads, saveUpload, getUpload, deleteUpload, getLatest };
