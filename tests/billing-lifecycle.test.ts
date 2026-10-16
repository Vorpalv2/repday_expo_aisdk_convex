import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {test} from 'node:test';
import vm from 'node:vm';
import {URL} from 'node:url';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../lib/server/billing.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const records=new Map<string,any>([['billingAccounts/owner',{subscriptionId:'sub_test',paidUntil:null}],['billingSubscriptions/sub_test',{uid:'owner'}]]);
 const end=Math.floor(Date.now()/1000)+86400;
 let status='active',cancels:boolean[]=[],committedWrites=0,documentReads=0;
 let clockTime=Date.now(), invoicePaid=true;
 class Clock extends Date { static now(){return clockTime;} }
 class ServerError extends Error{constructor(public status:number,message:string){super(message);}}
 const storage={ServerError,adminCredential:()=>({}),readDocument:async(path:string)=>{documentReads+=1;return records.has(path)?structuredClone(records.get(path)):null;},documentWrite:(path:string,value:any,merge=false)=>({path,value,merge}),inTransaction:async(work:any)=>{const {result,writes}=await work('test-txn');committedWrites+=writes.length;for(const write of writes)records.set(write.path,write.merge?{...records.get(write.path),...write.value}:write.value);return result;}};
 const cache={readBillingAccount:async(uid:string)=>storage.readDocument(`billingAccounts/${uid}`),invalidateBillingAccount:async()=>{}};
 const exports:any={};
 vm.runInNewContext(compiled,{exports,require:(name:string)=>name==='./firebaseAdmin'?storage:name==='./billingCache'?cache:{FREE_SPLIT_LIMIT:6,SANDBOX_AMOUNT_PAISE:100},process:{env:{BILLING_ENABLED:'true',RAZORPAY_MODE:'test',RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'test-only',RAZORPAY_PLAN_ID:'plan_test',RAZORPAY_WEBHOOK_SECRET:'test-only'}},Date:Clock,AbortSignal,btoa,crypto:webcrypto,fetch:async(url:string,options:any)=>{
 if(url.endsWith('/cancel')){const atEnd=JSON.parse(options.body).cancel_at_cycle_end;cancels.push(atEnd);if(!atEnd)status='cancelled';}
 const data=url.includes('/invoices?')?{items:invoicePaid?[{subscription_id:'sub_test',status:'paid',currency:'INR',amount_paid:100,amount_due:0,billing_end:end}]:[]}:{id:'sub_test',plan_id:'plan_test',status,has_scheduled_changes:false,paid_count:invoicePaid?1:0,notes:{firebase_uid:'owner'}};
 return {ok:true,json:async()=>data};
 }});
 return {exports,records,cancels,end,writes:()=>committedWrites,reads:()=>documentReads,now:()=>clockTime,advance:(milliseconds:number)=>{clockTime+=milliseconds;},setPaid:(paid:boolean)=>{invoicePaid=paid;}};
}
test('cycle-end cancellation retains paid access and is idempotent when provider changes flag is false',async()=>{
 const f=fixture();await f.exports.cancelSubscription('owner');
 let status=await f.exports.billingStatus('owner');assert.equal(status.cancellationScheduled,true);assert.equal(status.premium,true);assert.equal(status.paidUntil,f.end*1000);
 await f.exports.cancelSubscription('owner');assert.deepEqual(f.cancels,[true]);
 await f.exports.cancelSubscription('owner',true);assert.deepEqual(f.cancels,[true,false]);status=await f.exports.billingStatus('owner');assert.equal(status.status,'cancelled');assert.equal(status.cancellationScheduled,false);
});
test('expired access fails closed even if provider status remains active',async()=>{
 const f=fixture();f.records.set('billingAccounts/owner',{subscriptionId:'sub_test',status:'active',paidUntil:Date.now()-1});
 assert.equal((await f.exports.billingStatus('owner')).premium,false);await assert.rejects(()=>f.exports.requirePremium('owner'),/Plus is required/);
});
test('an access check reuses the billing status already loaded by its endpoint',async()=>{
 const f=fixture();f.records.set('billingAccounts/owner',{subscriptionId:'sub_test',paidUntil:f.end*1000});
 const status=await f.exports.billingStatus('owner');const reads=f.reads();
 await f.exports.requirePremium('owner',status);
 assert.equal(f.reads(),reads);
});
test('manual Plus grant survives paid expiry and cannot start checkout',async()=>{
 const f=fixture();f.records.set('billingAccounts/owner',{subscriptionId:null,status:'cancelled',paidUntil:f.now()-1,manualPlusAccess:true});
 const status=await f.exports.billingStatus('owner');
 assert.equal(status.premium,true);assert.equal(status.accessSource,'manual');assert.equal(status.splitLimit,null);
 await assert.doesNotReject(()=>f.exports.requirePremium('owner'));
 await assert.rejects(()=>f.exports.subscribe('owner'),/complimentary Repday Plus access/);
 assert.deepEqual(f.cancels,[]);
 f.records.set('billingAccounts/owner',{subscriptionId:null,status:'free',paidUntil:null,manualPlusAccess:false});
 assert.equal((await f.exports.billingStatus('owner')).premium,false);
 await assert.rejects(()=>f.exports.requirePremium('owner'),/Plus is required/);
});
test('event for a superseded subscription cannot overwrite the current account',async()=>{
 const f=fixture();f.records.set('billingAccounts/owner',{subscriptionId:'sub_new',status:'created',paidUntil:null});
 await f.exports.refreshSubscription('owner','sub_test','event_old');assert.equal(f.records.get('billingAccounts/owner').subscriptionId,'sub_new');assert.equal(f.records.get('billingEvents/event_old').ignored,true);
});

test('one-minute sandbox access starts on verification and refresh cannot extend it',async()=>{
 const f=fixture();f.records.set('billingAccounts/owner',{subscriptionId:'sub_test',mode:'test',testAccessDurationSeconds:60,paidUntil:null});
 await f.exports.refreshSubscription('owner','sub_test');const deadline=f.now()+60000;
 const writesAfterVerification=f.writes();
 assert.equal((await f.exports.billingStatus('owner')).paidUntil,deadline);
 f.advance(30000);await f.exports.refreshSubscription('owner','sub_test');assert.equal((await f.exports.billingStatus('owner')).paidUntil,deadline);assert.equal(f.writes(),writesAfterVerification);
 f.advance(30001);await f.exports.refreshSubscription('owner','sub_test');assert.equal((await f.exports.billingStatus('owner')).paidUntil,deadline);assert.equal((await f.exports.billingStatus('owner')).premium,false);
 await assert.rejects(()=>f.exports.requirePremium('owner'),/Plus is required/);
});
test('unpaid sandbox checkout does not start the test countdown',async()=>{
 const f=fixture();f.records.set('billingAccounts/owner',{subscriptionId:'sub_test',mode:'test',testAccessDurationSeconds:60,paidUntil:null});f.setPaid(false);
 await f.exports.refreshSubscription('owner','sub_test');assert.equal(f.records.get('billingAccounts/owner').testAccessExpiresAt,null);assert.equal((await f.exports.billingStatus('owner')).premium,false);
 f.advance(120000);f.setPaid(true);await f.exports.refreshSubscription('owner','sub_test');assert.equal((await f.exports.billingStatus('owner')).paidUntil,f.now()+60000);
});
