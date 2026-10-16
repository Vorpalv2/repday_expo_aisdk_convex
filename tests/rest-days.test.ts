import assert from 'node:assert/strict';
import test from 'node:test';
import { isRestDay, restDayKey } from '../lib/restDays';

test('rest override applies to one date and preserves the recurring split', () => {
  const plan = {4: 'pull-b', 6: null};
  const today = new Date('2026-10-16T08:00:00Z');
  const overrides = { '2026-10-16': true };
  assert.equal(isRestDay(today, 'Asia/Kolkata', plan, overrides), true);
  assert.equal(isRestDay(new Date('2026-10-23T08:00:00Z'), 'Asia/Kolkata', plan, overrides), false);
  assert.equal(isRestDay(today, 'Asia/Kolkata', plan, { '2026-10-16': false }), false);
  assert.equal(isRestDay(new Date('2026-10-18T08:00:00Z'), 'Asia/Kolkata', plan, {}), true);
  assert.deepEqual(plan, {4: 'pull-b', 6: null});
});

test('date boundaries use the account time zone', () => {
  const instant = new Date('2026-10-15T20:00:00Z');
  assert.equal(restDayKey(instant, 'Asia/Kolkata'), '2026-10-16');
  assert.equal(restDayKey(instant, 'America/New_York'), '2026-10-15');
  assert.equal(isRestDay(instant, 'Asia/Kolkata', {4: null}, {}), true);
});
