let DB = null, TAB = 'settings';
/* Админка хостится ОТДЕЛЬНО от сайта. Если API на другом адресе — впиши его сюда, напр. 'http://IP:4000' */
const API_BASE = '';
const api = p => (API_BASE || '') + p;
const H = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('loong-token') || '') });
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function init() {
  const s = await fetch(api('/api/setup-needed')).then(r => r.json()).catch(() => null);
  if (!s) { document.body.innerHTML = '<div class="wrap"><p>Нет связи с сервером.</p></div>'; return; }
  if (s.needed && !s.allowed) { document.body.innerHTML = '<div class="wrap"><p>Админ ещё не настроен. Первый пароль задаётся только с сервера (localhost) или через ADMIN_PASSWORD в .env.</p></div>'; return; }
  if (s.needed) show('setupBox');
  else if (!localStorage.getItem('loong-token')) show('loginBox');
  else if (!await reload()) show('loginBox');
  else show('mainBox');
}
function show(id) {
  ['setupBox', 'loginBox', 'mainBox'].forEach(x => $(x).classList.add('hidden'));
  $(id).classList.remove('hidden');
  $('logoutBtn').classList.toggle('hidden', id !== 'mainBox');
}
async function setup() {
  const r = await fetch(api('/api/setup'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('setupPass').value }) }).then(r => r.json());
  if (r.token) { localStorage.setItem('loong-token', r.token); await reload(); show('mainBox'); }
  else alert(r.error || 'ошибка');
}
async function login() {
  const r = await fetch(api('/api/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('loginPass').value }) }).then(r => r.json());
  if (r.token) { localStorage.setItem('loong-token', r.token); await reload(); show('mainBox'); }
  else alert(r.error === 'wrong password' ? 'Неверный пароль' : (r.error || 'ошибка'));
}
$('logoutBtn').onclick = async () => {
  await fetch(api('/api/logout'), { method: 'POST', headers: H() }).catch(() => {});
  localStorage.removeItem('loong-token');
  location.reload();
};

async function reload() {
  const r = await fetch(api('/api/admin/all'), { headers: H() });
  if (r.status === 401) return false;
  DB = await r.json();
  render();
  return true;
}
async function send(method, url, body) {
  const r = await fetch((API_BASE || '') + url, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { alert('Сессия истекла, войди заново'); location.reload(); return null; }
  return r.json();
}

document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  TAB = b.dataset.t;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  render();
});

function teamName(id) {
  const t = (DB.teams || []).find(x => x.id === id);
  return t ? `${t.tag ? '[' + t.tag + '] ' : ''}${t.name}` : (id || 'TBD');
}

function render() {
  const el = $('tabBody');
  if (TAB === 'settings') {
    const s = DB.settings || {};
    el.innerHTML = `<div class="form-card"><h3>⚙ О турнире</h3>
      <label>Название</label><input id="f-name" value="${esc(s.name || '')}">
      <div class="row2"><div><label>Город</label><input id="f-city" value="${esc(s.city || '')}"></div>
      <div><label>Аренa (коротко)</label><input id="f-venue" value="${esc(s.venue || '')}"></div></div>
      <div class="row2"><div><label>Даты</label><input id="f-dates" value="${esc(s.dates || '')}"></div>
      <div><label>Призовой</label><input id="f-prize" value="${esc(s.prize || '')}"></div></div>
      <label>Описание</label><textarea id="f-about" rows="2">${esc(s.about || '')}</textarea>
      <label>Арена (полное описание)</label><textarea id="f-arena" rows="5">${esc(s.arena || '')}</textarea>
      <label>Отели (каждый с новой строки)</label><textarea id="f-hotels" rows="6">${esc(s.hotels || '')}</textarea>
      <label>Правила (каждое с новой строки)</label><textarea id="f-rules" rows="8">${esc(s.rules || '')}</textarea>
      <button class="b-add" onclick="saveSettings()">Сохранить</button></div>`;
  }
  if (TAB === 'teams') {
    el.innerHTML = `<div class="form-card"><h3>＋ Новая команда</h3>
      <div class="row2"><div><label>Название</label><input id="n-tname" placeholder="Red Dragons"></div>
      <div><label>Тег</label><input id="n-ttag" placeholder="RDD"></div></div>
      <div class="row2"><div><label>Лого (эмодзи или ссылка)</label><input id="n-tlogo" placeholder="🐉"></div>
      <div><label>Группа</label><input id="n-tgroup" placeholder="A"></div></div>
      <div class="row2"><div><label>Страна</label><input id="n-tcountry" placeholder="China"></div>
      <div><label>Флаг (эмодзи)</label><input id="n-tflag" placeholder="🇨🇳"></div></div>
      <label>Описание команды (коротко)</label><input id="n-tdesc" placeholder="Aggressive riflers from Chongqing">
      <label>Игроки через запятую</label><input id="n-tplayers" placeholder="Nick1, Nick2, Nick3, Nick4, Nick5">
      <button class="b-add" onclick="addTeam()">Добавить</button></div>
      <table><tr><th>Команда</th><th>Гр.</th><th>W-L</th><th></th></tr>
      ${(DB.teams || []).map(t => `<tr>
        <td>${esc(t.logo || '')} <b>${esc(t.name)}</b> <span style="color:var(--gold)">${esc(t.tag || '')}</span><br>
          <span style="color:var(--muted);font-size:12px">${esc((t.players || []).join(', '))}</span></td>
        <td>${esc(t.group || '')}</td>
        <td><input style="width:44px" value="${t.w || 0}" onchange="setWL('${t.id}','w',this.value)"> –
            <input style="width:44px" value="${t.l || 0}" onchange="setWL('${t.id}','l',this.value)"></td>
        <td><button class="b-edit" onclick="editTeam('${t.id}')">Изм.</button>
            <button class="b-del" onclick="delTeam('${t.id}')">✕</button></td>
      </tr>`).join('')}</table>`;
  }
  if (TAB === 'matches') {
    const opts = '<option value="">— TBD —</option>' + (DB.teams || []).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    const e = editingMatch ? (DB.matches || []).find(x => x.id === editingMatch) : null;
    const stg = ['Group Stage', 'Quarterfinal', 'Semifinal', '3rd Place Match', 'Grand Final'];
    el.innerHTML = `<div class="form-card"><h3>${e ? '✎ Редактировать матч' : '＋ Новый матч'}</h3>
      <div class="row2"><div><label>Стадия</label><select id="n-mstage">${stg.map(s => `<option ${e && e.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>Группа (для групп) / BO (напр. BO3)</label><div class="row2"><input id="n-mgroup" placeholder="A" value="${esc(e ? e.group || '' : '')}"><input id="n-mbo" placeholder="BO3" value="${esc(e ? e.bo || '' : '')}"></div></div></div>
      <div class="row2"><div><label>Команда 1 (или слот: A1)</label><select id="n-ma">${opts}</select><input id="n-slota" placeholder="Слот: A1 / Winner QF1" value="${esc(e ? e.slotA || '' : '')}"></div>
      <div><label>Команда 2 (или слот: B2)</label><select id="n-mb">${opts}</select><input id="n-slotb" placeholder="Слот: B2 / Winner QF2" value="${esc(e ? e.slotB || '' : '')}"></div></div>
      <div class="row3"><div><label>Счёт 1</label><input id="n-sa" type="number" value="${e ? e.scoreA : 0}"></div>
      <div><label>Счёт 2</label><input id="n-sb" type="number" value="${e ? e.scoreB : 0}"></div>
      <div><label>Статус</label><select id="n-mstatus"><option value="scheduled">Скоро</option><option value="live">LIVE</option><option value="finished">Завершён</option></select></div></div>
      <label>Дата (текст)</label><input id="n-mdate" placeholder="2026-10-30 18:00" value="${esc(e ? e.date || '' : '')}">
      <label>Ссылка на стрим матча (необязательно)</label><input id="n-mstream" placeholder="https://…" value="${esc(e ? e.stream || '' : '')}">
      <button class="b-add" onclick="saveMatch()">${e ? 'Сохранить изменения' : 'Добавить'}</button>
      ${e ? '<button class="b-edit" onclick="cancelEdit()">Отмена</button>' : ''}</div>
      <table><tr><th>Матч</th><th>Счёт</th><th>Статус</th><th></th></tr>
      ${(DB.matches || []).map(m => `<tr>
        <td><b>${esc(m.stage)}</b>${m.bo ? ' • ' + esc(m.bo) : ''} ${esc(m.group ? '• ' + m.group : '')}<br>
          ${esc(m.a ? teamName(m.a) : (m.slotA || 'TBD'))} — ${esc(m.b ? teamName(m.b) : (m.slotB || 'TBD'))}<br>
          <span style="color:var(--muted);font-size:12px">${esc(m.date || '')}</span></td>
        <td><input style="width:44px" value="${m.scoreA}" onchange="setScore('${m.id}','scoreA',this.value)"> :
            <input style="width:44px" value="${m.scoreB}" onchange="setScore('${m.id}','scoreB',this.value)"></td>
        <td><select onchange="setStatus('${m.id}',this.value)">
          <option value="scheduled" ${m.status === 'scheduled' ? 'selected' : ''}>Скоро</option>
          <option value="live" ${m.status === 'live' ? 'selected' : ''}>LIVE</option>
          <option value="finished" ${m.status === 'finished' ? 'selected' : ''}>Завершён</option></select></td>
        <td><button class="b-edit" onclick="editMatch('${m.id}')">Изм.</button>
            <button class="b-del" onclick="delMatch('${m.id}')">✕</button></td>
      </tr>`).join('')}</table>`;
    if (e) { $('n-ma').value = e.a || ''; $('n-mb').value = e.b || ''; $('n-mstatus').value = e.status || 'scheduled'; }
  }
  if (TAB === 'streams') {
    const st = DB.streams || {}, own = st.own || {}, yt = st.youtube || {}, tw = st.twitch || {};
    el.innerHTML = `<div class="form-card"><h3>🐉 Свой стрим (на сайте)</h3>
      <label>Название</label><input id="s-otitle" value="${esc(own.title || '')}">
      <label>Ссылка на видео (.mp4) — если есть прямой файл</label><input id="s-ourl" value="${esc(own.url || '')}">
      <label>ИЛИ полный embed-код плеера (iframe) — для своего плеера/HLS</label>
      <textarea id="s-oembed" rows="3" placeholder="<iframe ...></iframe>">${esc(own.embed || '')}</textarea>
      </div>
      <div class="form-card"><h3>▶ YouTube</h3>
      <label>Ссылка на видео или трансляцию</label><input id="s-yt" value="${esc(yt.url || '')}" placeholder="https://youtube.com/watch?v=…">
      </div>
      <div class="form-card"><h3>💜 Twitch</h3>
      <label>Имя канала (только ник, без ссылок)</label><input id="s-tw" value="${esc(tw.channel || '')}" placeholder="shroud">
      </div>
      <button class="b-add" onclick="saveStreams()">Сохранить трансляции</button>`;
  }
}

async function saveSettings() {
  await send('PUT', '/api/admin/settings', {
    name: $('f-name').value, city: $('f-city').value, dates: $('f-dates').value,
    prize: $('f-prize').value, about: $('f-about').value, venue: $('f-venue').value,
    arena: $('f-arena').value, hotels: $('f-hotels').value, rules: $('f-rules').value
  });
  await reload(); alert('Сохранено ✅');
}
async function addTeam() {
  await send('POST', '/api/admin/teams', {
    name: $('n-tname').value, tag: $('n-ttag').value, logo: $('n-tlogo').value,
    group: $('n-tgroup').value, players: $('n-tplayers').value,
    country: $('n-tcountry').value, flag: $('n-tflag').value, desc: $('n-tdesc').value
  });
  await reload();
}
async function setWL(id, f, v) {
  const b = {}; b[f] = Number(v) || 0;
  await send('PUT', '/api/admin/teams/' + id, b); await reload();
}
async function editTeam(id) {
  const t = DB.teams.find(x => x.id === id);
  const name = prompt('Название:', t.name); if (name === null) return;
  const tag = prompt('Тег:', t.tag || ''); if (tag === null) return;
  const logo = prompt('Лого (эмодзи/ссылка):', t.logo || ''); if (logo === null) return;
  const group = prompt('Группа:', t.group || ''); if (group === null) return;
  const players = prompt('Игроки через запятую:', (t.players || []).join(', ')); if (players === null) return;
  const country = prompt('Страна:', t.country || ''); if (country === null) return;
  const flag = prompt('Флаг (эмодзи):', t.flag || ''); if (flag === null) return;
  const desc = prompt('Описание:', t.desc || ''); if (desc === null) return;
  await send('PUT', '/api/admin/teams/' + id, { name, tag, logo, group, players, country, flag, desc });
  await reload();
}
async function delTeam(id) {
  if (!confirm('Удалить команду?')) return;
  await send('DELETE', '/api/admin/teams/' + id); await reload();
}
let editingMatch = null;
async function saveMatch() {
  const body = {
    stage: $('n-mstage').value, group: $('n-mgroup').value, bo: $('n-mbo').value,
    a: $('n-ma').value, b: $('n-mb').value, slotA: $('n-slota').value.trim(), slotB: $('n-slotb').value.trim(),
    scoreA: $('n-sa').value, scoreB: $('n-sb').value,
    date: $('n-mdate').value, status: $('n-mstatus').value, stream: $('n-mstream').value
  };
  if (editingMatch) {
    await send('PUT', '/api/admin/matches/' + editingMatch, body);
    editingMatch = null;
  } else {
    await send('POST', '/api/admin/matches', body);
  }
  await reload();
}
function editMatch(id) { editingMatch = id; render(); window.scrollTo({ top: 0 }); }
function cancelEdit() { editingMatch = null; render(); }
async function setScore(id, f, v) {
  const b = {}; b[f] = Number(v) || 0;
  await send('PUT', '/api/admin/matches/' + id, b); await reload();
}
async function setStatus(id, v) {
  await send('PUT', '/api/admin/matches/' + id, { status: v }); await reload();
}
async function delMatch(id) {
  if (!confirm('Удалить матч?')) return;
  await send('DELETE', '/api/admin/matches/' + id); await reload();
}
async function saveStreams() {
  await send('PUT', '/api/admin/streams', {
    own: { title: $('s-otitle').value, url: $('s-ourl').value, embed: $('s-oembed').value },
    youtube: { url: $('s-yt').value },
    twitch: { channel: $('s-tw').value.trim() }
  });
  await reload(); alert('Трансляции сохранены ✅');
}

init();
