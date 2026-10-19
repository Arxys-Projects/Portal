// A fixed origin that can never be a real site, used only to resolve `next`.
const BASE_ORIGIN = "http://n.invalid";

// Browsers read "\" as "/" and drop tabs and newlines before resolving a URL,
// so "/\evil.com" and "/<TAB>/evil.com" leave the site even though they start
// with a single "/". Reject backslashes and every control character outright.
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/;

/**
 * Returns true only for same-origin relative paths that are safe to use as a
 * post-auth redirect target. Rejects protocol-relative URLs (`//evil.com`),
 * absolute URLs (`https://evil.com`) and the backslash / control-character
 * forms browsers also resolve off-site. The path is resolved against a fixed
 * origin and must stay on it. See AUDIT-01 M-2 and ADR 0164.
 */
export function isSafeNext(next: string | null | undefined): next is string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return false;
  if (UNSAFE_CHARS.test(next)) return false;
  let url: URL;
  try {
    url = new URL(next, BASE_ORIGIN);
  } catch {
    return false;
  }
  return url.origin === BASE_ORIGIN;
}
