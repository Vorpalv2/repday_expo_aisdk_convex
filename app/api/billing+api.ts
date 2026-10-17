import { billingUser,billingError,billingResponse } from '../../lib/server/billingAuth';
import { billingStatus } from '../../lib/server/billing';
// Status is a read. Paid periods are reconciled by signed checkout verification
// and webhooks; expiry is computed from paidUntil without another provider call.
export async function GET(request:Request){try{const {uid}=await billingUser(request,'billing',false);return billingResponse(await billingStatus(uid));}catch(error){return billingError(error);}}
