import React, {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle} from 'react-native';
import {Image} from 'expo-image';
import {MediaModeIcon, SetActionIcon} from './WorkoutIcons';
import type {Move, WeightUnit} from '../backend/contracts';

type Props = {
  moves: Move[];
  palette: {ink:string;muted:string;blue:string;surface:string;surfaceAlt:string;line:string;button:string;buttonText:string};
  titleFont: string;
  unit: WeightUnit;
  halfView: boolean;
  resting: boolean;
  blocked: boolean;
  index: number;
  onIndex: (index:number)=>void;
  selectedSets: Record<string,number>;
  onSelectSet: (key:string,index:number)=>void;
  mediaMode: 'image'|'gif';
  onMediaMode: (mode:'image'|'gif')=>void;
  media: (move:Move)=>{image?:string;gif?:string};
  renderActions: (move:Move)=>React.ReactNode;
  renderMediaOverlay: (compact?:boolean)=>React.ReactNode;
  input: (mi:number,si:number,field:'weight'|'reps')=>{
    value:string;onFocus:()=>void;onChangeText:(value:string)=>void;onBlur:()=>void;style?:StyleProp<ViewStyle>;
  };
  onStep: (mi:number,si:number,field:'weight'|'reps',direction:1|-1)=>void;
  onComplete: (mi:number,si:number)=>void;
  onFinish: ()=>void;
  onAdd: (mi:number)=>void;
  onRemove: (mi:number,si:number)=>void;
};

