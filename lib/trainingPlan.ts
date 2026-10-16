import { z } from 'zod';
import bundledCatalog from '../data/plans/catalog.json';
import type { Session, TrainingGoal } from '../backend/contracts';

export const planPreferencesSchema = z.object({
  experience: z.enum(['new', 'starting', 'experienced']),
  daysPerWeek: z.number().int().min(2).max(6),
  weekdays: z.array(z.number().int().min(0).max(6)).min(2).max(6),
  minutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  equipment: z.enum(['gym', 'db', 'home']),
  focus: z.enum(['balanced', 'upperbody', 'chest', 'shoulders', 'back', 'legs', 'core']),
  goal: z.enum(['strength', 'muscle', 'fitness', 'endurance']),
}).refine(p => new Set(p.weekdays).size === p.daysPerWeek && p.weekdays.length === p.daysPerWeek, 'Choose exactly the number of training days selected.');
export type PlanPreferences = z.infer<typeof planPreferencesSchema>;
export const planDraftPreferencesSchema = z.object({...planPreferencesSchema.shape,weekdays:z.array(z.number().int().min(0).max(6)).max(6)});
const exerciseSchema = z.object({id:z.string(),name:z.string(),target:z.string(),equipment:z.string(),image:z.string().optional(),gif_url:z.string().optional(),instructions:z.record(z.string(),z.string()).optional(),instruction_steps:z.record(z.string(),z.array(z.string())).optional()});
export const planCatalogSchema = z.object({version:z.literal(1),published:z.literal(true),exercises:z.record(z.string(),exerciseSchema),templates:z.array(z.object({id:z.string(),name:z.string(),daysPerWeek:z.number().int().min(2).max(6),tags:z.array(z.string()),sessions:z.array(z.object({name:z.string(),slots:z.array(z.string()).min(4).max(8)}))})).min(5)}).superRefine((catalog,context)=>{
  const counts=new Set(catalog.templates.map(template=>template.daysPerWeek));
  if([2,3,4,5,6].some(count=>!counts.has(count)))context.addIssue({code:'custom',message:'Missing weekly schedule.'});
  for(const template of catalog.templates){
    if(template.sessions.length!==template.daysPerWeek)context.addIssue({code:'custom',message:'Template session count does not match its frequency.'});
    for(const session of template.sessions)for(const equipment of ['gym','db','home']){
      const moves=session.slots.map(slot=>catalog.exercises[`${slot}-${equipment}`]);
      if(moves.some(move=>!move)||new Set(moves.filter(Boolean).map(move=>move.id)).size<4)context.addIssue({code:'custom',message:'Template has missing or insufficient unique exercises.'});
    }
  }
});
export type PlanCatalog = z.infer<typeof planCatalogSchema>;
export const DEFAULT_PLAN_CATALOG: PlanCatalog = planCatalogSchema.parse(bundledCatalog);
export const WEEKDAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const FOCUS_LABELS = {balanced:'Balanced training',upperbody:'Upper body',chest:'Chest',shoulders:'Shoulders',back:'Back',legs:'Legs',core:'Core'};
export const DEFAULT_WEEKDAYS: Record<number, number[]> = {2:[0,3],3:[0,2,4],4:[0,1,3,4],5:[0,1,3,4,5],6:[0,1,2,3,4,5]};
export const defaultPlanPreferences = (goal:TrainingGoal='fitness'):PlanPreferences => ({experience:'new',daysPerWeek:3,weekdays:[0,2,4],minutes:45,equipment:'gym',focus:'balanced',goal});
export type GeneratedPlan = {id:string;templateId:string;templateVersion:number;title:string;preferences:PlanPreferences;sessions:Session[];weeklyPlan:Record<number,string|null>};
const focusSlots: Record<PlanPreferences['focus'], string[]> = {balanced:[],upperbody:['chest','row','shoulder','pull'],chest:['chest','chestExtra'],shoulders:['shoulder','shoulderExtra'],back:['row','pull'],legs:['squat','hinge','legs'],core:['core']};

export function generateTrainingPlan(input: PlanPreferences, catalog:PlanCatalog=DEFAULT_PLAN_CATALOG, id=`guided-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`, restSeconds=90): GeneratedPlan {
  const preferences = planPreferencesSchema.parse(input);
  const template = catalog.templates.find(t => t.daysPerWeek === preferences.daysPerWeek && t.tags.includes(preferences.focus));
  if (!template || template.sessions.length !== preferences.daysPerWeek) throw new Error('A matching plan is unavailable. Try a different schedule.');
  const suffix = preferences.equipment;
  const limit = preferences.minutes===30?5:preferences.minutes===45?6:7;
  const sets = preferences.experience==='experienced' && preferences.minutes!==30?3:2;
  const reps = preferences.goal==='strength'?'8':preferences.goal==='endurance'?'15':'10';
  const emphasis = focusSlots[preferences.focus];
  const sessions = template.sessions.map((session,index):Session => {
    // Deduplicate by movement ID: some limited-equipment substitutions coincide.
    const seen = new Set<string>();
    const selected = session.slots.filter(slot => {const e=catalog.exercises[`${slot}-${suffix}`];if(!e)throw new Error(`Missing exercise for ${slot}.`);if(seen.has(e.id))return false;seen.add(e.id);return true;}).slice(0,limit);
    const focusIndex=selected.findIndex(slot=>emphasis.includes(slot));
    if(focusIndex>0){const [slot]=selected.splice(focusIndex,1);selected.unshift(slot);}
    return {id:`${id}-${index}`,name:session.name,description:`${FOCUS_LABELS[preferences.focus]} · ${preferences.minutes} min`,accent:'#3478f6',moves:selected.map((slot,moveIndex)=>{
      const exercise=catalog.exercises[`${slot}-${suffix}`];
      const extra=preferences.focus!=='balanced'&&moveIndex===0&&emphasis.includes(slot)?1:0;
      return {key:`${id}-${index}-${exercise.id}`,name:exercise.name,restSeconds:String(restSeconds),target:exercise.target,equipment:exercise.equipment,...(exercise.image?{image:exercise.image}:{}),...(exercise.gif_url?{gif_url:exercise.gif_url}:{}),...(exercise.instructions?{instructions:{...exercise.instructions}}:{}),...(exercise.instruction_steps?{instruction_steps:Object.fromEntries(Object.entries(exercise.instruction_steps).map(([language,steps])=>[language,[...steps]]))}:{}),sets:Array.from({length:sets+extra},()=>({weight:'0',reps,done:false}))};
    })};
  });
  const weeklyPlan:Record<number,string|null>=Object.fromEntries(Array.from({length:7},(_,index)=>[index,null]));
  [...preferences.weekdays].sort((a,b)=>a-b).forEach((day,index)=>{weeklyPlan[day]=sessions[index].id;});
  return {id,templateId:template.id,templateVersion:catalog.version,title:template.name,preferences,sessions,weeklyPlan};
}
