// Selbsttest der Verschlüsselung gegen den Testvektor aus RFC 8291, Anhang A. Aufruf: node worker/test-webpush.mjs
import { encryptPayload, vapidAuthorization, b64uDecode, b64uEncode } from './src/webpush.js';
import assert from 'node:assert/strict';

const asPrivate = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const asPublic = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const pub = b64uDecode(asPublic);
const jwk = { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: asPrivate };
const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
const publicKey = await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
const sub = { keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } };
const out = await encryptPayload(sub, 'When I grow up, I want to be a watermelon', { asKeys: { privateKey, publicKey }, salt: b64uDecode('DGv6ra1nlYgDCS1FRnbzlw') });
const expected = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
assert.equal(b64uEncode(out), expected);
console.log('Verschlüsselung: Testvektor RFC 8291 stimmt.');

// VAPID: Signatur prüfen
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vpub = b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
const vd = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;
const h = await vapidAuthorization('https://web.push.apple.com/abc', 'https://example.org/', vpub, vd);
const [, t, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
assert.equal(k, vpub);
const [hd, cl, sg] = t.split('.');
const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64uDecode(sg), new TextEncoder().encode(`${hd}.${cl}`));
assert.ok(ok);
assert.equal(JSON.parse(Buffer.from(cl, 'base64url')).aud, 'https://web.push.apple.com');
console.log('VAPID: Signatur und Zielangabe stimmen.');
