import React from 'react';
import Svg, {Circle, Path, Rect} from 'react-native-svg';

export function MediaModeIcon({mode,color,size=21}:{mode:'image'|'gif';color:string;size?:number}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="3" y="4" width="18" height="16" rx="3" stroke={color} strokeWidth={2} fill="none"/>
    {mode==='gif'?<Path d="m10 8 6 4-6 4Z" stroke={color} strokeWidth={2} strokeLinejoin="round" fill="none"/>:<><Circle cx="8" cy="9" r="1.5" fill={color}/><Path d="m4 17 5-5 4 4 3-3 5 5" stroke={color} strokeWidth={2} strokeLinejoin="round" fill="none"/></>}
  </Svg>;
}

export function SetActionIcon({kind,color}:{kind:'plus'|'trash';color:string}) {
  return <Svg width={19} height={19} viewBox="0 0 24 24"><Path d={kind==='plus'?'M12 5v14M5 12h14':'M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none"/></Svg>;
}
