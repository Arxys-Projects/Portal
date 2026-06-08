// Re-send a working "set your password" link to every partner still stuck at
// status='invited'. These partners either never completed onboarding or had
// their original single-use link consumed by an email security scanner.
//
// Mechanism: resetPasswordForEmail (recovery). Works for any existing auth user
// whether or not they confirmed, and lands them on the create-password screen
// via the click-through interstitial at /auth/confirm (see ADR 0051). The email
// itself is sent by Supabase using the branded "Reset Password" template, so
// make sure that template's copy is up to date in the dashboard first.
//
// Dry-run (default — prints who WOULD be emailed, sends nothing):
//   node --env-file=.env.local --import tsx scripts/resend-onboarding.ts
// Actually send:
//   node --env-file=.env.local --import tsx scripts/resend-onboarding.ts --send
// Target one of the stuck partners only:
//   node --env-file=.env.local --import tsx scripts/resend-onboarding.ts --send --only gsavage@danners.com
// Preview the flow against your own (or any existing) address before the real send:
//   node --env-file=.env.local --import tsx scripts/resend-onboarding.ts --test andy.newbom@arxys.com
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { env } from "../src/lib/env";

// Canonical partner-facing domain (portal.arxys.com went live 2026-05-26).
// Only governs the redirectTo we pass; the actual email link host is the
// dashboard Site URL via {{ .SiteURL }}. Keep them aligned. Override with --site.
const SITE = "https://portal.arxys.com";
const REDIRECT_TO = `${SITE}/auth/confirm?next=/reset-password`;

async function main() {
  const { values } = parseArgs({
    options: {
      send: { type: "boolean", default: false },
      only: { type: "string" },
      site: { type: "string" },
      test: { type: "string" },
    },
  });
  const doSend = Boolean(values.send);
  const only = values.only?.toLowerCase();
  const redirectTo = values.site
    ? `${values.site}/auth/confirm?next=/reset-password`
    : REDIRECT_TO;

  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  // resetPasswordForEmail hits the public /recover endpoint — use the anon key
  // so it behaves exactly like the in-app forgot-password flow.
  const anon = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // --test <email>: send ONE recovery email to an arbitrary address (bypassing
  // the invited-partner filter) to preview the exact flow the 11 will get,
  // before the real send. The address must be an existing auth user.
  if (values.test) {
    console.log(`TEST SEND — ${values.test} via redirectTo=${redirectTo}\n`);
    const { error: testErr } = await anon.auth.resetPasswordForEmail(values.test, {
      redirectTo,
    });
    if (testErr) {
      console.error(`  ✗ ${values.test}: ${testErr.message}`);
      process.exit(1);
    }
    console.log(`  ✓ sent to ${values.test} — check the inbox and click through.`);
    return;
  }

  const { data: partners, error } = await admin
    .from("partners")
    .select("id, company_name, contact_name, status")
    .eq("status", "invited")
    .order("company_name", { ascending: true });
  if (error) throw error;

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const emailById = new Map(list.users.map((u) => [u.id, u.email]));

  let targets = partners!
    .map((p) => ({ ...p, email: emailById.get(p.id) }))
    .filter((p): p is typeof p & { email: string } => Boolean(p.email));
  if (only) targets = targets.filter((t) => t.email.toLowerCase() === only);

  console.log(
    `${doSend ? "SENDING" : "DRY RUN"} — redirectTo=${redirectTo}\n` +
      `${targets.length} stuck partner(s):\n`,
  );
  for (const t of targets) {
    console.log(`  ${t.company_name} — ${t.contact_name} <${t.email}>`);
  }
  if (!doSend) {
    console.log(`\nNothing sent. Re-run with --send to actually email these.`);
    return;
  }

  console.log("");
  for (const t of targets) {
    const { error: sendErr } = await anon.auth.resetPasswordForEmail(t.email, {
      redirectTo,
    });
    if (sendErr) {
      console.error(`  ✗ ${t.email}: ${sendErr.message}`);
    } else {
      console.log(`  ✓ sent to ${t.email}`);
    }
    // Respect Supabase auth rate limiting (config max_frequency).
    await sleep(1500);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
