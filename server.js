const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, 'database.json');

app.use(express.json({ limit: '1mb' }));
// CORS для публичных данных: сайт можно хостить отдельно (статика), API — здесь
app.use('/api/public', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
// Локальный доступ к админке (на публичный хостинг заливается ТОЛЬКО public/, без админки)
app.use('/manage', express.static(path.join(__dirname, 'admin-panel')));

// database.json не в гите (там хеш пароля), при первом старте берём демо из примера
const DB_EXAMPLE = path.join(__dirname, 'database.example.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    if (fs.existsSync(DB_EXAMPLE)) fs.copyFileSync(DB_EXAMPLE, DB_PATH);
    else fs.writeFileSync(DB_PATH, JSON.stringify({ adminPasswordHash: null, settings: {}, teams: [], matches: [], streams: {} }, null, 2));
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  db.settings = db.settings || {};
  db.teams = db.teams || [];
  db.matches = db.matches || [];
  db.streams = db.streams || {};
  return db;
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
let db = loadDB();

// токен -> когда протухает (12ч)
const tokens = new Map();
const TOKEN_TTL = 12 * 60 * 60 * 1000;
const uid = () => crypto.randomBytes(6).toString('hex');

function newToken() {
  const t = crypto.randomBytes(32).toString('hex');
  tokens.set(t, Date.now() + TOKEN_TTL);
  return t;
}

function auth(req, res, next) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-auth-token'];
  const exp = token && tokens.get(token);
  if (exp && exp > Date.now()) return next();
  if (exp) tokens.delete(token);
  return res.status(401).json({ error: 'unauthorized' });
}

// антибрут: 5 неверных паролей с ip -> бан на 15 мин
const fails = new Map();
function blocked(ip) {
  const f = fails.get(ip);
  return f && f.n >= 5 && Date.now() - f.at < 15 * 60 * 1000;
}
function addFail(ip) {
  const f = fails.get(ip) || { n: 0, at: 0 };
  if (Date.now() - f.at > 15 * 60 * 1000) f.n = 0;
  f.n++; f.at = Date.now();
  fails.set(ip, f);
}

// первый пароль ставится только с этой же машины,
// иначе на хостинге админом станет первый кто зашёл
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

// можно задать пароль сразу через env — удобно для деплоя
if (process.env.ADMIN_PASSWORD && !db.adminPasswordHash) {
  db.adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
  saveDB(db);
}

// открыто для всех
app.get('/api/setup-needed', (req, res) => {
  db = loadDB();
  res.json({ needed: !db.adminPasswordHash, allowed: isLocal(req) });
});

app.post('/api/setup', async (req, res) => {
  db = loadDB();
  if (db.adminPasswordHash) return res.status(400).json({ error: 'already setup' });
  if (!isLocal(req)) return res.status(403).json({ error: 'setup only from localhost or via ADMIN_PASSWORD env' });
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'short password' });
  db.adminPasswordHash = await bcrypt.hash(password, 10);
  saveDB(db);
  res.json({ token: newToken() });
});

app.post('/api/login', async (req, res) => {
  if (blocked(req.ip)) return res.status(429).json({ error: 'too many tries, wait 15 min' });
  db = loadDB();
  const { password } = req.body || {};
  if (!db.adminPasswordHash) return res.status(400).json({ error: 'need setup' });
  if (password && await bcrypt.compare(String(password), db.adminPasswordHash)) {
    fails.delete(req.ip);
    return res.json({ token: newToken() });
  }
  addFail(req.ip);
  res.status(401).json({ error: 'wrong password' });
});

