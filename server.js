const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const https   = require('https');
const Anthropic = require('@anthropic-ai/sdk');
const jwt     = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { google } = require('googleapis');
const { parseExcel } = require('./parser');
const { parseAdlens } = require('./adlens_parser');
const { parseIngresos } = require('./ingresos_parser');
const drive = require('./drive');

// ── RSS UTILITIES ─────────────────────────────────────────────────────────────
function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsReader/1.0)', 'Accept': 'application/rss+xml,application/xml' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseRSS(xml, max = 8) {
  const items = [];
  const rx = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = rx.exec(xml)) && items.length < max) {
    const s = m[1];
    const titleM = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i.exec(s) || /<title>([\s\S]*?)<\/title>/i.exec(s);
    const linkM  = /<link>([\s\S]*?)<\/link>/i.exec(s);
    const dateM  = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(s);
    const srcM   = /<source[^>]*>([\s\S]*?)<\/source>/i.exec(s);
    const title  = titleM ? titleM[1].replace(/\s+-\s+[^-]+$/, '').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim() : '';
    const link   = linkM ? linkM[1].trim() : '';
    const pubDate = dateM ? dateM[1].trim() : '';
    const source = srcM ? srcM[1].replace(/&amp;/g,'&').trim() : '';
    if (title && link) items.push({ title, link, pubDate, source });
  }
  return items;
}

let _newsCache = { data: null, ts: 0 };
const NEWS_TTL = 30 * 60 * 1000; // 30 min

let _redesNewsCache = { data: null, ts: 0 };
const REDES_NEWS_TTL = 60 * 60 * 1000; // 1h

const REDES_CONFIG = [
  { id:'WPP',      nombre:'WPP',            agencias:['NASTA'],
    q:'WPP advertising agency news',
    keywords:['wpp'] },
  { id:'Publicis', nombre:'Publicis Groupe', agencias:['BRICK'],
    q:'Publicis Groupe advertising news',
    keywords:['publicis'] },
  { id:'Omnicom',  nombre:'Omnicom + IPG',  agencias:['OMD','ROGER'],
    q:'Omnicom IPG advertising merger news',
    keywords:['omnicom','ipg','interpublic','initiative'] },
  { id:'DAN',      nombre:'Dentsu / DAN',   agencias:[],
    q:'Dentsu advertising network news',
    keywords:['dentsu'] },
];

let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'texo-dev-secret-change-in-prod';
const SUPER_ADMIN = 'danilo.sosa@texo.com.py';

// Cache de usuarios permitidos (se refresca cada 5 min)
let _usuariosCache = null;
let _usuariosCacheTs = 0;
async function getUsuariosPermitidos() {
  if (_usuariosCache && Date.now() - _usuariosCacheTs < 5 * 60 * 1000) return _usuariosCache;
  try {
    const data = await drive.getUsuarios();
    _usuariosCache = (data.usuarios || []).map(u => u.toLowerCase());
    // Siempre incluir al super admin
    if (!_usuariosCache.includes(SUPER_ADMIN)) _usuariosCache.push(SUPER_ADMIN);
    _usuariosCacheTs = Date.now();
    return _usuariosCache;
  } catch(e) {
    return [SUPER_ADMIN];
  }
}
function invalidarCacheUsuarios() { _usuariosCache = null; _usuariosCacheTs = 0; }

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://texo-as-a-service.vercel.app/auth/google/callback'
  );
}

function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'No autorizado' });
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    res.clearCookie('session');
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sesión expirada' });
    res.redirect('/login');
  }
}

// ── RUTAS PÚBLICAS (sin auth) ──────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.cookies?.session) {
    try { jwt.verify(req.cookies.session, JWT_SECRET); return res.redirect('/'); } catch(e) {}
  }
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/auth/google', (req, res) => {
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'online',
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: req.query.next || '/'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect('/login?error=no_code');
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const permitidos = await getUsuariosPermitidos();
    if (!permitidos.includes(userInfo.email.toLowerCase())) {
      return res.redirect('/login?error=acceso_denegado');
    }
    const token = jwt.sign(
      { email: userInfo.email, name: userInfo.name, picture: userInfo.picture || null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const isSecure = !!process.env.VERCEL || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('session', token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    const redirectTo = (state && state.startsWith('/') && state !== '/login') ? state : '/home';
    res.redirect(redirectTo);
  } catch(e) {
    console.error('OAuth callback error:', e);
    res.redirect('/login?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie('session');
  res.redirect('/login');
});

// ── ASSETS PÚBLICOS (accesibles sin login) ────────────────────────────────────
app.get('/logo-impulsados.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/logo-impulsados.png'));
});

