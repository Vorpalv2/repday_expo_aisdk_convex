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
 const status=await exports.startCheckout();assert.equal(status.premium,true);assert.deepEqual(calls,['/api/billing/subscribe','/api/billing/refresh']);assert.equal(checkouts,0);
});
for(const mode of ['test','live'])test(`${mode} checkout dismissal picks up payment completed outside the callback`,async()=>{
 const calls:string[]=[];const exports:any={};
 class Checkout{
  constructor(private options:any){assert.equal(options.key,`rzp_${mode}_fixture`);assert.equal(options.description.includes('No real money'),mode==='test');}
  on(){}
  open(){this.options.modal.ondismiss();}
 }
 vm.runInNewContext(compiled,{exports,require:(name:string)=>name==='react-native'?{Platform:{OS:'web'}}:name==='./firebase/client'?{auth:{currentUser:{getIdToken:async()=>'fixture'}}}:{getApiBaseUrl:()=>''},AbortSignal,JSON,window:{Razorpay:Checkout},fetch:async(path:string)=>{
  calls.push(path);return Response.json(path.endsWith('/subscribe')?{subscriptionId:'sub_fixture',keyId:`rzp_${mode}_fixture`,mode,amountPaise:7500}:{premium:true,status:'active',paidUntil:Date.now()+60000});
 }});
 assert.equal((await exports.startCheckout()).premium,true);assert.deepEqual(calls,['/api/billing/subscribe','/api/billing/refresh']);
});

function retryFixture(){
 const calls:string[]=[],notifications:string[]=[];
 const exports:any={};let checkout:any,closed=0;
 class Checkout{
  events:Record<string,()=>void>={};
  constructor(public options:any){checkout=this;}
  on(event:string,callback:()=>void){this.events[event]=callback;}
  close(){closed++;this.options.modal.ondismiss();}
  open(){}
 }
 vm.runInNewContext(compiled,{exports,require:(name:string)=>name==='react-native'?{Platform:{OS:'web'}}:name==='./firebase/client'?{auth:{currentUser:{getIdToken:async()=>'fixture'}}}:{getApiBaseUrl:()=>''},AbortSignal,JSON,window:{Razorpay:Checkout},fetch:async(path:string)=>{
  calls.push(path);
  if(path.endsWith('/subscribe'))return Response.json({subscriptionId:'sub_fixture',keyId:'rzp_live_fixture',mode:'live',amountPaise:100});
  return Response.json({premium:path.endsWith('/verify'),status:path.endsWith('/verify')?'active':'created',paidUntil:path.endsWith('/verify')?Date.now()+86400000:null});
 }});
 const result=exports.startCheckout((message:string)=>notifications.push(message));
 return {result,calls,notifications,checkout:()=>checkout,closed:()=>closed};
}
async function checkoutReady(f:ReturnType<typeof retryFixture>){
 for(let i=0;i<20&&!f.checkout();i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(f.checkout(),'checkout opened');return f.checkout();
}
test('declined UPI attempt stays open and a retry can activate Plus in the same checkout',async()=>{
 const f=retryFixture();const checkout=await checkoutReady(f);
 assert.equal(checkout.options.retry.enabled,true);
 checkout.events['payment.failed']();
 assert.equal(f.closed(),0);assert.equal(f.notifications.length,1);assert.deepEqual(f.calls,['/api/billing/subscribe']);
 checkout.events['payment.failed']();
 await checkout.options.handler({razorpay_payment_id:'pay_success'});
 const status=await f.result;assert.equal(status.premium,true);assert.equal(f.closed(),0);
 assert.deepEqual(f.calls,['/api/billing/subscribe','/api/billing/verify']);
});
test('closing checkout after failure reconciles once and reports failure instead of cancellation',async()=>{
 const f=retryFixture();const checkout=await checkoutReady(f);
 const failure=assert.rejects(f.result,/Payment was declined/);
 checkout.events['payment.failed']();checkout.options.modal.ondismiss();checkout.options.modal.ondismiss();
 await failure;assert.deepEqual(f.calls,['/api/billing/subscribe','/api/billing/refresh']);
});
test('late failure and dismiss events cannot overwrite successful verification',async()=>{
 const f=retryFixture();const checkout=await checkoutReady(f);
 const verification=checkout.options.handler({razorpay_payment_id:'pay_success'});
 checkout.events['payment.failed']();checkout.options.modal.ondismiss();
 await verification;assert.equal((await f.result).premium,true);assert.equal(f.notifications.length,0);
 checkout.events['payment.failed']();checkout.options.modal.ondismiss();
 assert.deepEqual(f.calls,['/api/billing/subscribe','/api/billing/verify']);
});

test('explicit recovery finishes verification and retirement before opening fresh checkout',async()=>{
 const calls:string[]=[],exports:any={};
 class Checkout{constructor(options:any){assert.equal(options.subscription_id,'sub_new');}on(){}open(){calls.push('opened');}}
 vm.runInNewContext(compiled,{exports,require:(name:string)=>name==='react-native'?{Platform:{OS:'web'}}:name==='./firebase/client'?{auth:{currentUser:{getIdToken:async()=>'fixture'}}}:{getApiBaseUrl:()=>''},AbortSignal,JSON,window:{Razorpay:Checkout},fetch:async(path:string,options:any)=>{
  const action=JSON.parse(options.body).action;calls.push(action||path);
  return Response.json(action==='prepare'?{stage:'verify',proof:'first'}:action==='verify'?{stage:'retire',proof:'second'}:action==='retire'?{stage:'ready'}:{subscriptionId:'sub_new',keyId:'rzp_live_fixture',mode:'live',amountPaise:100});
 }});
 void exports.retryCheckout();
 for(let i=0;i<20&&!calls.includes('opened');i++)await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['prepare','verify','retire','/api/billing/subscribe','opened']);
});
test('blocked recovery never starts another subscription checkout',async()=>{
 const calls:string[]=[],exports:any={};
 vm.runInNewContext(compiled,{exports,require:(name:string)=>name==='react-native'?{Platform:{OS:'web'}}:name==='./firebase/client'?{auth:{currentUser:{getIdToken:async()=>'fixture'}}}:{getApiBaseUrl:()=>''},AbortSignal,JSON,fetch:async(path:string)=>{calls.push(path);return Response.json({error:'Mandate is pending.',code:'CHECKOUT_RETRY_BLOCKED'},{status:409});}});
 await assert.rejects(exports.retryCheckout(),/Mandate is pending/);assert.deepEqual(calls,['/api/billing/retry-checkout']);
});
