import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PLAN_CATALOG, DEFAULT_WEEKDAYS, FOCUS_LABELS, defaultPlanPreferences, generateTrainingPlan, planPreferencesSchema } from '../lib/trainingPlan';

test('all schedules, equipment and focus choices produce complete editable weeks',()=>{
  for(const days of [2,3,4,5,6])for(const equipment of ['gym','db','home'] as const)for(const focus of Object.keys(FOCUS_LABELS) as (keyof typeof FOCUS_LABELS)[])for(const minutes of [30,45,60] as const){
    const plan=generateTrainingPlan({...defaultPlanPreferences(),daysPerWeek:days,weekdays:DEFAULT_WEEKDAYS[days],equipment,focus,minutes});
    assert.equal(plan.sessions.length,days);
    assert.equal(Object.values(plan.weeklyPlan).filter(Boolean).length,days);
    assert.equal(Object.values(plan.weeklyPlan).filter(id=>id===null).length,7-days);
    for(const session of plan.sessions){
      assert.ok(session.moves.length>=4&&session.moves.length<=7);
      assert.equal(new Set(session.moves.map(m=>m.name)).size,session.moves.length);
      for(const move of session.moves){
        assert.ok(move.instruction_steps?.en?.length||move.instructions?.en);
        assert.ok(move.image&&move.gif_url);
        assert.ok(move.sets.every(set=>set.weight==='0'&&!set.done));
        if(equipment==='home')assert.ok(['body weight','band','resistance band'].includes(move.equipment!));
        if(equipment==='db')assert.ok(['body weight','dumbbell'].includes(move.equipment!));
      }
    }
  }
});

test('generated copies are independent of the shared catalog and each other',()=>{
  const before=JSON.stringify(DEFAULT_PLAN_CATALOG);
  const first=generateTrainingPlan(defaultPlanPreferences());
  const second=generateTrainingPlan(defaultPlanPreferences());
  first.sessions[0].moves[0].sets[0].weight='20';
  first.sessions[0].moves[0].instructions!.en='My own cues';
  assert.equal(JSON.stringify(DEFAULT_PLAN_CATALOG),before);
  assert.equal(second.sessions[0].moves[0].sets[0].weight,'0');
  assert.notEqual(first.sessions[0].id,second.sessions[0].id);
});

test('goals, experience, focus and chosen rest time change starting targets',()=>{
  const plan=generateTrainingPlan({...defaultPlanPreferences('strength'),experience:'experienced',focus:'chest'},DEFAULT_PLAN_CATALOG,'qa-plan',120);
  const move=plan.sessions[0].moves[0];
  assert.equal(move.sets.length,4);
  assert.equal(move.sets[0].reps,'8');
  assert.equal(move.restSeconds,'120');
  assert.ok(move.name.includes('chest'));
});

test('invalid, duplicate or mismatched weekdays are rejected',()=>{
  for(const weekdays of [[0,0,2],[0,1],[0,1,7]])assert.equal(planPreferencesSchema.safeParse({...defaultPlanPreferences(),weekdays}).success,false);
});

test('invalid published catalogs are rejected before selection',async()=>{
  const {planCatalogSchema}=await import('../lib/trainingPlan');
  const broken=JSON.parse(JSON.stringify(DEFAULT_PLAN_CATALOG));
  delete broken.exercises['squat-gym'];
  assert.equal(planCatalogSchema.safeParse(broken).success,false);
  broken.exercises=DEFAULT_PLAN_CATALOG.exercises;
  broken.templates[0].sessions.pop();
  assert.equal(planCatalogSchema.safeParse(broken).success,false);
});
