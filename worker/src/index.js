// Push-Worker: speichert Push-Abos (KV) und versendet Meldungen, die der Feed-Sammler per POST /notify liefert.
import { sendWebPush } from './webpush.js';

const MAX_SUBS = 10;

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extra } });

async function subKey(endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return 'sub:' + [...h].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function equalSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export default {
  async fetch(req, env) {
    const cors = {
      'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      vary: 'origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const { pathname } = new URL(req.url);
    try {
      if (req.method === 'GET' && pathname === '/key') return new Response(env.VAPID_PUBLIC, { headers: { ...cors, 'content-type': 'text/plain' } });

      if (req.method === 'POST' && pathname === '/subscribe') {
        const sub = await req.json();
        if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: 'ungültiges Abo' }, 400, cors);
        const key = await subKey(sub.endpoint);
        if (!(await env.SUBS.get(key))) {
          const { keys } = await env.SUBS.list({ prefix: 'sub:', limit: MAX_SUBS + 1 });
          if (keys.length >= MAX_SUBS) return json({ error: 'zu viele Abos' }, 429, cors);
        }
        await env.SUBS.put(key, JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }));
        return json({ ok: true }, 200, cors);
      }

      if (req.method === 'POST' && pathname === '/unsubscribe') {
        const { endpoint } = await req.json();
        if (endpoint) await env.SUBS.delete(await subKey(endpoint));
        return json({ ok: true }, 200, cors);
      }

      if (req.method === 'POST' && pathname === '/notify') {
        const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
        if (!equalSecret(token, env.NOTIFY_SECRET)) return json({ error: 'nicht erlaubt' }, 401, cors);
        const msg = await req.json();
        const payload = { title: String(msg.title || 'News').slice(0, 120), body: String(msg.body || '').slice(0, 400), url: String(msg.url || ''), tag: msg.tag ? String(msg.tag) : undefined };
        const { keys } = await env.SUBS.list({ prefix: 'sub:' });
        let sent = 0, removed = 0, failed = 0;
        for (const k of keys) {
          const sub = JSON.parse(await env.SUBS.get(k.name));
          const r = await sendWebPush(sub, payload, { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE });
          if (r.ok) sent++;
          else if (r.status === 404 || r.status === 410) { await env.SUBS.delete(k.name); removed++; }
          else failed++;
        }
        return json({ sent, removed, failed }, 200, cors);
      }

      return json({ error: 'nicht gefunden' }, 404, cors);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500, cors);
    }
  },
};
