import {URL} from 'node:url';
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {test} from 'node:test';import vm from 'node:vm';import ts from 'typescript';import {encodeCoachConversation,decodeCoachConversation,type CoachConversation} from '../lib/coachConversation';
const compiled=ts.transpileModule(readFileSync(new URL('../backend/firebase/coachHistory.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const conversation:CoachConversation={id:'chat',title:'Question',preview:'Answer',context:{title:'Rest',text:'Rest day'},messages:[{id:'u',role:'user',text:'Question'},{id:'a',role:'assistant',text:'Answer'}],createdAt:1,updatedAt:2,revision:0};
function fixture(){let stored:any=null,writes=0,reads=0;const client={db:{},auth:{currentUser:{uid:'owner'}}};const exports:any={};
 vm.runInNewContext(compiled,{exports,require:(name:string)=>name==='./client'?client:name.includes('coachConversation')?{decodeCoachConversation,encodeCoachConversation}:{
  collection:(_db:any,...parts:string[])=>parts.join('/'),doc:(_db:any,...parts:string[])=>parts.join('/'),orderBy:(...parts:any[])=>({orderBy:parts}),limit:(size:number)=>({limit:size}),startAfter:(cursor:any)=>({cursor}),query:(...constraints:any[])=>constraints,
  getDocsFromServer:async(constraints:any[])=>{reads++;assert.ok(constraints.some(c=>c.limit===8));return {docs:[],size:0};},
  runTransaction:async(_db:any,work:any)=>work({get:async(path:string)=>{reads++;assert.equal(path,'users/owner/coachConversations/chat');return {exists:()=>!!stored,data:()=>stored};},set:(_ref:any,value:any)=>{writes++;stored=value;}})
 },Date});return {exports,client,stored:()=>stored,writes:()=>writes,reads:()=>reads};}
test('History saves once per completed turn and rejects a stale revision without overwrite',async()=>{
 const f=fixture();const saved=await f.exports.saveCoachConversation('owner',conversation);assert.equal(saved.revision,1);assert.equal(f.writes(),1);assert.equal(f.reads(),1);
 await assert.rejects(f.exports.saveCoachConversation('owner',conversation),/another device/);assert.equal(f.writes(),1);assert.equal(f.stored().revision,1);
});
test('History rejects cross-account use and loads only an explicitly requested bounded page',async()=>{
 const f=fixture();assert.equal(f.reads(),0);await assert.rejects(f.exports.listCoachConversations('other'),/Sign in/);assert.equal(f.reads(),0);await f.exports.listCoachConversations('owner');assert.equal(f.reads(),1);
});