app.post('/api/logout', auth, (req, res) => {
  const h = req.headers['authorization'] || '';
  tokens.delete(h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-auth-token']);
  res.json({ ok: true });
});

// весь сайт одним запросом
app.get('/api/public', (req, res) => {
  db = loadDB();
  res.json({ settings: db.settings, teams: db.teams, matches: db.matches, streams: db.streams });
});

// админка
app.get('/api/admin/all', auth, (req, res) => {
  db = loadDB();
  // хеш пароля наружу не отдаём даже админу
  const { adminPasswordHash, ...rest } = db;
  res.json(rest);
});

app.put('/api/admin/settings', auth, (req, res) => {
  db = loadDB();
  const { name, city, dates, prize, about, venue, arena, hotels, rules } = req.body || {};
  db.settings = {
    name: name || 'Cyber Loong Championship',
    city: city || 'Chongqing, China',
    dates: dates || '',
    prize: prize || '',
    about: about || '',
    venue: venue || '',
    arena: arena || '',
    hotels: hotels || '',
    rules: rules || ''
  };
  saveDB(db);
  res.json({ ok: true });
});

// команды
app.post('/api/admin/teams', auth, (req, res) => {
  db = loadDB();
  const { name, tag, logo, players, group, country, flag, desc } = req.body || {};
  if (!name) return res.status(400).json({ error: 'need name' });
  const team = {
    id: uid(),
    name, tag: tag || '', logo: logo || '🐉',
    players: Array.isArray(players) ? players : String(players || '').split(',').map(s => s.trim()).filter(Boolean),
    group: group || '', country: country || '', flag: flag || '', desc: desc || '', w: 0, l: 0
  };
  db.teams.push(team);
  saveDB(db);
  res.json(team);
});

app.put('/api/admin/teams/:id', auth, (req, res) => {
  db = loadDB();
  const t = db.teams.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  const { name, tag, logo, players, group, country, flag, desc, w, l } = req.body || {};
  if (name !== undefined) t.name = name;
  if (tag !== undefined) t.tag = tag;
  if (logo !== undefined) t.logo = logo;
  if (flag !== undefined) t.flag = flag;
  if (players !== undefined) t.players = Array.isArray(players) ? players : String(players || '').split(',').map(s => s.trim()).filter(Boolean);
  if (group !== undefined) t.group = group;
  if (country !== undefined) t.country = country;
  if (desc !== undefined) t.desc = desc;
  if (w !== undefined) t.w = Number(w) || 0;
  if (l !== undefined) t.l = Number(l) || 0;
  saveDB(db);
  res.json(t);
});

app.delete('/api/admin/teams/:id', auth, (req, res) => {
  db = loadDB();
  db.teams = db.teams.filter(x => x.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// матчи
app.post('/api/admin/matches', auth, (req, res) => {
  db = loadDB();
  const { stage, group, a, b, slotA, slotB, bo, scoreA, scoreB, date, status, stream } = req.body || {};
  if (!a && !b && !slotA && !slotB) return res.status(400).json({ error: 'need teams or slots' });
  const m = {
    id: uid(),
    stage: stage || 'Group Stage', group: group || '',
    a: a || '', b: b || '', slotA: slotA || '', slotB: slotB || '', bo: bo || '',
    scoreA: Number(scoreA) || 0, scoreB: Number(scoreB) || 0,
    date: date || '', status: status || 'scheduled', stream: stream || ''
  };
  db.matches.push(m);
  saveDB(db);
  res.json(m);
});

app.put('/api/admin/matches/:id', auth, (req, res) => {
  db = loadDB();
  const m = db.matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  const { stage, group, a, b, slotA, slotB, bo, scoreA, scoreB, date, status, stream } = req.body || {};
  if (stage !== undefined) m.stage = stage;
  if (group !== undefined) m.group = group;
  if (a !== undefined) m.a = a;
  if (b !== undefined) m.b = b;
  if (slotA !== undefined) m.slotA = slotA;
  if (slotB !== undefined) m.slotB = slotB;
  if (bo !== undefined) m.bo = bo;
  if (scoreA !== undefined) m.scoreA = Number(scoreA) || 0;
  if (scoreB !== undefined) m.scoreB = Number(scoreB) || 0;
  if (date !== undefined) m.date = date;
  if (status !== undefined) m.status = status;
  if (stream !== undefined) m.stream = stream;
  saveDB(db);
  res.json(m);
});

app.delete('/api/admin/matches/:id', auth, (req, res) => {
  db = loadDB();
  db.matches = db.matches.filter(x => x.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// трансляции: own {title, url, embed}, youtube {url}, twitch {channel}
app.put('/api/admin/streams', auth, (req, res) => {
  db = loadDB();
  db.streams = req.body || {};
  saveDB(db);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`CyberLoong on http://0.0.0.0:${PORT}`));
