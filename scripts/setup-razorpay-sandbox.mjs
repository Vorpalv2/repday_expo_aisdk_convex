import fs from 'node:fs';
import crypto from 'node:crypto';
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const id = process.env.RAZORPAY_KEY_ID;
const secret = process.env.RAZORPAY_KEY_SECRET;
if (!id?.startsWith('rzp_test_') || !secret) throw new Error('Configure Razorpay Test Mode keys in .env.local. Live keys are refused.');
const request = async (path, body) => {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Razorpay sandbox request failed (${response.status}). Check Test Mode credentials and Subscriptions access.`);
  return response.json();
};
function save(name, value) {
  let text = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  text = pattern.test(text) ? text.replace(pattern, `${name}=${value}`) : `${text.trimEnd()}\n${name}=${value}\n`;
  fs.writeFileSync('.env.local', text, { mode: 0o600 });
}
let plan = process.env.RAZORPAY_PLAN_ID ? await request(`plans/${process.env.RAZORPAY_PLAN_ID}`) : await request('plans', { period: 'monthly', interval: 1, item: { name: 'Repday Plus — sandbox', amount: 100, currency: 'INR', description: 'Test only: AI Coach, Form Inspection, and more than six workout splits.' } });
if (plan.period !== 'monthly' || plan.interval !== 1 || plan.item?.amount !== 100 || plan.item?.currency !== 'INR') throw new Error('The configured sandbox plan must be INR 1 per month.');
save('RAZORPAY_PLAN_ID', plan.id);
if (!process.env.RAZORPAY_WEBHOOK_SECRET) save('RAZORPAY_WEBHOOK_SECRET', crypto.randomBytes(32).toString('base64url'));
save('RAZORPAY_MODE', 'test');
console.log('Sandbox plan ready:', plan.id, '— INR 1/month, simulated payments only.');
console.log('Webhook secret is saved in .env.local; its value is not displayed.');
