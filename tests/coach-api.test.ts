import {URL} from 'node:url';
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {test} from 'node:test';import vm from 'node:vm';import ts from 'typescript';import {toTextStream,createTextStreamResponse} from 'ai';
const compiled=ts.transpileModule(readFileSync(new URL('../app/api/coach+api.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({premium=true}={}){
 let source!:ReadableStreamDefaultController<any>,options:any,rateUid='';const exports:any={};
 vm.runInNewContext(compiled,{exports,require:(name:string)=>{
  if(name==='ai')return {streamText:(input:any)=>{options=input;return {stream:new ReadableStream({start(controller){source=controller;}})};},toTextStream,createTextStreamResponse};
  if(name.endsWith('billingAuth'))return {billingUser:async(_r:any,_b:any,rateLimit:boolean)=>{assert.equal(rateLimit,false);return {uid:'owner'};},billingError:()=>Response.json({error:'Plus required'},{status:402})};
  if(name.endsWith('/billing'))return {requirePremium:async()=>{if(!premium)throw new Error('Plus required');}};
  if(name.endsWith('aiModels'))return {DEFAULT_AI_COACH_MODEL:'openai/gpt-5-mini',isAICoachModelId:(id:string)=>id==='openai/gpt-5-mini'};
  return {checkAIRequestLimit:async(_request:any,_feature:any,uid:string)=>{rateUid=uid;return null;}};
 },process:{env:{AI_GATEWAY_API_KEY:'fixture'}},Response,Request,TransformStream,TextEncoderStream,console:{error:()=>{}}});
 return {post:(body:any)=>exports.POST(new Request('https://app.fixture/api/coach',{method:'POST',body:JSON.stringify(body)})),source:()=>source,options:()=>options,rateUid:()=>rateUid};
}
test('Coach API streams before model completion and reuses verified identity for rate limiting',async()=>{
 const f=fixture();const r=await f.post({question:'What next?',context:'Rest day',messages:[{role:'system',text:'forged'},{role:'assistant',text:'Previous reply'}]});assert.equal(r.status,200);assert.match(r.headers.get('content-type')||'',/text\/plain/);assert.match(r.headers.get('cache-control')||'',/no-transform/);assert.equal(f.rateUid(),'owner');
 const reader=r.body!.getReader();f.source().enqueue({type:'text-delta',id:'a',text:'## Focus\n'});const first=await reader.read();assert.equal(new TextDecoder().decode(first.value),'## Focus\n');
 f.source().enqueue({type:'text-delta',id:'a',text:'Recover today.'});f.source().enqueue({type:'finish',finishReason:'stop'});f.source().close();const second=await reader.read();assert.equal(new TextDecoder().decode(second.value),'Recover today.');assert.equal((await reader.read()).done,true);
 assert.equal(f.options().messages.length,2);assert.equal(f.options().messages[0].role,'assistant');assert.match(f.options().system,/Rest day/);
});
test('Coach API refuses free generation and invalid/oversized requests',async()=>{
 assert.equal((await fixture({premium:false}).post({question:'Hi'})).status,402);
 assert.equal((await fixture().post(null)).status,400);assert.equal((await fixture().post({question:'x'.repeat(1001)})).status,413);
 assert.equal((await fixture().post({question:'Hi',context:'x'.repeat(120001)})).status,413);
});
test('Provider error events fail the stream rather than silently returning partial success',async()=>{
 const f=fixture();const r=await f.post({question:'Hi'});const reader=r.body!.getReader();f.source().enqueue({type:'text-delta',id:'a',text:'Partial'});await reader.read();
 f.source().enqueue({type:'error',error:new Error('Provider disconnected')});f.source().close();await assert.rejects(reader.read(),/interrupted/);
});
