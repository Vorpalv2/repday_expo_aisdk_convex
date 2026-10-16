import fs from 'node:fs';

const filename = process.argv[2];
if (!filename) throw new Error('Usage: npm run billing:firebase -- /path/to/service-account.json');
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
let credential;
try { credential = JSON.parse(fs.readFileSync(filename, 'utf8')); }
catch { throw new Error('Could not read a valid JSON credential file.'); }
const project = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
if (!project || credential.type !== 'service_account' || credential.project_id !== project ||
    typeof credential.client_email !== 'string' || !credential.private_key?.includes('BEGIN PRIVATE KEY')) {
  throw new Error('Use a Firebase service-account credential for the configured Firebase project.');
}
const compact = JSON.stringify(credential);
// JSON strings escape newlines. Single quotes keep the PEM intact for dotenv.
if (compact.includes("'")) throw new Error('Credential contains an unsupported quote.');
fs.writeFileSync('.firebase-admin.local.json', compact + '\n', { mode: 0o600 });
fs.chmodSync('.firebase-admin.local.json', 0o600);
let env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const line = `FIREBASE_ADMIN_SERVICE_ACCOUNT='${compact}'`;
env = /^FIREBASE_ADMIN_SERVICE_ACCOUNT=.*$/m.test(env)
  ? env.replace(/^FIREBASE_ADMIN_SERVICE_ACCOUNT=.*$/m, () => line)
  : `${env.trimEnd()}\n${line}\n`;
fs.writeFileSync('.env.local', env, { mode: 0o600 });
fs.chmodSync('.env.local', 0o600);
console.log('Firebase server credential configured locally. No secret values are displayed.');
