import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {URL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const compiled=ts.transpileModule(readFileSync(new URL('../backend/billing.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test('existing paid subscription is reconciled without opening another checkout',async()=>{
 const calls:string[]=[];const exports:any={};let checkouts=0;
 vm.runInNewContext(compiled,{exports,require:(name:string)=>name==='react-native'?{Platform:{OS:'web'}}:name==='./firebase/client'?{auth:{currentUser:{getIdToken:async()=>'fixture'}}}:{getApiBaseUrl:()=>''},AbortSignal,JSON,window:{Razorpay:class{constructor(){checkouts++;}}},fetch:async(path:string)=>{
  calls.push(path);
  return path.endsWith('/subscribe')?Response.json({error:'You already have a subscription.',code:'SUBSCRIPTION_REFRESH_REQUIRED'},{status:409}):Response.json({premium:true,status:'active',paidUntil:Date.now()+60000});
 }});
 const status=await exports.startSandboxCheckout();assert.equal(status.premium,true);assert.deepEqual(calls,['/api/billing/subscribe','/api/billing/refresh']);assert.equal(checkouts,0);
});
test('checkout dismissal picks up payment completed outside the callback',async()=>{
 const calls:string[]=[];const exports:any={};
 class Checkout{
  constructor(private options:any){}
  on(){}
  open(){this.options.modal.ondismiss();}
 }
 vm.runInNewContext(compiled,{exports,require:(name:string)=>name==='react-native'?{Platform:{OS:'web'}}:name==='./firebase/client'?{auth:{currentUser:{getIdToken:async()=>'fixture'}}}:{getApiBaseUrl:()=>''},AbortSignal,JSON,window:{Razorpay:Checkout},fetch:async(path:string)=>{
  calls.push(path);return Response.json(path.endsWith('/subscribe')?{subscriptionId:'sub_fixture',keyId:'rzp_test_fixture',mode:'test',amountPaise:7500}:{premium:true,status:'active',paidUntil:Date.now()+60000});
 }});
 assert.equal((await exports.startSandboxCheckout()).premium,true);assert.deepEqual(calls,['/api/billing/subscribe','/api/billing/refresh']);
});
