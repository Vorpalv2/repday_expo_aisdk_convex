import { billingUser,billingError,billingResponse,readBillingBody } from '../../../lib/server/billingAuth';
import { billingStatus,refreshSubscription,verifySignature } from '../../../lib/server/billing';
import { readDocument,ServerError } from '../../../lib/server/firebaseAdmin';
export async function POST(request:Request){try{const {uid}=await billingUser(request);const body=await readBillingBody(request);const account=await readDocument(`billingAccounts/${uid}`);const id=account?.subscriptionId;
if(!id||body.razorpay_subscription_id!==id||!/^pay_[a-zA-Z0-9]+$/.test(body.razorpay_payment_id)||typeof body.razorpay_signature!=='string'||!process.env.RAZORPAY_KEY_SECRET||!await verifySignature(`${body.razorpay_payment_id}|${id}`,body.razorpay_signature,process.env.RAZORPAY_KEY_SECRET))throw new ServerError(400,'Payment signature verification failed.');
await refreshSubscription(uid,id);return billingResponse(await billingStatus(uid));}catch(error){return billingError(error);}}
