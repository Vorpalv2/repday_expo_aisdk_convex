import { billingUser,billingError,billingResponse } from '../../../lib/server/billingAuth';
import { cancelSubscription,requirePremium,billingStatus } from '../../../lib/server/billing';
export async function POST(request:Request){try{const {uid}=await billingUser(request);await cancelSubscription(uid); return billingResponse(await billingStatus(uid));}catch(error){return billingError(error);}}
