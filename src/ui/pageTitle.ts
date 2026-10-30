/**
 * The browser tab title for every route, in one place: "<Page> · Tableside", and just
 * "Tableside" on the landing page. Rendered by the root layout with expo-router's `Head`, so it
 * is in the prerendered HTML too (expo-router leaves `document.title` alone on web).
 */

export const PRODUCT_NAME = "Tableside";

const PAGES: Readonly<Record<string, string>> = {
  "/": "",
  "/onboarding": "Get started",
  "/lobby": "Lobby",
  "/play": "Blackjack",
  "/games/roulette": "Roulette",
  "/games/craps": "Craps",
  "/games/video-poker": "Video poker",
  "/games/baccarat": "Baccarat",
  "/drills": "Trainer",
  "/drills/basic-strategy": "Basic Strategy drill",
  "/drills/counting": "Counting drill",
  "/drills/true-count": "True Count drill",
  "/drills/deviation": "Deviation drill",
  "/strategies": "Strategies",
  "/strategies/blackjack": "Blackjack strategy builder",
  "/strategies/craps": "Craps strategy builder",
  "/strategies/roulette": "Roulette strategy builder",
  "/live": "Live tables",
  "/live/craps": "Live craps",
  "/progress": "Progress",
  "/pricing": "Pricing",
  "/sign-in": "Sign in",
  "/account": "Account",
  "/rules": "Your table",
  "/shoe-integrity": "Shoe integrity",
  "/session": "Statistics",
  "/design-system": "Design system",
};

/** Routes with a title of their own (for the test that every route has one). */
export const TITLED_ROUTES: readonly string[] = Object.keys(PAGES);

export function pageTitle(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const page = PAGES[path];
  if (page === undefined) return `Not found · ${PRODUCT_NAME}`;
  return page ? `${page} · ${PRODUCT_NAME}` : PRODUCT_NAME;
}
