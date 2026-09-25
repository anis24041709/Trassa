/* TRASSA App V1 – mobile client for existing /api backend */
const API = (location.pathname.includes('/app') ? '' : '') + '/api';
// If served under /app/, still call origin /api
const TRASSA_API = '/api';

let csrf = null;
let user = null;
let screen = 'dashboard';
let state = {
  requests: [],
  market: [],
  offers: [],
  conversations: [],
  messages: [],
  currentRequest: null,
  currentOffer: null,
  currentConv: null,
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2800);
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && !csrf) {
    try {
      const c = await fetch(TRASSA_API + '/csrf', { credentials: 'same-origin' });
      csrf = (await c.json()).csrfToken;
    } catch (_) {}
  }
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(TRASSA_API + path, { credentials: 'same-origin', ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Serverfehler');
  return data;
}

function statusLabel(s) {
  return ({
    draft: 'Entwurf', new: 'Offen', progress: 'In Bearbeitung', awarded: 'Vergeben', cancelled: 'Storniert',
    pending: 'Offen', accepted: 'Angenommen', declined: 'Abgelehnt', withdrawn: 'Zurückgezogen',
    planned: 'Geplant', underway: 'Unterwegs', done: 'Fertig'
  })[s] || s || '—';
}
function statusBadge(s) {
  const cls = ({ awarded: 'green', accepted: 'green', done: 'green', new: 'amber', pending: 'amber', progress: 'amber', planned: 'amber', underway: 'amber', cancelled: 'red', declined: 'red', withdrawn: 'red' })[s] || '';
  return `<span class="badge ${cls}">${esc(statusLabel(s))}</span>`;
}
function fmtDate(v) {
  if (!v) return '—';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('de-DE');
}
function money(cents) {
  if (cents == null) return '—';
  return (Number(cents) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function initials(u) {
  const a = (u?.first_name || '')[0] || '';
  const b = (u?.last_name || '')[0] || '';
  return ((a + b) || (u?.email || 'TR').slice(0, 2)).toUpperCase();
}
function displayName(u) {
  const n = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return n || u?.company?.name || u?.email || 'TRASSA Nutzer';
}

/* ---------- Auth ---------- */
function showAuth(mode = 'login') {
  $('shell').classList.add('hidden');
  $('auth').classList.remove('hidden');
  $('tab-login').classList.toggle('active', mode === 'login');
  $('tab-register').classList.toggle('active', mode === 'register');
  $('form-login').classList.toggle('hidden', mode !== 'login');
  $('form-register').classList.toggle('hidden', mode !== 'register');
  $('auth-msg').classList.remove('show', 'err', 'ok');
}
function showApp() {
  $('auth').classList.add('hidden');
  $('shell').classList.remove('hidden');
  $('top-user').textContent = displayName(user);
  $('top-avatar').textContent = initials(user);
  navigate('dashboard');
}

async function login(email, password) {
  await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  const me = await api('/auth/me');
  user = me.user;
  showApp();
}
async function register(payload) {
  await api('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
  // try login
  try {
    await login(payload.email, payload.password);
  } catch {
    showAuth('login');
    const m = $('auth-msg');
    m.textContent = 'Registrierung ok. Bitte einloggen (ggf. E-Mail bestätigen).';
    m.classList.add('show', 'ok');
  }
}
async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
  user = null;
  showAuth('login');
}
async function boot() {
  try {
    const c = await fetch(TRASSA_API + '/csrf', { credentials: 'same-origin' });
    csrf = (await c.json()).csrfToken;
  } catch (_) {}
  try {
    const me = await api('/auth/me');
    user = me.user;
    showApp();
  } catch {
    showAuth('login');
  }
}

/* ---------- Navigation ---------- */
const titles = {
  dashboard: 'Dashboard',
  market: 'Marktplatz',
  requests: 'Anfragen',
  offers: 'Angebote',
  messages: 'Nachrichten',
  requestDetail: 'Anfrage',
  offerDetail: 'Angebot',
  chat: 'Chat',
  newRequest: 'Neue Anfrage',
};

async function navigate(name, data) {
  screen = name;
  document.querySelectorAll('.bottom-nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === name || (['requestDetail', 'newRequest'].includes(name) && b.dataset.nav === 'requests') || (name === 'offerDetail' && b.dataset.nav === 'offers') || (name === 'chat' && b.dataset.nav === 'messages'));
  });
  $('top-title').textContent = titles[name] || 'TRASSA';
  const back = ['requestDetail', 'offerDetail', 'chat', 'newRequest'].includes(name);
  $('btn-back').classList.toggle('hidden', !back);
  $('top-avatar').classList.toggle('hidden', back);

  const root = $('content');
  root.innerHTML = '<div class="empty">Laden …</div>';
  try {
    if (name === 'dashboard') await renderDashboard(root);
    else if (name === 'market') await renderMarket(root);
    else if (name === 'requests') await renderRequests(root);
    else if (name === 'offers') await renderOffers(root);
    else if (name === 'messages') await renderMessages(root);
    else if (name === 'requestDetail') await renderRequestDetail(root, data);
    else if (name === 'offerDetail') await renderOfferDetail(root, data);
    else if (name === 'chat') await renderChat(root, data);
    else if (name === 'newRequest') renderNewRequest(root);
  } catch (e) {
    root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function goBack() {
  if (screen === 'requestDetail' || screen === 'newRequest') navigate('requests');
  else if (screen === 'offerDetail') navigate('offers');
  else if (screen === 'chat') navigate('messages');
  else navigate('dashboard');
}

/* ---------- Screens ---------- */
async function renderDashboard(root) {
  const d = await api('/dashboard');
  const k = d.kpi || {};
  root.innerHTML = `
    <div class="kpi-row">
      <div class="kpi"><div class="lbl">Anfragen</div><div class="num">${esc(k.open ?? k.requests ?? '—')}</div></div>
      <div class="kpi"><div class="lbl">Angebote</div><div class="num">${esc(k.offers ?? '—')}</div></div>
      <div class="kpi"><div class="lbl">Transporte</div><div class="num">${esc(k.transports ?? '—')}</div></div>
      <div class="kpi"><div class="lbl">Nachrichten</div><div class="num">${esc(k.messages ?? '—')}</div></div>
    </div>
    <div class="section-title">Neueste Anfragen</div>
    <div class="list" id="dash-req"></div>
    <div class="section-title">Aktivität</div>
    <div class="list" id="dash-act"></div>
    <div style="margin-top:16px"><button class="btn btn-primary btn-block" onclick="navigate('newRequest')">+ Neue Anfrage</button></div>
    <div style="margin-top:10px"><button class="btn btn-ghost btn-block" onclick="logout()">Abmelden</button></div>
  `;
  const reqs = d.requests || [];
  $('dash-req').innerHTML = reqs.slice(0, 5).map((r) => `
    <button class="item" onclick="openRequest('${esc(r.id)}')">
      <div class="item-row"><span class="title">${esc(r.route || r.title || 'Anfrage')}</span>${statusBadge(r.status)}</div>
      <div class="meta">#TR-${esc(r.public_id)} · ${esc(fmtDate(r.from_date) + ' – ' + fmtDate(r.to_date))}</div>
    </button>
  `).join('') || '<div class="empty">Keine Anfragen</div>';
  const acts = d.activity || d.activities || [];
  $('dash-act').innerHTML = acts.slice(0, 6).map((a) => `
    <div class="item" style="cursor:default">
      <div class="title">${esc(a.text || a.message || a.action || 'Aktivität')}</div>
      <div class="meta">${esc(a.time || fmtDate(a.created_at))}</div>
    </div>
  `).join('') || '<div class="empty">Keine Aktivität</div>';
}

async function renderMarket(root) {
  root.innerHTML = `
    <input class="search" id="m-search" placeholder="Strecke / Titel suchen …" />
    <div class="list" id="m-list"></div>
  `;
  const load = async () => {
    const q = $('m-search').value.trim();
    const out = await api('/requests' + (q ? '?q=' + encodeURIComponent(q) : ''));
    state.market = out.requests || [];
    $('m-list').innerHTML = state.market.map((r) => `
      <button class="item" onclick="openRequest('${esc(r.id)}', true)">
        <div class="item-row"><span class="title">${esc(r.route || r.title)}</span>${statusBadge(r.status)}</div>
        <div class="meta">#TR-${esc(r.public_id)} · ${esc(r.gewicht || (r.weight_t ? r.weight_t + ' t' : '—'))}</div>
        <div class="meta">${esc(fmtDate(r.from_date))} – ${esc(fmtDate(r.to_date))}</div>
      </button>
    `).join('') || '<div class="empty">Keine Anfragen gefunden</div>';
  };
  $('m-search').oninput = () => { clearTimeout(load._t); load._t = setTimeout(load, 300); };
  await load();
}

async function renderRequests(root) {
  const out = await api('/requests?mine=true');
  state.requests = out.requests || [];
  root.innerHTML = `
    <button class="btn btn-primary btn-block" style="margin-bottom:12px" onclick="navigate('newRequest')">+ Neue Anfrage</button>
    <div class="list">
      ${state.requests.map((r) => `
        <button class="item" onclick="openRequest('${esc(r.id)}')">
          <div class="item-row"><span class="title">${esc(r.route || r.title)}</span>${statusBadge(r.status)}</div>
          <div class="meta">#TR-${esc(r.public_id)} · Angebote: ${esc(r.offers ?? 0)}</div>
        </button>
      `).join('') || '<div class="empty">Noch keine Anfragen</div>'}
    </div>
  `;
}

async function openRequest(id, fromMarket) {
  const out = await api('/requests/' + encodeURIComponent(id));
  state.currentRequest = out.request;
  state.currentRequest._docs = out.documents || [];
  state.currentRequest._fromMarket = !!fromMarket;
  navigate('requestDetail', state.currentRequest);
}

async function renderRequestDetail(root, r) {
  if (!r) r = state.currentRequest;
  if (!r) return navigate('requests');
  const isOwner = r.company_id === user?.company?.id;
  const docs = r._docs || [];
  root.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div style="font-weight:800;font-size:17px;margin-bottom:4px">${esc(r.title || r.route)}</div>
      <div class="meta">#TR-${esc(r.public_id)} · ${statusBadge(r.status)}</div>
    </div>
    <div class="detail-grid">
      <div class="box"><div class="k">Strecke</div><div class="v">${esc(r.route || (r.start_location + ' → ' + r.destination))}</div></div>
      <div class="box"><div class="k">Zeitraum</div><div class="v">${esc(fmtDate(r.from_date))} – ${esc(fmtDate(r.to_date))}</div></div>
      <div class="box"><div class="k">Gewicht</div><div class="v">${esc(r.gewicht || (r.weight_t != null ? r.weight_t + ' t' : '—'))}</div></div>
      <div class="box"><div class="k">Wagenart</div><div class="v">${esc(r.wagon_type || '—')}</div></div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="k" style="font-size:11px;font-weight:700;color:var(--muted)">Beschreibung</div>
      <div style="margin-top:6px;font-size:14px;line-height:1.45">${esc(r.description || '—')}</div>
    </div>
    <div class="section-title">Dokumente</div>
    <div class="list" style="margin-bottom:12px">
      ${docs.length ? docs.map((d) => `
        <a class="item" href="/api/documents/${esc(d.id)}/download" style="text-decoration:none;color:inherit">
          <div class="title">📎 ${esc(d.original_name)}</div>
          <div class="meta">${Math.round((d.size_bytes || 0) / 1024)} KB</div>
        </a>
      `).join('') : '<div class="empty">Keine Dokumente</div>'}
    </div>
    <div class="actions" id="req-actions"></div>
  `;
  const actions = $('req-actions');
  if (isOwner && ['draft', 'new', 'progress'].includes(r.status)) {
    actions.innerHTML = `
      <button class="btn btn-danger" onclick="cancelRequest('${esc(r.id)}')">Stornieren</button>
    `;
  } else if (!isOwner && ['new', 'progress'].includes(r.status)) {
    actions.innerHTML = `
      <div class="card" style="width:100%">
        <div class="field"><label>Preis (€)</label><input id="offer-price" type="number" min="0" step="0.01" placeholder="z. B. 12500"></div>
        <div class="field"><label>Gültig bis</label><input id="offer-valid" type="date"></div>
        <div class="field"><label>Notiz</label><input id="offer-note" type="text" placeholder="Optional"></div>
        <button class="btn btn-primary btn-block" onclick="submitOffer('${esc(r.id)}')">Angebot senden</button>
      </div>
    `;
  }
}

async function cancelRequest(id) {
  if (!confirm('Anfrage wirklich stornieren?')) return;
  try {
    await api('/requests/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
    toast('Anfrage storniert');
    openRequest(id);
  } catch (e) { toast(e.message); }
}

async function submitOffer(requestId) {
  const price = Number($('offer-price')?.value || 0);
  if (!Number.isFinite(price) || price < 0) return toast('Bitte Preis eingeben');
  try {
    await api('/requests/' + encodeURIComponent(requestId) + '/offers', {
      method: 'POST',
      body: JSON.stringify({
        price_cents: Math.round(price * 100),
        valid_until: $('offer-valid')?.value || '',
        note: $('offer-note')?.value?.trim() || '',
      }),
    });
    toast('Angebot gesendet');
    navigate('offers');
  } catch (e) { toast(e.message); }
}

async function renderOffers(root) {
  const out = await api('/offers');
  state.offers = out.offers || [];
  const myId = user?.company?.id;
  const incoming = state.offers.filter((o) => o.direction === 'incoming' || o.request_company === myId);
  const outgoing = state.offers.filter((o) => o.direction === 'outgoing' || o.provider_company_id === myId);
  const row = (o) => `
    <button class="item" onclick="openOffer('${esc(o.id)}')">
      <div class="item-row"><span class="title">${esc(o.route || 'Angebot')}</span>${statusBadge(o.status)}</div>
      <div class="meta">${esc(o.partner || '')} · ${esc(o.price || money(o.price_cents))}</div>
    </button>
  `;
  root.innerHTML = `
    <div class="section-title">Eingegangen (${incoming.length})</div>
    <div class="list">${incoming.map(row).join('') || '<div class="empty">Keine</div>'}</div>
    <div class="section-title">Abgegeben (${outgoing.length})</div>
    <div class="list">${outgoing.map(row).join('') || '<div class="empty">Keine</div>'}</div>
  `;
}

async function openOffer(id) {
  const out = await api('/offers/' + encodeURIComponent(id));
  state.currentOffer = out.offer || out;
  navigate('offerDetail', state.currentOffer);
}

async function renderOfferDetail(root, o) {
  if (!o) o = state.currentOffer;
  if (!o) return navigate('offers');
  const myId = user?.company?.id;
  const isRequester = o.request_company === myId || o.direction === 'incoming';
  const isProvider = o.provider_company_id === myId || o.direction === 'outgoing';
  root.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div style="font-weight:800;font-size:17px">${esc(o.route || 'Angebot')}</div>
      <div class="meta" style="margin-top:4px">${statusBadge(o.status)} · ${esc(o.price || money(o.price_cents))}</div>
    </div>
    <div class="detail-grid">
      <div class="box"><div class="k">Partner</div><div class="v">${esc(o.partner || '—')}</div></div>
      <div class="box"><div class="k">Gültig bis</div><div class="v">${esc(fmtDate(o.valid_until || o.validUntil))}</div></div>
    </div>
    <div class="card" style="margin-bottom:12px"><div class="meta">Notiz</div><div style="margin-top:6px">${esc(o.note || '—')}</div></div>
    <div class="actions" id="offer-actions"></div>
  `;
  const a = $('offer-actions');
  if (o.status === 'pending' && isRequester && !isProvider) {
    a.innerHTML = `
      <button class="btn btn-primary" onclick="offerAction('${esc(o.id)}','accepted')">Annehmen</button>
      <button class="btn btn-ghost" onclick="offerAction('${esc(o.id)}','declined')">Ablehnen</button>
    `;
  } else if (o.status === 'pending' && isProvider) {
    a.innerHTML = `<button class="btn btn-ghost" onclick="offerAction('${esc(o.id)}','withdrawn')">Zurückziehen</button>`;
  }
}

async function offerAction(id, status) {
  try {
    await api('/offers/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status }) });
    toast('Gespeichert');
    openOffer(id);
  } catch (e) { toast(e.message); }
}

async function renderMessages(root) {
  const out = await api('/conversations');
  state.conversations = out.conversations || [];
  root.innerHTML = `
    <div class="list">
      ${state.conversations.map((c, i) => `
        <button class="item" onclick="openChat(${i})">
          <div class="item-row">
            <span class="title">${esc(c.names || 'Gespräch')}</span>
            ${c.unread ? `<span class="badge green">${esc(c.unread)}</span>` : ''}
          </div>
          <div class="meta">${esc(c.last || '')}</div>
        </button>
      `).join('') || '<div class="empty">Noch keine Nachrichten.<br>Chat startet über Angebote.</div>'}
    </div>
  `;
}

async function openChat(index) {
  state.currentConv = state.conversations[index];
  navigate('chat', state.currentConv);
}

async function renderChat(root, c) {
  if (!c) c = state.currentConv;
  if (!c) return navigate('messages');
  const out = await api('/conversations/' + encodeURIComponent(c.id) + '/messages');
  state.messages = out.messages || [];
  root.innerHTML = `
    <div class="chat">
      <div style="font-weight:700;margin-bottom:8px">${esc(c.names || 'Chat')}</div>
      <div class="chat-thread" id="thread">
        ${state.messages.map((m) => `
          <div class="bubble ${m.sender_user_id === user.id ? 'out' : 'in'}">
            ${esc(m.body)}
            <span class="t">${esc(new Date(m.created_at).toLocaleString('de-DE'))}</span>
          </div>
        `).join('') || '<div class="empty">Noch keine Nachrichten</div>'}
      </div>
      <form class="chat-form" onsubmit="return sendChat(event)">
        <input id="chat-input" placeholder="Nachricht …" autocomplete="off" maxlength="4000" />
        <button class="btn btn-primary" type="submit">Senden</button>
      </form>
    </div>
  `;
  const th = $('thread');
  th.scrollTop = th.scrollHeight;
}

async function sendChat(e) {
  e.preventDefault();
  const input = $('chat-input');
  const body = input.value.trim();
  if (!body || !state.currentConv) return false;
  try {
    await api('/conversations/' + encodeURIComponent(state.currentConv.id) + '/messages', {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    input.value = '';
    renderChat($('content'), state.currentConv);
  } catch (err) { toast(err.message); }
  return false;
}

function renderNewRequest(root) {
  root.innerHTML = `
    <div class="card">
      <div class="field"><label>Titel</label><input id="nr-titel" placeholder="Kurzbeschreibung"></div>
      <div class="field"><label>Start</label><input id="nr-start" placeholder="z. B. Köln"></div>
      <div class="field"><label>Ziel</label><input id="nr-ziel" placeholder="z. B. Hamburg"></div>
      <div class="field"><label>Von</label><input id="nr-von" type="date"></div>
      <div class="field"><label>Bis</label><input id="nr-bis" type="date"></div>
      <div class="field"><label>Gewicht (t)</label><input id="nr-gewicht" type="number" min="0" step="0.1"></div>
      <div class="field"><label>Beschreibung</label><textarea id="nr-beschreibung"></textarea></div>
      <button class="btn btn-primary btn-block" onclick="createRequest()">Veröffentlichen</button>
      <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="createRequest(true)">Als Entwurf</button>
    </div>
  `;
}

async function createRequest(draft) {
  const payload = {
    start: $('nr-start').value.trim(),
    ziel: $('nr-ziel').value.trim(),
    von: $('nr-von').value,
    bis: $('nr-bis').value,
    gewicht: $('nr-gewicht').value ? Number($('nr-gewicht').value) : null,
    titel: $('nr-titel').value.trim(),
    beschreibung: $('nr-beschreibung').value.trim(),
    status: draft ? 'draft' : 'new',
    gefahrValue: 'nein',
  };
  if (!draft && (!payload.start || !payload.ziel || !payload.titel)) {
    return toast('Titel, Start und Ziel sind Pflicht');
  }
  try {
    await api('/requests', { method: 'POST', body: JSON.stringify(payload) });
    toast(draft ? 'Entwurf gespeichert' : 'Anfrage veröffentlicht');
    navigate('requests');
  } catch (e) { toast(e.message); }
}

/* ---------- Wire UI ---------- */
window.navigate = navigate;
window.logout = logout;
window.openRequest = openRequest;
window.openOffer = openOffer;
window.openChat = openChat;
window.cancelRequest = cancelRequest;
window.submitOffer = submitOffer;
window.offerAction = offerAction;
window.sendChat = sendChat;
window.createRequest = createRequest;

document.addEventListener('DOMContentLoaded', () => {
  $('tab-login').onclick = () => showAuth('login');
  $('tab-register').onclick = () => showAuth('register');
  $('btn-back').onclick = goBack;
  document.querySelectorAll('.bottom-nav button').forEach((b) => {
    b.onclick = () => navigate(b.dataset.nav);
  });
  $('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('auth-msg');
    msg.classList.remove('show', 'err', 'ok');
    try {
      const fd = new FormData(e.target);
      await login(fd.get('email'), fd.get('password'));
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('show', 'err');
    }
  };
  $('form-register').onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('auth-msg');
    msg.classList.remove('show', 'err', 'ok');
    const fd = new FormData(e.target);
    if (fd.get('password') !== fd.get('password2')) {
      msg.textContent = 'Passwörter stimmen nicht überein';
      msg.classList.add('show', 'err');
      return;
    }
    try {
      await register({
        first_name: fd.get('first_name'),
        last_name: fd.get('last_name'),
        company: fd.get('company'),
        role: fd.get('role') || 'Logistiker',
        email: fd.get('email'),
        password: fd.get('password'),
      });
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('show', 'err');
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  boot();
});
