import { billingError,billingResponse } from '../../../lib/server/billingAuth';
import { billingConfigured,refreshSubscription,verifySignature } from '../../../lib/server/billing';
import { readDocument,ServerError } from '../../../lib/server/firebaseAdmin';
export async function POST(request:Request){try{
 if(!billingConfigured())throw new ServerError(503,'Sandbox billing is not configured.');
 const raw=await request.text();if(raw.length>250000)throw new ServerError(413,'Webhook too large.');
 if(!await verifySignature(raw,request.headers.get('x-razorpay-signature')||'',process.env.RAZORPAY_WEBHOOK_SECRET!))throw new ServerError(401,'Invalid webhook signature.');
 let event:any;try{event=JSON.parse(raw);}catch{throw new ServerError(400,'Invalid webhook JSON.');}
 if(!event?.event?.startsWith('subscription.'))return billingResponse({received:true});
 const id=event.payload?.subscription?.entity?.id;
 if(typeof id!=='string'||!/^sub_[a-zA-Z0-9]+$/.test(id))throw new ServerError(400,'Invalid subscription event.');
 const owner=await readDocument(`billingSubscriptions/${id}`);
 if(!owner?.uid)throw new ServerError(503,'Subscription mapping not ready. Retry delivery.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('x-razorpay-event-id')||raw));
 const eventId=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 await refreshSubscription(owner.uid,id,eventId);return billingResponse({received:true});
}catch(error){return billingError(error);}}