// ── PROTECCIÓN GLOBAL ─────────────────────────────────────────────────────────
app.use(requireAuth);

// ── HOME REDIRECT ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/home'));

// ── CLEAN URLS: /home → /home.html, /adlens → /adlens.html, etc. ─────────────
app.use((req, res, next) => {
  if (!path.extname(req.path)) {
    const htmlPath = path.join(__dirname, 'public', req.path + '.html');
    res.sendFile(htmlPath, err => { if (err) next(); });
  } else {
    next();
  }
});

// ── ARCHIVOS ESTÁTICOS (protegidos) ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── ME ─────────────────────────────────────────────────────────────────────────
app.get('/api/me', (req, res) => res.json(req.user));

// ── ADMIN: GESTIÓN DE USUARIOS ────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user?.email !== SUPER_ADMIN) return res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
  next();
}

app.get('/api/admin/usuarios', requireAdmin, async (req, res) => {
  try {
    const data = await drive.getUsuarios();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/usuarios', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email inválido' });
    const data = await drive.getUsuarios();
    const lista = data.usuarios || [];
    const emailLower = email.toLowerCase().trim();
    if (lista.find(u => u.email.toLowerCase() === emailLower)) return res.status(409).json({ error: 'El usuario ya existe' });
    lista.push({ email: emailLower, agregado_en: new Date().toISOString(), agregado_por: req.user.email });
    await drive.saveUsuarios({ usuarios: lista });
    invalidarCacheUsuarios();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/usuarios/:email', requireAdmin, async (req, res) => {
  try {
    const emailTarget = decodeURIComponent(req.params.email).toLowerCase();
    if (emailTarget === SUPER_ADMIN) return res.status(400).json({ error: 'No podés eliminar al administrador principal' });
    const data = await drive.getUsuarios();
    const lista = (data.usuarios || []).filter(u => u.email.toLowerCase() !== emailTarget);
    await drive.saveUsuarios({ usuarios: lista });
    invalidarCacheUsuarios();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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

// ── UPLOAD INGRESOS ───────────────────────────────────────────────────────────
app.post('/api/upload-ingresos', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const parsed = parseIngresos(req.file.buffer);

    await drive.saveMarketingIntel('ingresos', {
      nombre: req.file.originalname,
      uploaded_at: new Date().toISOString(),
      ...parsed,
    });

    res.json({
      ok: true,
      periodo: parsed.periodo,
      agencias: parsed.agencias.length,
      totales: parsed.totales,
    });
  } catch (err) {
    console.error('ERROR /api/upload-ingresos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GUARDAR INGRESOS (JSON desde browser) ─────────────────────────────────────
app.post('/api/save-ingresos', async (req, res) => {
  try {
    const data = req.body;
    if (!data || data.tipo !== 'ingresos') return res.status(400).json({ error: 'JSON inválido' });
    await drive.saveMarketingIntel('ingresos', { ...data, uploaded_at: new Date().toISOString() });
    res.json({ ok: true, periodo: data.periodo, agencias: data.agencias?.length });
  } catch (err) {
    console.error('ERROR /api/save-ingresos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── ÚLTIMO INGRESOS ───────────────────────────────────────────────────────────
app.get('/api/latest-ingresos', async (req, res) => {
  try {
    const data = await drive.getMarketingIntel('ingresos');
    if (!data) return res.json({ empty: true });
    res.json(data);
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
    const { messages, data, context, ingresosData } = req.body;
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
- AMPLIFY (18 años) → Independiente. Vía pública/OOH. 30% del mercado rutero paraguayo tras adquirir Big Bang. +1.000 soportes.

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

    // ── Resumen ingresos 2026 ──────────────────────────────────────────────────
    let ingresosResumen = '';
    if (ingresosData && ingresosData.totales) {
      const fmtM = v => (parseFloat(v)||0) >= 1e9 ? ((v/1e9).toFixed(1)+'B Gs.') : (v/1e6).toFixed(0)+'M Gs.';
      const t = ingresosData.totales;
      const agLines = (ingresosData.agencias||[]).map(a =>
        `  ${a.nombre}: Facturación ${fmtM(a.facturacion)}, Revenue ${fmtM(a.revenue)}, Margen ${(a.margen*100).toFixed(1)}%, ${a.transacciones} facturas`
      ).join('\n');
      const topCli = (ingresosData.topClientes||[]).slice(0,5).map(c =>
        `  ${c.nombre.replace(/\s*-\s*\d{9,}.*$/,'').trim()}: ${(c.pct*100).toFixed(1)}%`
      ).join('\n');
      const ebLines = (ingresosData.ebitda||[]).map(e =>
        `  ${e.empresa}: EBITDA ${fmtM(e.ebitda)} (sin 3709: ${fmtM(e.ebitda_sin3709)}), margen ${(e.margen_ebitda*100).toFixed(1)}%, ${e.personas} personas`
      ).join('\n');
      ingresosResumen = `

DATOS DE DETALLE DE INGRESOS 2026 (período ${ingresosData.periodo || ''}):
Facturación total: ${fmtM(t.facturacion)} | Revenue total: ${fmtM(t.revenue)} | Margen: ${(t.margen*100).toFixed(1)}% | Transacciones: ${t.transacciones}

Por agencia:
${agLines}
${ebLines ? `\nEBITDA por empresa (P&L interno):\n${ebLines}` : ''}
${topCli ? `\nTop clientes (% facturación):\n${topCli}` : ''}`;
    }

    const systemPrompt = `Eres un asistente especializado exclusivamente en Salud Financiera de agencias de publicidad. Tu fuente de información es el Excel de Salud Financiera, corte ${fechaCorte}, y el Detalle de Ingresos 2026 cuando esté disponible.

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

${ingresosResumen}

REGLAS DE COMPORTAMIENTO:
1. Responde SIEMPRE citando los datos con la frase "Según los datos recaudados de Salud Financiera" cuando hagas referencia a números del Excel 2025, y "Según el Detalle de Ingresos 2026" cuando uses datos del período ENERO–JUNIO 2026.
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
  { nombre:'AMPLIFY', red:'Independiente',     color:'#8b5cf6', anos:18,
    especialidad:'Vía pública · OOH',
    servicios:['Cartelería','Pantallas digitales','OOH','Vía pública'],
    clientes:[],
    dato:'Adquirió Big Bang: 30% del mercado rutero paraguayo. +1.000 soportes. Pantalla más grande del país.' },
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
    const [alertasIntel, redesIntel, mercadoIntel] = await Promise.all([
      drive.getMarketingIntel('alertas').catch(() => null),
      drive.getMarketingIntel('redes').catch(() => null),
      drive.getMarketingIntel('mercado').catch(() => null),
    ]);
    res.json({
      holding: HOLDING_DATA,
      mercado: mercadoIntel || MERCADO_DATA,
      alertas: alertasIntel?.alertas || [],
      resumen: alertasIntel?.resumen || '',
      ultima_actualizacion: alertasIntel?.generado_en || null,
      redes: redesIntel?.briefings || [],
      redes_resumen: redesIntel?.resumen || '',
      redes_actualizacion: redesIntel?.generado_en || null,
    });
  } catch (err) {
    console.error('ERROR /api/marketing:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── MARKETING — NOTICIAS (Google News RSS) ────────────────────────────────────
const AD_KEYWORDS = ['publicidad','agencia','marketing','publicitario','medios','anuncio','campaña','creativo','creatividad','wpp','publicis','omnicom','ipg','dentsu','ogilvy','bbdo','mccann','havas','tbwa','apap','tatakua','inversión publi','industria publi'];
function isAdNews(title) {
  const t = title.toLowerCase();
  return AD_KEYWORDS.some(k => t.includes(k));
}
function hasPy(title) {
  return /paraguay/i.test(title);
}

app.get('/api/marketing/news', async (req, res) => {
  try {
    if (_newsCache.data && (Date.now() - _newsCache.ts) < NEWS_TTL) {
      return res.json(_newsCache.data);
    }

    // Query 1: noticias de publicidad/marketing locales Paraguay
    const localQueries = [
      'publicidad+Paraguay',
      'agencia+publicidad+Paraguay',
      'marketing+Paraguay',
    ];
    // Query 2: movimientos de redes globales
    const globalQueries = [
      'WPP+OR+Publicis+OR+Omnicom+IPG+advertising+2025',
    ];

    const local = [], global = [], seen = new Set();

    for (const q of localQueries) {
      try {
        const url = `https://news.google.com/rss/search?q=${q}&hl=es-419&gl=PY&ceid=PY:es-419`;
        const xml = await fetchURL(url);
        for (const item of parseRSS(xml, 6)) {
          const key = item.title.slice(0, 50).toLowerCase();
          if (!seen.has(key) && isAdNews(item.title) && hasPy(item.title)) {
            seen.add(key); local.push({ ...item, categoria: 'paraguay' });
          }
        }
      } catch(e) { console.warn('RSS local error:', e.message); }
    }

    for (const q of globalQueries) {
      try {
        const url = `https://news.google.com/rss/search?q=${q}&hl=es-419&gl=AR&ceid=AR:es-419`;
        const xml = await fetchURL(url);
        for (const item of parseRSS(xml, 6)) {
          const key = item.title.slice(0, 50).toLowerCase();
          if (!seen.has(key) && isAdNews(item.title)) {
            seen.add(key); global.push({ ...item, categoria: 'global' });
          }
        }
      } catch(e) { console.warn('RSS global error:', e.message); }
    }

    local.sort((a,b) => new Date(b.pubDate)-new Date(a.pubDate));
    global.sort((a,b) => new Date(b.pubDate)-new Date(a.pubDate));

    const result = {
      noticias_py: local.slice(0, 6),
      noticias_global: global.slice(0, 4),
      fetched_at: new Date().toISOString()
    };
    _newsCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('ERROR /api/marketing/news:', err);
    res.status(500).json({ error: err.message, noticias_py: [], noticias_global: [] });
  }
});

// ── MARKETING — NOTICIAS POR RED GLOBAL ──────────────────────────────────────
app.get('/api/marketing/redes-news', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && _redesNewsCache.data && (Date.now() - _redesNewsCache.ts) < REDES_NEWS_TTL) {
      return res.json({ ..._redesNewsCache.data, cache: true });
    }

    const redesResults = await Promise.all(REDES_CONFIG.map(async (red) => {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(red.q)}&hl=en-US&gl=US&ceid=US:en`;
        const xml = await fetchURL(url);
        const items = parseRSS(xml, 12);
        const filtered = items.filter(item => {
          const t = (item.title + ' ' + (item.source || '') + ' ' + (item.link || '')).toLowerCase();
          return red.keywords.some(k => t.includes(k));
        }).slice(0, 4);
        // Si el filtro queda vacío, devolver los primeros ítems sin filtrar
        const result = filtered.length > 0 ? filtered : items.slice(0, 3);
        return { ...red, noticias: result };
      } catch(e) {
        console.warn(`RSS redes-news error (${red.id}):`, e.message);
        return { ...red, noticias: [] };
      }
    }));

    const data = { redes: redesResults, fetched_at: new Date().toISOString() };
    _redesNewsCache = { data, ts: Date.now() };
    res.json(data);
  } catch (err) {
    console.error('ERROR /api/marketing/redes-news:', err);
    res.status(500).json({ error: err.message, redes: [] });
  }
});

// ── MARKETING — REFRESH (Claude) ─────────────────────────────────────────────
const TEXO_CONTEXT = `HOLDING TEXO (Paraguay):
- NASTA (56a) → WPP. Clientes: Claro, Nestlé, Colgate, Petrobras, SC Johnson.
- BRICK (24a) → Publicis. Clientes: Tigo, McDonald's, Banco Familiar. Gran Tatakua 2025.
- LUPE → Independiente. Clientes: Chevrolet, Babysec, Pepsi, Pilsen.
- OMD (15a) → Omnicom. Planificación y compra de medios. +15 marcas.
- ROGER (14a) → Initiative/IPG. Clientes: Unilever, Diageo, La Consolidada.
- AMPLIFY (18a) → OOH. 30% mercado rutero Paraguay (+1.000 soportes).
Mercado PY 2024: US$135.5M (+6.5%). Fusión Omnicom+IPG 2025 (US$13.5B): OMD y ROGER = mismo holding global.`;

const PROMPTS = {
  alertas: () => `Sos analista senior de marketing especializado en mercado paraguayo.
${TEXO_CONTEXT}
Fecha: ${new Date().toLocaleDateString('es-PY', { month:'long', year:'numeric' })}.
IMPORTANTE: Solo JSON, sin texto adicional, sin markdown.
Formato: {"alertas":[{"tipo":"riesgo","titulo":"Max 6 palabras","texto":"Una oración con impacto para TEXO.","agencias":["NASTA"],"fecha":"05/2026"}],"resumen":"Una oración ejecutiva.","generado_en":"${new Date().toISOString()}"}
Genera exactamente 5 alertas. Tipos: riesgo, oportunidad, tension, info. Temas: fusión Omnicom+IPG, AMPLIFY OOH, IA en publicidad, tendencia digital, riesgo de red global.`,

  mercado: () => `Sos analista del mercado publicitario paraguayo con acceso a datos públicos de APAP, Kantar IBOPE Media y Audimedia.
${TEXO_CONTEXT}
Fecha actual: ${new Date().toLocaleDateString('es-PY', { day:'numeric', month:'long', year:'numeric' })}.
Necesito que generes un resumen actualizado del mercado publicitario de Paraguay con los datos más recientes que conozcas.
IMPORTANTE: Solo JSON, sin texto adicional, sin markdown. Usá solo datos que sean razonablemente públicos o estimables. Si no tenés un dato exacto reciente, usá la última cifra conocida e indicá el año.
Formato: {"total_usd":number,"crecimiento_pct":number,"ano":number,"fuente":"string","destacados":[{"label":"string max 2 palabras","valor":"string","crecimiento":"string","nota":"string corto"}],"generado_en":"${new Date().toISOString()}"}
Reglas:
- total_usd: tamaño total del mercado en millones de USD
- ano: año al que corresponden los datos
- destacados: exactamente 4 items con datos relevantes (medios, sectores, tendencias, proyecciones)
- fuente: las fuentes de donde provienen los datos
- Sé conservador: mejor un dato viejo correcto que uno nuevo inventado`,

  redes: () => `Sos analista de inteligencia competitiva en publicidad global.
${TEXO_CONTEXT}
Fecha: ${new Date().toLocaleDateString('es-PY', { month:'long', year:'numeric' })}.
Genera un briefing del estado actual de cada red global presente en TEXO: WPP, Publicis, Omnicom (post-fusión con IPG), DAN.
IMPORTANTE: Solo JSON, sin texto adicional, sin markdown.
Formato: {"briefings":[{"red":"WPP","estado":"una oración sobre su situación actual.","movimientos":"un movimiento reciente clave.","impacto_texo":"impacto concreto para NASTA en Paraguay."},{"red":"Publicis","estado":"...","movimientos":"...","impacto_texo":"..."},{"red":"Omnicom+IPG","estado":"...","movimientos":"...","impacto_texo":"..."},{"red":"DAN","estado":"...","movimientos":"...","impacto_texo":"..."}],"resumen":"Una oración sobre el panorama global de redes.","generado_en":"${new Date().toISOString()}"}`
};

app.post('/api/marketing/refresh', async (req, res) => {
  const validTipos = ['alertas', 'redes', 'mercado'];
  const tipo = validTipos.includes(req.body?.tipo) ? req.body.tipo : 'alertas';
  try {
    const prompt = PROMPTS[tipo]();
    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    let intel;
    try {
      const text = response.content[0].text;
      let raw = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      try { intel = JSON.parse(raw); }
      catch(_) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON object found in response');
        intel = JSON.parse(match[0]);
      }
    } catch(e) {
      return res.status(500).json({ error: 'Error al parsear respuesta de Claude: ' + e.message, raw: response.content[0].text });
    }

    await drive.saveMarketingIntel(tipo, intel);
    res.json({ ok: true, tipo, ...intel });
  } catch (err) {
    console.error('ERROR /api/marketing/refresh:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── ADLENS ────────────────────────────────────────────────────────────────────
// El procesamiento de los Excels ocurre en el browser; el servidor solo guarda el JSON resultante.
app.post('/api/adlens/save', requireAuth, async (req, res) => {
  try {
    const data = req.body;
    if (!data?.resumen) return res.status(400).json({ error: 'JSON inválido' });
    await drive.saveMarketingIntel('adlens', data);
    res.json({ ok: true });
  } catch (e) {
    console.error('ERROR /api/adlens/save:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/adlens/latest', requireAuth, async (req, res) => {
  try {
    const data = await drive.getMarketingIntel('adlens');
    if (!data) return res.status(404).json({ error: 'Sin datos' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Datos en vivo desde BigQuery (mismas tablas que el Looker). Cacheado en memoria 1h.
let _bqCache = { data: null, ts: 0 };
const BQ_TTL = 60 * 60 * 1000;

app.get('/api/adlens/bigquery', requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && _bqCache.data && (Date.now() - _bqCache.ts) < BQ_TTL) {
      return res.json({ ..._bqCache.data, cache: true });
    }
    const bigquery = require('./bigquery');
    const data = await bigquery.buildAdlensData();
    _bqCache = { data, ts: Date.now() };
    res.json(data);
  } catch (e) {
    console.error('ERROR /api/adlens/bigquery:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
// En local/Render: corre como servidor. En Vercel: exporta el app como función serverless.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
}
module.exports = app;
