// Web Push (RFC 8030, VAPID RFC 8292, Nachrichtenverschlüsselung RFC 8291 / aes128gcm) mit WebCrypto.
const enc = new TextEncoder();

export const b64uEncode = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const b64uDecode = (str) => {
  const s = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const concat = (...a) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// Verschlüsselt eine Nutzlast für ein Push-Abo. `opts` (Schlüsselpaar, Salt) dient nur Tests mit festen Werten.
export async function encryptPayload(subscription, payload, opts = {}) {
  const uaPublic = b64uDecode(subscription.keys.p256dh);
  const authSecret = b64uDecode(subscription.keys.auth);
  const data = typeof payload === 'string' ? enc.encode(payload) : payload;

  const asKeys = opts.asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const record = concat(data, new Uint8Array([2])); // 0x02 = letzter Datensatz
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

// VAPID-Kopfzeile: Schlüssel = öffentlicher Schlüssel (65 Byte, Base64url) + privater Wert d (32 Byte, Base64url)
export async function vapidAuthorization(endpoint, subject, publicKeyB64u, privateKeyB64u) {
  const pub = b64uDecode(publicKeyB64u);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: privateKeyB64u };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64uEncode(sig)}, k=${publicKeyB64u}`;
}

export async function sendWebPush(subscription, payload, { subject, publicKey, privateKey, ttl = 3600, urgency = 'normal' }) {
  const body = await encryptPayload(subscription, JSON.stringify(payload));
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorization(subscription.endpoint, subject, publicKey, privateKey),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(ttl),
      urgency,
    },
    body,
  });
}
