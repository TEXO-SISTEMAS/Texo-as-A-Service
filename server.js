const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { parseExcel } = require('./parser');
const drive = require('./drive');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    res.status(500).json({ error: err.message });
  }
});

// ── CHAT AI ───────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, data } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages requerido' });

    const agenciasResumen = data?.agencias?.length
      ? data.agencias.map(a => {
          const fmt = v => (v/1e6).toFixed(2)+'M';
          const margen = a.revenue_total > 0 ? (a.ebitda / a.revenue_total * 100).toFixed(1) : '—';
          const margenSin = a.revenue_total > 0 ? (a.ebitda_sin3709 / a.revenue_total * 100).toFixed(1) : '—';
          const rendInv = a.total_egresos > 0 ? (a.ebitda / a.total_egresos * 100).toFixed(1) : '—';
          const CC_KEYS = ['cc_creatividad','cc_social_media','cc_pr_influencer','cc_activacion_prod','cc_otras_innovaciones','cc_asesorias','cc_branding','cc_estrategias'];
          const CC_LABELS = ['Creatividad','Social Media','PR/Influencer','Activación','Otras Innov.','Asesorías','Branding','Estrategias'];
          let maxVal=0, maxName='—';
          CC_KEYS.forEach((k,i)=>{ const v=parseFloat(a[k]||0); if(v>maxVal){maxVal=v;maxName=CC_LABELS[i];} });
          const concPct = a.facturacion_cc > 0 ? (maxVal/a.facturacion_cc*100).toFixed(1) : '—';
          const innov = fmt((a.cc_otras_innovaciones||0)+(a.cc_pr_influencer||0)+(a.cc_social_media||0));
          return `Agencia ${a.nombre}: Facturación total=${fmt(a.facturacion_total)} (CC=${fmt(a.facturacion_cc)}, DC=${fmt(a.facturacion_dc)}), Revenue=${fmt(a.revenue_total)}, EBITDA=${fmt(a.ebitda)} (margen ${margen}%), EBITDA sin3709=${fmt(a.ebitda_sin3709)} (margen ${margenSin}%), Rendimiento inversión=${rendInv}%, Percápita EBITDA=${fmt(a.percapita_ebitda)}, Personas=${a.cantidad_personas}, Monto3709=${fmt(a.monto3709)}, Aporte innovación=${innov}, Expertise foco=${maxName} (${concPct}% del CC), Gastos RRHH=${fmt(a.gastos_rrhh)}, Gastos comerciales=${fmt(a.gastos_comerciales)}, Gastos admin=${fmt(a.gastos_admin)}, Total egresos=${fmt(a.total_egresos)}`;
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

REGLAS DE COMPORTAMIENTO:
1. Responde SIEMPRE citando los datos con la frase "Según los datos recaudados de Salud Financiera" cuando hagas referencia a números o métricas.
2. Adapta tu lenguaje: si el usuario usa términos técnicos financieros, responde con profundidad técnica. Si pregunta de forma simple o muestra no conocer el tema, explica en términos cotidianos con ejemplos concretos.
3. Si alguien refuta un dato o resultado, no cedas sin evidencia — cita el número exacto del Excel y explica cómo se calcula.
4. Si alguien hace preguntas mezcladas o confusas, identifica la pregunta principal, respóndela y luego ofrece aclarar los demás puntos.
5. Si alguien pregunta algo fuera del tema de salud financiera de estas agencias, redirige amablemente: "Este chat está enfocado exclusivamente en la salud financiera de Texo as a Service. ¿Hay algo sobre los datos financieros en lo que pueda ayudarte?"
6. Nunca inventes datos. Si no tienes el dato exacto, dilo claramente.
7. Mantén respuestas claras y directas. Para explicaciones complejas, usa listas o pasos numerados.`;

    const response = await anthropic.messages.create({
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

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
