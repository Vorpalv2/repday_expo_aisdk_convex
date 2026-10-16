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

test('automatic rest fills missed dates, skipping workouts and manual choices', async () => {
  const { fillAutomaticRestDays } = await import('../lib/restDays');
  const original = { '2026-10-12': true, '2026-10-13': false };
  const result = fillAutomaticRestDays({today:'2026-10-16',nextDate:'2026-10-10',restDays:original,completedDates:new Set(['2026-10-11']),activeDate:null});
  assert.deepEqual(result.restDays, {'2026-10-10':'auto','2026-10-12':true,'2026-10-13':false,'2026-10-14':'auto','2026-10-15':'auto'});
  assert.equal(result.nextDate,'2026-10-16');
  assert.deepEqual(original, {'2026-10-12':true,'2026-10-13':false});
  assert.equal(isRestDay(new Date('2026-10-15T08:00:00Z'),'Asia/Kolkata',{},result.restDays),true);
});

test('unfinished workout blocks processing until completed or discarded', async () => {
  const { fillAutomaticRestDays } = await import('../lib/restDays');
  const args={today:'2026-10-16',nextDate:'2026-10-14',restDays:{},completedDates:new Set<string>(),activeDate:'2026-10-14'};
  const protectedResult=fillAutomaticRestDays(args);
  assert.deepEqual(protectedResult,{restDays:{},nextDate:'2026-10-14'});
  const finished=fillAutomaticRestDays({...args,activeDate:null,completedDates:new Set(['2026-10-14'])});
  assert.deepEqual(finished.restDays,{'2026-10-15':'auto'});
  const discarded=fillAutomaticRestDays({...args,activeDate:null});
  assert.deepEqual(discarded.restDays,{'2026-10-14':'auto','2026-10-15':'auto'});
});

test('first use starts today, midnight advances and repeated checks do nothing', async () => {
  const { fillAutomaticRestDays } = await import('../lib/restDays');
  const first=fillAutomaticRestDays({today:'2026-11-01',nextDate:null,restDays:{},completedDates:new Set<string>(),activeDate:null});
  assert.deepEqual(first,{restDays:{},nextDate:'2026-11-01'});
  const same=fillAutomaticRestDays({...first,today:'2026-11-01',completedDates:new Set<string>(),activeDate:null});
  assert.equal(same.restDays,first.restDays);
  const next=fillAutomaticRestDays({...first,today:'2026-11-02',completedDates:new Set<string>(),activeDate:null});
  assert.deepEqual(next.restDays,{'2026-11-01':'auto'});
});


test('repair only automatic entries before tracking and clamp an old cursor',async()=>{
  const { fillAutomaticRestDays } = await import('../lib/restDays');
  const result=fillAutomaticRestDays({today:'2026-10-16',nextDate:'2026-10-12',trackingStartDate:'2026-10-16',restDays:{'2026-10-13':true,'2026-10-14':false,'2026-10-15':'auto'},completedDates:new Set<string>(),activeDate:null});
  assert.deepEqual(result,{restDays:{'2026-10-13':true,'2026-10-14':false,'2026-10-15':false},nextDate:'2026-10-16'});
  assert.equal(isRestDay(new Date('2026-10-15T08:00:00Z'),'Asia/Kolkata',{3:'push'},result.restDays),false);
  const next=fillAutomaticRestDays({...result,today:'2026-10-17',trackingStartDate:'2026-10-16',completedDates:new Set<string>(),activeDate:null});
  assert.equal(next.restDays['2026-10-16'],'auto');
});
