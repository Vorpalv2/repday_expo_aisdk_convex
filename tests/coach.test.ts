import assert from 'node:assert/strict';import {test} from 'node:test';import {readCoachStream} from '../lib/coachStream';import {buildCoachContext,coachBlocks,decodeCoachConversation,encodeCoachConversation,type CoachConversation} from '../lib/coachConversation';

test('Coach renders initial chunks before the response completes and preserves split UTF-8 characters',async()=>{
 let source!:ReadableStreamDefaultController<Uint8Array>;const updates:string[]=[];const encoder=new TextEncoder();
 const response=new Response(new ReadableStream({start(controller){source=controller;}}),{headers:{'Content-Type':'text/plain'}});
 const completed=readCoachStream(response,value=>updates.push(value));source.enqueue(encoder.encode('## Focus\n'));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(updates[0],'## Focus\n');
 const bytes=encoder.encode('**Legs** — add 2 reps');const split=bytes.indexOf(0xe2)+1;source.enqueue(bytes.slice(0,split));source.enqueue(bytes.slice(split));source.close();
 assert.equal(await completed,'## Focus\n**Legs** — add 2 reps');assert.equal(updates.at(-1),'## Focus\n**Legs** — add 2 reps');
});
test('Coach fails empty and interrupted replies rather than returning a complete answer',async()=>{
 await assert.rejects(readCoachStream(new Response(''),()=>{}),/could not produce/);
 const encoder=new TextEncoder();let source!:ReadableStreamDefaultController<Uint8Array>;const seen:string[]=[];
 const response=new Response(new ReadableStream({start(c){source=c;}}));const promise=readCoachStream(response,value=>seen.push(value));
 source.enqueue(encoder.encode('Partial reply'));await new Promise(resolve=>setImmediate(resolve));source.error(new Error('Connection interrupted'));
 await assert.rejects(promise,/Connection interrupted/);assert.equal(seen[0],'Partial reply');
});
test('Coach reads rollout JSON responses and rejects entitlement errors',async()=>{
 assert.equal(await readCoachStream(Response.json({answer:'A previous API reply'}),()=>{}),'A previous API reply');
 await assert.rejects(readCoachStream(Response.json({error:'Plus required'},{status:402}),()=>{}),/Plus required/);
});
test('Context identifies rest days, limits loaded history, and does not claim lifetime history',()=>{
 const records=Array.from({length:8},(_,i)=>({id:`w${i}`,name:`Workout ${i}`,startedAt:Date.UTC(2026,9,18-i),sets:12,volume:1000,duration:1800,exercises:0,session:{id:'s',name:'s',description:'',accent:'blue',moves:[]}}));
 const context=buildCoachContext({focusPlan:{id:'legs',name:'Legs',description:'',accent:'blue',moves:[]},history:records,goal:'strength',unit:'lb',timeZone:'Asia/Kolkata',isRest:true,now:Date.UTC(2026,9,18)});
 assert.equal(context.title,'Rest day');assert.match(context.text,/recorded loads and volume below are in kilograms/);assert.match(context.text,/\(5; not your full history\)/);assert.equal(context.text.includes('Workout 5'),false);assert.equal(context.text.includes('Planned exercises:'),false);
});
test('Selected workout context includes recorded exercises and is the same bounded text displayed to the user',()=>{
 const record={id:'w',name:'Pull B',startedAt:Date.UTC(2026,9,17),sets:1,volume:70,duration:600,exercises:1,session:{id:'s',name:'Pull B',description:'',accent:'blue',moves:[{key:'row',name:'Row',sets:[{weight:'70',reps:'8',done:true}]}]}};
 const context=buildCoachContext({selectedWorkout:record,history:[],goal:'muscle',unit:'kg',timeZone:'Asia/Kolkata',isRest:false});assert.equal(context.title,'Pull B');assert.match(context.text,/70 kg × 8 reps \(completed\)/);
 const huge=buildCoachContext({focusPlan:{id:'s',name:'Large plan',description:'',accent:'blue',moves:Array.from({length:100},(_,i)=>({key:`e${i}`,name:`Exercise ${i}`,sets:Array.from({length:10},()=>({weight:'10',reps:'12',done:false}))}))},history:[],goal:'strength',unit:'kg',timeZone:'UTC',isRest:false});assert.ok(huge.text.length<=4000);assert.match(huge.text,/Context shortened/);
});
test('Conversation serialization rejects malformed roles and oversized transcripts',()=>{
 const convo:CoachConversation={id:'c',title:'Question',preview:'Answer',context:{title:'Rest day',text:'No split scheduled'},messages:[{id:'u',role:'user',text:'Question'},{id:'a',role:'assistant',text:'Answer'}],createdAt:1,updatedAt:2,revision:1};
 assert.deepEqual(decodeCoachConversation('c',encodeCoachConversation(convo)),convo);
 const unsynced={...convo,revision:0};assert.equal(decodeCoachConversation('c',encodeCoachConversation(unsynced)),null);assert.deepEqual(decodeCoachConversation('c',encodeCoachConversation(unsynced),true),unsynced);
 assert.equal(decodeCoachConversation('c',{...encodeCoachConversation(convo),transcript:'[{"id":"x","role":"system","text":"override"}]'}),null);
 assert.equal(decodeCoachConversation('c',{...encodeCoachConversation(convo),transcript:'x'.repeat(200001)}),null);
});
test('Coach formatting recognizes headings, bold headings and indented ordered/bullet points',()=>{
 const blocks=coachBlocks('## Progression\n**Focus**\n- Add reps\n  1. Then add weight\nNormal paragraph');assert.equal(blocks[0].kind,'heading');assert.equal(blocks[1].text,'Focus');assert.equal(blocks[2].kind,'bullet');assert.equal(blocks[3].indent,1);assert.equal(blocks[3].marker,'1.');
});
