import React,{useState} from 'react';
import { ActivityIndicator,Pressable,Text,View } from 'react-native';
import { billingRequest,startCheckout } from '../backend/billing';
import type { BillingStatus } from '../lib/billingTypes';

type Palette={ink:string;muted:string;surface:string;line:string;blue:string;button:string;buttonText:string};

export const PLUS_GOLD={background:'#e8bd57',ink:'#211b0e',border:'#c89528'};

const MEMBERSHIP_COLORS={
 background:'#111318',
 surface:'#1a1d24',
 surfaceStrong:'#20242d',
 ink:'#fffaf0',
 muted:'#aaa79f',
 goldSoft:'#f6e3a7',
 success:'#82d9a0',
 danger:'#ff9a9a',
 line:'rgba(232,189,87,.28)',
 softLine:'rgba(255,250,240,.10)',
};

export function PlusBadge({premium,compact=false}:{premium:boolean;compact?:boolean}){
 if(premium)return null;
 return <View pointerEvents="none" style={{position:'absolute',top:compact?-5:5,right:compact?-7:7,backgroundColor:PLUS_GOLD.background,borderRadius:8,paddingHorizontal:5,paddingVertical:2,borderWidth:1,borderColor:'#fff',zIndex:3}}><Text style={{color:PLUS_GOLD.ink,fontSize:8,fontWeight:'900',letterSpacing:.5}}>PLUS</Text></View>;
}

