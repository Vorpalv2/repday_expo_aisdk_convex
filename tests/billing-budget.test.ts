import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto,createHmac} from 'node:crypto';
import {test} from 'node:test';
import {URL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real route, auth and Firestore REST code against in-memory provider
// responses. Each fixture has a cold OAuth token/cache and a hard 10-fetch cap.
async function fixture(mode:'test'|'live'='test'){
 const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pem=`-----BEGIN PRIVATE KEY-----\n${Buffer.from(await webcrypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
 const records=new Map<string,any>(),cache=new Map<string,any>(),versions=new Map<string,string>();
 let calls=0,revision=0,providerStatus='created',paid=false;
 const now=Date.now(),end=Math.floor(now/1000)+86400;
 let retry:any=null;let cancellations=0;
 let beforeCommit:(()=>void)|undefined;
 const fetch=async(input:string,options:any={})=>{
  if(++calls>10)throw new Error('Too many subrequests by single Worker invocation.');
  const url=new URL(input),body=options.body?JSON.parse(options.headers?.['Content-Type']==='application/x-www-form-urlencoded'?'null':options.body):null;
  if(url.hostname==='identitytoolkit.googleapis.com')return Response.json({users:[{localId:'owner',email:'demo@example.test'}]});
  if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'fixture-token',expires_in:3600});
  if(url.hostname==='redis.fixture'){
   if(body[0]==='EVAL')return Response.json({result:1});
   if(body[0]==='GET')return Response.json({result:cache.has(body[1])?JSON.stringify(cache.get(body[1])):null});
   if(body[0]==='SET'){cache.set(body[1],JSON.parse(body[2]));return Response.json({result:'OK'});}
   if(body[0]==='DEL'){cache.delete(body[1]);return Response.json({result:1});}
  }
  if(url.hostname==='firestore.googleapis.com'){
   if(url.pathname.endsWith(':commit')){
    beforeCommit?.();beforeCommit=undefined;
    for(const w of body.writes){
     const key=w.update.name.split('/documents/')[1],pre=w.currentDocument;
     if(pre&&(pre.exists===false?records.has(key):versions.get(key)!==pre.updateTime))return Response.json({error:{status:'FAILED_PRECONDITION'}},{status:400});
    }
    return Response.json({writeResults:body.writes.map((w:any)=>{
     const key=w.update.name.split('/documents/')[1];
     records.set(key,w.updateMask?{...records.get(key),...w.update.fields}:w.update.fields);
     const updateTime=`2026-10-17T00:00:${String(++revision).padStart(2,'0')}.000000Z`;versions.set(key,updateTime);return {updateTime};
    })});
   }
   const key=decodeURIComponent(url.pathname.split('/documents/')[1]);
   return records.has(key)?Response.json({name:key,fields:records.get(key),updateTime:versions.get(key)}):Response.json({error:{status:'NOT_FOUND'}},{status:404});
  }
  if(url.hostname==='api.razorpay.com'){
   if(url.pathname.includes('/plans/'))return Response.json({period:'monthly',interval:1,item:{amount:7500,currency:'INR'}});
   if(url.pathname==='/v1/subscriptions'&&options.method==='POST')return Response.json({id:'sub_fixture',plan_id:'plan_fixture',status:'created',notes:{firebase_uid:'owner'}});
   if(retry&&url.pathname.includes('/tokens/')){const tokenId=url.pathname.split('/').at(-1)!;return Response.json({id:tokenId,method:'upi',recurring:retry.tokens?.find((token:any)=>token.id===tokenId)?.recurring??false,recurring_details:{status:retry.tokens?.find((token:any)=>token.id===tokenId)?.status||retry.tokenStatus}});}
   if(retry&&url.pathname.endsWith('/payments'))return Response.json({items:retry.noAttempt==='payments'?[]:(retry.tokens||[{id:'token_fixture'}]).map((token:any,index:number)=>({id:`pay_fixture${index}`,order_id:'order_fixture',customer_id:'cust_fixture',token_id:token.id,status:retry.paymentStatus,method:'upi'}))});
   if(retry&&url.pathname.endsWith('/invoices'))return Response.json({items:retry.noAttempt==='invoice'?[]:[{subscription_id:'sub_fixture',status:'issued',amount_paid:0,amount_due:7500,order_id:'order_fixture'}]});
   if(url.pathname.endsWith('/cancel')){cancellations++;if(!body.cancel_at_cycle_end)providerStatus='cancelled';}
   if(url.pathname.endsWith('/invoices'))return Response.json({items:paid?[{subscription_id:'sub_fixture',status:'paid',currency:'INR',amount_paid:7500,amount_due:0,billing_end:end}]:[]});
   return Response.json({id:'sub_fixture',plan_id:'plan_fixture',status:providerStatus,paid_count:paid?1:0,...(retry?{auth_attempts:0,customer_id:'cust_fixture',current_start:null,current_end:null}:{}),notes:{firebase_uid:'owner'}});
  }
  throw new Error(`Unexpected fixture request: ${url.hostname}`);
 };
 class Redis{
  constructor(options:any){assert.equal(options.retry.retries,0);assert.equal(options.enableAutoPipelining,false);}
  async command(command:any[]){const r=await fetch('https://redis.fixture',{body:JSON.stringify(command)});return (await r.json()).result;}
  async get(key:string){const value=await this.command(['GET',key]);return value?JSON.parse(value):null;}
  async set(key:string,value:any){return this.command(['SET',key,JSON.stringify(value)]);}
  async del(key:string){return this.command(['DEL',key]);}
 }
 const env={EXPO_PUBLIC_FIREBASE_PROJECT_ID:'fixture',EXPO_PUBLIC_FIREBASE_API_KEY:'fixture',FIREBASE_ADMIN_SERVICE_ACCOUNT:JSON.stringify({project_id:'fixture',client_email:'test@example.test',private_key:pem}),UPSTASH_REDIS_REST_URL:'https://redis.fixture',UPSTASH_REDIS_REST_TOKEN:'fixture',RAZORPAY_MODE:mode,RAZORPAY_KEY_ID:`rzp_${mode}_fixture`,RAZORPAY_KEY_SECRET:'secret',RAZORPAY_PLAN_ID:'plan_fixture',RAZORPAY_PLAN_AMOUNT_PAISE:'7500',RAZORPAY_WEBHOOK_SECRET:'secret',BILLING_ENABLED:'true'};
 const modules=new Map<string,any>();
 function load(path:string):any{
  if(modules.has(path))return modules.get(path);
  const exports:any={};modules.set(path,exports);
  const code=ts.transpileModule(readFileSync(new URL(`../${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:(name:string)=>{
   if(name==='@upstash/redis')return {Redis};
   const resolved=new URL(name,`file:///${path}.ts`).pathname.slice(1);return load(resolved);
  },process:{env},Date,AbortSignal,Response,Request,TextEncoder,Uint8Array,btoa,atob,crypto:webcrypto,URLSearchParams,setTimeout,Math,Object,fetch});return exports;
 }
 const admin=load('lib/server/firebaseAdmin');
 const seed=(value:any)=>{records.set('billingAccounts/owner',admin.encodeFields(value));versions.set('billingAccounts/owner','2026-10-17T00:00:00.000000Z');records.set('billingSubscriptions/sub_fixture',admin.encodeFields({uid:'owner'}));versions.set('billingSubscriptions/sub_fixture','2026-10-17T00:00:00.000000Z');};
 const request=(body?:any)=>new Request('https://app.fixture/api/billing',{method:body?'POST':'GET',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {retry:(tokenStatus='rejected',paymentStatus='failed',noAttempt?:'invoice'|'payments')=>{retry={tokenStatus,paymentStatus,noAttempt};},mixedRetry:(middle='initiated',recurring=false)=>{retry={paymentStatus:'failed',tokens:[{id:'token_first',status:'rejected'},{id:'token_middle',status:middle,recurring},{id:'token_last',status:'rejected'}]};},cancellations:()=>cancellations,resetCalls:()=>{calls=0;},load,request,calls:()=>calls,seed,records,admin,end,env,setPaid:()=>{paid=true;providerStatus='active';},setTerminal:()=>{providerStatus='cancelled';},conflict:()=>{beforeCommit=()=>versions.set('billingAccounts/owner','concurrent-change');}};
}
test('cold new-account checkout stays within the hosted 10-call budget',async()=>{
 const f=await fixture();const r=await f.load('app/api/billing/subscribe+api').POST(f.request({}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).subscriptionId,'sub_fixture');assert.equal(f.calls(),9);
});
test('cold checkout retry for an unpaid subscription uses five outbound calls',async()=>{
 const f=await fixture();f.seed({subscriptionId:'sub_fixture',status:'created',paidUntil:null});const r=await f.load('app/api/billing/subscribe+api').POST(f.request({}));assert.equal(r.status,200);assert.equal(f.calls(),5);
});
test('signed payment verification fits the cold budget and returns paid access',async()=>{
 const f=await fixture();f.seed({subscriptionId:'sub_fixture',status:'created',paidUntil:null});f.setPaid();
 const body={razorpay_subscription_id:'sub_fixture',razorpay_payment_id:'pay_fixture',razorpay_signature:createHmac('sha256','secret').update('pay_fixture|sub_fixture').digest('hex')};
 const r=await f.load('app/api/billing/verify+api').POST(f.request(body));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).premium,true);assert.equal(f.calls(),9);
});
test('cancellation keeps paidUntil without another invoice reconciliation',async()=>{
 const f=await fixture();f.seed({subscriptionId:'sub_fixture',status:'active',paidUntil:f.end*1000});f.setPaid();const r=await f.load('app/api/billing/cancel+api').POST(f.request({}));assert.equal(r.status,200);const status=await r.json();assert.equal(status.premium,true);assert.equal(status.cancellationScheduled,true);assert.equal(f.calls(),8);
});
test('a concurrent account change rejects the checkout reservation',async()=>{
 const f=await fixture();f.seed({status:'free'});f.conflict();const r=await f.load('app/api/billing/subscribe+api').POST(f.request({}));assert.equal(r.status,409);assert.equal(f.records.has('billingSubscriptions/sub_fixture'),true);assert.equal(f.calls(),5);
});
test('cold replacement of a cancelled unpaid checkout fits the 10-call limit',async()=>{
 const f=await fixture();f.seed({subscriptionId:'sub_fixture',status:'cancelled',paidUntil:null});f.setTerminal();const r=await f.load('app/api/billing/subscribe+api').POST(f.request({}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal(f.calls(),10);
});
test('expired status reads use no provider reconciliation',async()=>{
 const f=await fixture();f.seed({subscriptionId:'sub_fixture',status:'active',paidUntil:Date.now()-1000});const r=await f.load('app/api/billing+api').GET(f.request());assert.equal(r.status,200);assert.equal((await r.json()).premium,false);assert.equal(f.calls(),5);
});
test('deletion billing preparation fits the budget without invoice reconciliation',async()=>{
 const f=await fixture();f.seed({subscriptionId:'sub_fixture',status:'active',paidUntil:f.end*1000});f.setPaid();const r=await f.load('app/api/billing/delete-account+api').POST(f.request({}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal(f.calls(),8);
});
test('signed webhook fits the cold request budget',async()=>{
 const f=await fixture();f.seed({subscriptionId:'sub_fixture',status:'created',paidUntil:null});f.setPaid();
 const body=JSON.stringify({event:'subscription.charged',payload:{subscription:{entity:{id:'sub_fixture'}}}});
 const request=new Request('https://app.fixture/api/billing/webhook',{method:'POST',headers:{'x-razorpay-signature':createHmac('sha256','secret').update(body).digest('hex'),'x-razorpay-event-id':'fixture-event'},body});
 const r=await f.load('app/api/billing/webhook+api').POST(request);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal(f.calls(),9);
});
test('explicit refresh recovers a paid subscription still marked created, in nine calls',async()=>{
 const f=await fixture();f.seed({subscriptionId:'sub_fixture',status:'created',paidUntil:null});f.setPaid();
 const r=await f.load('app/api/billing/refresh+api').POST(f.request({}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));const status=await r.json();assert.equal(status.premium,true);assert.equal(status.status,'active');assert.equal(status.paidUntil,f.end*1000);assert.equal(f.calls(),9);
});
test('checkout reports a recoverable code when provider is paid but the account is stale',async()=>{
 const f=await fixture();f.seed({subscriptionId:'sub_fixture',status:'created',paidUntil:null});f.setPaid();
 const r=await f.load('app/api/billing/subscribe+api').POST(f.request({}));assert.equal(r.status,409);assert.equal((await r.json()).code,'SUBSCRIPTION_REFRESH_REQUIRED');assert.equal(f.calls(),5);
});

for(const action of ['verify','refresh','cancel','webhook'] as const)test(`live ${action} preserves monthly access and fits the hosted call limit`,async()=>{
 const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'active',paidUntil:f.end*1000,testAccessDurationSeconds:60,testAccessExpiresAt:Date.now()+60000});f.setPaid();
 let request=f.request({});
 if(action==='verify')request=f.request({razorpay_subscription_id:'sub_fixture',razorpay_payment_id:'pay_fixture',razorpay_signature:createHmac('sha256','secret').update('pay_fixture|sub_fixture').digest('hex')});
 if(action==='webhook'){
  const body=JSON.stringify({event:'subscription.charged',payload:{subscription:{entity:{id:'sub_fixture'}}}});
  request=new Request('https://app.fixture/api/billing/webhook',{method:'POST',headers:{'x-razorpay-signature':createHmac('sha256','secret').update(body).digest('hex')},body});
 }
 const response=await f.load(`app/api/billing/${action}+api`).POST(request);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 if(action!=='webhook'){const value=await response.json();assert.equal(value.premium,true);assert.equal(value.paidUntil,f.end*1000);assert.equal(value.mode,'live');assert.equal(value.testAccessDurationSeconds,null);if(action==='cancel')assert.equal(value.cancellationScheduled,true);}
 assert.ok(f.calls()<=10);
});
test('live checkout ignores a legacy test subscription and never fetches it with live keys',async()=>{
 const f=await fixture('live');f.seed({mode:'test',subscriptionId:'sub_oldTest',paidUntil:f.end*1000});
 const r=await f.load('app/api/billing/subscribe+api').POST(f.request({}));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).mode,'live');assert.equal(f.calls(),9);
});
test('live status rejects sandbox paidUntil but preserves complimentary access',async()=>{
 const f=await fixture('live');const billing=f.load('lib/server/billing');
 const old={mode:'test',subscriptionId:'sub_oldTest',paidUntil:f.end*1000};
 assert.equal(billing.billingStatusFromAccount(old).premium,false);assert.equal(billing.billingStatusFromAccount(old).subscriptionId,null);
 assert.equal(billing.billingStatusFromAccount({...old,manualPlusAccess:true}).accessSource,'manual');
});
test('existing live plan retains its invoice price when the configured offer changes',async()=>{
 const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',planId:'plan_fixture',amountPaise:7500,paidUntil:null});f.setPaid();f.env.RAZORPAY_PLAN_ID='plan_newOffer';f.env.RAZORPAY_PLAN_AMOUNT_PAISE='100';
 const billing=f.load('lib/server/billing');const value=await billing.refreshSubscription('owner','sub_fixture');assert.equal(value.paidUntil,f.end*1000);
 assert.equal(billing.paidThrough([{subscription_id:'sub_fixture',status:'paid',currency:'INR',amount_paid:100,amount_due:0,billing_end:f.end}],'sub_fixture',100),f.end*1000);
});

