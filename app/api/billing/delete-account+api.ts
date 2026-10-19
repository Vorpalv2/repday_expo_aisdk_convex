import { billingUser,billingError,billingResponse } from '../../../lib/server/billingAuth';
import { cancelSubscription } from '../../../lib/server/billing';
import { purgePushSubscriptions } from '../../../lib/server/webPush';
export async function POST(request:Request){try{const {uid}=await billingUser(request);await cancelSubscription(uid,true);await purgePushSubscriptions(uid);return billingResponse({cancelled:true});}catch(error){return billingError(error);}}
