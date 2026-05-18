# 0009 — Use `proxy.ts` (Next 16), not `middleware.ts`

- **Status**: Accepted
- **Date**: 2026-05-15

## Context

Next.js 16 renamed the `middleware` file convention to `proxy`. The exported function name changed from `middleware` to `proxy`. The old name still works in 16.x for backwards compatibility but is deprecated and will be removed.

Every example in my training data (and most blog posts on the internet) uses `middleware.ts` with `export function middleware()`. Following those examples in Next 16 produces working code that silently logs deprecation warnings and will break in a future minor version.

The shipped docs at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` are authoritative for our version. The project's `AGENTS.md` explicitly directs agents to consult those over training data.

## Decision

**Use `src/proxy.ts` with `export async function proxy(request: NextRequest)`** for the Supabase session refresh + protected-route gate. Same matcher pattern as the old middleware, same `NextResponse` API.

The reusable logic lives in `src/lib/supabase/proxy.ts` (the `updateSession` helper). The Next entry point at `src/proxy.ts` is a one-line delegator. This split mirrors the official `@supabase/ssr` recommendation and keeps the actual auth logic testable in isolation.

## Consequences

**Positive:**
- Aligned with current Next.js 16 conventions; no deprecation warnings.
- Future Next.js upgrades that remove the old name don't break us.

**Negative:**
- Code samples and tutorials online — including official Supabase docs — still say "middleware." Anyone copying examples needs to mentally translate `middleware.ts` → `proxy.ts` and `export function middleware` → `export async function proxy`.
- Some IDE templates and snippets will produce stale conventions.

## When to revisit

If Next.js ever reverts or further changes the naming convention. Watch the Next.js changelog on major version bumps.