async function retryStep(f:Awaited<ReturnType<typeof fixture>>,action:string,proof?:string){
 const response=await f.load('app/api/billing/retry-checkout+api').POST(f.request({action,proof}));
 return {status:response.status,...await response.json()};
}
async function retryProof(){
 const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'created',paidUntil:null});f.retry();
 const prepared=await retryStep(f,'prepare');assert.equal(prepared.status,200);assert.equal(prepared.stage,'verify');assert.ok(f.calls()<=10);
 f.resetCalls();const verified=await retryStep(f,'verify',prepared.proof);assert.equal(verified.status,200);assert.equal(verified.stage,'retire');assert.ok(f.calls()<=10);
 return {proof:verified.proof,prepared:prepared.proof};
}
test('rejected UPI recovery retires only the unpaid checkout within ten cold calls',async()=>{
 const {proof}=await retryProof();const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'created',paidUntil:null});f.retry();
 const result=await retryStep(f,'retire',proof);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.stage,'ready');assert.equal(f.cancellations(),1);assert.equal(f.calls(),10);
 f.resetCalls();assert.equal((await retryStep(f,'retire',proof)).status,409);assert.equal(f.cancellations(),1);
});
for(const tokenStatus of ['confirmed','paused'])test(`recovery blocks ${tokenStatus} mandates without cancellation`,async()=>{
 const {prepared}=await retryProof();const f=await fixture('live');f.retry(tokenStatus);const r=await retryStep(f,'verify',prepared);assert.equal(r.status,409);assert.equal(f.cancellations(),0);
});
for(const paymentStatus of ['authorized','captured','created'])test(`recovery blocks ${paymentStatus} payments before retirement`,async()=>{
 const {proof}=await retryProof();const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'created'});f.retry('rejected',paymentStatus);
 const r=await retryStep(f,'retire',proof);assert.equal(r.status,409);assert.equal(f.cancellations(),0);assert.ok(f.calls()<=10);
});
test('recovery rejects tampered, wrong-mode, expired and unverified proofs',async()=>{
 const {proof,prepared}=await retryProof();
 const payload=Buffer.from(proof.split('.')[0],'base64url');const expired=JSON.parse(payload.toString());expired.expires=Date.now()-1;
 const encoded=Buffer.from(JSON.stringify(expired)).toString('base64url');const signature=createHmac('sha256','secret').update(`repday-checkout-retry:v1:${encoded}`).digest('hex');
 for(const [mode,value,action,expected] of [['live',proof+'x','retire',400],['test',proof,'retire',403],['live',`${encoded}.${signature}`,'retire',409],['live',prepared,'retire',409]] as const){
  const f=await fixture(mode);f.retry();const result=await retryStep(f,action,value);assert.equal(result.status,expected);assert.equal(f.cancellations(),0);
 }
});
test('recovery protects paid access and concurrent account updates',async()=>{
 const {proof}=await retryProof();
 for(const paid of [true,false]){
  const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'created',paidUntil:paid?f.end*1000:null});f.retry();if(!paid)f.conflict();
  const r=await retryStep(f,'retire',proof);assert.equal(r.status,409);assert.equal(f.cancellations(),0);
 }
});

