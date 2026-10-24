import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import type { PropsWithChildren } from "react";
import { imageUri, portraits } from "@/ui/ds/Avatar";
import { colors } from "@/ui/ds/tokens";
import { pageTitle } from "@/ui/pageTitle";

/**
 * The static web document. Additions to Expo's default: the page itself is painted
 * `--background`, so overscroll and the first paint never flash white, the bundled
 * portraits are preloaded, and the tab title is in the exported HTML (`Head` only sets it
 * once the app has loaded). `headNodes` and `bodyNodes` carry the styles and the JS bundles:
 * without them the page never becomes interactive.
 */
export default function Root({ children, pathname }: PropsWithChildren<{ pathname?: string }>) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {pathname ? <title>{pageTitle(pathname)}</title> : null}
        <ScrollViewStyleReset />
        {/* The coach's portrait: requested with the page, so no Coach Note waits on it. */}
        {Object.values(portraits).map((source) => {
          const href = imageUri(source);
          return href ? <link key={href} rel="preload" as="image" href={href} /> : null;
        })}
        <style
          dangerouslySetInnerHTML={{ __html: `html,body{background-color:${colors.background};}` }}
        />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
