const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const { parseExcel } = require('./parser');
const drive = require('./drive');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── UPLOAD ────────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const parsed = parseExcel(req.file.buffer);
    if (!parsed.agencias.length)
      return res.status(422).json({ error: 'No se encontraron hojas SALUD en el archivo' });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombre = `salud-financiera_${timestamp}.json`;

    const saved = await drive.saveUpload(nombre, {
      nombre: req.file.originalname,
      fecha_corte: parsed.fecha_corte,
      uploaded_at: new Date().toISOString(),
      agencias: parsed.agencias
    });

    res.json({ ok: true, fileId: saved.id, agencias: parsed.agencias.length, fecha_corte: parsed.fecha_corte });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── LISTAR UPLOADS ────────────────────────────────────────────────────────────
app.get('/api/uploads', async (req, res) => {
  try {
    const files = await drive.listUploads();
    res.json(files.map(f => ({
      id: f.id,
      nombre: f.name,
      uploaded_at: f.createdTime
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DATOS DE UN UPLOAD ────────────────────────────────────────────────────────
app.get('/api/uploads/:id', async (req, res) => {
  try {
    const data = await drive.getUpload(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ÚLTIMO UPLOAD ─────────────────────────────────────────────────────────────
app.get('/api/latest', async (req, res) => {
  try {
    const data = await drive.getLatest();
    if (!data) return res.json({ empty: true });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ELIMINAR ──────────────────────────────────────────────────────────────────
app.delete('/api/uploads/:id', async (req, res) => {
  try {
    await drive.deleteUpload(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
