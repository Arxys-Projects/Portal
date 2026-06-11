/**
 * Returns true only for same-origin relative paths that are safe to use as a
 * post-auth redirect target. Rejects protocol-relative URLs (`//evil.com`) and
 * absolute URLs (`https://evil.com`), both of which browsers resolve off-site.
 * See AUDIT-01 M-2.
 */
export function isSafeNext(next: string | null | undefined): next is string {
  return (
    !!next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("://")
  );
}
