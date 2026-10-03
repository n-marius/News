// Erzeugt ein VAPID-Schlüsselpaar. Aufruf: node worker/gen-vapid.mjs
import { webcrypto as crypto } from 'node:crypto';
const b64u = (b) => Buffer.from(b).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
console.log('VAPID_PUBLIC  =', pub);
console.log('VAPID_PRIVATE =', jwk.d);
console.log('\nNotiere beide Werte. Den privaten Wert niemals weitergeben oder ins Repo stellen.');
