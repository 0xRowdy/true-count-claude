import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";
import { imageUri, portraits } from "@/ui/ds/Avatar";
import { colors } from "@/ui/ds/tokens";

/**
 * The static web document. Additions to Expo's default: the page itself is painted
 * `--background`, so overscroll and the first paint never flash white, and the bundled
 * portraits are preloaded.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        {/* The coach's portrait: requested with the page, so no Coach Note waits on it. */}
        {Object.values(portraits).map((source) => {
          const href = imageUri(source);
          return href ? <link key={href} rel="preload" as="image" href={href} /> : null;
        })}
        <style
          dangerouslySetInnerHTML={{ __html: `html,body{background-color:${colors.background};}` }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
