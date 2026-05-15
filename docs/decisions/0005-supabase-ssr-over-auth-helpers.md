# 0005 — `@supabase/ssr` over the legacy `@supabase/auth-helpers-nextjs`

- **Status**: Accepted
- **Date**: 2026-05-14

## Context

Server-side Supabase usage from Next.js needs a client that can read and write the session cookie correctly across Server Components, Route Handlers, Server Actions, and Middleware. Two packages exist:

1. **`@supabase/auth-helpers-nextjs`** — the legacy helper, written when Next.js's app router was new. Documented across many older tutorials.
2. **`@supabase/ssr`** — the modern replacement. Officially recommended by Supabase. Maintained for the current Next.js + SSR model.

## Decision

**`@supabase/ssr`** (plus `@supabase/supabase-js` for non-SSR code paths like the server-side API route that uses the service-role key).

## Consequences

**Positive:**
- Aligned with Supabase's current guidance and examples; future docs will describe `@supabase/ssr`, not `auth-helpers-nextjs`.
- Cleaner cookie handling across Next 16's App Router (Server Components, Route Handlers, Server Actions, Middleware).

**Negative:**
- Most older blog posts and Stack Overflow answers will be wrong. Cross-reference the [Supabase auth docs](https://supabase.com/docs/guides/auth/server-side/nextjs) directly rather than search results.
- Subtle API differences from `auth-helpers-nextjs` mean copy-pasting from older codebases produces compile errors or stale-session bugs.

## Practical setup pattern (for when Step 3 lands)

We'll create three thin helpers:

- `src/lib/supabase/browser.ts` — uses `createBrowserClient()` from `@supabase/ssr`. For client components only.
- `src/lib/supabase/server.ts` — uses `createServerClient()` with the Next.js cookie store. For Server Components / Route Handlers.
- `src/lib/supabase/admin.ts` — uses `createClient()` from `@supabase/supabase-js` with the service-role key, no session. For server-only code that needs to bypass RLS (signup webhooks, admin tools, scripts).

Never import `admin.ts` from a path that could be reached by a client component. The ESLint config and a runtime check on `typeof window === 'undefined'` will help, but the discipline is mostly enforced by reading file paths carefully.
