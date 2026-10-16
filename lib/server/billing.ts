import { FREE_SPLIT_LIMIT, SANDBOX_AMOUNT_PAISE, type BillingStatus } from '../billingTypes';
import { adminCredential, inTransaction, readDocument, documentWrite, ServerError } from './firebaseAdmin';
import { invalidateBillingAccount, readBillingAccount } from './billingCache';

type Subscription = { id:string; plan_id:string; status:string; notes?:{firebase_uid?:string}; has_scheduled_changes?:boolean; paid_count?:number };
export function billingConfigured() { return process.env.RAZORPAY_MODE === 'test' && !!process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') && !!process.env.RAZORPAY_KEY_SECRET && !!process.env.RAZORPAY_PLAN_ID && !!process.env.RAZORPAY_WEBHOOK_SECRET && !!adminCredential(); }
export const billingEnforced = () => process.env.BILLING_ENABLED === 'true';
function requireConfig() { if (!billingConfigured()) throw new ServerError(503,'Sandbox billing is not configured.'); }
export async function razorpay<T = any>(path:string, body?:unknown):Promise<T> {
  requireConfig();
  const response=await fetch(`https://api.razorpay.com/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Basic ${btoa(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`)}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new ServerError(502,`Razorpay sandbox request failed (${response.status}). Please retry.`);
  return response.json();
}
export async function verifySignature(body:string, signature:string, secret:string) {
  if(!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const bytes=Uint8Array.from(signature.match(/../g)!,value=>parseInt(value,16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(body));
}
export function paidThrough(invoices:any[],subscriptionId:string) {
  return invoices.reduce((end,invoice)=>invoice.subscription_id===subscriptionId && invoice.status==='paid' && invoice.currency==='INR' && invoice.amount_paid===SANDBOX_AMOUNT_PAISE && invoice.amount_due===0 && typeof invoice.billing_end==='number' && invoice.billing_end>0 ? Math.max(end,invoice.billing_end*1000):end,0);
}
// Only the trusted server or Firebase Console can set this field. Firestore
// rules deny client writes to billingAccounts, including owner writes.
export function hasPlusAccess(account:Record<string,any>|null,now=Date.now()) {
  return account?.manualPlusAccess===true || (typeof account?.paidUntil==='number' && account.paidUntil>now);
}
export async function billingStatus(uid:string, fresh=false):Promise<BillingStatus> {
  const configured=billingConfigured(), enforced=billingEnforced();
  const saved=adminCredential()?await readBillingAccount(uid,fresh):null;
  const paidUntil=typeof saved?.paidUntil==='number'?saved.paidUntil:null;
  const manuallyGranted=saved?.manualPlusAccess===true;
  const premium=hasPlusAccess(saved);
  return {configured,enforced,mode:'test',amountPaise:100,currency:'INR',premium,paidUntil,subscriptionId:saved?.subscriptionId||null,status:saved?.status||'free',cancellationScheduled:!!saved?.cancellationScheduled,splitLimit:premium||!enforced?null:FREE_SPLIT_LIMIT,testAccessDurationSeconds:saved?.mode==='test'&&saved?.testAccessDurationSeconds===60?60:null,accessSource:manuallyGranted?'manual':premium?'subscription':null};
}
export async function requirePremium(uid:string,knownStatus?:BillingStatus) {
  if(!billingEnforced())return;
  const status=knownStatus??await billingStatus(uid);
  if(status.accessSource==='manual')return;
  requireConfig();
  if(!status.premium)throw new ServerError(402,'Repday Plus is required. Open Profile to subscribe in Test Mode.');
}
export async function refreshSubscription(uid:string, id:string, eventId?:string) {
  requireConfig();
  if(!/^sub_[a-zA-Z0-9]+$/.test(id)) throw new ServerError(400,'Invalid subscription.');
  const mapping=await readDocument(`billingSubscriptions/${id}`);
  if(mapping?.uid!==uid)throw new ServerError(403,'This subscription belongs to another account.');
  const result=await inTransaction(async transaction=>{
    const previous=await readDocument(`billingAccounts/${uid}`,transaction);
    const seen=eventId?await readDocument(`billingEvents/${eventId}`,transaction):null;
    if(seen)return {result:null,writes:[]};
    if(previous?.subscriptionId!==id) return {result:null,writes:eventId?[documentWrite(`billingEvents/${eventId}`,{subscriptionId:id,ignored:true,at:Date.now()})]:[]};
    // Fetch canonical provider state while holding the account transaction. Replayed
    // or reordered webhooks cannot replace a newer subscription or paid period.
    const subscription=await razorpay<Subscription>(`subscriptions/${id}`);
    if(subscription.plan_id!==process.env.RAZORPAY_PLAN_ID||subscription.notes?.firebase_uid!==uid)throw new ServerError(403,'Subscription verification failed.');
    const first=await razorpay<{items:any[]}>(`invoices?subscription_id=${id}&count=100`);
    const second=first.items.length===100?await razorpay<{items:any[]}>(`invoices?subscription_id=${id}&count=100&skip=100`):{items:[]};
    const invoices=[...first.items,...second.items];
    if((subscription.paid_count||0)>invoices.filter(invoice=>invoice.status==='paid').length)throw new ServerError(503,'Payment invoices are still updating. Please refresh shortly.');
    const invoicePaidUntil=paidThrough(invoices,id);
    // An admin-enabled, per-account sandbox cap. It starts on the first verified
    // paid invoice and is persisted so reloads/webhooks never restart the minute.
    const shortTest=previous?.mode==='test' && previous?.testAccessDurationSeconds===60;
    const testAccessExpiresAt=shortTest && invoicePaidUntil>0
      ? (typeof previous?.testAccessExpiresAt==='number' ? previous.testAccessExpiresAt : Date.now()+60000)
      : null;
    const paidUntil=testAccessExpiresAt===null?invoicePaidUntil:Math.min(invoicePaidUntil,testAccessExpiresAt);
    const changes={subscriptionId:id,status:subscription.status,paidUntil:paidUntil||null,testAccessExpiresAt,cancellationScheduled:['cancelled','completed','expired'].includes(subscription.status)?false:!!previous?.cancellationScheduled,mode:'test'};
    const changed=Object.entries(changes).some(([key,value])=>previous?.[key]!==value);
    const value=changed?{...previous,...changes,updatedAt:Date.now()}:previous;
    return {result:value,writes:[...(changed?[documentWrite(`billingAccounts/${uid}`,value)]:[]),...(eventId?[documentWrite(`billingEvents/${eventId}`,{subscriptionId:id,at:Date.now()})]:[])]};
  });
  await invalidateBillingAccount(uid);
  return result;
}
export async function subscribe(uid:string) {
  requireConfig();
  const lease=crypto.randomUUID();
  const existing=await inTransaction(async transaction=>{
    const account=await readDocument(`billingAccounts/${uid}`,transaction);
    if((account?.deletingUntil||0)>Date.now())throw new ServerError(409,'Account deletion is in progress.');
    if(account?.manualPlusAccess===true)throw new ServerError(409,'This account already has complimentary Repday Plus access.');
    if(account?.subscriptionId)return {result:account.subscriptionId as string,writes:[]};
    if((account?.creatingUntil||0)>Date.now())throw new ServerError(409,'Checkout is being prepared. Retry in a moment.');
    return {result:null,writes:[documentWrite(`billingAccounts/${uid}`,{...account,creatingUntil:Date.now()+60000,lease})]};
  });
  if(existing){
    await refreshSubscription(uid,existing);
    const current=await billingStatus(uid);
    if(['created','authenticated'].includes(current.status))return existing;
    if(!['cancelled','completed','expired'].includes(current.status)||current.premium)throw new ServerError(409,'You already have a subscription. Refresh or manage it in Profile.');
    await inTransaction(async transaction=>{
      const account=await readDocument(`billingAccounts/${uid}`,transaction);
      if(account?.subscriptionId!==existing||(account?.deletingUntil||0)>Date.now())throw new ServerError(409,'Subscription changed. Retry.');
      return {result:null,writes:[documentWrite(`billingAccounts/${uid}`,{...account,subscriptionId:null,creatingUntil:Date.now()+60000,lease})]};
    });
    await invalidateBillingAccount(uid);
  }
  let created:Subscription|undefined;
  try{
    const plan=await razorpay(`plans/${process.env.RAZORPAY_PLAN_ID}`);
    if(plan.period!=='monthly'||plan.interval!==1||plan.item?.amount!==100||plan.item?.currency!=='INR')throw new ServerError(503,'The sandbox plan must be ₹1/month.');
    created=await razorpay<Subscription>('subscriptions',{plan_id:process.env.RAZORPAY_PLAN_ID,total_count:120,quantity:1,customer_notify:1,notes:{firebase_uid:uid}});
    const id=created.id;
    await inTransaction(async transaction=>{
      const account=await readDocument(`billingAccounts/${uid}`,transaction);
      if(account?.lease!==lease||(account.deletingUntil||0)>Date.now())throw new ServerError(409,'Checkout changed. Please retry.');
      return {result:null,writes:[documentWrite(`billingAccounts/${uid}`,{...account,subscriptionId:id,status:'created',paidUntil:null,testAccessExpiresAt:null,cancellationScheduled:false,creatingUntil:0,mode:'test',updatedAt:Date.now()}),documentWrite(`billingSubscriptions/${id}`,{uid,createdAt:Date.now()})]};
    });
    await invalidateBillingAccount(uid);
    return id;
  }catch(error){
    if(created)await razorpay(`subscriptions/${created.id}/cancel`,{cancel_at_cycle_end:false}).catch(()=>{});
    await inTransaction(async transaction=>{const account=await readDocument(`billingAccounts/${uid}`,transaction);return {result:null,writes:account?.lease===lease?[documentWrite(`billingAccounts/${uid}`,{creatingUntil:0},true)]:[]};}).catch(()=>{});
    await invalidateBillingAccount(uid);
    throw error;
  }
}
export async function cancelSubscription(uid:string, deleting=false) {
  if(!adminCredential()){if(billingEnforced())requireConfig();return;}
  const account=await inTransaction(async transaction=>{
    const saved=await readDocument(`billingAccounts/${uid}`,transaction);
    if((saved?.creatingUntil||0)>Date.now())throw new ServerError(409,'Checkout is being prepared. Wait a moment before deleting your account.');
    return {result:saved,writes:deleting?[documentWrite(`billingAccounts/${uid}`,{deletingUntil:Date.now()+120000},true)]:[]};
  });
  if(deleting)await invalidateBillingAccount(uid);
  if(!account?.subscriptionId)return;
  requireConfig();
  const subscription=await razorpay<Subscription>(`subscriptions/${account.subscriptionId}`);
  if(subscription.notes?.firebase_uid!==uid)throw new ServerError(403,'Subscription verification failed.');
  if(!['cancelled','completed','expired'].includes(subscription.status)) {
    const atEnd=!deleting && subscription.status==='active';
    if(!atEnd||!account.cancellationScheduled){
      await razorpay(`subscriptions/${subscription.id}/cancel`,{cancel_at_cycle_end:atEnd});
      await inTransaction(async transaction=>{const saved=await readDocument(`billingAccounts/${uid}`,transaction);if(saved?.subscriptionId!==subscription.id)throw new ServerError(409,'Subscription changed. Refresh your status.');return {result:null,writes:[documentWrite(`billingAccounts/${uid}`,{cancellationScheduled:atEnd},true)]};});
      await invalidateBillingAccount(uid);
    }
  }
  await refreshSubscription(uid,account.subscriptionId);
}
