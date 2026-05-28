const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { parseExcel } = require('./parser');
const drive = require('./drive');

let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

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
    console.error('ERROR /api/upload:', err);
    res.status(500).json({ error: err.message, detail: err.response?.data || null });
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
    console.error('ERROR /api/uploads:', err);
    res.status(500).json({ error: err.message, detail: err.response?.data || null });
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

// ── DIAGNÓSTICO ───────────────────────────────────────────────────────────────
app.get('/api/diag', async (req, res) => {
  const result = {
    folder_id: process.env.DRIVE_FOLDER_ID || 'NO SETEADO',
    service_account_ok: false,
    service_account_email: null,
    drive_connection: null,
    error: null
  };
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    result.service_account_ok = true;
    result.service_account_email = creds.client_email;
  } catch(e) {
    result.error = 'GOOGLE_SERVICE_ACCOUNT invalido: ' + e.message;
    return res.json(result);
  }
  try {
    const files = await drive.listUploads();
    result.drive_connection = 'OK — ' + files.length + ' archivos encontrados';
  } catch(e) {
    result.drive_connection = 'ERROR: ' + e.message;
    result.error = e.response?.data || e.message;
  }
  res.json(result);
});

// ── HISTORIAL DE CHATS ───────────────────────────────────────────────────────
app.get('/api/chat/history', async (req, res) => {
  try {
    const files = await drive.listChats();
    res.json(files.map(f => ({ id: f.id, nombre: f.name, created_at: f.createdTime })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chat/history/:id', async (req, res) => {
  try {
    const data = await drive.getChat(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat/save', async (req, res) => {
  try {
    const { messages, title } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'messages requerido' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nombre = `chat-${timestamp}.json`;
    const saved = await drive.saveChat(nombre, { title, messages, saved_at: new Date().toISOString() });
    res.json({ ok: true, id: saved.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/chat/history/:id', async (req, res) => {
  try {
    await drive.deleteChat(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('ERROR DELETE /api/chat/history:', err.message, err.response?.data);
    res.status(500).json({ error: err.message, detail: err.response?.data || null });
  }
});

// ── CHAT AI ───────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, data, context } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages requerido' });

    // ── CONTEXTO MARKETING ────────────────────────────────────────────────────
    if (context === 'marketing') {
      const mktSystemPrompt = `Sos un estratega de marketing y publicidad especializado en el mercado paraguayo y en redes globales de comunicación.

ESTRUCTURA DEL HOLDING TEXO (el grupo que te consulta):
- NASTA (56 años) → WPP. Creatividad, Media, PR, Digital. Clientes: Claro, Nestlé, Colgate, Petrobras, SC Johnson, Kimberly Clark, BAT. Mayor certificación Meta del país.
- BRICK (24 años) → Publicis Worldwide. Creatividad, Media, PR, Content. Clientes: Tigo, McDonald's, Banco Familiar, Nestlé, Puma Energy. Ganó Gran Tatakua 2025.
- LUPE → Independiente. Agencia creativa ("HeartWork"). Clientes: Babysec, Chevrolet, Pepsi, Pilsen, Mirinda, Grolsch.
- OMD (15 años) → Omnicom Media Group. Planificación y compra de medios. +15 marcas.
- ROGER (14 años) → Initiative / IPG Mediabrands. Medios 360°. Clientes: Unilever, Diageo, La Consolidada, Softys.
- SWITCH (4 años) → DAN. Consultoría digital y tecnología.
- AMPLIFY (18 años) → Independiente. Vía pública/OOH. 30% del mercado rutero paraguayo tras adquirir Big Bang. +1.000 soportes.
- WILD FI → Independiente. Marketing digital y social.

CONTEXTO DEL MERCADO:
- Mercado publicitario Paraguay 2024: US$135.5M (+6.5% vs 2023)
- Radio: US$14.9M, ~80% de las emisiones publicitarias
- Sector Banca: mayor crecimiento (+54% en anuncios)
- Fusión Omnicom+IPG completada en 2025: OMD y ROGER ahora en el mismo holding global
- Unilever Latam renovó contrato con Initiative (alianza histórica de 25 años)

REGLAS:
1. Respondé exclusivamente sobre el holding Texo, sus agencias, las redes globales que representan, y el mercado publicitario paraguayo y latinoamericano.
2. Si te preguntan algo fuera de tema, redirigí amablemente.
3. Nunca inventes datos. Si no sabés algo, decilo.
4. Usá lenguaje ejecutivo pero accesible. Sin jerga innecesaria.`;

      const response = await getAnthropic().messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: mktSystemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      });
      return res.json({ reply: response.content[0].text });
    }

    const agenciasResumen = data?.agencias?.length
      ? data.agencias.map(a => {
          const fmt   = v => (v/1e6).toFixed(2)+'M';
          const fmtPC = v => Math.round(v/1e3)+'M'; // per cápita en millones de Gs.
          const margen = a.revenue_total > 0 ? (a.ebitda / a.revenue_total * 100).toFixed(1) : '—';
          const margenSin = a.revenue_total > 0 ? (a.ebitda_sin3709 / a.revenue_total * 100).toFixed(1) : '—';
          const rendInv = a.total_egresos > 0 ? (a.ebitda / a.total_egresos * 100).toFixed(1) : '—';
          const CC_KEYS = ['cc_creatividad','cc_social_media','cc_pr_influencer','cc_activacion_prod','cc_otras_innovaciones','cc_asesorias','cc_branding','cc_estrategias'];
          const CC_LABELS = ['Creatividad','Social Media','PR/Influencer','Activación','Otras Innov.','Asesorías','Branding','Estrategias'];
          let maxVal=0, maxName='—';
          CC_KEYS.forEach((k,i)=>{ const v=parseFloat(a[k]||0); if(v>maxVal){maxVal=v;maxName=CC_LABELS[i];} });
          const concPct = a.facturacion_cc > 0 ? (maxVal/a.facturacion_cc*100).toFixed(1) : '—';
          const innov = fmt((a.cc_otras_innovaciones||0)+(a.cc_pr_influencer||0)+(a.cc_social_media||0));
          return `Agencia ${a.nombre}: Facturación total=${fmt(a.facturacion_total)} (CC=${fmt(a.facturacion_cc)}, DC=${fmt(a.facturacion_dc)}), Revenue=${fmt(a.revenue_total)}, EBITDA=${fmt(a.ebitda)} (margen ${margen}%), EBITDA sin3709=${fmt(a.ebitda_sin3709)} (margen ${margenSin}%), Rendimiento inversión=${rendInv}%, Percápita EBITDA=${fmtPC(a.percapita_ebitda)} Miles de Gs., Personas=${a.cantidad_personas}, Monto3709=${fmt(a.monto3709)}, Aporte innovación=${innov}, Expertise foco=${maxName} (${concPct}% del CC), Gastos RRHH=${fmt(a.gastos_rrhh)}, Gastos comerciales=${fmt(a.gastos_comerciales)}, Gastos admin=${fmt(a.gastos_admin)}, Total egresos=${fmt(a.total_egresos)}`;
        }).join('\n')
      : 'No hay datos de agencias disponibles.';

    const fechaCorte = data?.fecha_corte || 'Octubre 2025';

    const systemPrompt = `Eres un asistente especializado exclusivamente en Salud Financiera de agencias de publicidad. Tu fuente de información es el Excel de Salud Financiera, corte ${fechaCorte}.

DATOS ACTUALES DE LAS AGENCIAS:
${agenciasResumen}

MÉTRICAS Y DEFINICIONES:
- Salud de la Rentabilidad: mide si la agencia genera ganancias reales. Se analiza EBITDA y margen EBITDA por arena (CC y DC).
- Sin 3709: EBITDA excluyendo el subsidio/crédito fiscal 3709. Muestra la rentabilidad real sin ese efecto.
- Eficiencia (Rendimiento de inversión): EBITDA / Total Egresos. Indica cuánto se gana por cada peso de gasto. También incluye el Percápita (EBITDA por persona).
- Aporte de Innovación: suma de facturación en Otras Innovaciones + PR/Influencer + Social Media. Lo que impulsa el crecimiento rápido.
- Expertise Foco: la sub-arena CC con mayor facturación. Indica dónde está la fortaleza de cada agencia.
- Concentración de Fee: porcentaje del expertise foco sobre el total CC. Verde <50%, amarillo 50-70%, rojo ≥70% (riesgo de dependencia).

GRÁFICOS DEL DASHBOARD (para responder preguntas sobre gráficos específicos):
- Sección "Consolidado General": KPIs de totales consolidados — facturación total, revenue total, EBITDA total y cantidad de personas de todas las agencias sumadas.
- Sección "1 · Rentabilidad — Salud de la Rentabilidad":
    · Gráfico de barras "EBITDA por Agencia": muestra el EBITDA absoluto de cada agencia. Barras verdes = positivo, rojas = negativo.
    · Gráfico de barras "Margen EBITDA por Agencia": EBITDA como % del Revenue. Mide eficiencia real de conversión.
    · Gráfico de barras agrupadas "EBITDA CC vs DC": compara el EBITDA generado en la arena Content Creation (naranja) vs Digital Commerce (violeta) por agencia.
- Sección "2 · Sin 3709 — Rentabilidad Real":
    · Gráfico de barras "EBITDA sin 3709 por Agencia": EBITDA excluyendo el crédito fiscal, muestra la rentabilidad genuina.
    · Gráfico de barras "Margen sin 3709": margen porcentual sin el efecto del subsidio 3709.
- Sección "3 · Eficiencia — Rendimiento de Inversión":
    · Gráfico de barras "Rendimiento de Inversión": EBITDA dividido Total Egresos en porcentaje. Mide cuánto retorno genera cada peso gastado.
    · Gráfico de barras "Percápita EBITDA": EBITDA dividido cantidad de personas. Indica productividad por empleado.
- Sección "4 · Aporte de Innovación":
    · Gráfico de barras apiladas: muestra la facturación en Otras Innovaciones (verde), PR/Influencer (violeta) y Social Media (celeste) por agencia. El total es el aporte de innovación que impulsa el crecimiento.
- Sección "5 · Expertise Foco":
    · Gráfico de barras "Distribución CC por Sub-arena": barras apiladas al 100% mostrando el peso de cada sub-arena (Creatividad, Social Media, PR/Influencer, Activación, Otras Innov., Asesorías, Branding, Estrategias) dentro del CC de cada agencia.
- Sección "6 · Concentración de Fee":
    · Gráfico de barras "Concentración de Fee": muestra el % del expertise foco (sub-arena dominante) sobre el total CC. Color verde si <50% (diversificado), amarillo 50-70% (moderado), rojo ≥70% (alta dependencia/riesgo).
- Sección "Análisis Complementario":
    · "Mix CC / DC por Agencia": barras apiladas al 100% mostrando la proporción de CC (naranja) vs DC (violeta) en la facturación de cada agencia.
    · "EBITDA CC vs DC": barras agrupadas comparando la rentabilidad entre arenas.
    · "Estructura de Egresos": barras apiladas con RRHH, Gastos Comerciales y Administrativos por agencia.
    · "Facturación por Sub-arena CC": detalle de los 8 tipos de servicios CC por agencia.
    · Cards individuales por agencia: resumen ejecutivo con todos los indicadores clave de cada una.

GRÁFICOS EN EL CHAT (instrucción técnica):
SOLO agrega un marcador [[CHART:key]] cuando el usuario lo pida explícitamente usando palabras como "grafica", "graficame", "hacé un gráfico", "mostrá el gráfico", "quiero ver el gráfico", "mostrame", u otras expresiones que indiquen claramente que quiere una visualización. Si el usuario solo pregunta por un dato o métrica, responde ÚNICAMENTE con texto — nunca generes un gráfico por iniciativa propia. Solo uno por respuesta. No menciones ni expliques el marcador.
Claves disponibles (todas las agencias):
- [[CHART:ebitda]] → EBITDA por agencia
- [[CHART:margen]] → Margen EBITDA % por agencia
- [[CHART:sin3709]] → EBITDA con vs sin 3709
- [[CHART:rendimiento]] → Rendimiento de inversión por agencia
- [[CHART:percapita]] → EBITDA per cápita por agencia
- [[CHART:concentracion]] → Concentración de fee por agencia
- [[CHART:innovacion]] → Aporte de innovación por agencia
- [[CHART:facturacion]] → Facturación total por agencia
- [[CHART:revenue_ebitda]] → Revenue vs EBITDA comparado

Claves con agencia específica (agrega :NOMBRE al final, ej. [[CHART:margen:NASTA]]):
- [[CHART:margen:AGENCIA]] → Margen de todas las agencias, resaltando la consultada
- [[CHART:ebitda:AGENCIA]] → EBITDA resaltando la agencia específica
- [[CHART:rendimiento:AGENCIA]] → Rendimiento de inversión resaltando la agencia
- [[CHART:percapita:AGENCIA]] → Per cápita resaltando la agencia
- [[CHART:facturacion:AGENCIA]] → Facturación resaltando la agencia
- [[CHART:cc_breakdown:AGENCIA]] → Desglose de sub-arenas CC de esa agencia (dona)
- [[CHART:dc_breakdown:AGENCIA]] → Desglose DC (OFF/ON/Performance) de esa agencia (dona)
- [[CHART:egresos:AGENCIA]] → Estructura de costos de esa agencia (RRHH/Comercial/Admin)
Nombres válidos de agencias: BRICK, NASTA, LUPE, OMD, ROGER

NAVEGACIÓN DE GRÁFICOS (instrucción técnica):
Cuando el usuario pregunte sobre un gráfico o sección específica, agrega al FINAL de tu respuesta el marcador [[SCROLL:id]] con el ID correspondiente. Solo uno por respuesta. No lo menciones ni expliques.
IDs disponibles:
- [[SCROLL:sec-1]] → Sección 1: Rentabilidad (EBITDA DC vs CC, Margen)
- [[SCROLL:cEbitdaDCCC]] → Gráfico EBITDA DC vs CC
- [[SCROLL:cMargen]] → Gráfico Margen EBITDA %
- [[SCROLL:sec-2]] → Sección 2: Sin 3709
- [[SCROLL:cEbitda]] → Gráfico EBITDA Con vs Sin 3709
- [[SCROLL:sec-3]] → Sección 3: Eficiencia
- [[SCROLL:cRendInv]] → Gráfico Rendimiento de Inversión
- [[SCROLL:cPC]] → Gráfico EBITDA Per Cápita
- [[SCROLL:cPers]] → Gráfico Dotación por Agencia
- [[SCROLL:sec-4]] → Sección 4: Aporte de Innovación
- [[SCROLL:cInnov]] → Gráfico Innovación por Agencia
- [[SCROLL:sec-5]] → Sección 5: Expertise Foco
- [[SCROLL:cFoco]] → Gráfico Expertise Foco por Agencia
- [[SCROLL:sec-6]] → Sección 6: Concentración de Fee
- [[SCROLL:cConc]] → Gráfico Concentración de Fee
- [[SCROLL:sec-comp]] → Análisis Complementario
- [[SCROLL:cFact]] → Gráfico Facturación por Agencia
- [[SCROLL:cRev]] → Gráfico Revenue por Agencia
- [[SCROLL:cEgr]] → Gráfico Egresos por Agencia
- [[SCROLL:cCC]] → Gráfico Sub-Arenas CC
- [[SCROLL:cDC]] → Gráfico Sub-Arenas DC

REGLAS DE COMPORTAMIENTO:
1. Responde SIEMPRE citando los datos con la frase "Según los datos recaudados de Salud Financiera" cuando hagas referencia a números o métricas.
2. Adapta tu lenguaje: si el usuario usa términos técnicos financieros, responde con profundidad técnica. Si pregunta de forma simple o muestra no conocer el tema, explica en términos cotidianos con ejemplos concretos.
3. Si alguien refuta un dato o resultado, no cedas sin evidencia — cita el número exacto del Excel y explica cómo se calcula.
4. Si alguien hace preguntas mezcladas o confusas, identifica la pregunta principal, respóndela y luego ofrece aclarar los demás puntos.
5. Si alguien pregunta algo fuera del tema de salud financiera de estas agencias, redirige amablemente: "Este chat está enfocado exclusivamente en la salud financiera de Texo as a Service. ¿Hay algo sobre los datos financieros en lo que pueda ayudarte?"
6. Nunca inventes datos. Si no tienes el dato exacto, dilo claramente.
7. Mantén respuestas claras y directas. Para explicaciones complejas, usa listas o pasos numerados.`;

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    });

    res.json({ reply: response.content[0].text });
  } catch (err) {
    console.error('ERROR /api/chat:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── MARKETING — DATOS ESTÁTICOS DEL HOLDING ──────────────────────────────────
const HOLDING_DATA = [
  { nombre:'NASTA',   red:'WPP',              color:'#6c3fc5', anos:56,
    especialidad:'Agencia integral · Medios, Creatividad, PR, Digital',
    servicios:['Creatividad','Media','PR','Digital','Trade'],
    clientes:['Claro','Nestlé','Colgate','Petrobras','SC Johnson','Kimberly Clark','BAT'],
    dato:'La agencia más veterana del holding y con la certificación Meta más alta del país.' },
  { nombre:'BRICK',   red:'Publicis',          color:'#e85d26', anos:24,
    especialidad:'Creatividad + Media · Agencia integral',
    servicios:['Creatividad','Media','Digital','PR','Content'],
    clientes:['Banco Familiar','Tigo',"McDonald's",'Nestlé','Puma Energy','Chacomer','Cervepar'],
    dato:'Gran Tatakua 2025 — máximo premio de publicidad en Paraguay.' },
  { nombre:'LUPE',    red:'Independiente',     color:'#0ea5b0', anos:null,
    especialidad:'Agencia creativa · Filosofía HeartWork',
    servicios:['Branding','Creatividad','Digital','Audiovisual','E-commerce'],
    clientes:['Babysec','Chevrolet','Pepsi','Pilsen','Mirinda','Grolsch'],
    dato:'Única agencia 100% independiente del grupo.' },
  { nombre:'OMD',     red:'Omnicom',           color:'#d4900a', anos:15,
    especialidad:'Planificación y compra de medios',
    servicios:['Planificación','Compra de medios','Programática','Data & Analytics'],
    clientes:['+15 marcas locales e internacionales'],
    dato:'Fusión Omnicom+IPG 2025: OMD y Roger ahora pertenecen al mismo holding global.' },
  { nombre:'ROGER',   red:'Initiative · IPG',  color:'#d42b4f', anos:14,
    especialidad:'Medios 360° · Cross-selling integrado',
    servicios:['Medios integrados','Planificación','Cross-media'],
    clientes:['Unilever','Diageo','La Consolidada','Softys','U. Columbia'],
    dato:'Unilever Latam renovó contrato con Initiative — alianza de más de 25 años en la región.' },
  { nombre:'SWITCH',  red:'DAN',               color:'#16a34a', anos:4,
    especialidad:'Consultoría digital y tecnología',
    servicios:['Transformación digital','Consultoría','Desarrollo tech','Automatización'],
    clientes:[],
    dato:'Fundada por Texo en 2021. Integra consultoría de negocio, creatividad y tecnología.' },
  { nombre:'AMPLIFY', red:'Independiente',     color:'#8b5cf6', anos:18,
    especialidad:'Vía pública · OOH',
    servicios:['Cartelería','Pantallas digitales','OOH','Vía pública'],
    clientes:[],
    dato:'Adquirió Big Bang: 30% del mercado rutero paraguayo. +1.000 soportes. Pantalla más grande del país.' },
  { nombre:'WILD FI', red:'Independiente',     color:'#64748b', anos:null,
    especialidad:'Marketing digital y social',
    servicios:['Marketing digital','Social media','Performance'],
    clientes:[],
    dato:'' },
];

const MERCADO_DATA = {
  total_usd: 135.5,
  crecimiento_pct: 6.5,
  ano: 2024,
  fuente: 'APAP / Kantar IBOPE Media / Audimedia',
  destacados: [
    { label:'Radio', valor:'US$14.9M', crecimiento:'+7.5%', nota:'~80% de las emisiones' },
    { label:'Banca', valor:'Sector líder', crecimiento:'+54% anuncios', nota:'Mayor crecimiento 2024' },
    { label:'2025', valor:'+4.3%', crecimiento:'emisiones', nota:'Crecimiento sostenido' },
  ]
};

// ── MARKETING — GET ───────────────────────────────────────────────────────────
app.get('/api/marketing', async (req, res) => {
  try {
    const intel = await drive.getMarketing().catch(() => null);
    res.json({
      holding: HOLDING_DATA,
      mercado: MERCADO_DATA,
      alertas: intel?.alertas || [],
      resumen: intel?.resumen || '',
      ultima_actualizacion: intel?.generado_en || null
    });
  } catch (err) {
    console.error('ERROR /api/marketing:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── MARKETING — REFRESH (Claude genera alertas estratégicas) ──────────────────
app.post('/api/marketing/refresh', async (req, res) => {
  try {
    const prompt = `Sos un analista senior de marketing y publicidad, especializado en el mercado paraguayo y latinoamericano.

El directorio de TEXO necesita un briefing estratégico actualizado. TEXO es el holding de marketing más grande de Paraguay, compuesto por 10 empresas.

ESTRUCTURA DEL GRUPO TEXO:
- NASTA (56 años) → WPP. Creatividad, Media, PR, Digital. Clientes: Claro, Nestlé, Colgate, Petrobras, SC Johnson.
- BRICK (24 años) → Publicis Worldwide. Creatividad, Media, PR. Clientes: Tigo, McDonald's, Banco Familiar, Nestlé. Ganó Gran Tatakua 2025.
- LUPE → Independiente. Agencia creativa pura. Clientes: Chevrolet, Babysec, Pepsi, Pilsen.
- OMD (15 años) → Omnicom Media Group. Planificación y compra de medios. +15 marcas.
- ROGER (14 años) → Initiative / IPG Mediabrands. Medios 360°. Clientes: Unilever, Diageo, La Consolidada.
- SWITCH (4 años) → DAN. Consultoría digital y tecnología.
- AMPLIFY (18 años) → Independiente. Vía pública/OOH. Adquirió Big Bang → 30% del mercado rutero, +1.000 soportes.
- WILD FI → Independiente. Marketing digital.

DATOS DEL MERCADO PARAGUAYO (2024):
- Inversión publicitaria total: US$135.5 millones (+6.5% vs 2023)
- Radio: US$14.9M (+7.5%), ~80% de las emisiones publicitarias
- Sector Banca: +54% en anuncios (mayor crecimiento del mercado)
- 2025: crecimiento del +4.3% en emisiones totales

EVENTOS ESTRATÉGICOS RECIENTES:
- Omnicom completó la adquisición de IPG en 2025 (US$13.500M). OMD (Omnicom) y ROGER (Initiative/IPG) ahora pertenecen al mismo holding global.
- Unilever renovó contrato con Initiative para Latinoamérica — alianza de más de 25 años que explica la relación histórica de ROGER con Unilever.
- AMPLIFY adquirió los activos de Big Bang, pasando a controlar el 30% del mercado de vía pública rutero de Paraguay.
- BRICK ganó el Gran Tatakua 2025, el máximo premio de publicidad en Paraguay.

Fecha: ${new Date().toLocaleDateString('es-PY', { month: 'long', year: 'numeric' })}.

Genera alertas estratégicas concisas y accionables para el CEO y directorio de TEXO. Basate en tu conocimiento del mercado publicitario global y latinoamericano, las redes WPP, Publicis, Omnicom+IPG y DAN, y las tendencias de marketing digital y OOH.

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "alertas": [
    {
      "tipo": "riesgo|oportunidad|tension|info",
      "titulo": "Título corto (máximo 8 palabras)",
      "texto": "2-3 oraciones: qué pasó y cuál es el impacto concreto para TEXO",
      "agencias": ["NASTA"],
      "fecha": "mes/año del evento"
    }
  ],
  "resumen": "1-2 párrafos del panorama estratégico para el CEO de TEXO",
  "generado_en": "${new Date().toISOString()}"
}
Genera entre 5 y 8 alertas. Incluí la fusión Omnicom+IPG, la expansión de Amplify, tendencias de IA en publicidad, y oportunidades/riesgos relevantes para el grupo.`;

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    let intel;
    try {
      const raw = response.content[0].text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      intel = JSON.parse(raw);
    } catch(e) {
      return res.status(500).json({ error: 'Error al parsear respuesta de Claude', raw: response.content[0].text });
    }

    await drive.saveMarketing(intel);
    res.json({ ok: true, ...intel });
  } catch (err) {
    console.error('ERROR /api/marketing/refresh:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
// En local/Render: corre como servidor. En Vercel: exporta el app como función serverless.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
}
module.exports = app;
