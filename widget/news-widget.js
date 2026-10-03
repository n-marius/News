// Scriptable-Widget „News“ (mittlere Größe). Widget-Parameter (optional): iwr | ukraine | sabotage
const BASE = 'https://n-marius.github.io/News/';
const TOPICS = { iwr: 'Wirtschaftsrecht', ukraine: 'Ukraine', sabotage: 'Sabotage' };
const topic = (args.widgetParameter || '').trim().toLowerCase();

const bg = Color.dynamic(new Color('#ffffff'), new Color('#1e1f21'));
const fg = Color.dynamic(new Color('#202124'), new Color('#ffffff'));
const muted = Color.dynamic(new Color('#5f6368'), new Color('#9aa0a6'));
const ph = Color.dynamic(new Color('#e8eaed'), new Color('#35373b'));

async function loadFeed() {
  const r = new Request(`${BASE}data/feed.json?t=${Date.now()}`);
  r.timeoutInterval = 20;
  return (await r.loadJSON()).items || [];
}
async function loadImage(url) {
  if (!url) return null;
  try { const r = new Request(url); r.timeoutInterval = 10; return await r.loadImage(); } catch (e) { return null; }
}
function ago(iso) {
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(1, Math.round(m))}min`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

let items = [];
try { items = await loadFeed(); } catch (e) { /* offline */ }
if (topic && TOPICS[topic]) items = items.filter((i) => i.topics.includes(topic));
items = items.slice(0, 3);
const images = await Promise.all(items.map((i) => loadImage(i.image)));

const w = new ListWidget();
w.backgroundColor = bg;
w.setPadding(12, 14, 8, 14);
w.url = BASE;

const head = w.addStack();
head.centerAlignContent();
const label = head.addText(topic && TOPICS[topic] ? `NEWS · ${TOPICS[topic].toUpperCase()}` : 'AUSWAHL FÜR DICH');
label.font = Font.mediumSystemFont(11);
label.textColor = muted;
w.addSpacer(6);

if (!items.length) {
  const t = w.addText('Keine Meldungen geladen.');
  t.font = Font.systemFont(13);
  t.textColor = muted;
}
items.forEach((it, n) => {
  const row = w.addStack();
  row.centerAlignContent();
  row.url = it.url;
  const left = row.addStack();
  left.layoutVertically();
  const title = left.addText(it.title);
  title.font = Font.semiboldSystemFont(13);
  title.textColor = fg;
  title.lineLimit = 3;
  left.addSpacer(1);
  const meta = left.addText(`${it.source} · ${ago(it.date)}`);
  meta.font = Font.systemFont(10);
  meta.textColor = muted;
  meta.lineLimit = 1;
  row.addSpacer();
  const box = row.addStack();
  box.size = new Size(40, 40);
  box.cornerRadius = 8;
  box.backgroundColor = ph;
  if (images[n]) { const img = box.addImage(images[n]); img.imageSize = new Size(40, 40); img.applyFillingContentMode(); }
  if (n < items.length - 1) w.addSpacer(5);
});
w.addSpacer();
const foot = w.addText('Mehr Nachrichten für dich');
foot.font = Font.systemFont(10);
foot.textColor = muted;
foot.centerAlignText();

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
