const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const { pool, initDB } = require('./db');
const { parseExcel }   = require('./parser');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── UPLOAD ──────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const parsed = parseExcel(req.file.buffer);
    if (!parsed.agencias.length) {
      return res.status(422).json({ error: 'No se encontraron hojas SALUD en el archivo' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insertar upload
      const upRes = await client.query(
        `INSERT INTO uploads (nombre, fecha_corte) VALUES ($1, $2) RETURNING id`,
        [req.file.originalname, parsed.fecha_corte]
      );
      const uploadId = upRes.rows[0].id;

      // Insertar agencias
      for (const a of parsed.agencias) {
        await client.query(`
          INSERT INTO agencias (
            upload_id, nombre,
            facturacion_total, facturacion_cc, facturacion_dc, facturacion_pct_cc, facturacion_pct_dc,
            revenue_total, revenue_cc, revenue_dc,
            costos_total,
            ebitda, ebitda_sin3709,
            gastos_rrhh, gastos_comerciales, gastos_admin, total_egresos,
            percapita_ebitda, cantidad_personas,
            monto_3709,
            cc_creatividad, cc_activacion_prod, cc_social_media, cc_pr_influencer,
            cc_asesorias, cc_otras_innovaciones, cc_branding, cc_estrategias,
            dc_off, dc_on, dc_performance
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
          )`,
          [
            uploadId, a.nombre,
            a.facturacion_total, a.facturacion_cc, a.facturacion_dc, a.facturacion_pct_cc, a.facturacion_pct_dc,
            a.revenue_total, a.revenue_cc, a.revenue_dc,
            a.costos_total,
            a.ebitda, a.ebitda_sin3709,
            a.gastos_rrhh, a.gastos_comerciales, a.gastos_admin, a.total_egresos,
            a.percapita_ebitda, a.cantidad_personas,
            a.monto3709,
            a.cc_creatividad, a.cc_activacion_prod, a.cc_social_media, a.cc_pr_influencer,
            a.cc_asesorias, a.cc_otras_innovaciones, a.cc_branding, a.cc_estrategias,
            a.dc_off, a.dc_on, a.dc_performance
          ]
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true, uploadId, agencias: parsed.agencias.length, fecha_corte: parsed.fecha_corte });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── LISTAR UPLOADS ──────────────────────────────────────────────────────────
app.get('/api/uploads', async (req, res) => {
  try {
    const r = await pool.query(`SELECT id, nombre, fecha_corte, uploaded_at FROM uploads ORDER BY uploaded_at DESC`);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DATOS DE UN UPLOAD ───────────────────────────────────────────────────────
app.get('/api/uploads/:id', async (req, res) => {
  try {
    const uploadRes = await pool.query(`SELECT * FROM uploads WHERE id = $1`, [req.params.id]);
    if (!uploadRes.rows.length) return res.status(404).json({ error: 'No encontrado' });

    const agRes = await pool.query(`SELECT * FROM agencias WHERE upload_id = $1 ORDER BY nombre`, [req.params.id]);
    res.json({ upload: uploadRes.rows[0], agencias: agRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ÚLTIMO UPLOAD ────────────────────────────────────────────────────────────
app.get('/api/latest', async (req, res) => {
  try {
    const upRes = await pool.query(`SELECT id FROM uploads ORDER BY uploaded_at DESC LIMIT 1`);
    if (!upRes.rows.length) return res.json({ empty: true });
    const id = upRes.rows[0].id;
    const agRes = await pool.query(`SELECT * FROM agencias WHERE upload_id = $1 ORDER BY nombre`, [id]);
    const metaRes = await pool.query(`SELECT * FROM uploads WHERE id = $1`, [id]);
    res.json({ upload: metaRes.rows[0], agencias: agRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ELIMINAR UPLOAD ──────────────────────────────────────────────────────────
app.delete('/api/uploads/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM uploads WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── INIT + START ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`)))
  .catch(err => { console.error('Error iniciando DB:', err); process.exit(1); });
