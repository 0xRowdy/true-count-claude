/**
 * Where to go after signing in: a path inside this app, or else the account page. Browsers read
 * `/\host` and a path with a tab in it as `//host`, so backslashes and whitespace are refused too.
 */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/(?!\/)[^\\\s]*$/.test(next) ? next : "/account";
}