for(const noAttempt of ['invoice','payments'] as const)test(`continue reuses an unattempted checkout with no ${noAttempt} without cancellation`,async()=>{
 const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'created'});f.retry('rejected','failed',noAttempt);
 const result=await retryStep(f,'prepare');assert.equal(result.status,200);assert.equal(result.stage,'ready');assert.equal(f.cancellations(),0);assert.ok(f.calls()<=10);
});
test('subscribe marks existing checkout for automatic authorization checks without additional calls',async()=>{
 const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'created'});
 const result=await f.load('app/api/billing/subscribe+api').POST(f.request({}));assert.equal(result.status,200);assert.equal((await result.json()).resuming,true);assert.equal(f.calls(),5);
});

test('three failed payments with rejected/initiated/rejected inactive tokens can abandon their initial checkout',async()=>{
 const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'created'});f.mixedRetry();
 const prepared=await retryStep(f,'prepare');assert.equal(prepared.status,200);f.resetCalls();
 const first=await retryStep(f,'verify',prepared.proof);assert.equal(first.status,200);assert.equal(first.stage,'verify');f.resetCalls();
 const second=await retryStep(f,'verify',first.proof);assert.equal(second.status,200);assert.equal(second.stage,'retire');
 // Run retirement cold, with no OAuth token carried over from preparation.
 const cold=await fixture('live');cold.seed({mode:'live',subscriptionId:'sub_fixture',status:'created'});cold.mixedRetry();
 const retired=await retryStep(cold,'retire',second.proof);assert.equal(retired.status,200,JSON.stringify(retired));assert.equal(retired.stage,'ready');assert.equal(cold.cancellations(),1);assert.equal(cold.calls(),10);
});
for(const [middle,recurring] of [['confirmed',false],['initiated',true]] as const)test(`mixed failed attempts protect ${middle} recurring=${recurring} authorization`,async()=>{
 const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'created'});f.mixedRetry(middle,recurring);
 const prepared=await retryStep(f,'prepare');f.resetCalls();const first=await retryStep(f,'verify',prepared.proof);f.resetCalls();const result=first.stage==='verify'?await retryStep(f,'verify',first.proof):first;assert.equal(result.status,409);assert.equal(f.cancellations(),0);
});
for(const payment of ['created','authorized','captured'])test(`pending or successful ${payment} payment never starts checkout retirement`,async()=>{
 const f=await fixture('live');f.seed({mode:'live',subscriptionId:'sub_fixture',status:'created'});f.retry('initiated',payment);
 const prepared=await retryStep(f,'prepare');assert.equal(prepared.status,409);assert.equal(f.cancellations(),0);
});
