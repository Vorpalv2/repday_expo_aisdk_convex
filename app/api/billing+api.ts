import { billingUser,billingError,billingResponse } from '../../lib/server/billingAuth';
import { billingConfigured,billingStatus,refreshSubscription } from '../../lib/server/billing';
export async function GET(request:Request){try{const {uid}=await billingUser(request);let status=await billingStatus(uid,true);if(status.subscriptionId&&status.accessSource!=='manual'&&billingConfigured()){await refreshSubscription(uid,status.subscriptionId);status=await billingStatus(uid,true);}return billingResponse(status);}catch(error){return billingError(error);}}
