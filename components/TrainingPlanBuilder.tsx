import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loadPlanCatalog } from '../backend/firebase/trainingPlans';
import { DEFAULT_PLAN_CATALOG, DEFAULT_WEEKDAYS, FOCUS_LABELS, WEEKDAY_NAMES, defaultPlanPreferences, generateTrainingPlan, planDraftPreferencesSchema, type GeneratedPlan, type PlanPreferences } from '../lib/trainingPlan';
import type { TrainingGoal } from '../backend/contracts';

type Palette={bg:string;ink:string;muted:string;blue:string;surface:string;soft:string;border:string};
const DEFAULT_PALETTE:Palette={bg:'#fff',ink:'#17191d',muted:'#687682',blue:'#3478f6',surface:'#fff',soft:'#eaf3ff',border:'#e0e6eb'};
const TITLES=['Let’s find your starting point','Make room for your week','What will you train with?','Choose your emphasis','Here’s your week'];
const DETAILS=['Your experience helps us set a manageable starting volume.','Choose your training days and how much time you have.','We’ll choose exercises for the equipment you have.','Keep a balanced plan, with extra attention where you want it.','Review each workout before making this your plan.'];

export function TrainingPlanBuilder({onUse,onCancel,onSkip,goal='fitness',restSeconds=90,draftKey,initialPreferences,palette=DEFAULT_PALETTE,rebuilding=false}:{
  onUse:(plan:GeneratedPlan)=>Promise<void>;onCancel:()=>void;onSkip?:()=>Promise<void>;goal?:TrainingGoal;restSeconds?:number;draftKey?:string;initialPreferences?:PlanPreferences;palette?:Palette;rebuilding?:boolean;
}){
  const [preferences,setPreferences]=useState<PlanPreferences>(()=>initialPreferences??defaultPlanPreferences(goal));
  const [step,setStep]=useState(0);
  const [draftLoaded,setDraftLoaded]=useState(!draftKey);
  const [catalog,setCatalog]=useState(DEFAULT_PLAN_CATALOG);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [openDay,setOpenDay]=useState<number|null>(null);
  const scroll=useRef<ScrollView>(null);
  const id=useRef(`guided-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`);
  useEffect(()=>{
    if(!draftKey){setDraftLoaded(true);return;}
    let alive=true;
    AsyncStorage.getItem(draftKey).then(saved=>{
      if(!alive||!saved)return;
      try{const draft=JSON.parse(saved);const parsed=planDraftPreferencesSchema.safeParse(draft.preferences);if(parsed.success){setPreferences(parsed.data);if(Number.isInteger(draft.step))setStep(Math.max(0,Math.min(4,draft.step)));if(typeof draft.id==='string'&&/^guided-[a-z0-9-]{1,80}$/.test(draft.id))id.current=draft.id;}}catch{}
    }).catch(()=>{}).finally(()=>{if(alive)setDraftLoaded(true);});
    return()=>{alive=false;};
  },[draftKey]);
  useEffect(()=>{if(draftKey&&draftLoaded)AsyncStorage.setItem(draftKey,JSON.stringify({preferences,step,id:id.current})).catch(()=>{});},[draftKey,draftLoaded,preferences,step]);
  useEffect(()=>{let alive=true;loadPlanCatalog().then(value=>{if(alive)setCatalog(value);});return()=>{alive=false;};},[]);
  const validDays=preferences.weekdays.length===preferences.daysPerWeek;
  const preview=useMemo(()=>{
    if(!validDays)return null;
    try{return generateTrainingPlan(preferences,catalog,id.current,restSeconds);}catch{return null;}
  },[preferences,catalog,validDays,restSeconds]);
  const update=<K extends keyof PlanPreferences>(key:K,value:PlanPreferences[K])=>setPreferences(current=>({...current,[key]:value}));
  const advance=(next:number)=>{setStep(next);setError('');setOpenDay(null);scroll.current?.scrollTo({y:0,animated:false});};
  const choice=(label:string,detail:string,selected:boolean,onPress:()=>void)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} onPress={onPress} style={[styles.choice,{borderColor:selected?palette.blue:palette.border,backgroundColor:selected?palette.soft:palette.surface}]}><View style={{flex:1}}><Text style={[styles.label,{color:palette.ink}]}>{label}</Text>{!!detail&&<Text style={[styles.detail,{color:palette.muted}]}>{detail}</Text>}</View><Text style={{color:palette.blue,fontSize:20}}>{selected?'✓':'○'}</Text></Pressable>;
  const action=async(skip=false)=>{setBusy(true);setError('');try{if(skip&&onSkip)await onSkip();else if(preview)await onUse(preview);else throw new Error('Choose your training days to preview a plan.');if(draftKey)await AsyncStorage.removeItem(draftKey);}catch(e){setError(e instanceof Error?e.message:'Could not save your plan. Try again.');}finally{setBusy(false);}};
  const color={color:palette.ink};
  if(!draftLoaded)return <View style={[styles.root,{justifyContent:'center',alignItems:'center'}]}><ActivityIndicator color={palette.blue}/></View>;
  return <View style={[styles.root,{backgroundColor:palette.bg}]}>
    <View style={styles.top}><Pressable accessibilityRole="button" accessibilityLabel={step===0?'Close plan builder':'Previous plan step'} disabled={busy} onPress={()=>step===0?onCancel():advance(step-1)} style={[styles.back,{backgroundColor:palette.soft}]}><Text style={[{fontSize:26},color]}>‹</Text></Pressable><Text style={[styles.eyebrow,{color:palette.muted}]}>YOUR TRAINING PLAN · {step+1}/5</Text><View style={{width:42}}/></View>
    <View style={styles.progress}>{TITLES.map((_,i)=><View key={i} style={{flex:1,height:4,borderRadius:2,backgroundColor:i<=step?palette.blue:palette.border}}/>)}</View>
    <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={styles.content} pointerEvents={busy?'none':'auto'}>
      <Text accessibilityRole="header" style={[styles.title,color]}>{TITLES[step]}</Text>
      <Text style={[styles.description,{color:palette.muted}]}>{DETAILS[step]}</Text>
      {step===0&&<View style={styles.stack}>
        {choice('First time at the gym','Start with simple movements and two sets per exercise.',preferences.experience==='new',()=>update('experience','new'))}
        {choice('Getting started','Build consistency with a manageable routine.',preferences.experience==='starting',()=>update('experience','starting'))}
        {choice('Already training','A starting plan you can adapt to your experience.',preferences.experience==='experienced',()=>update('experience','experienced'))}
        <Text style={[styles.section,color]}>Your goal</Text><View style={styles.chips}>{(['strength','muscle','fitness','endurance'] as const).map(g=>choice(({strength:'Build strength',muscle:'Build muscle',fitness:'General fitness',endurance:'Improve endurance'})[g],'',preferences.goal===g,()=>update('goal',g)))}</View>
      </View>}
      {step===1&&<View style={styles.stack}>
        <Text style={[styles.section,color]}>Days per week</Text><View style={styles.chips}>{[2,3,4,5,6].map(n=><Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} days per week`} accessibilityState={{selected:preferences.daysPerWeek===n}} onPress={()=>setPreferences(current=>({...current,daysPerWeek:n,weekdays:[...DEFAULT_WEEKDAYS[n]]}))} style={[styles.chip,{backgroundColor:preferences.daysPerWeek===n?palette.blue:palette.soft}]}><Text style={{fontWeight:'800',color:preferences.daysPerWeek===n?'#fff':palette.ink}}>{n}</Text></Pressable>)}</View>
        <Text style={[styles.section,color]}>Which days work for you?</Text><View style={styles.chips}>{WEEKDAY_NAMES.map((name,i)=>{const selected=preferences.weekdays.includes(i);return <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Train on ${name}`} accessibilityState={{selected}} onPress={()=>update('weekdays',selected?preferences.weekdays.filter(d=>d!==i):preferences.weekdays.length<preferences.daysPerWeek?[...preferences.weekdays,i]:preferences.weekdays)} style={[styles.day,{backgroundColor:selected?palette.blue:palette.soft}]}><Text style={{fontSize:12,fontWeight:'800',color:selected?'#fff':palette.ink}}>{name.slice(0,3)}</Text></Pressable>;})}</View>
        <Text style={[styles.detail,{color:palette.muted}]}>{preferences.weekdays.length} of {preferences.daysPerWeek} days selected. Deselect a day before choosing a replacement.</Text>
        {preferences.daysPerWeek<=3&&<Text style={[styles.detail,{color:palette.muted}]}>For full-body sessions, leave a day between workouts when possible.</Text>}
        <Text style={[styles.section,color]}>Time for each session</Text><View style={styles.chips}>{([30,45,60] as const).map(n=>choice(`${n} minutes`,'',preferences.minutes===n,()=>update('minutes',n)))}</View>
        {preferences.experience==='new'&&preferences.daysPerWeek>3&&<Text style={[styles.note,{backgroundColor:palette.soft,color:palette.ink}]}>New to training? Two or three days is a manageable starting point. You can change your schedule later.</Text>}
      </View>}
      {step===2&&<View style={styles.stack}>
        {choice('Full gym','Machines, cables, dumbbells and a bench.',preferences.equipment==='gym',()=>update('equipment','gym'))}
        {choice('Dumbbells and a bench','A limited gym or a home dumbbell setup.',preferences.equipment==='db',()=>update('equipment','db'))}
        {choice('Home with resistance bands','Bodyweight exercises, a resistance band and a sturdy chair.',preferences.equipment==='home',()=>update('equipment','home'))}
      </View>}
      {step===3&&<View style={styles.stack}>{(Object.keys(FOCUS_LABELS) as PlanPreferences['focus'][]).map(focus=>choice(FOCUS_LABELS[focus],focus==='balanced'?'Train your whole body across the week.':'An extra set on a focus exercise in relevant sessions.',preferences.focus===focus,()=>update('focus',focus)))}</View>}
      {step===4&&preview&&<View style={styles.stack}>
        <View style={[styles.summary,{backgroundColor:palette.soft}]}><Text style={[styles.section,color]}>{preview.title}</Text><Text style={[styles.detail,{color:palette.muted}]}>{FOCUS_LABELS[preferences.focus]} · about {preferences.minutes} min per workout</Text><Text style={[styles.detail,{color:palette.muted}]}>Start with a comfortable load and leave a few reps in reserve. Ask a trainer to demonstrate unfamiliar movements.</Text></View>
        {rebuilding&&<Text style={[styles.note,{backgroundColor:palette.soft,color:palette.ink}]}>This updates your weekly schedule. Your existing splits and workout history will be kept.</Text>}
        {WEEKDAY_NAMES.map((name,day)=>{const session=preview.sessions.find(s=>s.id===preview.weeklyPlan[day]);return <View key={name} style={[styles.previewDay,{borderColor:palette.border}]}><Pressable accessibilityRole="button" accessibilityLabel={`${name}: ${session?.name??'Rest day'}`} accessibilityState={{expanded:openDay===day,disabled:!session}} disabled={!session} onPress={()=>setOpenDay(openDay===day?null:day)} style={styles.dayHead}><View style={{flex:1}}><Text style={[styles.label,color]}>{name}</Text><Text style={[styles.detail,{color:palette.muted}]}>{session?`${session.name} · ${session.moves.length} exercises`:'Rest day'}</Text></View><Text style={{color:palette.blue,fontSize:20}}>{session?(openDay===day?'−':'+'):'○'}</Text></Pressable>{openDay===day&&session&&<View style={styles.exerciseList}>{session.moves.map(move=><View key={move.key} style={{gap:3}}><Text style={[styles.label,{fontSize:14,color:palette.ink}]}>{move.name}</Text><Text style={[styles.detail,{color:palette.muted}]}>{move.sets.length} sets × {move.sets[0].reps} reps · {move.restSeconds} sec rest</Text></View>)}</View>}</View>;})}
        <Text style={[styles.detail,{color:palette.muted}]}>Weights start at 0. Choose a comfortable starting weight when you log your first workout. You can edit any exercise later.</Text>
      </View>}
      {step===4&&!preview&&<Text style={{color:palette.ink}}>No matching plan is available. Go back and check your schedule.</Text>}
      {!!error&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{color:'#c34444'}}>{error}</Text>}
    </ScrollView>
    <View style={[styles.footer,{borderTopColor:palette.border}]}><Pressable accessibilityRole="button" accessibilityLabel={step===4?(rebuilding?'Save new plan':'Use this plan'):'Continue plan setup'} disabled={busy||(step===1&&!validDays)||(step===4&&!preview)} onPress={()=>step===4?void action():advance(step+1)} style={[styles.primary,{backgroundColor:palette.blue,opacity:busy||(step===1&&!validDays)||(step===4&&!preview)?.5:1}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.primaryText}>{step===4?(rebuilding?'Save new plan':'Use this plan'):'Continue'}</Text>}</Pressable>{onSkip&&<Pressable accessibilityRole="button" disabled={busy} accessibilityLabel="Build my own plan" onPress={()=>void action(true)} style={{paddingVertical:12,alignItems:'center'}}><Text style={{fontSize:13,fontWeight:'700',color:palette.muted}}>I’ll build my own plan</Text></Pressable>}</View>
  </View>;
}
const styles=StyleSheet.create({root:{flex:1,width:'100%',maxWidth:620,alignSelf:'center'},top:{paddingHorizontal:20,paddingTop:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{height:42,width:42,borderRadius:22,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1},progress:{flexDirection:'row',gap:5,marginHorizontal:20,marginTop:16},content:{padding:20,paddingBottom:32,gap:16},title:{fontSize:30,fontWeight:'900',letterSpacing:-.7,lineHeight:35},description:{fontSize:15,lineHeight:22},stack:{gap:10},choice:{minHeight:66,padding:15,borderWidth:1.5,borderRadius:18,flexDirection:'row',gap:12,alignItems:'center',flexGrow:1},label:{fontSize:16,fontWeight:'700'},detail:{fontSize:13,lineHeight:19,marginTop:3},section:{fontSize:16,fontWeight:'800',marginTop:10,marginBottom:3},chips:{flexDirection:'row',gap:7,flexWrap:'wrap'},chip:{minWidth:48,minHeight:48,borderRadius:24,alignItems:'center',justifyContent:'center'},day:{minWidth:42,minHeight:44,borderRadius:15,alignItems:'center',justifyContent:'center',flex:1},note:{padding:14,borderRadius:16,fontSize:13,lineHeight:20},summary:{padding:18,borderRadius:20,gap:6},previewDay:{borderWidth:1,borderRadius:18,overflow:'hidden'},dayHead:{padding:15,flexDirection:'row',alignItems:'center',gap:10,minHeight:70},exerciseList:{padding:15,paddingTop:0,gap:13},footer:{padding:20,paddingBottom:12,borderTopWidth:1,gap:2},primary:{minHeight:52,borderRadius:27,alignItems:'center',justifyContent:'center'},primaryText:{fontSize:16,fontWeight:'800',color:'#fff'}});
