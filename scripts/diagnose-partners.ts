// Read-only diagnostic: cross-reference partners rows against auth.users to see
// who has actually set a password / signed in. Run with:
//   node --env-file=.env.local --import tsx scripts/diagnose-partners.ts
import { createClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
const { data: partners, error } = await admin
  .from("partners")
  .select("id, company_name, contact_name, role, status, is_internal, created_at")
  .order("created_at", { ascending: true });
if (error) throw error;

const { data: list, error: listErr } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listErr) throw listErr;
const byId = new Map(list.users.map((u) => [u.id, u]));

console.log(`partners rows: ${partners!.length}, auth users: ${list.users.length}\n`);
for (const p of partners!) {
  const u = byId.get(p.id);
  console.log(
    [
      p.company_name,
      p.contact_name,
      p.role + (p.is_internal ? "/internal" : ""),
      `status=${p.status}`,
      u ? `email=${u.email}` : "NO-AUTH-USER",
      u ? `confirmed=${u.email_confirmed_at ? "Y" : "N"}` : "",
      u ? `invited=${u.invited_at ? "Y" : "N"}` : "",
      u ? `lastSignIn=${u.last_sign_in_at ?? "NEVER"}` : "",
    ].join("  |  "),
  );
}

// Detect orphan auth users (auth user with no partner row) — these cause the
// "already registered" error on re-invite.
const partnerIds = new Set(partners!.map((p) => p.id));
const orphans = list.users.filter((u) => !partnerIds.has(u.id));
if (orphans.length) {
  console.log(`\nORPHAN auth users (no partners row):`);
  for (const u of orphans) {
    console.log(`  ${u.email}  id=${u.id}  lastSignIn=${u.last_sign_in_at ?? "NEVER"}`);
  }
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
