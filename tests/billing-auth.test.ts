import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {URL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const compiled=ts.transpileModule(readFileSync(new URL('../lib/server/billingAuth.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(result:0|1=1,unavailable=false){
  const calls:{url:string;body:any}[]=[];
  class ServerError extends Error{constructor(public status:number,message:string){super(message);}}
  const exports:any={};
  vm.runInNewContext(compiled,{exports,require:()=>({ServerError}),Date,AbortSignal,Request,Response,setTimeout,process:{env:{EXPO_PUBLIC_FIREBASE_API_KEY:'fixture',UPSTASH_REDIS_REST_URL:'https://redis.fixture',UPSTASH_REDIS_REST_TOKEN:'fixture'}},fetch:async(url:string,options:any)=>{
    calls.push({url,body:JSON.parse(options.body)});
    if(url.startsWith('https://identitytoolkit'))return Response.json({users:[{localId:'owner'}]});
    if(unavailable)throw new Error('network unavailable');
    return Response.json({result});
  }});
  const request=new Request('https://app.fixture/api/billing/subscribe',{headers:{Authorization:'Bearer fixture'}});
  return {exports,calls,request};
}
test('billing auth consumes one auth call and one atomic limiter call',async()=>{
  const f=fixture();assert.equal((await f.exports.billingUser(f.request)).uid,'owner');
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].body[0],'EVAL');assert.equal(f.calls[1].body[2],2);
});
test('exhausted billing limit rejects checkout',async()=>{
  const f=fixture(0);await assert.rejects(()=>f.exports.billingUser(f.request),(error:any)=>error.status===429);assert.equal(f.calls.length,2);
});
test('limiter network failure fails closed without outbound retries',async()=>{
  const f=fixture(1,true);await assert.rejects(()=>f.exports.billingUser(f.request),(error:any)=>error.status===503);assert.equal(f.calls.length,2);
});
test('read-only status auth does not consume limiter requests',async()=>{
  const f=fixture();await f.exports.billingUser(f.request,'billing',false);assert.equal(f.calls.length,1);
});
