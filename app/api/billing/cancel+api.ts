import { billingUser,billingError,billingResponse } from '../../../lib/server/billingAuth';
import { cancelSubscription,billingStatusFromAccount } from '../../../lib/server/billing';
export async function POST(request:Request){try{const {uid}=await billingUser(request);const account=await cancelSubscription(uid);return billingResponse(billingStatusFromAccount(account??null));}catch(error){return billingError(error);}}
