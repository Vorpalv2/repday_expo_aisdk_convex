import { useEffect } from 'react';
import { Platform } from 'react-native';

// Loading always uses the light artwork canvas, including the browser safe areas.
export function useWhiteLoadingChrome() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const htmlColor = document.documentElement.style.backgroundColor;
    const bodyColor = document.body.style.backgroundColor;
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const themeColor = theme?.content;
    document.documentElement.style.backgroundColor = '#fff';
    document.body.style.backgroundColor = '#fff';
    if (theme) theme.content = '#ffffff';
    return () => {
      document.documentElement.style.backgroundColor = htmlColor;
      document.body.style.backgroundColor = bodyColor;
      if (theme && themeColor !== undefined) theme.content = themeColor;
    };
  }, []);
}

// Match browser/PWA chrome and the overscroll canvas to the AMOLED app surface.
// Restore the previous values on leaving dark mode, preserving other themes.
export function useDarkBrowserChrome(dark: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !dark || typeof document === 'undefined') return;
    const htmlColor=document.documentElement.style.backgroundColor;
    const bodyColor=document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor='#000';
    document.body.style.backgroundColor='#000';
    const previous: {node:HTMLMetaElement;content:string|null;created:boolean}[]=[];
    for(const [name,content] of [['theme-color','#000000'],['apple-mobile-web-app-status-bar-style','black-translucent']]){
      let node=document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      const bootstrap=node?.dataset.repdayDarkBootstrap==='true';
      const created=!node||(bootstrap&&name==='apple-mobile-web-app-status-bar-style');
      if(!node){node=document.createElement('meta');node.name=name;document.head.appendChild(node);}
      previous.push({node,content:bootstrap&&name==='theme-color'?'#3478f6':node.getAttribute('content'),created});
      delete node.dataset.repdayDarkBootstrap;
      node.content=content;
    }
    return()=>{
      document.documentElement.style.backgroundColor=htmlColor;
      document.body.style.backgroundColor=bodyColor;
      for(const {node,content,created} of previous){if(created)node.remove();else if(content===null)node.removeAttribute('content');else node.content=content;}
    };
  },[dark]);
}
