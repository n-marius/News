// News-PWA: liest data/feed.json, zeigt Reiter, Suche, Pull-to-Refresh und Push-Anmeldung.
const TABS = [['all', 'Für mich'], ['iwr', 'Wirtschaftsrecht'], ['ukraine', 'Ukraine'], ['sabotage', 'Sabotage']];
const FEED_URL = 'data/feed.json';
const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* Speicher gesperrt */ } },
};

let items = [];
let generated = null;
let tab = TABS.some(([k]) => k === store.get('tab')) ? store.get('tab') : 'all';
let query = '';
let loadedAt = 0;

// ---------- Hilfen ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function ago(iso) {
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `${Math.round(m)} Min.`;
  if (m < 1440) return `${Math.floor(m / 60)} Std.`;
  return `${Math.floor(m / 1440)} T.`;
}
const fav = (domain) => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;

function srcLine(i) {
  return `<div class="src"><img src="${fav(i.domain)}" alt="" width="18" height="18" loading="lazy" referrerpolicy="no-referrer"><b>${esc(i.source)}</b>`
    + `${i.type === 'schnell' ? '<span class="chip">schnell/unbestätigt</span>' : ''}${i.breaking ? '<span class="chip brk">Eilmeldung</span>' : ''}</div>`;
}
const thumb = (i) => (i.image ? `<div class="thumb"><img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : '');

function card(i) {
  return `<a class="card${i.image ? '' : ' noimg'}" href="${esc(i.url)}" target="_blank" rel="noopener">${thumb(i)}`
    + `<div class="txt">${srcLine(i)}<h3 class="title">${esc(i.title)}</h3><div class="time" title="${esc(new Date(i.date).toLocaleString('de-DE'))}">${ago(i.date)}</div></div></a>`;
}
function hero(i) {
  return `<a class="hero" href="${esc(i.url)}" target="_blank" rel="noopener">${i.image ? thumb(i) : ''}`
    + `<div class="txt">${srcLine(i)}<h2 class="title">${esc(i.title)}</h2>${i.teaser ? `<p class="teaser">${esc(i.teaser)}</p>` : ''}`
    + `<div class="time" title="${esc(new Date(i.date).toLocaleString('de-DE'))}">${ago(i.date)}</div></div></a>`;
}

// ---------- Darstellung ----------
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([k, n]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${n}</button>`).join('');
}
function visible() {
  const q = query.trim().toLowerCase();
  return items.filter((i) => (tab === 'all' || i.topics.includes(tab))
    && (!q || `${i.title} ${i.teaser} ${i.source}`.toLowerCase().includes(q)));
}
function render() {
  const list = visible();
  const name = TABS.find(([k]) => k === tab)[1];
  const chevron = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.4 6 8 7.4l4.6 4.6L8 16.6 9.4 18l6-6z"/></svg>';
  let html = `<div class="heading">${query ? 'Suchergebnisse' : tab === 'all' ? 'Top-Meldungen' : name}${chevron}</div>`;
  if (!list.length) {
    html += `<div class="empty">${items.length ? 'Keine Treffer.' : 'Noch keine Meldungen geladen.'}</div>`;
  } else {
    const h = Math.max(0, list.slice(0, 6).findIndex((i) => i.image));
    const first = list[h];
    html += hero(first) + `<div class="grid">${list.filter((_, n) => n !== h).map(card).join('')}</div>`;
  }
  if (generated) html += `<div class="foot">Stand ${new Date(generated).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr · ${list.length} Meldungen</div>`;
  $('#content').innerHTML = html;
}
function setTab(k, scroll = true) {
  tab = k; store.set('tab', k);
  renderTabs(); render();
  if (scroll) window.scrollTo(0, 0);
  $('#tabs [aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

async function load(force = false) {
  try {
    const r = await fetch(`${FEED_URL}?t=${force ? Date.now() : Math.floor(Date.now() / 60000)}`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    items = d.items || []; generated = d.generated; loadedAt = Date.now();
  } catch { /* offline: Service Worker liefert ggf. den letzten Stand */ }
  render();
}

// ---------- Bedienung ----------
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
$('#content').addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('broken'); }, true);

$('#btn-search').addEventListener('click', () => { $('#searchbar').hidden = false; $('#q').focus(); });
$('#q').addEventListener('input', (e) => { query = e.target.value; render(); });
$('#searchbar').addEventListener('submit', (e) => { e.preventDefault(); $('#q').blur(); });
$('#q-close').addEventListener('click', () => { query = ''; $('#q').value = ''; $('#searchbar').hidden = true; render(); });

document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - loadedAt > 120000) load(true); });

