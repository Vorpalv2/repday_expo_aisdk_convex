import {billingUser,billingError,billingResponse,readBillingBody} from '../../lib/server/billingAuth';
import {saveSplits} from '../../lib/server/splits';
export async function POST(request:Request){try{const {uid}=await billingUser(request,'splits');return billingResponse(await saveSplits(uid,await readBillingBody(request)));}catch(error){return billingError(error);}}
