const bq = require('./bigquery');
(async () => {
  // Listar todas las tablas del dataset
  const tables = await bq.query(`SELECT table_name FROM \`${bq.PROJECT_ID}.${bq.DATASET}.INFORMATION_SCHEMA.TABLES\` ORDER BY table_name`);
  console.log('=== TABLAS en', bq.DATASET, '===');
  tables.forEach(t => console.log('  -', t.table_name));

  // Si existe radatabulado, inspeccionar
  const has = tables.some(t => t.table_name === 'radatabulado');
  if (has) {
    const cols = await bq.query(`SELECT column_name, data_type FROM \`${bq.PROJECT_ID}.${bq.DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name='radatabulado' ORDER BY ordinal_position`);
    console.log('\n=== radatabulado columnas ===');
    cols.forEach(c => console.log('  -', c.column_name, '('+c.data_type+')'));
    const R = bq.fq('radatabulado');
    const cnt = await bq.query(`SELECT COUNT(*) n FROM ${R}`);
    console.log('filas:', cnt[0].n);
    const sample = await bq.query(`SELECT * FROM ${R} LIMIT 3`);
    console.log('muestra:', JSON.stringify(sample, null, 1).slice(0,800));
    // AVG(Score)
    const sc = await bq.query(`SELECT AVG(SAFE_CAST(Score AS FLOAT64)) avg_score, SUM(SAFE_CAST(Score AS FLOAT64)) sum_score, COUNT(*) n FROM ${R}`);
    console.log('\nAVG(Score):', sc[0].avg_score, '| SUM:', sc[0].sum_score, '| n:', sc[0].n, '| target 58.7');
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
