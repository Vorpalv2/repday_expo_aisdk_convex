import { billingUser,billingError,billingResponse } from '../../../lib/server/billingAuth';
import { cancelSubscription,requirePremium,billingStatus } from '../../../lib/server/billing';
export async function POST(request:Request){try{const {uid}=await billingUser(request);const status=await billingStatus(uid);await requirePremium(uid,status);return billingResponse(status);}catch(error){return billingError(error);}}
