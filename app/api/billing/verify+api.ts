import { billingUser,billingError,billingResponse,readBillingBody } from '../../../lib/server/billingAuth';
import { billingStatusFromAccount,refreshSubscription,verifySignature } from '../../../lib/server/billing';
import { ServerError } from '../../../lib/server/firebaseAdmin';
export async function POST(request:Request){try{const {uid}=await billingUser(request);const body=await readBillingBody(request);const id=body.razorpay_subscription_id;
if(typeof id!=='string'||!/^sub_[a-zA-Z0-9]+$/.test(id)||!/^pay_[a-zA-Z0-9]+$/.test(body.razorpay_payment_id)||typeof body.razorpay_signature!=='string'||!process.env.RAZORPAY_KEY_SECRET||!await verifySignature(`${body.razorpay_payment_id}|${id}`,body.razorpay_signature,process.env.RAZORPAY_KEY_SECRET))throw new ServerError(400,'Payment signature verification failed.');
const account=await refreshSubscription(uid,id);if(account?.subscriptionId!==id)throw new ServerError(409,'Subscription changed. Please refresh access.');return billingResponse(billingStatusFromAccount(account));}catch(error){return billingError(error);}}
