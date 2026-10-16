import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {paidThrough,verifySignature,billingConfigured,hasPlusAccess} from '../lib/server/billing';
import {splitNeedsWrite,validateSplitQuota} from '../lib/server/splits';
test('checkout HMAC binds payment to server subscription; raw webhook body is significant',async()=>{
 const body='pay_123|sub_456', secret='unit-test-only';const signature=createHmac('sha256',secret).update(body).digest('hex');
 assert.equal(await verifySignature(body,signature,secret),true);
 assert.equal(await verifySignature('pay_123|sub_other',signature,secret),false);
 assert.equal(await verifySignature(body+' ',signature,secret),false);
 assert.equal(await verifySignature(body,'invalid',secret),false);
});
test('access requires a fully paid INR 1 invoice for the correct subscription',()=>{
 const valid={subscription_id:'sub_a',status:'paid',currency:'INR',amount_paid:100,amount_due:0,billing_end:2000000000};
 assert.equal(paidThrough([valid],'sub_a'),2000000000000);
 for(const patch of [{status:'issued'},{currency:'USD'},{amount_paid:0},{amount_due:1},{subscription_id:'sub_b'},{billing_end:null}])assert.equal(paidThrough([{...valid,...patch}],'sub_a'),0);
 assert.equal(paidThrough([{...valid,billing_end:100},valid],'sub_a'),2000000000000);
});
test('free quota rejects a seventh split, permits edits and atomic replacement within six',()=>{
 const existing=['1','2','3','4','5','6'];
 assert.throws(()=>validateSplitQuota(existing,['7'],false,false,true),/6 splits/);
 assert.doesNotThrow(()=>validateSplitQuota(existing,['1'],false,false,true));
 assert.doesNotThrow(()=>validateSplitQuota(existing,['7'],true,false,true));
 assert.doesNotThrow(()=>validateSplitQuota(existing,['7'],false,true,true));
 assert.throws(()=>validateSplitQuota(existing,['7','7'],false,true,true),/Duplicate/);
 assert.doesNotThrow(()=>validateSplitQuota([...existing,'7'],['7'],false,false,true));
});
test('server quota accepts a trusted manual Plus grant without a paid invoice',()=>{
 const account={manualPlusAccess:true,paidUntil:null};
 assert.equal(hasPlusAccess(account),true);
 assert.doesNotThrow(()=>validateSplitQuota(['1','2','3','4','5','6'],['7'],false,hasPlusAccess(account),true));
 assert.equal(hasPlusAccess({manualPlusAccess:'true',paidUntil:null}),false);
});
test('unchanged split saves do not need another Firestore write',()=>{
 const item={id:'push',name:'Push',moves:[{name:'Bench press',sets:[{weight:'20',reps:'8'}]}]};
 const existing={clientId:'push',data:{moves:item.moves,name:item.name,id:item.id},position:0,setTargets:{}};
 assert.equal(splitNeedsWrite(existing,item,0,true),false);
 assert.equal(splitNeedsWrite(existing,item,1),true);
 assert.equal(splitNeedsWrite({...existing,setTargets:{bench:{weight:'25'}}},item,0,true),true);
 assert.equal(splitNeedsWrite(undefined,item,0),true);
});
test('live credentials are refused even with an explicit test mode flag',()=>{
 const saved=process.env.RAZORPAY_KEY_ID;process.env.RAZORPAY_KEY_ID='rzp_live_unit';assert.equal(billingConfigured(),false);if(saved)process.env.RAZORPAY_KEY_ID=saved;else delete process.env.RAZORPAY_KEY_ID;
});
