"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Public, unauthenticated "Request access" intake from the login page. This is
// the portal's only anonymous-origin write path (ADR 0077). The write runs
// server-side via service_role — anon holds no grant on access_requests — so
// the honeypot, throttle, and dedup below are the sole gate and cannot be
// bypassed with the public anon key. No email is sent anywhere; the table is
// the entire notification mechanism.

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  companyName: z.string().trim().min(1).max(120),
});

export type RequestAccessState =
  | { status: "idle" }
  | { status: "error"; error: string; fieldErrors?: Record<string, string[]> }
  | { status: "ok"; message: string };

// Shown for a clean submit AND for a honeypot hit — the two are indistinguishable
// to the submitter by design.
const SUCCESS_MESSAGE = "Thanks — we've received your request and will be in touch.";
const THROTTLE_MESSAGE =
  "We've received several requests from here recently. Please try again later.";
const PENDING_MESSAGE = "You already have a request pending — we'll be in touch.";
const GENERIC_ERROR = "Something went wrong. Please try again later.";

// Max requests allowed before we start rejecting: per-IP within the last hour,
// or per-email within the last 24 hours.
const THROTTLE_LIMIT = 3;

function clientIp(headerBag: Headers): string | null {
  const forwarded = headerBag.get("x-forwarded-for");
  if (forwarded) {
    // Vercel prepends the real client IP as the first entry.
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headerBag.get("x-real-ip");
}

export async function requestAccess(
  _prev: RequestAccessState | null,
  formData: FormData,
): Promise<RequestAccessState> {
  // 1. Honeypot. A hidden, off-screen field basic bots fill in. If it's
  //    populated, silently accept (same success UI) without inserting a row.
  const honeypot = String(formData.get("website") ?? "").trim();
  if (honeypot !== "") {
    return { status: "ok", message: SUCCESS_MESSAGE };
  }

  // 2. Validate.
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    companyName: formData.get("companyName"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      status: "error",
      error: "Fix the highlighted fields and try again.",
      fieldErrors,
    };
  }
  const { name, companyName } = parsed.data;
  const emailLc = parsed.data.email.toLowerCase();

  // 3. Capture IP server-side (never trust a client-supplied value).
  const headerBag = await headers();
  const ip = clientIp(headerBag);

  const admin = createSupabaseAdminClient();
  const now = Date.now();

  // 4. Dedup: an existing pending request for this email gets a friendly nudge,
  //    not a duplicate row.
  const pending = await admin
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", emailLc)
    .eq("status", "pending");
  if (pending.error) {
    console.error("[requestAccess] pending dedup failed", pending.error);
    return { status: "error", error: GENERIC_ERROR };
  }
  if ((pending.count ?? 0) > 0) {
    return { status: "ok", message: PENDING_MESSAGE };
  }

  // 5. Throttle: too many from the same IP in the last hour, or the same email
  //    in the last 24 hours → generic soft failure.
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  if (ip) {
    const ipCount = await admin
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", oneHourAgo);
    if (ipCount.error) {
      console.error("[requestAccess] ip throttle count failed", ipCount.error);
      return { status: "error", error: GENERIC_ERROR };
    }
    if ((ipCount.count ?? 0) >= THROTTLE_LIMIT) {
      return { status: "error", error: THROTTLE_MESSAGE };
    }
  }

  const emailCount = await admin
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", emailLc)
    .gte("created_at", oneDayAgo);
  if (emailCount.error) {
    console.error("[requestAccess] email throttle count failed", emailCount.error);
    return { status: "error", error: GENERIC_ERROR };
  }
  if ((emailCount.count ?? 0) >= THROTTLE_LIMIT) {
    return { status: "error", error: THROTTLE_MESSAGE };
  }

  // 6. Flag (don't block) an email that already has a portal account. Reuse the
  //    same admin listUsers join the partners page uses; no second lookup path.
  //    listUsers caps at perPage=200 — fine for the current user base; if it
  //    grows past that, paginate here (mirrors the note on the partners page).
  let existingUser = false;
  const list = await admin.auth.admin.listUsers({ perPage: 200 });
  if (list.error) {
    // Non-fatal: fall through with existing_user=false rather than block a
    // legitimate request on an auth-list hiccup.
    console.error("[requestAccess] listUsers failed", list.error);
  } else {
    existingUser = list.data.users.some(
      (u) => u.email?.toLowerCase() === emailLc,
    );
  }

  // 7. Insert (service_role bypasses RLS). status + created_at defaulted.
  const insert = await admin.from("access_requests").insert({
    name,
    email: emailLc,
    company_name: companyName,
    ip_address: ip,
    existing_user: existingUser,
  });
  if (insert.error) {
    console.error("[requestAccess] insert failed", insert.error);
    return { status: "error", error: GENERIC_ERROR };
  }

  return { status: "ok", message: SUCCESS_MESSAGE };
}
