import type {Session,WorkoutRecord,TrainingGoal,WeightUnit} from '../backend/contracts';

export type CoachMessage={id:string;role:'user'|'assistant';text:string};
export type CoachContext={title:string;text:string};
export type CoachConversation={id:string;title:string;preview:string;context:CoachContext;messages:CoachMessage[];createdAt:number;updatedAt:number;revision:number};
export const MAX_COACH_MESSAGES=40;
export const MAX_COACH_CONTEXT=4000;
export const coachId=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
const goals:Record<TrainingGoal,string>={strength:'Build strength',muscle:'Build muscle',fitness:'General fitness',endurance:'Improve endurance'};
export function buildCoachContext({selectedWorkout,focusPlan,history,goal,unit,timeZone,isRest,now=Date.now()}:{selectedWorkout?:WorkoutRecord|null;focusPlan?:Session|null;history:WorkoutRecord[];goal:TrainingGoal;unit:WeightUnit;timeZone:string;isRest:boolean;now?:number}):CoachContext{
 const date=(time:number)=>new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'short',day:'numeric'}).format(time);
 const lines=[`Training goal: ${goals[goal]}`,`Display units: ${unit}; recorded loads and volume below are in kilograms.`,`Local date: ${date(now)} (${timeZone})`];
 if(selectedWorkout){
  lines.push(`Selected completed workout: ${selectedWorkout.name}`,`Completed on: ${date(selectedWorkout.startedAt)}`,`Duration: ${Math.round(selectedWorkout.duration/60)} min; completed sets: ${selectedWorkout.sets}; volume: ${Math.round(selectedWorkout.volume)} kg`,`Recorded exercises:`);
  for(const move of selectedWorkout.session.moves)lines.push(`- ${move.name}: ${move.sets.map((set,index)=>`set ${index+1}: ${set.weight||'0'} kg × ${set.reps||'—'} reps (${set.done?'completed':'not completed'})`).join('; ')}`);
 }else{
  lines.push(`Today's workout: ${isRest?'Rest day':focusPlan?.name||'No split scheduled'}`);
  if(focusPlan&&!isRest){lines.push('Planned exercises:');for(const move of focusPlan.moves)lines.push(`- ${move.name}: ${move.sets.length} sets; ${move.sets.map(set=>`${set.weight||'0'} kg × ${set.reps||'—'} reps`).join('; ')}`);}
  const recent=[...history].sort((a,b)=>b.startedAt-a.startedAt).slice(0,5);
  lines.push(`Recent completed workouts available on this device (${recent.length}; not your full history):`);
  for(const record of recent)lines.push(`- ${date(record.startedAt)}: ${record.name}, ${record.sets} sets, ${Math.round(record.volume)} kg volume, ${Math.round(record.duration/60)} min`);
  if(!recent.length)lines.push('No completed workouts are loaded.');
 }
 const raw=lines.join('\n');const marker='\n[Context shortened to fit the request.]';
 return {title:selectedWorkout?selectedWorkout.name:isRest?'Rest day':focusPlan?.name||'Your current training',text:raw.length>MAX_COACH_CONTEXT?raw.slice(0,MAX_COACH_CONTEXT-marker.length)+marker:raw};
}
export function decodeCoachConversation(id:string,value:unknown,allowUnsynced=false):CoachConversation|null{
 if(!value||typeof value!=='object')return null;const data=value as Record<string,any>;
 if(data.version!==1||typeof data.title!=='string'||data.title.length>100||typeof data.preview!=='string'||data.preview.length>200||typeof data.contextTitle!=='string'||data.contextTitle.length>150||typeof data.contextText!=='string'||data.contextText.length>MAX_COACH_CONTEXT||typeof data.transcript!=='string'||data.transcript.length>200000||!Number.isSafeInteger(data.revision)||data.revision<(allowUnsynced?0:1)||!Number.isFinite(data.createdAt)||!Number.isFinite(data.updatedAt)||data.createdAt<=0||data.updatedAt<data.createdAt)return null;
 let messages:unknown;try{messages=JSON.parse(data.transcript);}catch{return null;}
 if(!Array.isArray(messages)||messages.length===0||messages.length%2!==0||messages.length>MAX_COACH_MESSAGES||messages.some((m,index)=>!m||typeof m.id!=='string'||m.id.length>100||m.role!==(index%2===0?'user':'assistant')||typeof m.text!=='string'||m.text.length>8000))return null;
 return {id,title:data.title,preview:data.preview,context:{title:data.contextTitle,text:data.contextText},messages,createdAt:data.createdAt,updatedAt:data.updatedAt,revision:data.revision};
}
export function encodeCoachConversation(value:CoachConversation){return {version:1,title:value.title.slice(0,100),preview:value.preview.slice(0,200),contextTitle:value.context.title.slice(0,150),contextText:value.context.text.slice(0,MAX_COACH_CONTEXT),transcript:JSON.stringify(value.messages.slice(-MAX_COACH_MESSAGES)),createdAt:value.createdAt,updatedAt:value.updatedAt,revision:value.revision};}

// A small, safe subset of Markdown; no HTML, URLs or executable markup.
export type CoachBlock={kind:'heading'|'bullet'|'paragraph';text:string;indent:number;marker?:string};
export function coachBlocks(text:string):CoachBlock[]{return text.split('\n').filter(line=>line.trim()).map(line=>{
 const heading=line.match(/^\s{0,3}#{1,4}\s+(.+)/);if(heading)return {kind:'heading',text:heading[1],indent:0};
 const bullet=line.match(/^(\s*)([-*•]|\d+[.)])\s+(.+)/);if(bullet)return {kind:'bullet',text:bullet[3],indent:Math.min(2,Math.floor(bullet[1].length/2)),marker:/\d/.test(bullet[2])?bullet[2]:'•'};
 if(/^\*\*[^*]+\*\*:?$/.test(line.trim()))return {kind:'heading',text:line.trim().replace(/^\*\*|\*\*:?$/g,''),indent:0};
 return {kind:'paragraph',text:line.trim(),indent:0};
});}
