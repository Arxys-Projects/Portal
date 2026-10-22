// Who is signed in, and what they may do (ADR 0164). The pure half of
// viewer.ts: no `server-only`, no React, no Next, so the predicates and the
// load step can be unit tested with a fake client. App code imports
// viewer.ts, never this file.
//
// The words match the SQL side: active = status 'active'; internal = active
// and is_internal; staff = active and (admin or internal); admin = active and
// role 'admin'. Every predicate fails closed on a missing partners row, so an
// Auth user with no row gets nothing.

import type { User } from "@supabase/supabase-js";

export type ViewerPartner = {
  company_name: string | null;
  contact_name: string | null;
  role: string | null;
  status: string | null;
  is_internal: boolean | null;
};

// null partner = an Auth user with no partners row.
export type Viewer = { user: User; partner: ViewerPartner | null };

export function isActive(v: Viewer | null): boolean {
  return v?.partner?.status === "active";
}

// Internal alone, without admin: the on-behalf picker and the Project Quote
// panel key on the flag, matching public.is_internal().
export function isInternal(v: Viewer | null): boolean {
  return isActive(v) && v?.partner?.is_internal === true;
}

export function isAdmin(v: Viewer | null): boolean {
  return isActive(v) && v?.partner?.role === "admin";
}

export function isStaff(v: Viewer | null): boolean {
  return isActive(v) && (v?.partner?.role === "admin" || v?.partner?.is_internal === true);
}

export type ActiveViewer = { user: User; partner: ViewerPartner };

export type ViewerGate =
  | { ok: true; viewer: ActiveViewer }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

export function gateViewer(
  v: Viewer | null,
  allowed: (v: Viewer | null) => boolean,
): ViewerGate {
  if (!v) return { ok: false, reason: "unauthenticated" };
  if (!v.partner || !allowed(v)) return { ok: false, reason: "forbidden" };
  return { ok: true, viewer: { user: v.user, partner: v.partner } };
}

// The plain refusal text the admin and staff actions return.
export function gateError(gate: { reason: "unauthenticated" | "forbidden" }): string {
  return gate.reason === "unauthenticated" ? "Not authenticated." : "Not authorized.";
}

// What loadViewer needs from the session-scoped Supabase client; viewer.ts
// builds it, tests pass fakes.
export type ViewerDeps = {
  getUser(): Promise<User | null>;
  loadPartner(userId: string): Promise<{ data: ViewerPartner | null; error: unknown }>;
};

// A failed partners read throws rather than reading as "no row": a transient
// database error should show an error page, not sign the user out.
export async function loadViewer(deps: ViewerDeps): Promise<Viewer | null> {
  const user = await deps.getUser();
  if (!user) return null;
  const { data: partner, error } = await deps.loadPartner(user.id);
  if (error) {
    console.error("[viewer load partner]", error);
    throw new Error("Could not load your account. Please try again.");
  }
  return { user, partner: partner ?? null };
}

// Shown when a signed-in caller has no active partners row.
export const NOT_ACTIVE_MESSAGE =
  "Your account does not have access to the Partner Portal. Contact your administrator.";
