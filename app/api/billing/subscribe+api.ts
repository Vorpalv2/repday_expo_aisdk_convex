import { billingUser,billingError,billingResponse } from '../../../lib/server/billingAuth';
import { billingAmountPaise,subscribe } from '../../../lib/server/billing';
export async function POST(request:Request){let stage='session';try{const {uid,email}=await billingUser(request);stage='checkout';const subscriptionId=await subscribe(uid);return billingResponse({subscriptionId,keyId:process.env.RAZORPAY_KEY_ID,email,mode:'test',amountPaise:billingAmountPaise()});}catch(error){return billingError(error,stage);}}
