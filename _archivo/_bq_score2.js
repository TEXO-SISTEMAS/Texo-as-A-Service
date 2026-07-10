const bq = require('./bigquery');
(async () => {
  const A = bq.fq(bq.T_ADLENS);
  // listar columnas numéricas candidatas
  const cols = await bq.query(`SELECT column_name, data_type FROM \`${bq.PROJECT_ID}.${bq.DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name='${bq.T_ADLENS}' AND data_type IN ('FLOAT64','INT64') ORDER BY ordinal_position`);
  console.log('Columnas numéricas adlens:', cols.length);

  // AVG de cada columna numérica
  const sel = cols.map(c => `ROUND(AVG(SAFE_CAST(\`${c.column_name}\` AS FLOAT64)),2) AS \`${c.column_name}\``).join(',');
  const avgs = await bq.query(`SELECT ${sel} FROM ${A} WHERE anunciante IS NOT NULL`);
  const row = avgs[0];
  console.log('\n=== AVG por columna (buscando ~58.7) ===');
  Object.entries(row).sort((a,b)=>Math.abs((a[1]??0)-58.7)-Math.abs((b[1]??0)-58.7))
    .slice(0,20)
    .forEach(([k,v]) => console.log('  '+String(v).padStart(10)+'  <- '+k));

  // AVG de las p-columns combinadas y de los scores ×100
  const combo = await bq.query(`
    SELECT
      ROUND(AVG((SAFE_CAST(pcultura AS FLOAT64)+SAFE_CAST(pejecucion AS FLOAT64)+SAFE_CAST(pestructura AS FLOAT64)+SAFE_CAST(pcompetitividad AS FLOAT64))/4),2) AS avg_p4,
      ROUND(AVG((Cultura+ejecucion+Estructura+Competitividad+inversion)/5)*100,2) AS avg_scores5_x100
    FROM ${A} WHERE anunciante IS NOT NULL`);
  console.log('\nAVG promedio de 4 p-cols:', combo[0].avg_p4, '| AVG de 5 scores ×100:', combo[0].avg_scores5_x100, '| target 58.7');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
