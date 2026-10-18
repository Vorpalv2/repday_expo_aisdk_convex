import {billingUser,billingError,billingResponse} from '../../../lib/server/billingAuth';
import {billingStatusFromAccount,currentBillingAccount,refreshSubscription} from '../../../lib/server/billing';
import {readVersionedDocument} from '../../../lib/server/firebaseAdmin';

// Explicit reconciliation for checkout recovery and the user's Refresh access
// action. Reuse the authoritative account read to keep the cold path at 9 calls.
export async function POST(request:Request){
  try{
    const {uid}=await billingUser(request);
    const snapshot=await readVersionedDocument(`billingAccounts/${uid}`);
    const account=currentBillingAccount(snapshot.data);
    if(account?.manualPlusAccess===true||!account?.subscriptionId)return billingResponse(billingStatusFromAccount(account));
    const value=await refreshSubscription(uid,account.subscriptionId,undefined,snapshot);
    return billingResponse(billingStatusFromAccount(value));
  }catch(error){return billingError(error);}
}
