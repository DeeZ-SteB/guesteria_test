/** Paths that require a signed-in user. Checked optimistically in proxy.ts and enforced in pages. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

/** Where to send a signed-out visitor: home page with the auth modal open. */
export function signInRedirectPath(returnTo: string): string {
  return `/?auth=signin&next=${encodeURIComponent(returnTo)}`;
}
