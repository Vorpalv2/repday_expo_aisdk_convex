import { Platform } from 'react-native';
import { auth } from './firebase/client';
import { getApiBaseUrl } from './ai';
import type { BillingStatus } from '../lib/billingTypes';
export class BillingApiError extends Error { constructor(message:string,public status:number,public code=''){super(message);} }
export async function billingRequest<T=BillingStatus>(path:string,body?:unknown):Promise<T> {
 const user=auth?.currentUser;if(!user)throw new BillingApiError('Sign in to continue.',401);
 const token=await user.getIdToken();
 const response=await fetch(`${getApiBaseUrl()}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 let data:any;try{data=await response.json();}catch{throw new Error('Could not reach subscription services. Please retry.');}
 if(!response.ok)throw new BillingApiError(data.error||'Subscription request failed.',response.status,data.code||'');
 return data;
}
let scriptPromise:Promise<void>|null=null;
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function loadCheckout(){
 if((window as any).Razorpay)return;
 if(scriptPromise)return scriptPromise;
 scriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;const timeout=setTimeout(()=>{script.remove();scriptPromise=null;reject(new Error('Checkout took too long to load. Please retry.'));},15000);script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);script.remove();scriptPromise=null;reject(new Error('Could not load Razorpay checkout. Please retry.'));};document.head.appendChild(script);});
 return scriptPromise;
}
export async function startCheckout():Promise<BillingStatus|null>{
 if(Platform.OS!=='web')throw new Error('Open Repday in your browser to subscribe.');
 let data:{subscriptionId:string;keyId:string;email:string;mode:string;amountPaise:number};
 try{data=await billingRequest('/api/billing/subscribe',{});}catch(error){
  if(error instanceof BillingApiError&&error.code==='SUBSCRIPTION_REFRESH_REQUIRED'){
   const status=await billingRequest<BillingStatus>('/api/billing/refresh',{});
   if(status.premium)return status;
   throw new Error(status.paidUntil&&status.paidUntil<=Date.now()?'The paid access period has ended. Manage your subscription in Profile.':'Your subscription is pending payment confirmation. Please refresh access shortly.');
  }
  throw error;
 }
 if(!['test','live'].includes(data.mode)||!data.keyId.startsWith(`rzp_${data.mode}_`))throw new Error('Checkout configuration is invalid. Please retry.');
 await loadCheckout();
 return new Promise((resolve,reject)=>{
 let verifying=false;
 const checkout=new (window as any).Razorpay({key:data.keyId,subscription_id:data.subscriptionId,name:'Repday Plus',image:'https://repday.expo.app/icons/repday-login-192.png',description:`₹${data.amountPaise/100}/month${data.mode==='test'?' · Test Mode · No real money':''}`,prefill:{email:data.email},theme:{color:'#3478f6'},handler:async(response:unknown)=>{verifying=true;let lastError:unknown;for(let attempt=0;attempt<6;attempt+=1){try{const status=await billingRequest<BillingStatus>('/api/billing/verify',response);if(status.premium||attempt===5){resolve(status);return;}}catch(error){lastError=error;if(!(error instanceof BillingApiError)||![409,503].includes(error.status)||attempt===5)break;}await wait(2000);}reject(lastError instanceof Error?lastError:new Error('Subscription verification is still pending. Please retry shortly.'));},modal:{ondismiss:()=>{if(!verifying)void billingRequest<BillingStatus>('/api/billing/refresh',{}).then(status=>resolve(status.premium?status:null)).catch(()=>resolve(null));}}});
 checkout.on('payment.failed',()=>{reject(new Error('Payment failed. You can retry checkout.'));checkout.close();});checkout.open();
 });
}
