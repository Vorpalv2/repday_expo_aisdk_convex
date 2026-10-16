import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../lib/server/billingCache.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test('paid entitlement is cached, invalidated on billing changes, and never cached past expiry', async () => {
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const entries = new Map<string, { value: unknown; expiresAt: number }>();
  const account = { paidUntil: now + 60_000, manualPlusAccess: false };
  let reads = 0;
  class Redis {
    async get(key: string) { const entry = entries.get(key); return entry && entry.expiresAt > now ? entry.value : null; }
    async set(key: string, value: unknown, options: { ex: number }) { entries.set(key, { value, expiresAt: now + options.ex * 1000 }); }
    async del(key: string) { entries.delete(key); }
  }
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => name === '@upstash/redis' ? { Redis } : { readDocument: async () => { reads++; return { ...account }; } }, process: { env: { UPSTASH_REDIS_REST_URL: 'https://example.invalid', UPSTASH_REDIS_REST_TOKEN: 'test' } }, Date: Clock, Object });
  assert.equal((await exports.readBillingAccount('owner')).paidUntil, account.paidUntil);
  assert.equal((await exports.readBillingAccount('owner')).paidUntil, account.paidUntil);
  assert.equal(reads, 1);
  account.paidUntil = now + 120_000;
  await exports.invalidateBillingAccount('owner');
  assert.equal((await exports.readBillingAccount('owner')).paidUntil, account.paidUntil);
  assert.equal(reads, 2);
  assert.equal(exports.billingCacheSeconds(account, now), 120);
  now += 121_000;
  await exports.readBillingAccount('owner');
  assert.equal(reads, 3);
});
