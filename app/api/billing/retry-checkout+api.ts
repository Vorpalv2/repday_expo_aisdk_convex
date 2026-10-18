import {billingUser,billingError,billingResponse,readBillingBody} from '../../../lib/server/billingAuth';
import {prepareCheckoutRetry,verifyCheckoutRetry,retireCheckoutRetry} from '../../../lib/server/billingRetry';
import {ServerError} from '../../../lib/server/firebaseAdmin';
export async function POST(request:Request){try{
 const {uid}=await billingUser(request);const body=await readBillingBody(request);
 if(body.action==='prepare')return billingResponse(await prepareCheckoutRetry(uid));
 if(body.action==='verify')return billingResponse(await verifyCheckoutRetry(uid,body.proof));
 if(body.action==='retire')return billingResponse(await retireCheckoutRetry(uid,body.proof));
 throw new ServerError(400,'Invalid checkout retry action.');
}catch(error){return billingError(error);}}
