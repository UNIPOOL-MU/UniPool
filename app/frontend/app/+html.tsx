import React from "react";
import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#2447A8" />
      <meta name="description" content="UniPool for campus rides, live trip coordination and shared money." />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content="UniPool" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <ScrollViewStyleReset />
      <style dangerouslySetInnerHTML={{ __html: `html,body,#root{height:100%;width:100%;margin:0;min-width:0}body{overscroll-behavior-y:none}#root{isolation:isolate}` }} />
    </head>
    <body>{children}</body>
  </html>;
}
