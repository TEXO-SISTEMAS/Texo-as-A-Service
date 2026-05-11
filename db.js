const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS uploads (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        fecha_corte TEXT,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agencias (
        id SERIAL PRIMARY KEY,
        upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        -- Facturación
        facturacion_total NUMERIC,
        facturacion_cc NUMERIC,
        facturacion_dc NUMERIC,
        facturacion_pct_cc NUMERIC,
        facturacion_pct_dc NUMERIC,
        -- Revenue
        revenue_total NUMERIC,
        revenue_cc NUMERIC,
        revenue_dc NUMERIC,
        -- Costos
        costos_total NUMERIC,
        -- EBITDA
        ebitda NUMERIC,
        ebitda_sin3709 NUMERIC,
        -- Egresos
        gastos_rrhh NUMERIC,
        gastos_comerciales NUMERIC,
        gastos_admin NUMERIC,
        total_egresos NUMERIC,
        -- Per cápita
        percapita_ebitda NUMERIC,
        cantidad_personas NUMERIC,
        -- 3709
        monto_3709 NUMERIC,
        -- Sub-arenas CC
        cc_creatividad NUMERIC,
        cc_activacion_prod NUMERIC,
        cc_social_media NUMERIC,
        cc_pr_influencer NUMERIC,
        cc_asesorias NUMERIC,
        cc_otras_innovaciones NUMERIC,
        cc_branding NUMERIC,
        cc_estrategias NUMERIC,
        -- Sub-arenas DC
        dc_off NUMERIC,
        dc_on NUMERIC,
        dc_performance NUMERIC
      );
    `);
    console.log('✅ Base de datos inicializada');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
