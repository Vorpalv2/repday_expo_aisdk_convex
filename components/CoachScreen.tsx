import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {askCoachQuestion} from '../backend/ai';
import {DEFAULT_AI_COACH_MODEL} from '../backend/aiModels';
import {listCoachConversations,saveCoachConversation} from '../backend/firebase/coachHistory';
import {buildCoachContext,coachBlocks,coachId,decodeCoachConversation,encodeCoachConversation,MAX_COACH_MESSAGES,type CoachContext,type CoachConversation,type CoachMessage} from '../lib/coachConversation';
import type {Session,TrainingGoal,WeightUnit,WorkoutRecord} from '../backend/contracts';

export type CoachPalette={ink:string;muted:string;surface:string;surfaceAlt:string;line:string;blue:string;bg:string};
type Launch={id:string;question:string;record:WorkoutRecord};
type PendingTurn={question:string;context:CoachContext;previous:CoachMessage[];user:CoachMessage;conversation:CoachConversation|null};
const GOLD='#e8bd57';
const wrapLongText=Platform.OS==='web'?{overflowWrap:'anywhere'} as any:undefined;
const cacheKey=(uid:string)=>`repday.coachHistory.${uid}`;
function mergeHistory(a:CoachConversation[],b:CoachConversation[]){const all=new Map<string,CoachConversation>();for(const item of [...a,...b]){const old=all.get(item.id);if(!old||item.updatedAt>=old.updatedAt)all.set(item.id,item);}return [...all.values()].sort((x,y)=>y.updatedAt-x.updatedAt);}
function InlineText({text,color}:{text:string;color:string}){return <Text>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,index)=><Text key={index} style={{color,fontWeight:part.startsWith('**')?'800':undefined,...(part.startsWith('`')?{fontWeight:'700' as const}: {})}}>{part.startsWith('**')?part.slice(2,-2):part.startsWith('`')?part.slice(1,-1):part}</Text>)}</Text>;}
function CoachReply({text,palette}:{text:string;palette:CoachPalette}){return <View style={{gap:9,width:'100%',minWidth:0}}>{coachBlocks(text).map((block,index)=><View key={index} style={{width:'100%',maxWidth:'100%',minWidth:0,flexDirection:'row',paddingLeft:block.indent*14,gap:8}}>{block.kind==='bullet'?<Text style={{color:palette.blue,width:20,fontWeight:'800',lineHeight:24,flexShrink:0}}>{block.marker}</Text>:null}<Text selectable style={[wrapLongText,{flex:1,minWidth:0,maxWidth:'100%',flexShrink:1,color:palette.ink,fontSize:block.kind==='heading'?17:15,lineHeight:24,fontWeight:block.kind==='heading'?'800':'400',marginTop:block.kind==='heading'&&index>0?8:0}]}><InlineText text={block.text} color={palette.ink}/></Text></View>)}</View>;}

