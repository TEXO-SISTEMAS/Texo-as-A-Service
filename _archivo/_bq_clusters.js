// Verifica que los scores por cluster coincidan con Looker
// Looker: AVG(Cultura, Competitividad, ejecucion, inversion, Estructura) GROUP BY tipodecluster
const bq = require('./bigquery');
const A = bq.fq('tablamaterializada_adlens');

(async () => {
  // 1) Query equivalente al Looker: AVG por tipodecluster
  const rows = await bq.query(`
    SELECT
      Cluster,
      tipodecluster,
      COUNT(*) AS n,
      ROUND(AVG(Cultura)*100, 1)        AS Cultura,
      ROUND(AVG(Competitividad)*100, 1) AS Competitividad,
      ROUND(AVG(ejecucion)*100, 1)      AS Ejecucion,
      ROUND(AVG(inversion)*100, 1)      AS Inversion,
      ROUND(AVG(Estructura)*100, 1)     AS Estructura
    FROM ${A}
    WHERE Cluster IS NOT NULL
    GROUP BY Cluster, tipodecluster
    ORDER BY Cluster ASC
  `);

  console.log('\n=== SCORES POR CLUSTER (Looker AVG ×100) ===');
  rows.forEach(r => {
    console.log(`\nCluster ${r.Cluster} · ${r.tipodecluster} (${r.n} empresas)`);
    console.log(`  Cultura:        ${r.Cultura}%`);
    console.log(`  Ejecucion:      ${r.Ejecucion}%`);
    console.log(`  Estructura:     ${r.Estructura}%`);
    console.log(`  Competitividad: ${r.Competitividad}%`);
    console.log(`  Inversion:      ${r.Inversion}%`);
  });

  // 2) Verificar si los scores vienen como fracción (0-1) o porcentaje (0-100)
  const sample = await bq.query(`SELECT Cultura, Competitividad, ejecucion, inversion, Estructura FROM ${A} WHERE Cultura IS NOT NULL LIMIT 5`);
  console.log('\n=== MUESTRA de scores crudos (para detectar escala) ===');
  sample.forEach(r => console.log(r));

})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
