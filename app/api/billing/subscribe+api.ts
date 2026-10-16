import { billingUser,billingError,billingResponse } from '../../../lib/server/billingAuth';
import { subscribe } from '../../../lib/server/billing';
export async function POST(request:Request){try{const {uid,email}=await billingUser(request);const subscriptionId=await subscribe(uid);return billingResponse({subscriptionId,keyId:process.env.RAZORPAY_KEY_ID,email,mode:'test'});}catch(error){return billingError(error);}}
