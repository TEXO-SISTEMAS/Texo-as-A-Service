const bq = require('./bigquery');
(async () => {
  const P = 'adlenslooker', D = 'adlensmedios';

  // listar tablas
  const tables = await bq.query(`SELECT table_name FROM \`${P}.${D}.INFORMATION_SCHEMA.TABLES\` ORDER BY table_name`);
  console.log('Tablas:', tables.map(t => t.table_name));

  const candidates = ['radatabulado', 'Rada tabulado', 'adlens'];
  for (const t of candidates) {
    try {
      const fq = `\`${P}.${D}.${t}\``;
      // schema
      const cols = await bq.query(`SELECT column_name, data_type FROM \`${P}.${D}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name='${t}' ORDER BY ordinal_position`);
      console.log(`\n--- ${t} cols:`, cols.map(c => c.column_name + '(' + c.data_type + ')'));
      const r = await bq.query(`SELECT AVG(SAFE_CAST(Score AS FLOAT64)) avg_score, COUNT(*) n FROM ${fq}`);
      console.log(`  AVG(Score)=${r[0].avg_score}  n=${r[0].n}  target=58.7`);
      // sample
      const s = await bq.query(`SELECT * FROM ${fq} LIMIT 3`);
      console.log('  sample:', JSON.stringify(s).slice(0, 300));
    } catch(e) { console.log(`  ERROR ${t}:`, e.message.slice(0, 100)); }
  }
})().catch(e => console.error('FATAL:', e.message));
