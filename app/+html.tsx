import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";
import { colors } from "@/ui/ds/tokens";

/**
 * The static web document. Only addition to Expo's default: the page itself is painted
 * `--background`, so overscroll and the first paint never flash white.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{ __html: `html,body{background-color:${colors.background};}` }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
