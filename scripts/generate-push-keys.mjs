import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const file = new URL('../.env.local', import.meta.url);
const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
const hasPublic = /^WEB_PUSH_PUBLIC_KEY=.+/m.test(existing);
const hasPrivate = /^WEB_PUSH_PRIVATE_KEY=.+/m.test(existing);
if (hasPublic !== hasPrivate) throw new Error('Only one Web Push key exists in .env.local. Restore the matching pair before continuing.');
if (hasPublic && hasPrivate) {
  console.log('Web Push keys already exist in .env.local; kept the existing pair.');
} else {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
  const lines = { WEB_PUSH_PUBLIC_KEY: publicKey, WEB_PUSH_PRIVATE_KEY: jwk.d };
  let updated = existing;
  for (const [name, value] of Object.entries(lines)) {
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    updated = pattern.test(updated) ? updated.replace(pattern, `${name}=${value}`) : `${updated.trimEnd()}\n${name}=${value}\n`;
  }
  writeFileSync(file, updated, { mode: 0o600 });
  console.log('Generated a VAPID key pair in ignored .env.local. Keep the private key secret and reuse this pair across deployments.');
}
