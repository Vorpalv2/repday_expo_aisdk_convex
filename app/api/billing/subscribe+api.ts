import { billingUser,billingError,billingResponse } from '../../../lib/server/billingAuth';
import { billingAmountPaise,billingMode,subscriptionCheckout } from '../../../lib/server/billing';
export async function POST(request:Request){let stage='session';try{const {uid,email}=await billingUser(request);stage='checkout';const checkout=await subscriptionCheckout(uid);return billingResponse({...checkout,keyId:process.env.RAZORPAY_KEY_ID,email,mode:billingMode(),amountPaise:billingAmountPaise()});}catch(error){return billingError(error,stage);}}
