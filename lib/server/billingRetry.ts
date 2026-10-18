import { billingConfigured, billingMode, currentBillingAccount, hasPlusAccess, razorpay, verifySignature } from './billing';
import { readVersionedDocument, conditionalDocumentWrite, commitWrites, ServerError } from './firebaseAdmin';
import { invalidateBillingAccount } from './billingCache';

type Subscription={id:string;status:string;paid_count?:number;auth_attempts?:number;customer_id?:string;current_start?:number|null;current_end?:number|null;notes?:{firebase_uid?:string}};
type Payment={id:string;order_id:string;customer_id?:string;token_id?:string;status:string;method:string};
type Proof={uid:string;mode:string;subscriptionId:string;orderId:string;customerId:string;tokens:string[];verified:number;version:string;expires:number};
const blocked=()=>new ServerError(409,'This authorization is paid, pending, or not confirmed rejected. Please wait a little, then continue checkout again.','CHECKOUT_RETRY_BLOCKED');
const refreshRequired=()=>new ServerError(409,'Payment authorization changed. Please wait a little, then continue checkout again.','SUBSCRIPTION_REFRESH_REQUIRED');
function unpaidCreated(sub:Subscription){return sub.status==='created'&&sub.paid_count===0&&sub.auth_attempts===0&&!sub.current_start&&!sub.current_end;}
function owned(sub:Subscription,uid:string,id:string){if(sub.id!==id||sub.notes?.firebase_uid!==uid)throw new ServerError(403,'Subscription verification failed.');}
function failedPayments(items:Payment[],orderId:string,customerId:string){
 if(!Array.isArray(items)||items.length===0||items.length>50||items.some(p=>p.order_id!==orderId||p.customer_id!==customerId||p.status!=='failed'||p.method!=='upi'||!/^token_[a-zA-Z0-9]+$/.test(p.token_id||'')))throw blocked();
 return [...new Set(items.map(p=>p.token_id!))].sort();
}
async function sign(payload:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(process.env.RAZORPAY_KEY_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`repday-checkout-retry:v1:${payload}`))),b=>b.toString(16).padStart(2,'0')).join('');
}
async function seal(proof:Proof){const payload=btoa(JSON.stringify(proof)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');return `${payload}.${await sign(payload)}`;}
async function unseal(uid:string,value:unknown):Promise<Proof>{
 if(typeof value!=='string'||value.length>12000)throw new ServerError(400,'Invalid retry verification.');
 const [payload,signature,...extra]=value.split('.');
 if(extra.length||!payload||!signature||!await verifySignature(`repday-checkout-retry:v1:${payload}`,signature,process.env.RAZORPAY_KEY_SECRET!))throw new ServerError(400,'Invalid retry verification.');
 let proof:Proof;try{proof=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));}catch{throw new ServerError(400,'Invalid retry verification.');}
 if(proof.uid!==uid||proof.mode!==billingMode())throw new ServerError(403,'Retry verification belongs to another account or environment.');
 if(!Number.isFinite(proof.expires)||proof.expires<Date.now())throw new ServerError(409,'Retry verification expired. Continue checkout again.','CHECKOUT_RETRY_EXPIRED');
 return proof;
}
async function accountForRetry(uid:string){
 const snapshot=await readVersionedDocument(`billingAccounts/${uid}`);const account=currentBillingAccount(snapshot.data);
 if(hasPlusAccess(account))throw refreshRequired();
 if((account?.deletingUntil||0)>Date.now()||(account?.creatingUntil||0)>Date.now())throw new ServerError(409,'Another billing operation is in progress. Retry shortly.','CHECKOUT_RETRY_BUSY');
 return {snapshot,account};
}
export async function prepareCheckoutRetry(uid:string){
 if(!billingConfigured())throw new ServerError(503,'Billing is not configured.');
 const {snapshot,account}=await accountForRetry(uid);const id=account?.subscriptionId;
 if(!id||['cancelled','completed','expired'].includes(account?.status))return {stage:'ready' as const};
 const sub=await razorpay<Subscription>(`subscriptions/${id}`);owned(sub,uid,id);
 if(['cancelled','completed','expired'].includes(sub.status)&&sub.paid_count===0)return {stage:'ready' as const};
 if(!unpaidCreated(sub))throw refreshRequired();
 const invoices=await razorpay<{items:any[]}>(`invoices?subscription_id=${id}&count=100`);
 // No invoice/payment attempt yet: reuse this checkout without cancelling it.
 if(Array.isArray(invoices.items)&&invoices.items.length===0)return {stage:'ready' as const};
 if(!Array.isArray(invoices.items)||invoices.items.length!==1)throw blocked();
 const invoice=invoices.items[0];
 if(invoice.amount_paid>0||invoice.status==='paid')throw refreshRequired();
 if(invoice.subscription_id!==id||invoice.status!=='issued'||invoice.amount_paid!==0||!(invoice.amount_due>0)||!/^order_[a-zA-Z0-9]+$/.test(invoice.order_id||''))throw blocked();
 const payments=await razorpay<{items:Payment[]}>(`orders/${invoice.order_id}/payments`);
 if(Array.isArray(payments.items)&&payments.items.length===0)return {stage:'ready' as const};
 if(payments.items?.some(payment=>['authorized','captured'].includes(payment.status)))throw refreshRequired();
 if(!/^cust_[a-zA-Z0-9]+$/.test(sub.customer_id||''))throw blocked();
 const tokens=failedPayments(payments.items,invoice.order_id,sub.customer_id!);
 const proof:Proof={uid,mode:billingMode(),subscriptionId:id,orderId:invoice.order_id,customerId:sub.customer_id!,tokens,verified:0,version:snapshot.version!,expires:Date.now()+60000};
 return {stage:'verify' as const,proof:await seal(proof)};
}
export async function verifyCheckoutRetry(uid:string,value:unknown){
 if(!billingConfigured())throw new ServerError(503,'Billing is not configured.');
 const proof=await unseal(uid,value);const end=Math.min(proof.verified+2,proof.tokens.length);
 for(let index=proof.verified;index<end;index++){
  const token=await razorpay<any>(`customers/${proof.customerId}/tokens/${proof.tokens[index]}`);
  if(token.id!==proof.tokens[index]||token.method!=='upi'||token.recurring!==false||!['rejected','cancelled'].includes(token.recurring_details?.status))throw blocked();
 }
 proof.verified=end;
 return {stage:end===proof.tokens.length?'retire' as const:'verify' as const,proof:await seal(proof)};
}
export async function retireCheckoutRetry(uid:string,value:unknown){
 if(!billingConfigured())throw new ServerError(503,'Billing is not configured.');
 const proof=await unseal(uid,value);
 if(proof.verified!==proof.tokens.length||proof.tokens.length===0)throw blocked();
 const {snapshot,account}=await accountForRetry(uid);const path=`billingAccounts/${uid}`;
 if(account?.subscriptionId!==proof.subscriptionId||snapshot.version!==proof.version)throw new ServerError(409,'Checkout changed. Continue checkout again.','CHECKOUT_RETRY_CHANGED');
 const lease=crypto.randomUUID();
 const claim=await commitWrites([conditionalDocumentWrite(path,{...account,creatingUntil:Date.now()+60000,retryingSubscriptionId:proof.subscriptionId,lease},snapshot.version)]);
 const version=claim.writeResults?.[0]?.updateTime;if(typeof version!=='string')throw new ServerError(503,'Could not confirm retry reservation.');
 let released=false;
 try{
  const sub=await razorpay<Subscription>(`subscriptions/${proof.subscriptionId}`);owned(sub,uid,proof.subscriptionId);
  if(!unpaidCreated(sub)||sub.customer_id!==proof.customerId)throw refreshRequired();
  const payments=await razorpay<{items:Payment[]}>(`orders/${proof.orderId}/payments`);
  const tokens=failedPayments(payments.items,proof.orderId,proof.customerId);
  if(JSON.stringify(tokens)!==JSON.stringify(proof.tokens))throw blocked();
  // Only explicitly rejected/cancelled initial authorizations reach this point.
  // No token records or payment history are deleted, and confirmed mandates are
  // never sent to a cancellation endpoint by this recovery flow.
  const cancelled=await razorpay<Subscription>(`subscriptions/${proof.subscriptionId}/cancel`,{cancel_at_cycle_end:false});
  owned(cancelled,uid,proof.subscriptionId);
  if(cancelled.status!=='cancelled'||cancelled.paid_count!==0||cancelled.auth_attempts!==0||cancelled.current_start||cancelled.current_end)throw refreshRequired();
  await commitWrites([conditionalDocumentWrite(path,{...account,status:'cancelled',creatingUntil:0,retryingSubscriptionId:null,lease,updatedAt:Date.now()},version)]);
  released=true;
  await invalidateBillingAccount(uid);
  return {stage:'ready' as const};
 }finally{
  if(!released)await commitWrites([conditionalDocumentWrite(path,{creatingUntil:0,retryingSubscriptionId:null},version,true)]).catch(()=>{});
 }
}
