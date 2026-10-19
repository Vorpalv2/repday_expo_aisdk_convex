import { FREE_SPLIT_LIMIT, SANDBOX_AMOUNT_PAISE, type BillingStatus } from '../billingTypes';
import { adminCredential, readDocument, documentWrite, documentDelete, readVersionedDocument, conditionalDocumentWrite, commitWrites, listDocuments, ServerError } from './firebaseAdmin';
import { invalidateBillingAccount, readBillingAccount } from './billingCache';

type Subscription = { id:string; plan_id:string; status:string; notes?:{firebase_uid?:string}; has_scheduled_changes?:boolean; paid_count?:number };
export const billingMode = () => process.env.RAZORPAY_MODE === 'live' ? 'live' as const : 'test' as const;
export const accountMatchesBillingMode = (account:Record<string,any>|null) => account?.mode===billingMode() || (billingMode()==='test'&&!account?.mode);
export function currentBillingAccount(account:Record<string,any>|null):Record<string,any>|null {
  if(!account||accountMatchesBillingMode(account))return account;
  return {...account,subscriptionId:null,status:'free',paidUntil:null,cancellationScheduled:false,testAccessDurationSeconds:null,testAccessExpiresAt:null,planId:null,amountPaise:null};
}
export function billingConfigured() { return ['test','live'].includes(process.env.RAZORPAY_MODE||'') && !!process.env.RAZORPAY_KEY_ID?.startsWith(`rzp_${billingMode()}_`) && !!process.env.RAZORPAY_KEY_SECRET && !!process.env.RAZORPAY_PLAN_ID && !!process.env.RAZORPAY_WEBHOOK_SECRET && !!adminCredential(); }
export function billingAmountPaise() {
  const configured=Number(process.env.RAZORPAY_PLAN_AMOUNT_PAISE);
  return Number.isSafeInteger(configured)&&configured>0?configured:SANDBOX_AMOUNT_PAISE;
}
export const billingEnforced = () => process.env.BILLING_ENABLED === 'true';
function requireConfig() { if (!billingConfigured()) throw new ServerError(503,'Billing is not configured.'); }
export async function razorpay<T = any>(path:string, body?:unknown):Promise<T> {
  requireConfig();
  const response=await fetch(`https://api.razorpay.com/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Basic ${btoa(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`)}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new ServerError(502,`Razorpay request failed (${response.status}). Please retry.`);
  return response.json();
}
export async function verifySignature(body:string, signature:string, secret:string) {
  if(!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const bytes=Uint8Array.from(signature.match(/../g)!,value=>parseInt(value,16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(body));
}
export function paidThrough(invoices:any[],subscriptionId:string,amountPaise=billingAmountPaise()) {
  return invoices.reduce((end,invoice)=>invoice.subscription_id===subscriptionId && invoice.status==='paid' && invoice.currency==='INR' && invoice.amount_paid===amountPaise && invoice.amount_due===0 && typeof invoice.billing_end==='number' && invoice.billing_end>0 ? Math.max(end,invoice.billing_end*1000):end,0);
}
// Only the trusted server or Firebase Console can set this field. Firestore
// rules deny client writes to billingAccounts, including owner writes.
export function hasPlusAccess(account:Record<string,any>|null,now=Date.now()) {
  return account?.manualPlusAccess===true || (accountMatchesBillingMode(account) && typeof account?.paidUntil==='number' && account.paidUntil>now);
}
export function billingStatusFromAccount(saved:Record<string,any>|null):BillingStatus {
  saved=currentBillingAccount(saved);
  const configured=billingConfigured(), enforced=billingEnforced();
  const paidUntil=typeof saved?.paidUntil==='number'?saved.paidUntil:null;
  const manuallyGranted=saved?.manualPlusAccess===true;
  const premium=hasPlusAccess(saved);
  return {configured,enforced,mode:billingMode(),amountPaise:billingAmountPaise(),currency:'INR',premium,paidUntil,subscriptionId:saved?.subscriptionId||null,status:saved?.status||'free',cancellationScheduled:!!saved?.cancellationScheduled,splitLimit:premium||!enforced?null:FREE_SPLIT_LIMIT,testAccessDurationSeconds:billingMode()==='test'&&saved?.mode==='test'&&saved?.testAccessDurationSeconds===60?60:null,accessSource:manuallyGranted?'manual':premium?'subscription':null};
}
export async function billingStatus(uid:string, fresh=false):Promise<BillingStatus> {
  return billingStatusFromAccount(adminCredential()?await readBillingAccount(uid,fresh):null);
}
export async function requirePremium(uid:string,knownStatus?:BillingStatus) {
  if(!billingEnforced())return;
  const status=knownStatus??await billingStatus(uid);
  if(status.accessSource==='manual')return;
  requireConfig();
  if(!status.premium)throw new ServerError(402,'Repday Plus is required. Open Profile to subscribe.');
}
export async function refreshSubscription(uid:string, id:string, eventId?:string, knownSnapshot?:Awaited<ReturnType<typeof readVersionedDocument>>) {
  requireConfig();
  if(!/^sub_[a-zA-Z0-9]+$/.test(id)) throw new ServerError(400,'Invalid subscription.');
  const mapping=await readDocument(`billingSubscriptions/${id}`);
  if(mapping?.uid!==uid)throw new ServerError(403,'This subscription belongs to another account.');
  const path=`billingAccounts/${uid}`;
  const snapshot=knownSnapshot??await readVersionedDocument(path);
  const previous=snapshot.data;
  if(eventId&&await readDocument(`billingEvents/${eventId}`))return previous;
  const eventWrite=eventId?[conditionalDocumentWrite(`billingEvents/${eventId}`,{subscriptionId:id,ignored:previous?.subscriptionId!==id||!accountMatchesBillingMode(previous),at:Date.now()},null)]:[];
  if(previous?.subscriptionId!==id||!accountMatchesBillingMode(previous)){
    if(eventWrite.length)await commitWrites(eventWrite);
    return previous;
  }
  const subscription=await razorpay<Subscription>(`subscriptions/${id}`);
  if(subscription.plan_id!==(previous?.planId||process.env.RAZORPAY_PLAN_ID)||subscription.notes?.firebase_uid!==uid)throw new ServerError(403,'Subscription verification failed.');
  let changes:Record<string,unknown>;
  if(subscription.status==='created'){
    changes={subscriptionId:id,status:'created',paidUntil:null,testAccessExpiresAt:null,cancellationScheduled:false,mode:billingMode()};
  }else{
    const first=await razorpay<{items:any[]}>(`invoices?subscription_id=${id}&count=100`);
    const second=first.items.length===100?await razorpay<{items:any[]}>(`invoices?subscription_id=${id}&count=100&skip=100`):{items:[]};
    const invoices=[...first.items,...second.items];
    if((subscription.paid_count||0)>invoices.filter(invoice=>invoice.status==='paid').length)throw new ServerError(503,'Payment invoices are still updating. Please refresh shortly.');
    const invoicePaidUntil=paidThrough(invoices,id,previous?.amountPaise||billingAmountPaise());
    // Persist the first verified deadline; refreshes never restart sandbox time.
    const shortTest=billingMode()==='test'&&previous?.mode==='test'&&previous?.testAccessDurationSeconds===60;
    const testAccessExpiresAt=shortTest&&invoicePaidUntil>0?(typeof previous?.testAccessExpiresAt==='number'?previous.testAccessExpiresAt:Date.now()+60000):null;
    const paidUntil=testAccessExpiresAt===null?invoicePaidUntil:Math.min(invoicePaidUntil,testAccessExpiresAt);
    changes={subscriptionId:id,status:subscription.status,paidUntil:paidUntil||null,testAccessExpiresAt,cancellationScheduled:['cancelled','completed','expired'].includes(subscription.status)?false:!!previous?.cancellationScheduled,mode:billingMode()};
  }
  if(previous?.retryingSubscriptionId===id&&['cancelled','active','authenticated','completed','expired'].includes(subscription.status)){changes.creatingUntil=0;changes.retryingSubscriptionId=null;}
  const changed=Object.entries(changes).some(([key,value])=>previous?.[key]!==value);
  const value=changed?{...previous,...changes,updatedAt:Date.now()}:previous;
  if(changed||eventWrite.length){
    // Compare the account version even for an event-only write. Reordered
    // snapshots cannot overwrite a newer subscription/entitlement/manual grant.
    await commitWrites([conditionalDocumentWrite(path,value!,snapshot.version),...eventWrite]);
  }
  await invalidateBillingAccount(uid);
  return value;
}
export async function subscriptionCheckout(uid:string) {
  requireConfig();
  const path=`billingAccounts/${uid}`;
  const snapshot=await readVersionedDocument(path);
  const account=currentBillingAccount(snapshot.data);
  if(account?.manualPlusAccess===true)throw new ServerError(409,'This account already has complimentary Repday Plus access.');
  if((account?.deletingUntil||0)>Date.now())throw new ServerError(409,'Account deletion is in progress.');
  if((account?.creatingUntil||0)>Date.now())throw new ServerError(409,'Checkout is being prepared. Retry in a moment.');
  if(hasPlusAccess(account))throw new ServerError(409,'You already have paid access. Refresh or manage it in Profile.','SUBSCRIPTION_REFRESH_REQUIRED');
  if(account?.subscriptionId){
    const checkout=await razorpay<Subscription>(`subscriptions/${account.subscriptionId}`);
    if(checkout.notes?.firebase_uid!==uid)throw new ServerError(403,'This subscription belongs to another account.');
    if(['created','authenticated'].includes(checkout.status)&&checkout.plan_id===process.env.RAZORPAY_PLAN_ID)return {subscriptionId:checkout.id,resuming:true};
    const terminal=['cancelled','completed','expired'].includes(checkout.status);
    if(!terminal&&!(checkout.status==='created'&&checkout.plan_id!==process.env.RAZORPAY_PLAN_ID))throw new ServerError(409,'You already have a subscription. Refresh or manage it in Profile.','SUBSCRIPTION_REFRESH_REQUIRED');
  }
  // The precondition atomically acquires the lease only if the account has not
  // changed since our read (including concurrent deletion/manual access).
  const lease=crypto.randomUUID();
  const acquired=await commitWrites([conditionalDocumentWrite(path,{...account,creatingUntil:Date.now()+60000,lease},snapshot.version)]);
  const leaseVersion=acquired.writeResults?.[0]?.updateTime;
  if(typeof leaseVersion!=='string')throw new ServerError(503,'Could not confirm checkout reservation. Retry shortly.');
  let created:Subscription|undefined;
  try{
    const plan=await razorpay(`plans/${process.env.RAZORPAY_PLAN_ID}`);
    if(plan.period!=='monthly'||plan.interval!==1||plan.item?.amount!==billingAmountPaise()||plan.item?.currency!=='INR')throw new ServerError(503,`The subscription plan must be INR ${billingAmountPaise()/100}/month.`);
    created=await razorpay<Subscription>('subscriptions',{plan_id:process.env.RAZORPAY_PLAN_ID,total_count:120,quantity:1,customer_notify:1,notes:{firebase_uid:uid}});
    const id=created.id;
    // Account and ownership mapping commit together. A changed lease/account
    // rejects the entire commit, so an overlapping action cannot be overwritten.
    await commitWrites([
      conditionalDocumentWrite(path,{...account,subscriptionId:id,status:'created',paidUntil:null,testAccessExpiresAt:null,cancellationScheduled:false,creatingUntil:0,retryingSubscriptionId:null,lease,mode:billingMode(),planId:process.env.RAZORPAY_PLAN_ID,amountPaise:billingAmountPaise(),testAccessDurationSeconds:null,updatedAt:Date.now()},leaseVersion),
      documentWrite(`billingSubscriptions/${id}`,{uid,createdAt:Date.now()})
    ]);
    await invalidateBillingAccount(uid);
    return {subscriptionId:id,resuming:false};
  }catch(error){
    if(created)await razorpay(`subscriptions/${created.id}/cancel`,{cancel_at_cycle_end:false}).catch(()=>{});
    await commitWrites([conditionalDocumentWrite(path,{creatingUntil:0},leaseVersion,true)]).catch(()=>{});
    await invalidateBillingAccount(uid);
    throw error;
  }
}
export async function subscribe(uid:string){return (await subscriptionCheckout(uid)).subscriptionId;}
export async function cancelSubscription(uid:string, deleting=false) {
  if(!adminCredential()){if(billingEnforced())requireConfig();return;}
  const path=`billingAccounts/${uid}`;
  const snapshot=await readVersionedDocument(path);
  const account=currentBillingAccount(snapshot.data);
  if((account?.creatingUntil||0)>Date.now())throw new ServerError(409,'Checkout is being prepared. Wait a moment before deleting your account.');
  if(deleting){
    await commitWrites([conditionalDocumentWrite(path,{...account,deletingUntil:Date.now()+120000},snapshot.version)]);
  }
  if(!account?.subscriptionId){
    if(deleting)await purgeBillingRecords(uid);
    return account;
  }
  requireConfig();
  let subscription=await razorpay<Subscription>(`subscriptions/${account.subscriptionId}`);
  if(subscription.notes?.firebase_uid!==uid)throw new ServerError(403,'Subscription verification failed.');
  let scheduled=!!account.cancellationScheduled;
  if(!['cancelled','completed','expired'].includes(subscription.status)){
    const atEnd=!deleting&&subscription.status==='active';
    if(!atEnd||!scheduled){
      subscription=await razorpay<Subscription>(`subscriptions/${subscription.id}/cancel`,{cancel_at_cycle_end:atEnd});
      scheduled=atEnd;
    }
  }else scheduled=false;
  if(deleting){
    await purgeBillingRecords(uid);
    return account;
  }
  const changes={status:subscription.status,cancellationScheduled:scheduled,updatedAt:Date.now()};
  // Preserve the already-verified paidUntil. Cancelling renewal must not revoke
  // the remaining paid period, and requires no second invoice reconciliation.
  const value={...account,...changes};
  await commitWrites([conditionalDocumentWrite(path,value,snapshot.version)]);
  await invalidateBillingAccount(uid);
  return value;
}

// Remove Repday-owned billing metadata after the provider subscription has
// been cancelled. Razorpay's own payment records remain with Razorpay where
// legally required; they are never treated as Repday entitlement records.
export async function purgeBillingRecords(uid:string) {
  const mappings=await listDocuments('', 'billingSubscriptions');
  const owned=mappings.filter(row=>row.data.uid===uid);
  const subscriptionIds=new Set(owned.map(row=>row.id));
  const events=await listDocuments('', 'billingEvents');
  const writes=[documentDelete(`billingAccounts/${uid}`),documentDelete(`splitQuotas/${uid}`),...owned.map(row=>documentDelete(`billingSubscriptions/${row.id}`)),...events.filter(row=>subscriptionIds.has(row.data.subscriptionId)).map(row=>documentDelete(`billingEvents/${row.id}`))];
  for(let start=0;start<writes.length;start+=400) await commitWrites(writes.slice(start,start+400));
}
