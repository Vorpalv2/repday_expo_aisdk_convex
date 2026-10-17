import { billingUser,billingError,billingResponse } from '../../../lib/server/billingAuth';
import { cancelSubscription } from '../../../lib/server/billing';
export async function POST(request:Request){try{const {uid}=await billingUser(request);await cancelSubscription(uid,true); return billingResponse({cancelled:true});}catch(error){return billingError(error);}}
