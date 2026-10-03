// Feed-Sammler: liest config/sources.json, filtert nach config/keywords.json,
// schreibt data/feed.json und meldet neue Nachrichten an den Push-Worker.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(ROOT, ...p);
const MAX_ITEMS = 300;
const MAX_AGE_MS = 14 * 24 * 3600 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// ---------- Hilfsfunktionen ----------
const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
};

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return ''; }
    }
    return ENT[e] ?? m;
  });
}
const stripCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const text = (s) => decode(stripCdata(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function tag(block, name) {
  const m = block.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, 'i'));
  return m ? stripCdata(m[1]).trim() : '';
}
function attrs(tagText) {
  const out = {};
  for (const m of tagText.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g)) out[(m[1] || m[3]).toLowerCase()] = decode(m[2] ?? m[4]);
  return out;
}
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

function canonicalUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|wt_mc|at_|cmpid|ref$)/i.test(k)) x.searchParams.delete(k);
    return x.toString();
  } catch { return u; }
}
const normTitle = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// curl statt Node-fetch: mehrere Seiten sperren den TLS-Fingerabdruck von Node (HTTP 403).
const execFileP = promisify(execFile);
async function http(url, { timeout = 25000, headers = {}, simple = false } = {}) {
  const h = simple ? { accept: 'application/rss+xml, */*', ...headers } : { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, application/json, */*;q=0.5', 'accept-language': 'de,en;q=0.8', ...headers };
  // Manche Captcha-Schranken (z. B. SiteGround) lassen nur die schlichte Anfrage durch.
  const args = ['-sSL', '--fail', ...(simple ? [] : ['--compressed']), '-m', String(Math.ceil(timeout / 1000)), '-A', UA, '-D', '-', ...Object.entries(h).flatMap(([k, v]) => ['-H', `${k}: ${v}`]), url];
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const { stdout } = await execFileP('curl', args, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
      // -D - liefert Kopfzeilen (ggf. mehrere Blöcke bei Weiterleitungen) vor dem Rumpf
      let pos = 0, hdr = '';
      while (stdout.slice(pos, pos + 5).toString('latin1') === 'HTTP/') {
        const end = stdout.indexOf('\r\n\r\n', pos);
        if (end < 0) break;
        hdr = stdout.slice(pos, end).toString('latin1'); pos = end + 4;
      }
      const buf = stdout.slice(pos);
      const head = buf.slice(0, 300).toString('latin1');
      const enc = hdr.match(/content-type:[^\r\n]*charset=([\w-]+)/i)?.[1] || head.match(/encoding=["']([\w-]+)["']/i)?.[1] || 'utf-8';
      try { return new TextDecoder(enc).decode(buf); } catch { return buf.toString('utf8'); }
    } catch (e) {
      lastErr = new Error(/exit code 22|returned error: (\d+)/.test(e.message) ? `HTTP ${e.message.match(/error: (\d+)/)?.[1] || 'Fehler'}` : String(e.message).split('\n')[0]);
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

// ---------- Parser ----------
const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
function pickImage(block, base) {
  for (const m of block.matchAll(/<media:(?:content|thumbnail)\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (!a.url) continue;
    if (/video|audio/.test(a.type || '') || a.medium === 'video') continue;
    if ((a.type || '').startsWith('image') || a.medium === 'image' || IMG_EXT.test(a.url) || m[0].toLowerCase().startsWith('<media:thumbnail')) return abs(a.url, base);
  }
  for (const m of block.matchAll(/<enclosure\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.url && ((a.type || '').startsWith('image') || IMG_EXT.test(a.url))) return abs(a.url, base);
  }
  const im = decode(stripCdata(block)).match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (im && !/^data:/.test(im[1]) && !/pixel|tracking|1x1|spacer/i.test(im[1])) return abs(im[1], base);
  return '';
}
function abs(u, base) { try { return new URL(u, base).toString(); } catch { return ''; } }

function parseFeed(xml, base) {
  const out = [];
  for (const m of xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const b = m[2];
    let link = text(tag(b, 'link'));
    if (!link) {
      const links = [...b.matchAll(/<link\b[^>]*>/gi)].map((x) => attrs(x[0]));
      link = (links.find((a) => a.rel === 'alternate') || links.find((a) => a.href) || {}).href || '';
    }
    if (!link) link = text(tag(b, 'guid'));
    const title = text(tag(b, 'title'));
    const teaser = text(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content')).slice(0, 320);
    const d = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const date = d ? new Date(d.trim()) : null;
    out.push({
      title, teaser, url: abs(link, base), date: date && !isNaN(date) ? date : null,
      image: pickImage(b, base), categories: [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((c) => text(c[1])).filter(Boolean),
      premium: /<bild:premium>\s*true\s*</i.test(b),
    });
  }
  return out;
}

async function loadSource(s) {
  const raw = await http(s.feed);
  if (s.kind === 'wp-json') {
    return JSON.parse(raw).map((p) => ({
      title: text(p.title?.rendered), teaser: text(p.excerpt?.rendered).slice(0, 320), url: p.link,
      date: p.date_gmt ? new Date(p.date_gmt + 'Z') : null, image: p.yoast_head_json?.og_image?.[0]?.url || '', categories: [],
    })).filter((i) => !s.linkContains || i.url.includes(s.linkContains));
  }
  if (s.kind === 'icsid') {
    return [...raw.matchAll(/<time datetime="([^"]+)"[^>]*>[\s\S]*?<h3><a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
      .map((m) => ({ title: text(m[3]), teaser: '', url: abs(m[2], s.feed), date: new Date(m[1]), image: '', categories: [] }));
  }
  if (s.kind === 'br24') {
    for (const b of raw.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let d; try { d = JSON.parse(b[1]); } catch { continue; }
      if (d['@type'] === 'CollectionPage') {
        return (d.mainEntity?.itemListElement || []).filter((i) => i.url && /,[A-Za-z0-9]{6,}$/.test(i.url))
          .map((i) => ({ title: text(i.name), teaser: '', url: i.url, date: null, image: '', categories: [] }));
      }
    }
    return [];
  }
  let items = parseFeed(raw, s.feed);
  if (!items.length) items = parseFeed(await http(s.feed, { simple: true }), s.feed);
  return items;
}

// ---------- Stichwortfilter ----------
function termRe(t) {
  const body = esc(t).replace(/\s+/g, '\\s+');
  const acronym = t.length <= 4 && t === t.toUpperCase() && /\p{L}/u.test(t);
  const tail = t.length >= 7 ? '' : '(?![\\p{L}\\p{N}])';
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${tail}`, acronym ? 'u' : 'iu');
}
const compile = (list) => (list || []).map((t) => (Array.isArray(t) ? t : [t]).map(termRe));
const matches = (compiled, hay) => compiled.some((all) => all.every((re) => re.test(hay)));

// ---------- Seitenanreicherung (og:image / Datum) ----------
async function enrich(item) {
  try {
    const html = await http(item.url, { timeout: 9000 });
    const head = html.slice(0, 250000);
    if (!item.image) {
      const m = head.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i) || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
      if (m) item.image = abs(decode(m[1]), item.url);
    }
    if (!item.date) {
      const m = head.match(/article:published_time["'][^>]*content=["']([^"']+)/i) || head.match(/"datePublished"\s*:\s*"([^"]+)"/);
      const d = m && new Date(m[1]);
      if (d && !isNaN(d)) item.date = d;
    }
  } catch { /* Bild bleibt leer */ }
}