function Benefit({label}:{label:string}){
 return <View style={{minHeight:43,flexDirection:'row',alignItems:'center',gap:11,paddingHorizontal:12,borderRadius:14,backgroundColor:MEMBERSHIP_COLORS.surfaceStrong,borderWidth:1,borderColor:MEMBERSHIP_COLORS.softLine}}>
  <View style={{width:22,height:22,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(232,189,87,.14)',borderWidth:1,borderColor:MEMBERSHIP_COLORS.line}}><Text style={{fontSize:13,fontWeight:'900',color:PLUS_GOLD.background}}>✓</Text></View>
  <Text style={{flex:1,fontSize:14,fontWeight:'700',color:MEMBERSHIP_COLORS.ink}}>{label}</Text>
 </View>;
}

export function SubscriptionPanel({status,palette:_palette,onChange,onRefresh,onNotify,error:loadError,titleFont,onClose}:{status:BillingStatus|null;palette:Palette;onChange:(value:BillingStatus)=>void;onRefresh:()=>Promise<unknown>;onNotify:(message:string)=>void;error?:string;titleFont?:string;onClose?:()=>void}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[confirm,setConfirm]=useState(false);
 const [expanded,setExpanded]=useState(!!onClose);
 const manual=status?.accessSource==='manual';
 const premium=!!status?.premium;
 const monthlyPrice=status?status.amountPaise/100:75;
 const run=async(action:()=>Promise<void>,toastOnError=false)=>{if(busy)return;setBusy(true);setMessage('');try{await action();}catch(error){const detail=error instanceof Error?error.message:'Please retry.';setMessage(detail);if(toastOnError)onNotify(detail);}finally{setBusy(false);}};
 const button={backgroundColor:PLUS_GOLD.background,borderRadius:18,minHeight:50,alignItems:'center' as const,justifyContent:'center' as const,paddingHorizontal:18,borderWidth:1,borderColor:PLUS_GOLD.border};
 const statusText=manual?'Complimentary access':premium?'Membership active':'Unlock Repday Plus';
 const statusDetail=manual?'Full Plus access is granted to this account.':premium&&status?.paidUntil?`${status.cancellationScheduled||status.status==='cancelled'?'Access until':'Paid through'} ${new Date(status.paidUntil).toLocaleDateString()}`:'AI Coach, Form Inspection, Cyberpunk theme, and unlimited workout splits.';

 return <View accessibilityLabel="Repday Plus membership" style={{position:'relative',overflow:'hidden',backgroundColor:MEMBERSHIP_COLORS.background,borderRadius:expanded?28:22,padding:expanded?20:16,borderWidth:1.5,borderColor:PLUS_GOLD.border,gap:15,marginVertical:onClose?0:16,shadowColor:PLUS_GOLD.border,shadowOpacity:.18,shadowRadius:18,shadowOffset:{width:0,height:7},elevation:5}}>
  <View pointerEvents="none" style={{position:'absolute',width:150,height:150,borderRadius:75,right:-72,top:-88,backgroundColor:'rgba(232,189,87,.12)'}}/>
  <View pointerEvents="none" style={{position:'absolute',width:82,height:82,borderRadius:41,right:-38,top:6,borderWidth:1,borderColor:'rgba(232,189,87,.18)'}}/>

  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}>
   <Pressable accessibilityRole="button" accessibilityLabel={expanded?'Collapse Repday Plus membership':'Expand Repday Plus membership'} accessibilityState={{expanded}} disabled={!!onClose} onPress={()=>setExpanded(value=>!value)} style={{flex:1,minWidth:0}}>
    {expanded?<Text style={{fontSize:11,fontWeight:'800',letterSpacing:2,color:MEMBERSHIP_COLORS.muted}}>MEMBERSHIP</Text>:null}
    <View style={{flexDirection:'row',alignItems:'baseline',flexWrap:'wrap',gap:7,marginTop:expanded?2:0}}>
     <Text style={{fontSize:29,lineHeight:34,fontWeight:'900',fontFamily:titleFont,color:MEMBERSHIP_COLORS.ink}}>REPDAY</Text>
     <Text style={{fontSize:18,lineHeight:24,fontWeight:'900',letterSpacing:1.5,color:PLUS_GOLD.background}}>PLUS</Text>
    </View>
   </Pressable>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
    <View style={{backgroundColor:manual?PLUS_GOLD.background:'rgba(232,189,87,.13)',paddingHorizontal:10,paddingVertical:6,borderRadius:14,borderWidth:1,borderColor:manual?PLUS_GOLD.border:MEMBERSHIP_COLORS.line}}><Text style={{fontSize:10,fontWeight:'900',letterSpacing:.7,color:manual?PLUS_GOLD.ink:MEMBERSHIP_COLORS.goldSoft}}>{manual?'COMPLIMENTARY':status?.mode==='live'?'MEMBERSHIP':'TEST MODE'}</Text></View>
    {onClose?<Pressable accessibilityRole="button" accessibilityLabel="Close subscription popup" onPress={onClose} style={{width:34,height:34,borderRadius:17,backgroundColor:MEMBERSHIP_COLORS.surfaceStrong,borderWidth:1,borderColor:MEMBERSHIP_COLORS.softLine,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:22,lineHeight:25,color:MEMBERSHIP_COLORS.ink}}>×</Text></Pressable>:null}
    {!onClose?<Pressable accessibilityRole="button" accessibilityLabel={expanded?'Collapse Repday Plus membership':'Expand Repday Plus membership'} accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} hitSlop={8} style={{width:28,height:28,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:19,lineHeight:22,fontWeight:'800',color:MEMBERSHIP_COLORS.goldSoft,transform:[{rotate:expanded?'180deg':'0deg'}]}}>⌄</Text></Pressable>:null}
   </View>
  </View>

  {expanded?<>
  {!manual?<View style={{flexDirection:'row',alignItems:'flex-end',gap:6}}><Text style={{fontSize:34,lineHeight:39,fontWeight:'900',color:MEMBERSHIP_COLORS.ink}}>₹{monthlyPrice}</Text><Text style={{fontSize:14,lineHeight:24,color:MEMBERSHIP_COLORS.muted}}>/ month{status?.mode==='test'?' · sandbox':''}</Text></View>:null}

  <View style={{gap:8}}>
   <Benefit label="AI Coach"/>
   <Benefit label="Form Inspection"/>
   <Benefit label="Cyberpunk theme"/>
   <Benefit label="Unlimited workout splits"/>
   <Benefit label="Live cross-device sync"/>
   <Benefit label="Custom training plan builder"/>
  </View>

  <View style={{padding:13,borderRadius:17,backgroundColor:'rgba(232,189,87,.09)',borderWidth:1,borderColor:MEMBERSHIP_COLORS.line,flexDirection:'row',alignItems:'center',gap:11}}>
   <View style={{width:10,height:10,borderRadius:5,backgroundColor:premium?MEMBERSHIP_COLORS.success:PLUS_GOLD.background,shadowColor:premium?MEMBERSHIP_COLORS.success:PLUS_GOLD.background,shadowOpacity:.55,shadowRadius:5,shadowOffset:{width:0,height:0}}}/>
   <View style={{flex:1,minWidth:0}}><Text style={{fontSize:14,fontWeight:'800',color:MEMBERSHIP_COLORS.ink}}>{statusText}</Text><Text style={{fontSize:12,lineHeight:18,color:MEMBERSHIP_COLORS.muted,marginTop:2}}>{statusDetail}</Text></View>
  </View>

  {status?.testAccessDurationSeconds===60&&!manual?<View style={{padding:12,borderRadius:14,backgroundColor:'rgba(246,227,167,.11)',borderWidth:1,borderColor:MEMBERSHIP_COLORS.line}}><Text style={{color:MEMBERSHIP_COLORS.goldSoft,fontSize:12,lineHeight:18,fontWeight:'700'}}>{status.paidUntil?premium?`1-minute sandbox test · Access ends at ${new Date(status.paidUntil).toLocaleTimeString()}`:'1-minute sandbox test · Paid access has expired.':'1-minute sandbox test · Access expires 60 seconds after payment is verified.'}</Text></View>:null}

  {busy?<ActivityIndicator color={PLUS_GOLD.background}/>:null}
  {status?.configured&&!premium&&['free','created','cancelled','completed','expired'].includes(status.status)?<Pressable accessibilityRole="button" disabled={busy} style={[button,{opacity:busy?.65:1}]} onPress={()=>void run(async()=>{const value=await startCheckout();if(value){onChange(value);onNotify(value.premium?'Repday Plus is now active!':'Subscription activation is pending. Try Refresh access shortly.');}else onNotify('Checkout closed. You can try again anytime.');},true)}><Text style={{fontSize:16,fontWeight:'900',color:PLUS_GOLD.ink}}>{status.status==='created'?'Continue checkout':`Try Plus · ₹${monthlyPrice}/month`}</Text></Pressable>:null}
  {status?.subscriptionId&&!['cancelled','completed','expired'].includes(status.status)&&!status.cancellationScheduled?<Pressable accessibilityRole="button" disabled={busy} onPress={()=>setConfirm(true)} style={{minHeight:40,alignItems:'center',justifyContent:'center'}}><Text style={{color:MEMBERSHIP_COLORS.muted,fontSize:13,fontWeight:'700'}}>Cancel subscription</Text></Pressable>:null}
  {confirm?<View style={{gap:10,padding:13,borderWidth:1,borderColor:MEMBERSHIP_COLORS.line,borderRadius:17,backgroundColor:MEMBERSHIP_COLORS.surface}}><Text style={{color:MEMBERSHIP_COLORS.ink,lineHeight:20}}>Cancel monthly renewal? Paid access remains until the end of the paid period.</Text><Pressable accessibilityRole="button" disabled={busy} style={button} onPress={()=>void run(async()=>{const value=await billingRequest<BillingStatus>('/api/billing/cancel',{});onChange(value);setConfirm(false);onNotify(value.premium&&value.paidUntil?`Renewal cancelled. Plus stays active until ${new Date(value.paidUntil).toLocaleDateString()}.`:'Subscription cancelled.');},true)}><Text style={{color:PLUS_GOLD.ink,fontWeight:'900'}}>Confirm cancellation</Text></Pressable><Pressable onPress={()=>setConfirm(false)}><Text style={{color:MEMBERSHIP_COLORS.goldSoft,textAlign:'center',fontWeight:'700'}}>Keep subscription</Text></Pressable></View>:null}

  <Pressable accessibilityRole="button" accessibilityLabel="Refresh subscription status" disabled={busy} onPress={()=>void run(async()=>{const value=await onRefresh() as BillingStatus|null;if(value?.premium&&!premium)onNotify('Repday Plus is now active!');})} style={{minHeight:40,borderRadius:14,borderWidth:1,borderColor:MEMBERSHIP_COLORS.softLine,backgroundColor:MEMBERSHIP_COLORS.surface,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:14}}><Text style={{fontSize:17,color:PLUS_GOLD.background}}>↻</Text><Text style={{color:MEMBERSHIP_COLORS.goldSoft,fontSize:13,fontWeight:'800'}}>Refresh access</Text></Pressable>
  {!status?.configured&&status&&!premium?<Text style={{color:MEMBERSHIP_COLORS.muted,fontSize:13,lineHeight:19}}>Checkout is not configured on this deployment yet.</Text>:null}
  {message||loadError?<Text accessibilityRole="alert" style={{color:MEMBERSHIP_COLORS.danger,fontSize:13,lineHeight:19}}>{message||loadError}</Text>:null}
  </>:null}
 </View>;
}