// Pull-to-Refresh
{
  const ptr = $('#ptr'); let y0 = null, dy = 0;
  addEventListener('touchstart', (e) => { y0 = window.scrollY <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 === null || ptr.classList.contains('loading')) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0 && window.scrollY <= 0) { ptr.classList.add('pulling'); ptr.style.height = `${Math.min(dy / 2, 56)}px`; ptr.firstElementChild.style.transform = `rotate(${dy * 3}deg)`; }
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (y0 === null) return;
    const go = dy > 110; y0 = null;
    ptr.classList.remove('pulling');
    if (go) { ptr.classList.add('loading'); ptr.style.height = '44px'; await load(true); }
    ptr.classList.remove('loading'); ptr.style.height = '0';
  });
}

// ---------- Push ----------
const sheet = { back: $('#sheet-back'), box: $('#sheet'), text: $('#sheet-text'), action: $('#sheet-action') };
const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
let workerUrl = '';

async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { k: 'unsupported', text: standalone() ? 'Dieses Gerät unterstützt keine Web-Push-Benachrichtigungen.' : 'Benachrichtigungen funktionieren nur in der installierten App.\n\nIn Safari: Teilen-Symbol → „Zum Home-Bildschirm“, dann die App vom Home-Bildschirm öffnen und hier erneut tippen.' };
  }
  if (!workerUrl) return { k: 'nourl', text: 'Push ist noch nicht eingerichtet (Worker-Adresse fehlt).' };
  if (Notification.permission === 'denied') return { k: 'denied', text: 'Benachrichtigungen sind blockiert.\n\nEinstellungen → Mitteilungen → News → „Mitteilungen erlauben“.' };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub && Notification.permission === 'granted') return { k: 'on', text: 'Benachrichtigungen sind aktiv. Du erhältst neue Meldungen gesammelt nach jedem Abruf (etwa alle 15 Minuten).', sub };
  return { k: 'off', text: 'Neue Meldungen als Benachrichtigung erhalten. iOS fragt nach der Erlaubnis.' };
}
async function openSheet() {
  sheet.text.textContent = 'Lade …'; sheet.action.hidden = true;
  sheet.back.hidden = sheet.box.hidden = false;
  const s = await pushState();
  sheet.text.textContent = s.text;
  const label = { off: 'Benachrichtigungen aktivieren', on: 'Deaktivieren' }[s.k];
  sheet.action.hidden = !label; sheet.action.textContent = label || ''; sheet.action.dataset.k = s.k;
  sheet.action.disabled = false;
}
function closeSheet() { sheet.back.hidden = sheet.box.hidden = true; }
$('#btn-bell').addEventListener('click', openSheet);
sheet.back.addEventListener('click', closeSheet);
$('#sheet-close').addEventListener('click', closeSheet);

sheet.action.addEventListener('click', async () => {
  sheet.action.disabled = true;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (sheet.action.dataset.k === 'on') {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${workerUrl}/unsubscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe();
      }
    } else {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Erlaubnis nicht erteilt.');
      const key = (await (await fetch(`${workerUrl}/key`)).text()).trim();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
      const r = await fetch(`${workerUrl}/subscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error(`Anmeldung am Server fehlgeschlagen (${r.status}).`);
    }
    await openSheet();
  } catch (e) {
    sheet.text.textContent = `Fehler: ${e.message || e}`;
    sheet.action.disabled = false;
  }
});

async function initPush() {
  try { workerUrl = ((await (await fetch('config/app.json', { cache: 'no-cache' })).json()).workerUrl || '').replace(/\/$/, ''); } catch { /* ohne Konfiguration */ }
  try { const s = await pushState(); $('#bell-dot').hidden = s.k !== 'off'; } catch { /* egal */ }
}

// ---------- Start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
renderTabs();
load().then(initPush);
