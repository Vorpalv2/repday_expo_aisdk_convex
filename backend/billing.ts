import { Platform } from 'react-native';
import { auth } from './firebase/client';
import { getApiBaseUrl } from './ai';
import type { BillingStatus } from '../lib/billingTypes';
export class BillingApiError extends Error { constructor(message:string,public status:number){super(message);} }
export async function billingRequest<T=BillingStatus>(path:string,body?:unknown):Promise<T> {
 const user=auth?.currentUser;if(!user)throw new BillingApiError('Sign in to continue.',401);
 const token=await user.getIdToken();
 const response=await fetch(`${getApiBaseUrl()}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 let data:any;try{data=await response.json();}catch{throw new Error('Could not reach subscription services. Please retry.');}
 if(!response.ok)throw new BillingApiError(data.error||'Subscription request failed.',response.status);
 return data;
}
let scriptPromise:Promise<void>|null=null;
async function loadCheckout(){
 if((window as any).Razorpay)return;
 if(scriptPromise)return scriptPromise;
 scriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;const timeout=setTimeout(()=>{script.remove();scriptPromise=null;reject(new Error('Checkout took too long to load. Please retry.'));},15000);script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);script.remove();scriptPromise=null;reject(new Error('Could not load Razorpay checkout. Please retry.'));};document.head.appendChild(script);});
 return scriptPromise;
}
export async function startSandboxCheckout():Promise<BillingStatus|null>{
 if(Platform.OS!=='web')throw new Error('Open Repday in your browser to use sandbox checkout.');
 await loadCheckout();
 const data=await billingRequest<{subscriptionId:string;keyId:string;email:string;mode:string}>('/api/billing/subscribe',{});
 if(data.mode!=='test'||!data.keyId.startsWith('rzp_test_'))throw new Error('Only Test Mode checkout is enabled.');
 return new Promise((resolve,reject)=>{
 let verifying=false;
 const checkout=new (window as any).Razorpay({key:data.keyId,subscription_id:data.subscriptionId,name:'Repday Plus',image:'https://repday.expo.app/icons/repday-login-192.png',description:'₹1/month · Test Mode · No real money',prefill:{email:data.email},theme:{color:'#3478f6'},handler:async(response:unknown)=>{verifying=true;try{resolve(await billingRequest('/api/billing/verify',response));}catch(error){reject(error);}},modal:{ondismiss:()=>{if(!verifying)resolve(null);}}});
 checkout.on('payment.failed',()=>{reject(new Error('Test payment failed. You can retry checkout.'));checkout.close();});checkout.open();
 });
}