async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => { for (let it; (it = queue.shift());) await fn(it); }));
}

// ---------- Push ----------
async function sendPush(items, cfg, appCfg) {
  const base = process.env.PUSH_WORKER_URL, secret = process.env.PUSH_SECRET;
  if (!base || !secret) return { skipped: true };
  let payload;
  if (items.length === 1) {
    payload = { title: items[0].source, body: items[0].title, url: items[0].url, tag: items[0].id };
  } else {
    const lines = items.slice(0, cfg.maxLinesInBody || 3).map((i) => `${i.source}: ${i.title}`);
    if (items.length > lines.length) lines.push(`… und ${items.length - lines.length} weitere`);
    payload = { title: `${items.length} neue Nachrichten`, body: lines.join('\n'), url: appCfg.pwaUrl || '/', tag: 'sammel' };
  }
  const r = await fetch(base.replace(/\/$/, '') + '/notify', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`Worker antwortet ${r.status}`);
  return r.json();
}

// ---------- Hauptlauf ----------
async function main() {
  const cfg = await readJson(P('config/sources.json'), { sources: [] });
  const kw = await readJson(P('config/keywords.json'), {});
  const pushCfg = await readJson(P('config/push.json'), { mode: 'all' });
  const appCfg = await readJson(P('config/app.json'), {});
  const prev = await readJson(P('data/feed.json'), null);
  const pushed = new Set((await readJson(P('data/pushed.json'), { ids: [] })).ids);
  const firstRun = !prev;
  const topicKw = Object.fromEntries(['iwr', 'ukraine', 'sabotage'].map((t) => [t, compile(kw[t])]));
  const breakingKw = compile(kw.breakingKeywords);
  const now = Date.now();

  const byId = new Map((prev?.items || []).map((i) => [i.id, i]));
  const prevIds = new Set(byId.keys());
  const status = {};
  const fresh = [];

  await pool(cfg.sources.filter((s) => s.enabled !== false && s.feed), 6, async (s) => {
    try {
      const list = await loadSource(s);
      if (!list.length) throw new Error('keine Einträge gelesen');
      const brk = new RegExp(s.breakingPattern || cfg.defaults?.breakingPattern || '$^', 'i');
      let kept = 0;
      for (const r of list) {
        if (!r.title || !r.url || r.premium && s.dropPremium) continue;
        const hay = `${r.title} ${r.teaser}`;
        const topics = s.topics.filter((t) => s.filter === 'all' || matches(topicKw[t] || [], hay));
        if (!topics.length) continue;
        if (r.date && now - r.date.getTime() > MAX_AGE_MS) continue;
        const url = canonicalUrl(r.url);
        fresh.push({
          id: sha(url), title: r.title, teaser: r.teaser, url, source: s.name, sourceId: s.id, domain: new URL(s.url).hostname,
          type: s.type, topics, image: r.image || '', date: r.date, breaking: brk.test(r.title) || r.categories.some((c) => brk.test(c)),
        });
        kept++;
      }
      status[s.id] = { ok: true, items: list.length, kept };
      console.log(`${s.id}: ${list.length} gelesen, ${kept} übernommen`);
    } catch (e) {
      status[s.id] = { ok: false, error: String(e.message || e).slice(0, 120), optional: !!s.optional };
      console.error(`[${s.id}] ${e.message || e}`);
    }
  });

  // Zusammenführen
  const seenTitle = new Map([...byId.values()].map((i) => [normTitle(i.title), i.id]));
  const added = [];
  for (const f of fresh) {
    const ex = byId.get(f.id);
    if (ex) { ex.topics = [...new Set([...ex.topics, ...f.topics])]; if (!ex.image && f.image) ex.image = f.image; continue; }
    const tk = normTitle(f.title);
    const dupId = tk.length > 14 ? seenTitle.get(tk) : null;
    if (dupId && byId.has(dupId)) { const d = byId.get(dupId); d.topics = [...new Set([...d.topics, ...f.topics])]; continue; }
    byId.set(f.id, f); seenTitle.set(tk, f.id); added.push(f);
  }

  await pool(added.filter((i) => !i.image || !i.date).slice(0, 60), 6, enrich);
  // Ohne Datum im Feed: Zeitpunkt der Erstentdeckung (beim allerersten Lauf: vor 5 Tagen, damit Altbestand nicht oben steht)
  for (const i of added) i.date = (i.date || new Date(firstRun ? now - 5 * 86400000 : now)).toISOString();
  for (const i of byId.values()) if (i.date instanceof Date) i.date = i.date.toISOString();

  const items = [...byId.values()]
    .filter((i) => now - Date.parse(i.date) <= MAX_AGE_MS)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, MAX_ITEMS);

  // Push-Kandidaten
  let candidates = added.filter((i) => !pushed.has(i.id) && now - Date.parse(i.date) <= (pushCfg.maxAgeHours || 6) * 3600 * 1000 && items.includes(i));
  if (pushCfg.mode === 'breaking') candidates = candidates.filter((i) => i.breaking && (!breakingKw.length || matches(breakingKw, `${i.title} ${i.teaser}`)));
  candidates.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  let toMark = added.map((i) => i.id);
  if (!firstRun && candidates.length) {
    try {
      const res = await sendPush(candidates, pushCfg, appCfg);
      if (res.skipped) { toMark = []; console.log('Push übersprungen (PUSH_WORKER_URL/PUSH_SECRET fehlen).'); }
      else console.log(`Push gesendet: ${candidates.length} Meldung(en)`, JSON.stringify(res));
    } catch (e) {
      console.error('Push fehlgeschlagen:', e.message);
      toMark = toMark.filter((id) => !candidates.some((c) => c.id === id));
    }
  }

  // Schreiben (nur bei Änderung)
  const body = JSON.stringify({ items });
  const oldBody = JSON.stringify({ items: prev?.items || [] });
  await mkdir(P('data'), { recursive: true });
  if (body !== oldBody) await writeFile(P('data/feed.json'), JSON.stringify({ generated: new Date().toISOString(), items }) + '\n');
  const oldStatus = await readJson(P('data/status.json'), null);
  const slim = Object.fromEntries(Object.entries(status).map(([k, v]) => [k, v.ok ? { ok: true } : { ok: false, error: v.error, optional: v.optional }]));
  if (JSON.stringify(oldStatus) !== JSON.stringify(slim)) await writeFile(P('data/status.json'), JSON.stringify(slim, null, 1) + '\n');
  if (toMark.length || !(await readJson(P('data/pushed.json'), null))) {
    const ids = [...toMark, ...pushed].slice(0, 3000);
    await writeFile(P('data/pushed.json'), JSON.stringify({ ids }) + '\n');
  }
  console.log(`Quellen ok: ${Object.values(status).filter((s) => s.ok).length}/${Object.keys(status).length}, neu: ${added.length}, gesamt: ${items.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
