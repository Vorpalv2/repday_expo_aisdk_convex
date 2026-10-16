import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: PropsWithChildren) {
  return <html lang="en"><head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="application-name" content="Repday" />
    <meta name="apple-mobile-web-app-title" content="Repday" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="theme-color" content="#3478f6" />
    <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('repday.theme')==='dark'){var theme=document.querySelector('meta[name="theme-color"]');theme.content='#000000';theme.dataset.repdayDarkBootstrap='true';var status=document.createElement('meta');status.name='apple-mobile-web-app-status-bar-style';status.content='black-translucent';status.dataset.repdayDarkBootstrap='true';document.head.appendChild(status);}}catch{}` }} />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico?v=2" />
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/repday-login-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/repday-login-180.png" />
    <ScrollViewStyleReset />
  </head><body>{children}</body></html>;
}
