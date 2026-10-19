import assert from 'node:assert/strict';
import test from 'node:test';
import { activityWeek } from '../lib/activityWeek';
import { restDayKey } from '../lib/restDays';

test('activity navigation moves one week at a time into history and never into the future', () => {
  const now = Date.parse('2026-10-19T02:00:00Z');
  const current = activityWeek(now, 'Asia/Kolkata', 0);
  const previous = activityWeek(now, 'Asia/Kolkata', -1);
  assert.equal(current.startKey, '2026-10-19');
  assert.equal(previous.startKey, '2026-10-12');
  assert.equal(previous.end, current.start);
  assert.equal(current.days[6].key, '2026-10-25');
  const twoWeeksAgo = activityWeek(now, 'Asia/Kolkata', -2);
  assert.equal(twoWeeksAgo.startKey, '2026-10-05');
  assert.equal(twoWeeksAgo.end, previous.start);
  assert.equal(activityWeek(now, 'Asia/Kolkata', -3).end, twoWeeksAgo.start);
  assert.equal(activityWeek(now, 'Asia/Kolkata', 1).startKey, current.startKey);
});

test('account time zone determines the current week, including a different day from the device', () => {
  const now = Date.parse('2026-10-18T20:00:00Z');
  assert.equal(activityWeek(now, 'Asia/Kolkata', 0).startKey, '2026-10-19');
  assert.equal(activityWeek(now, 'America/New_York', 0).startKey, '2026-10-12');
});

test('previous week crosses month/year and daylight-saving boundaries without missing or overlapping workouts', () => {
  const year = activityWeek(Date.parse('2027-01-04T12:00:00Z'), 'Asia/Kolkata', -1);
  assert.equal(year.startKey, '2026-12-28');
  assert.equal(year.days[6].key, '2027-01-03');
  const dst = activityWeek(Date.parse('2026-11-02T12:00:00Z'), 'America/New_York', -1);
  assert.equal((dst.end - dst.start) / 3600000, 169);
  assert.equal(restDayKey(dst.start - 1, 'America/New_York'), '2026-10-25');
  assert.equal(restDayKey(dst.end - 1, 'America/New_York'), '2026-11-01');
  assert.equal(restDayKey(dst.end, 'America/New_York'), '2026-11-02');
});