/** Presentation only: all set changes are delegated to the active session's existing handlers. */
export function WorkoutCards(p:Props) {
  const rail=useRef<ScrollView>(null);
  const [width,setWidth]=useState(0);
  const [pageHeight,setPageHeight]=useState(0);
  const compact=pageHeight<500;
  const [failedMedia,setFailedMedia]=useState<Record<string,boolean>>({});
  const index=Math.max(0,Math.min(p.index,p.moves.length-1));
  const c=p.palette;
  const latestIndex=useRef(index);
  latestIndex.current=index;
  useEffect(()=>{if(width)rail.current?.scrollTo({x:latestIndex.current*width,animated:false});},[width,p.moves.length]);
  // Web trackpad/touch scrolling does not consistently emit native momentum events.
  // Keep the visible page as the source of truth for every scroll input.
  const syncScrollIndex=(offset:number)=>{
    if(width<=0||p.moves.length===0)return;
    const next=Math.max(0,Math.min(p.moves.length-1,Math.round(offset/width)));
    if(next===latestIndex.current)return;
    latestIndex.current=next;
    p.onIndex(next);
  };
  const navigate=(next:number)=>{
    const target=Math.max(0,Math.min(p.moves.length-1,next));
    p.onIndex(target);
    rail.current?.scrollTo({x:target*width,animated:true});
  };
  const labelStyle={color:c.muted,fontSize:12,fontWeight:'700' as const};
  const circle={...s.circle,backgroundColor:c.surfaceAlt};
  if(!p.moves.length)return <View style={s.empty}><Text style={{color:c.muted}}>Add an exercise to get started.</Text></View>;
  return <View testID="workout-cards" style={{flex:1,minHeight:0}} onLayout={e=>{setWidth(e.nativeEvent.layout.width);}}>
    <View style={s.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous exercise" disabled={index===0} onPress={()=>navigate(index-1)} style={[circle,index===0&&s.disabled]}><Text style={{fontSize:28,color:c.blue}}>‹</Text></Pressable>
      <View style={{alignItems:'center',gap:5}}><Text style={labelStyle}>EXERCISE {index+1} OF {p.moves.length}</Text><View style={{flexDirection:'row',gap:5}}>{p.moves.map((m,i)=><View key={m.key} style={{width:i===index?18:5,height:5,borderRadius:3,backgroundColor:i===index?c.blue:c.line}}/>)}</View></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Next exercise" disabled={index===p.moves.length-1} onPress={()=>navigate(index+1)} style={[circle,index===p.moves.length-1&&s.disabled]}><Text style={{fontSize:28,color:c.blue}}>›</Text></Pressable>
    </View>
    {width>0&&<ScrollView ref={rail} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={16} onScroll={e=>syncScrollIndex(e.nativeEvent.contentOffset.x)} onMomentumScrollEnd={e=>syncScrollIndex(e.nativeEvent.contentOffset.x)} onScrollEndDrag={e=>syncScrollIndex(e.nativeEvent.contentOffset.x)} style={{flex:1,minHeight:0}} onLayout={e=>setPageHeight(e.nativeEvent.layout.height)}>
      {p.moves.map((move,mi)=>{
        const si=Math.max(0,Math.min(p.selectedSets[move.key]??Math.max(0,move.sets.findIndex(set=>!set.done)),move.sets.length-1));
        const set=move.sets[si];
        const exerciseComplete=move.sets.length>0&&move.sets.every(item=>item.done);
        const lastExercise=mi===p.moves.length-1;
        const primaryLabel=exerciseComplete?(lastExercise?'Finish exercise':'Next Exercise'):(set?.done?'Set complete':'Complete set');
        const primaryBlocked=p.blocked||(!exerciseComplete&&p.resting);
        const media=p.media(move);
        const source=p.mediaMode==='gif'?(media.gif??media.image):(media.image??media.gif);
        const failed=source?failedMedia[source]:false;
        return <View key={move.key} style={{width,height:pageHeight,paddingHorizontal:16,paddingBottom:6}} accessibilityElementsHidden={mi!==index} importantForAccessibility={mi===index?'auto':'no-hide-descendants'}>
          <View style={[s.card,{flex:1,minHeight:0,borderColor:c.line,backgroundColor:c.surface}]}>
            <View style={[s.cardHead,{flexShrink:0,padding:compact?8:12,backgroundColor:c.surfaceAlt}]}><Text numberOfLines={2} style={{flex:1,minWidth:0,fontFamily:p.titleFont,fontSize:compact?20:24,color:c.ink}}>{move.name}</Text>{!p.halfView&&<Pressable accessibilityRole="button" accessibilityLabel={`Switch exercise media to ${p.mediaMode==='image'?'GIF':'image'}`} accessibilityHint={`Currently showing ${p.mediaMode}.`} accessibilityState={{disabled:!media.image||!media.gif}} disabled={!media.image||!media.gif} onPress={()=>p.onMediaMode(p.mediaMode==='image'?'gif':'image')} style={{width:44,height:40,borderRadius:12,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',opacity:(!media.image||!media.gif)?0.4:1}}><MediaModeIcon mode={p.mediaMode} color={c.blue}/></Pressable>}{p.renderActions(move)}</View>
            {p.halfView?<View style={s.halfReadouts}>{mi===index&&p.renderMediaOverlay(true)}</View>:(<>            <View style={[s.media,{flex:1,minHeight:0,backgroundColor:'#fff'}]}>
              {source&&!failed?<View style={{alignSelf:'stretch',flex:1}}><Image source={{uri:source}} style={StyleSheet.absoluteFill} contentFit="contain" autoplay={mi===index&&p.mediaMode==='gif'} cachePolicy="disk" accessibilityLabel={`${move.name} ${p.mediaMode==='gif'?'demonstration':'image'}`} onError={()=>setFailedMedia(current=>({...current,[source]:true}))}/></View>:<Text style={{color:'#9298a1',textAlign:'center'}}>Exercise media unavailable</Text>}
              {mi===index&&<View style={s.mediaReadouts}>{p.renderMediaOverlay()}</View>}
            </View></>)}
            <View style={[s.editor,{flexShrink:0,padding:compact?8:12}]}>
              <Text style={[labelStyle,{textAlign:'center'}]}>{(move.target||'Strength').toUpperCase()} · SET {si+1} OF {move.sets.length}</Text>
              <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:compact?5:8}}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Add set to ${move.name}`} accessibilityState={{disabled:p.resting||p.blocked}} disabled={p.blocked} onPress={()=>p.onAdd(mi)} style={[s.setActionIcon,{backgroundColor:c.surfaceAlt},(p.resting||p.blocked)&&s.disabled]}><SetActionIcon kind="plus" color={c.blue}/></Pressable>
              <ScrollView horizontal style={{flexGrow:0,flexShrink:1}} showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7,paddingVertical:0,flexGrow:1,justifyContent:'center'}}>{move.sets.map((item,i)=><Pressable key={i} accessibilityRole="button" accessibilityLabel={`Select set ${i+1}${item.done?', completed':''}`} accessibilityState={{selected:i===si}} onPress={()=>p.onSelectSet(move.key,i)} style={[s.setChip,{height:compact?28:32,backgroundColor:i===si?c.blue:c.surfaceAlt}]}><Text style={{fontWeight:'800',color:i===si?'#fff':item.done?'#35a967':c.muted}}>{i+1}{item.done?' ✓':''}</Text></Pressable>)}</ScrollView>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove last set from ${move.name}`} accessibilityState={{disabled:move.sets.length<=1||p.blocked}} disabled={move.sets.length<=1||p.blocked} onPress={()=>p.onRemove(mi,move.sets.length-1)} style={[s.setActionIcon,{backgroundColor:c.surfaceAlt},(move.sets.length<=1||p.blocked)&&s.disabled]}><SetActionIcon kind="trash" color="#d94b4b"/></Pressable>
              </View>
              {set&&<><View style={{flexDirection:'row',gap:10}}>{(['weight','reps'] as const).map(field=>{
                const input=p.input(mi,si,field);
                return <View key={field} style={[s.stepper,{paddingVertical:compact?6:12,backgroundColor:c.surfaceAlt},input.style]}><Text style={labelStyle}>{field==='weight'?'WEIGHT':'REPS'}</Text><View style={s.stepRow}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${field} by ${field==='weight'?'2.5 kilograms':'1'}`} onPress={()=>p.onStep(mi,si,field,-1)} style={[s.stepButton,{backgroundColor:c.surface}]}><Text style={{fontSize:26,color:c.blue}}>−</Text></Pressable>
                  <TextInput accessibilityLabel={`Set ${si+1} ${field}`} selectTextOnFocus keyboardType="decimal-pad" value={input.value} onFocus={input.onFocus} onChangeText={input.onChangeText} onBlur={input.onBlur} style={{flex:1,minWidth:0,padding:0,textAlign:'center',fontFamily:p.titleFont,fontSize:34,color:c.ink}}/>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${field} by ${field==='weight'?'2.5 kilograms':'1'}`} onPress={()=>p.onStep(mi,si,field,1)} style={[s.stepButton,{backgroundColor:c.surface}]}><Text style={{fontSize:26,color:c.blue}}>+</Text></Pressable>
                </View><Text style={[labelStyle,{fontSize:11}]}>{field==='weight'?`${p.unit} · ± 2.5 kg`:'reps · ± 1 rep'}</Text></View>;
              })}</View>
              <Pressable accessibilityRole="button" accessibilityLabel={exerciseComplete?primaryLabel:`${set.done?'Uncomplete':'Complete'} set ${si+1}`} accessibilityState={{disabled:primaryBlocked}} disabled={p.blocked} onPress={()=>{if(exerciseComplete){if(lastExercise)p.onFinish();else navigate(mi+1);}else p.onComplete(mi,si);}} style={[s.complete,{height:compact?44:52,marginTop:compact?8:12,backgroundColor:!exerciseComplete&&set.done?'#35a967':c.button,opacity:primaryBlocked?0.45:1}]}><Text style={{color:!exerciseComplete&&set.done?'#fff':c.buttonText,fontSize:17,fontWeight:'800'}}>{exerciseComplete?`${primaryLabel}  ›`:`✓  ${primaryLabel}`}</Text></Pressable></>}

            </View>
          </View>
        </View>;
      })}
    </ScrollView>}
  </View>;
}
const s=StyleSheet.create({
  navigation:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingBottom:8},
  circle:{width:38,height:38,borderRadius:20,alignItems:'center',justifyContent:'center'},
  disabled:{opacity:.35},empty:{flex:1,alignItems:'center',justifyContent:'center'},
  card:{borderRadius:24,borderWidth:1,overflow:'hidden'},
  cardHead:{padding:12,flexDirection:'row',gap:8,alignItems:'center'},
  media:{alignItems:'center',justifyContent:'center',padding:8,paddingLeft:110,overflow:'hidden'},
  halfReadouts:{flex:1,minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,paddingVertical:3,zIndex:25},
  mediaReadouts:{position:'absolute',left:8,top:20,width:100,gap:10,zIndex:20},
  editor:{padding:12},setChip:{minWidth:36,height:32,borderRadius:17,paddingHorizontal:9,alignItems:'center',justifyContent:'center'},
  stepper:{flex:1,minWidth:0,borderRadius:20,paddingHorizontal:6,paddingVertical:12,alignItems:'center',gap:4},
  stepRow:{flexDirection:'row',alignItems:'center',width:'100%',gap:2},stepButton:{width:40,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
  complete:{height:52,borderRadius:27,alignItems:'center',justifyContent:'center',marginTop:12},
  setActionIcon:{width:40,height:40,borderRadius:21,flexShrink:0,alignItems:'center',justifyContent:'center'},
});