export function CoachScreen({uid,visible,palette,header,focusPlan,history,goal,unit,timeZone,isRest,now,launch,onBusyChange,requirePlus}:{uid:string;visible:boolean;palette:CoachPalette;header:React.ReactNode;focusPlan:Session|null;history:WorkoutRecord[];goal:TrainingGoal;unit:WeightUnit;timeZone:string;isRest:boolean;now:number;launch:Launch|null;onBusyChange:(busy:boolean)=>void;requirePlus:()=>Promise<boolean>}){
 const [conversation,setConversation]=useState<CoachConversation|null>(null),[messages,setMessages]=useState<CoachMessage[]>([]),[input,setInput]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState<PendingTurn|null>(null),[saveError,setSaveError]=useState(''),[cacheError,setCacheError]=useState('');
 const [saved,setSaved]=useState<CoachConversation[]>([]),[drawer,setDrawer]=useState(false),[historyBusy,setHistoryBusy]=useState(false),[historyError,setHistoryError]=useState(''),[hasMore,setHasMore]=useState(false),[contextExpanded,setContextExpanded]=useState(false);
 const owner=useRef(uid),controller=useRef<AbortController|null>(null),sending=useRef(false),handledLaunch=useRef(''),historyCursor=useRef<Awaited<ReturnType<typeof listCoachConversations>>['cursor']>(null),savedRef=useRef<CoachConversation[]>([]),scroll=useRef<ScrollView|null>(null),nearBottom=useRef(true),cacheQueue=useRef(Promise.resolve());
 const contextDay=new Intl.DateTimeFormat('en-CA',{timeZone}).format(now);
 const liveContext=useMemo(()=>buildCoachContext({focusPlan,history,goal,unit,timeZone,isRest,now}),[focusPlan,history,goal,unit,timeZone,isRest,contextDay]);
 const context=conversation?.context||pending?.context||liveContext;
 const currentOwner=(id:string)=>owner.current===id;
 const cache=(id:string,items:CoachConversation[])=>{cacheQueue.current=cacheQueue.current.catch(()=>{}).then(()=>AsyncStorage.setItem(cacheKey(id),JSON.stringify(items.slice(0,12).map(item=>({id:item.id,...encodeCoachConversation(item)}))))).then(()=>{if(currentOwner(id))setCacheError('');}).catch(()=>{if(currentOwner(id))setCacheError('Device storage is unavailable. Keep this chat open until it is saved to the cloud.');});};
 const remember=(id:string,value:CoachConversation)=>{if(!currentOwner(id))return;const items=mergeHistory(savedRef.current,[value]);savedRef.current=items;setSaved(items);cache(id,items);};
 useEffect(()=>{
  owner.current=uid;savedRef.current=[];setSaved([]);setConversation(null);setMessages([]);setPending(null);setError('');setSaveError('');setDrawer(false);historyCursor.current=null;setHasMore(false);
  let alive=true;void AsyncStorage.getItem(cacheKey(uid)).then(raw=>{if(!alive||!raw)return;let values:unknown;try{values=JSON.parse(raw);}catch{return;}if(!Array.isArray(values))return;const items=values.slice(0,24).flatMap(value=>{const decoded=decodeCoachConversation(value?.id,value,true);return decoded?[decoded]:[];});savedRef.current=mergeHistory(savedRef.current,items);setSaved(savedRef.current);}).catch(()=>{});
  return()=>{alive=false;controller.current?.abort();owner.current='';};
 },[uid]);
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 const persist=async(id:string,value:CoachConversation)=>{
  remember(id,value);setSaveError('');
  try{const stored=await saveCoachConversation(id,value);if(!currentOwner(id))return;setConversation(stored);remember(id,stored);}
  catch(problem){if(currentOwner(id))setSaveError(problem instanceof Error?problem.message:'Kept on this device. Cloud history could not be saved.');}
 };
 const send=async(question=input,retry?:PendingTurn)=>{
  const value=question.trim();if(!value||busy||sending.current||!await requirePlus())return;
  if(sending.current)return;
  if(pending&&!retry){setError('Retry the interrupted question, or start a new chat before asking another question.');return;}
  const id=uid,base=retry?retry.conversation:conversation,previous=retry?.previous??messages;
  if(previous.length>=MAX_COACH_MESSAGES&&!retry){setError('This conversation has 20 replies. Start a new chat to keep the context focused.');return;}
  sending.current=true;setBusy(true);setError('');setSaveError('');setInput('');
  const requestContext=retry?.context??base?.context??liveContext;
  const user=retry?.user??{id:coachId(),role:'user' as const,text:value},assistant={id:coachId(),role:'assistant' as const,text:''};
  const turn:PendingTurn={question:value,context:requestContext,previous,user,conversation:base};setPending(turn);setMessages([...previous,user,assistant]);
  const abort=new AbortController();controller.current=abort;
  try{
   const answer=await askCoachQuestion(value,requestContext.text,DEFAULT_AI_COACH_MODEL,{messages:previous,signal:abort.signal,onText:text=>{if(currentOwner(id))setMessages(items=>items.map(item=>item.id===assistant.id?{...item,text}:item));}});
   if(!currentOwner(id))return;
   const completed=[...previous,user,{...assistant,text:answer.trim()}];
   const next:CoachConversation={id:base?.id||coachId(),title:base?.title||value.slice(0,100),preview:answer.trim().replace(/[#*`]/g,'').slice(0,200),context:requestContext,messages:completed,createdAt:base?.createdAt||Date.now(),updatedAt:Date.now(),revision:base?.revision||0};
   setMessages(completed);setConversation(next);setPending(null);await persist(id,next);
  }catch(problem){if(currentOwner(id)){setError(problem instanceof Error?problem.message:'The reply was interrupted. Please retry.');setMessages(items=>items.filter(item=>item.id!==assistant.id||item.text.trim()));}}
  finally{if(currentOwner(id)){setBusy(false);sending.current=false;controller.current=null;}}
 };
 const newChat=()=>{if(sending.current)return;setConversation(null);setMessages([]);setPending(null);setInput('');setError('');setSaveError('');setContextExpanded(false);setDrawer(false);};
 useEffect(()=>{
  if(!launch||handledLaunch.current===launch.id||!visible||busy)return;
  handledLaunch.current=launch.id;
  const snapshot=buildCoachContext({selectedWorkout:launch.record,history:[],goal,unit,timeZone,isRest:false});
  const user:CoachMessage={id:coachId(),role:'user',text:launch.question};
  setConversation(null);setMessages([]);setError('');setSaveError('');
  void send(launch.question,{question:launch.question,context:snapshot,previous:[],user,conversation:null});
 },[launch?.id,visible,busy,goal,unit,timeZone]);
 const loadHistory=async(more=false)=>{
  if(historyBusy)return;const id=uid;setHistoryBusy(true);setHistoryError('');
  try{const page=await listCoachConversations(id,more?historyCursor.current:null);if(!currentOwner(id))return;historyCursor.current=page.cursor;setHasMore(page.hasMore);const items=mergeHistory(savedRef.current,page.items);savedRef.current=items;setSaved(items);cache(id,items);}
  catch(problem){if(currentOwner(id))setHistoryError(problem instanceof Error?problem.message:'Could not load cloud history. Saved conversations on this device are shown.');}
  finally{if(currentOwner(id))setHistoryBusy(false);}
 };
 const openHistory=()=>{setDrawer(true);void loadHistory();};
 const choose=(value:CoachConversation)=>{if(sending.current)return;setConversation(value);setMessages(value.messages);setPending(null);setError('');setSaveError('');setDrawer(false);setContextExpanded(false);nearBottom.current=true;};
 const button=(muted=false)=>({paddingHorizontal:14,minHeight:40,borderRadius:14,alignItems:'center' as const,justifyContent:'center' as const,backgroundColor:muted?palette.surfaceAlt:GOLD});
 return <View style={{flex:1,display:visible?'flex':'none'}}>
  <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onScroll={event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;nearBottom.current=contentOffset.y+layoutMeasurement.height>=contentSize.height-120;}} scrollEventThrottle={100} onContentSizeChange={()=>{if(busy&&nearBottom.current)scroll.current?.scrollToEnd({animated:false});}} contentContainerStyle={{width:'100%',minWidth:0,alignItems:'stretch',paddingHorizontal:21,paddingTop:24,paddingBottom:180}}>
   {header}
   <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16,gap:12}}>
    <View style={{flex:1}}><Text style={{color:palette.blue,fontSize:10,fontWeight:'800',letterSpacing:1.2}}>REPDAY / COACHING DESK</Text><Text style={{color:palette.ink,fontSize:25,fontWeight:'800',marginTop:5}}>Train with intention.</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open AI Coach history" disabled={busy} onPress={openHistory} style={button(true)}><Text style={{color:palette.ink,fontWeight:'700'}}>History</Text></Pressable>
   </View>
   <View style={styles.contextCard}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><Text style={styles.eyebrow}>YOUR TRAINING IN CONTEXT</Text><View style={styles.contextDot}/></View>
    <Text style={styles.contextTitle}>{context.title}</Text>
    <Text style={styles.contextDescription}>{conversation||pending?'The saved context used for this conversation.':'Your current training snapshot, ready for your next question.'}</Text>
    <Text numberOfLines={contextExpanded?undefined:3} style={styles.contextText}>{context.text}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={contextExpanded?'Collapse coach context':'Show exact AI Coach context'} accessibilityState={{expanded:contextExpanded}} onPress={()=>setContextExpanded(value=>!value)} style={{paddingVertical:10,alignSelf:'flex-start'}}><Text style={{color:'#a9caff',fontSize:12,fontWeight:'800'}}>{contextExpanded?'Show less ↑':'View exact context ↓'}</Text></Pressable>
   </View>
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginVertical:15,gap:10}}><Text style={{color:palette.muted,fontSize:12}}>GPT-5 mini · {busy?'Responding…':conversation?'Saved conversation':'New conversation'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Start new AI Coach conversation" disabled={busy} onPress={newChat} hitSlop={8}><Text style={{color:palette.blue,fontWeight:'700'}}>New chat +</Text></Pressable></View>
   {!messages.length?<View style={{gap:10,marginBottom:18}}><Text style={{color:palette.ink,fontWeight:'800',fontSize:18,marginBottom:3}}>Pick a starting point</Text>{['How should I progress on my current split?','Am I giving my muscles enough recovery?','What should I focus on in my next session?'].map((question,index)=><Pressable key={question} accessibilityRole="button" disabled={busy} onPress={()=>void send(question)} style={{padding:16,borderRadius:18,borderWidth:1,borderColor:palette.line,backgroundColor:palette.surface,flexDirection:'row',gap:12}}><Text style={{color:palette.blue,fontWeight:'800'}}>0{index+1}</Text><Text style={{flex:1,color:palette.ink,fontWeight:'600',fontSize:14,lineHeight:21}}>{question}</Text><Text style={{color:palette.blue}}>›</Text></Pressable>)}</View>:null}
   <View style={{gap:12,marginBottom:16}}>{messages.map(message=><View key={message.id} style={{alignSelf:message.role==='user'?'flex-end':'stretch',width:message.role==='user'?undefined:'100%',minWidth:0,maxWidth:message.role==='user'?'90%':'100%',padding:17,borderRadius:19,borderWidth:1,borderColor:palette.line,backgroundColor:message.role==='user'?palette.surfaceAlt:palette.surface}}>
    <Text style={{color:message.role==='user'?palette.blue:palette.muted,fontSize:10,fontWeight:'800',letterSpacing:1,marginBottom:10}}>{message.role==='user'?'YOU':'AI COACH'}</Text>
    {message.role==='assistant'?message.text?<CoachReply text={message.text} palette={palette}/>:<Text style={{color:palette.muted,fontSize:14}}>Thinking…</Text>:<Text selectable style={[wrapLongText,{color:palette.ink,fontSize:15,lineHeight:24,minWidth:0,maxWidth:'100%',flexShrink:1}]}>{message.text}</Text>}
   </View>)}</View>
   {busy?<View style={{flexDirection:'row',gap:8,alignItems:'center',marginBottom:14}}><ActivityIndicator size="small" color={palette.blue}/><Text style={{color:palette.muted,fontSize:12}}>Coach is responding…</Text></View>:null}
   {error?<View accessibilityRole="alert" style={[styles.notice,{borderColor:palette.line,backgroundColor:palette.surfaceAlt}]}><Text style={{color:palette.ink,lineHeight:21}}>{error}</Text>{pending?<Pressable accessibilityRole="button" accessibilityLabel="Retry AI Coach question" disabled={busy} onPress={()=>void send(pending.question,pending)} style={button()}><Text style={styles.goldText}>Retry question</Text></Pressable>:null}</View>:null}
   {cacheError?<Text accessibilityRole="alert" style={{color:palette.muted,fontSize:12,lineHeight:19,marginBottom:12}}>{cacheError}</Text>:null}
   {saveError?<View accessibilityRole="alert" style={[styles.notice,{borderColor:palette.line,backgroundColor:palette.surfaceAlt}]}><Text style={{color:palette.ink,lineHeight:21}}>{cacheError?'Reply remains in this open chat.':'Saved on this device.'} Cloud history: {saveError}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry saving AI Coach conversation" disabled={busy} onPress={()=>{if(conversation){setBusy(true);void persist(uid,conversation).finally(()=>setBusy(false));}}} style={button(true)}><Text style={{color:palette.blue,fontWeight:'700'}}>Retry saving</Text></Pressable></View>:null}
   <View style={{flexDirection:'row',alignItems:'flex-end',gap:10,padding:10,borderWidth:1,borderColor:palette.line,borderRadius:23,backgroundColor:palette.surface,minWidth:0,width:'100%'}}><TextInput accessibilityLabel="Ask AI Coach" value={input} onChangeText={setInput} placeholder="Ask about your training…" placeholderTextColor={palette.muted} multiline maxLength={1000} style={{flex:1,minWidth:0,color:palette.ink,minHeight:46,maxHeight:130,padding:10,fontSize:16,lineHeight:23}}/><Pressable accessibilityRole="button" accessibilityLabel="Send to AI Coach" disabled={!input.trim()||busy} onPress={()=>void send()} style={{width:46,height:46,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:!input.trim()||busy?palette.surfaceAlt:GOLD}}><Text style={{fontSize:24,fontWeight:'800',color:!input.trim()||busy?palette.muted:'#211b0e'}}>↑</Text></Pressable></View>
   <Text style={{color:palette.muted,fontSize:11,lineHeight:17,marginTop:10}}>General training guidance. For pain or medical concerns, consult a qualified professional.</Text>
  </ScrollView>
  <Modal visible={drawer} transparent animationType="slide" onRequestClose={()=>setDrawer(false)}><View style={{flex:1,flexDirection:'row',justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,.4)'}}><Pressable accessibilityRole="button" accessibilityLabel="Dismiss AI Coach history" onPress={()=>setDrawer(false)} style={StyleSheet.absoluteFill}/><View accessibilityViewIsModal style={{width:'92%',maxWidth:420,backgroundColor:palette.bg,paddingTop:50,paddingHorizontal:20,paddingBottom:35,borderTopLeftRadius:26,borderBottomLeftRadius:26}}>
   <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8}}><Text style={{color:palette.ink,fontWeight:'800',fontSize:25}}>Coach history</Text><Pressable accessibilityRole="button" accessibilityLabel="Close AI Coach history" onPress={()=>setDrawer(false)} style={button(true)}><Text style={{color:palette.ink,fontSize:20}}>×</Text></Pressable></View>
   <Text style={{color:palette.muted,fontSize:12,lineHeight:18,marginBottom:16}}>Saved discussions and the training context used for each reply.</Text>
   <View style={{flexDirection:'row',gap:10,marginBottom:18}}><Pressable accessibilityRole="button" onPress={newChat} style={button()}><Text style={styles.goldText}>New chat +</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Refresh AI Coach history" disabled={historyBusy} onPress={()=>void loadHistory()} style={button(true)}><Text style={{color:palette.blue,fontWeight:'700'}}>Refresh ↻</Text></Pressable></View>
   {historyBusy?<ActivityIndicator color={palette.blue}/>:null}{historyError?<Text accessibilityRole="alert" style={{color:palette.muted,lineHeight:19,marginBottom:12}}>Cloud history is unavailable. {historyError}</Text>:null}
   <ScrollView showsVerticalScrollIndicator={false}>{!saved.length&&!historyBusy?<Text style={{color:palette.muted,lineHeight:22}}>No saved discussions yet. Completed replies will appear here.</Text>:null}{saved.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open conversation: ${item.title}`} onPress={()=>choose(item)} style={{paddingVertical:17,borderBottomWidth:1,borderColor:palette.line,gap:7}}><Text numberOfLines={2} style={{color:palette.ink,fontWeight:'800',fontSize:16,lineHeight:23}}>{item.title}</Text><Text style={{color:palette.blue,fontSize:11,fontWeight:'700'}}>{new Date(item.updatedAt).toLocaleDateString()} · {item.messages.filter(m=>m.role==='assistant').length} replies{item.revision===0?' · On this device':''}</Text><Text numberOfLines={2} style={{color:palette.muted,lineHeight:20,fontSize:13}}>{item.preview}</Text></Pressable>)}{hasMore?<Pressable accessibilityRole="button" disabled={historyBusy} onPress={()=>void loadHistory(true)} style={[button(true),{marginVertical:15}]}><Text style={{color:palette.blue,fontWeight:'700'}}>Load older discussions</Text></Pressable>:null}</ScrollView>
  </View></View></Modal>
 </View>;
}
const styles=StyleSheet.create({contextCard:{backgroundColor:'#151d2b',borderRadius:25,padding:22,borderWidth:1,borderColor:'#2d405e'},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.1,color:'#b5c8e8',flex:1},contextDot:{width:7,height:7,borderRadius:4,backgroundColor:'#78aaff'},contextTitle:{fontSize:25,lineHeight:32,fontWeight:'800',color:'#f7f9fc',marginTop:14},contextDescription:{fontSize:13,lineHeight:20,color:'#b2bdce',marginTop:8},contextText:{fontSize:12,lineHeight:20,color:'#d2dded',marginTop:15},notice:{padding:15,borderWidth:1,borderRadius:18,gap:12,marginBottom:14},goldText:{color:'#211b0e',fontWeight:'800'}});
