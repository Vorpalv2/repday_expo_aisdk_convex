import {billingUser,billingError,billingResponse} from '../../../lib/server/billingAuth';
import {billingMode,currentBillingAccount,razorpay} from '../../../lib/server/billing';
import {readVersionedDocument,ServerError} from '../../../lib/server/firebaseAdmin';

type SubscriptionLookup={
 id:string;
 customer_id?:string;
 plan_id?:string;
 status?:string;
 notes?:{firebase_uid?:string};
};
type InvoiceLookup={
 id?:string;
 customer_id?:string;
 subscription_id?:string;
 order_id?:string;
 amount?:number;
 amount_paid?:number;
 amount_due?:number;
 currency?:string;
 status?:string;
 created_at?:number;
 date?:number;
 paid_at?:number|null;
 payment_id?:string;
 short_url?:string;
};

// This endpoint is intentionally on-demand. The profile page shows the Firebase
// UID locally; Razorpay identifiers are fetched only after the user opens the
// Account details dialog.
export async function GET(request:Request){
 try{
  const {uid}=await billingUser(request);
  const url=new URL(request.url);
  const skip=Math.max(0,Number.parseInt(url.searchParams.get('skip')??'0',10)||0);
  const requestedCount=Number.parseInt(url.searchParams.get('count')??'7',10)||7;
  const count=Math.min(30,Math.max(1,requestedCount));
  const snapshot=await readVersionedDocument(`billingAccounts/${uid}`);
  const account=currentBillingAccount(snapshot.data);
  const subscriptionId=typeof account?.subscriptionId==='string'?account.subscriptionId:null;
  if(!subscriptionId)return billingResponse({uid,mode:billingMode(),subscriptionId:null,customerId:null,planId:null,status:account?.status||'free',latestInvoiceId:null,latestPaymentId:null,transactions:[]});
  const subscription=await razorpay<SubscriptionLookup>(`subscriptions/${subscriptionId}`);
  if(subscription.notes?.firebase_uid!==uid)throw new ServerError(403,'Subscription verification failed.');
  const invoices=await razorpay<{items?:InvoiceLookup[]}>(`invoices?subscription_id=${encodeURIComponent(subscriptionId)}&count=${count}&skip=${skip}`);
  const transactions=(invoices.items??[]).filter(invoice=>!invoice.subscription_id||invoice.subscription_id===subscriptionId).map(invoice=>({
   invoiceId:invoice.id??null,
   orderId:invoice.order_id??null,
   paymentId:invoice.payment_id??null,
   amountPaise:typeof invoice.amount==='number'?invoice.amount:null,
   amountPaidPaise:typeof invoice.amount_paid==='number'?invoice.amount_paid:null,
   amountDuePaise:typeof invoice.amount_due==='number'?invoice.amount_due:null,
   currency:invoice.currency??'INR',
   status:invoice.status??'unknown',
   createdAt:typeof invoice.created_at==='number'?invoice.created_at:(typeof invoice.date==='number'?invoice.date:null),
   paidAt:typeof invoice.paid_at==='number'?invoice.paid_at:null,
   invoiceUrl:typeof invoice.short_url==='string'&&/^https:\/\//.test(invoice.short_url)?invoice.short_url:null,
  })).sort((a,b)=>(b.createdAt??0)-(a.createdAt??0));
  const latest=transactions[0];
  return billingResponse({
   uid,
   mode:billingMode(),
   subscriptionId,
   customerId:subscription.customer_id??invoices.items?.[0]?.customer_id??null,
   planId:subscription.plan_id??account?.planId??null,
   status:subscription.status??account?.status??'unknown',
   latestInvoiceId:latest?.invoiceId??null,
   latestPaymentId:latest?.paymentId??null,
   transactions,
   hasMore:(invoices.items??[]).length===count,
   nextSkip:(invoices.items??[]).length===count?skip+(invoices.items??[]).length:null,
  });
 }catch(error){return billingError(error,'account-details');}
}
