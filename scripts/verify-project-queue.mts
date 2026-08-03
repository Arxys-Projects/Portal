// Live verification for the /projects query layer (ADRs 0112 / 0113).
//
// Run with:
//   node --env-file=.env.local --import tsx scripts/verify-project-queue.mts
//
// And, to also exercise the Pipedrive refresh path (see the write note below):
//   node --env-file=.env.local --import tsx scripts/verify-project-queue.mts --refresh
//
// WHY THIS EXISTS. The row derivation in src/lib/projects/rows.ts is covered by
// 101 unit tests, but those run on fixtures. The I/O half — the cross-partner
// reads, the RLS gates they depend on, the shape PostgREST returns for the frozen
// snapshot, and the partner-invisibility property ADR 0112 is built on — has
// never executed. Fixtures structurally cannot catch a wrong column name or a
// policy that does not do what its name suggests. This does.
//
// It answers five questions, and reports each one whether it passed or not:
//
//   1. APPLIED    — do the two new tables exist? Both migrations ship unapplied
//                   (docs/apply-notes/0112-0113-projects-page-schema.md), so a
//                   "no" here is the expected pre-apply state, not a failure. It
//                   is reported loudly because everything downstream degrades
//                   quietly when the answer is no, and a degraded pass looks
//                   exactly like a real one.
//   2. CROSS-PARTNER — does an is_internal user actually read across every
//                   partner through submissions_select_internal and
//                   partners_select_internal? This is the claim that let the
//                   migrations add no policy of their own, so it is the claim
//                   most worth checking against the real database.
//   3. CONTRACT   — is every field of the data contract present on every row?
//                   A column dropped from a select surfaces as `undefined`, which
//                   renders as an empty cell rather than as an error.
//   4. STATES     — what does production actually look like through this layer?
//                   Printed as distributions, because the useful signal is
//                   whether the numbers are plausible, not whether they match a
//                   fixture.
//   5. INVISIBLE  — can a plain partner read either new table? ADR 0112 exists
//                   because a flag on `submissions` would have been both
//                   partner-readable and partner-writable, so this is that ADR's
//                   entire premise and the one check its apply note says to do by
//                   hand.
//
// WRITES. Read-only by default: refresh: "none" means zero Pipedrive calls and
// zero cache writes. Two exceptions, both deliberate:
//
//   * Ephemeral personas. Two throwaway users plus their `partners` rows are
//     created and torn down in a `finally`, exactly as scripts/test-rls.ts does
//     it. Nothing else can prove an RLS claim: a service_role connection has no
//     auth.uid() and so passes every gate it is meant to test.
//   * --refresh. Live-reads Pipedrive and upserts pipedrive_deal_cache. That
//     table is a cache with no source of truth in it (every value is a copy of
//     something Pipedrive still holds) and it rebuilds itself on the next
//     refresh, so writing to it is safe. It is still opt-in, because it costs
//     real Pipedrive calls.
//
// It never writes to submissions, project_quotes or
// submission_internal_archives, and never touches Pipedrive except under
// --refresh.
//
// The `.mts` extension is load-bearing: tsx transforms plain `.ts` as CommonJS
// and rejects top-level await.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";
import { groupProjectRowsByPartner } from "../src/lib/projects/by-partner";
import { loadProjectQueue } from "../src/lib/projects/queue";
import type { ProjectQueueRow } from "../src/lib/projects/types";

const REFRESH = process.argv.includes("--refresh");

// The data contract, field by field, maintained by hand on purpose. A field that
// stops being produced shows up here rather than as a blank cell on the page.
const CONTRACT_FIELDS: Array<keyof ProjectQueueRow> = [
  "submission_id",
  "project_name",
  "partner_company_name",
  "partner_contact_name",
  "created_by_user_name",
  "created_by_is_internal",
  "created_at",
  "portal_status",
  "portal_status_editable",
  "internal_archived_at",
  "internal_archived_by",
  "internal_archived_by_name",
  "pipedrive_deal_id",
  "pipedrive_deal_url",
  "deal_link_state",
  "pipedrive_deal_status",
  "pipedrive_status_as_of",
  "pipedrive_read_ok",
  "pipedrive_deal_value",
  "portal_list_price_usd",
  "deal_line_item_count",
  "products_display",
  "products_source",
  "current_quote_version",
  "current_quote_generated_at",
  "needs_price_update",
  "project_quote_version_count",
  "is_superseded",
  "project_key",
  "parent_submission_id",
  "deal_line_items_changed_at",
  "line_item_drift_count",
  "row_state",
  "available_actions",
];

type Check = { name: string; pass: boolean; detail?: string; skipped?: boolean };
const checks: Check[] = [];
const record = (name: string, pass: boolean, detail?: string) =>
  checks.push({ name, pass, detail });
const skip = (name: string, detail: string) =>
  checks.push({ name, pass: true, detail, skipped: true });

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Persona = { id: string; client: SupabaseClient };

async function provisionPersona(suffix: string, isInternal: boolean): Promise<Persona> {
  const email = `projects-verify-${suffix}-${Date.now()}@arxys-verify.invalid`;
  const password = `Verify_${suffix}_${Math.random().toString(36).slice(2)}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const id = data.user.id;

  const { error: partnerErr } = await admin.from("partners").insert({
    id,
    company_name: `Projects Verify Co ${suffix}`,
    contact_name: `Verifier ${suffix}`,
    role: "partner",
    status: "active",
    is_internal: isInternal,
  });
  if (partnerErr) throw new Error(`partners insert failed: ${partnerErr.message}`);

  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);

  return { id, client };
}

async function teardownPersona(p: Persona): Promise<void> {
  // The persona files no submissions, but delete defensively before removing the
  // partners row: submissions.partner_id is `on delete restrict`.
  await admin.from("submissions").delete().eq("partner_id", p.id);
  await admin.from("submission_internal_archives").delete().eq("archived_by", p.id);
  await admin.from("partners").delete().eq("id", p.id);
  await admin.auth.admin.deleteUser(p.id);
}

// Does a table exist and is it readable at all? Probed through service-role, so
// this is an existence check and says nothing about the policies.
async function tableExists(table: string): Promise<boolean> {
  const { error } = await admin.from(table).select("*").limit(1);
  // PostgREST reports an unknown relation as PGRST205 / 42P01.
  return !error;
}

function tally<T extends string | number | boolean | null>(values: T[]): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`)
    .join("  ");
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

async function run(): Promise<void> {
  console.log("/projects query layer — live verification\n");
  if (REFRESH) {
    console.log("--refresh: this run WILL call Pipedrive and upsert pipedrive_deal_cache.\n");
  }

  // ---------------------------------------------------------------------
  // 1. APPLIED
  // ---------------------------------------------------------------------
  const archiveTable = await tableExists("submission_internal_archives");
  const cacheTable = await tableExists("pipedrive_deal_cache");
  record("1a: submission_internal_archives exists", archiveTable);
  record("1b: pipedrive_deal_cache exists", cacheTable);

  if (!archiveTable || !cacheTable) {
    console.log(
      "\n  NOTE  One or both migrations are not applied yet. That is the expected\n" +
        "        pre-apply state (docs/apply-notes/0112-0113-projects-page-schema.md).\n" +
        "        The queue still loads, degraded: nothing reads as archived and every\n" +
        "        linked deal reads as never-read. Checks that depend on the missing\n" +
        "        table are SKIPPED below rather than passing vacuously.\n",
    );
  }

  const internal = await provisionPersona("internal", true);
  const partner = await provisionPersona("partner", false);

  try {
    // -------------------------------------------------------------------
    // 2. CROSS-PARTNER
    // -------------------------------------------------------------------
    const started = Date.now();
    const result = await loadProjectQueue(internal.client, internal.id, {
      refresh: REFRESH ? "all" : "none",
    });
    const elapsed = Date.now() - started;
    const rows = result.rows;

    record("2a: the queue loads for an is_internal user", true, `${rows.length} projects in ${elapsed}ms`);

    const companies = new Set(rows.map((r) => r.partner_company_name));
    record(
      "2b: reads across more than one partner company",
      companies.size > 1,
      `${companies.size} companies`,
    );

    // The ephemeral internal persona files nothing, so every row it sees belongs
    // to somebody else. That is the whole cross-partner claim.
    const ownRows = rows.filter((r) => r.created_by_user_name === "Verifier internal");
    record("2c: the rows belong to other partners, not the viewer", ownRows.length === 0);

    if (rows.length === 0) {
      console.log("\n  0 projects returned. Nothing further to check.\n");
    } else {
      // -----------------------------------------------------------------
      // 3. CONTRACT
      // -----------------------------------------------------------------
      const missing = new Map<string, number>();
      for (const row of rows) {
        for (const field of CONTRACT_FIELDS) {
          if (!(field in row) || row[field] === undefined) {
            missing.set(field, (missing.get(field) ?? 0) + 1);
          }
        }
      }
      record(
        "3a: every contract field is present on every row",
        missing.size === 0,
        missing.size === 0
          ? `${CONTRACT_FIELDS.length} fields × ${rows.length} rows`
          : [...missing].map(([f, n]) => `${f} missing on ${n}`).join("; "),
      );

      // Never blank, never a bare ellipsis (the spec's rule for this line).
      const blankProducts = rows.filter((r) => !r.products_display || r.products_display.trim() === "");
      record("3b: no row has a blank products line", blankProducts.length === 0);

      // Task, Pipedrive and archive slots filled on every row, whatever the state.
      const emptySlot = rows.filter(
        (r) =>
          !r.available_actions.task?.label ||
          !r.available_actions.pipedrive?.label ||
          !r.available_actions.archive?.label,
      );
      record("3c: the task, Pipedrive and archive slots are filled on every row", emptySlot.length === 0);

      // Acceptance check 9, against real data: a stale row must still carry its
      // last known value.
      const staleWithNoValue = rows.filter(
        (r) =>
          r.deal_link_state === "linked" &&
          !r.pipedrive_read_ok &&
          r.pipedrive_status_as_of !== null &&
          r.pipedrive_deal_value === null,
      );
      record(
        "3d: no stale row lost its last known value",
        staleWithNoValue.length === 0,
        staleWithNoValue.length > 0 ? staleWithNoValue.map((r) => r.submission_id).join(", ") : undefined,
      );

      // A Quoted row must never show a calculator recommendation.
      const quotedWithoutVersion = rows.filter(
        (r) => r.products_source === "quoted" && r.current_quote_version === null,
      );
      record("3e: every Quoted row has a proposal version", quotedWithoutVersion.length === 0);

      // -----------------------------------------------------------------
      // 4. STATES
      // -----------------------------------------------------------------
      console.log("\n--- What production looks like through this layer ---");
      console.log(`  row_state        ${tally(rows.map((r) => r.row_state))}`);
      console.log(`  products_source  ${tally(rows.map((r) => r.products_source))}`);
      console.log(`  portal_status    ${tally(rows.map((r) => r.portal_status))}`);
      console.log(`  deal_link_state  ${tally(rows.map((r) => r.deal_link_state))}`);
      console.log(`  pipedrive status ${tally(rows.map((r) => r.pipedrive_deal_status))}`);
      console.log(`  read_ok          ${tally(rows.map((r) => r.pipedrive_read_ok))}`);
      console.log(`  task action      ${tally(rows.map((r) => r.available_actions.task.kind))}`);
      console.log(
        `  drift            ${rows.filter((r) => r.line_item_drift_count > 0).length} rows with differing lines`,
      );
      console.log(
        `  superseded       ${rows.filter((r) => r.is_superseded).length} rows`,
      );
      console.log(
        `  archived         ${rows.filter((r) => r.internal_archived_at !== null).length} rows`,
      );

      console.log("\n--- Band B (attention) ---");
      console.log(`  needs price update on open deals   ${result.attention.needs_price_update_submission_ids.length}`);
      console.log(`  projects with no deal link     ${result.attention.missing_deal_link_submission_ids.length}`);

      console.log("\n--- Band C (the three numbers) ---");
      console.log(
        `  open pipeline (Pipedrive)      ${money(result.totals.open_pipeline_usd)}` +
          `  across ${result.totals.open_pipeline_deal_count} deals` +
          (result.totals.open_pipeline_stale_deal_count > 0
            ? `, ${result.totals.open_pipeline_stale_deal_count} on a stale read`
            : ""),
      );
      console.log(`  as of                          ${result.totals.open_pipeline_as_of ?? "never read"}`);
      console.log(`  open projects                  ${result.totals.open_project_count}`);
      console.log(`  quotes, last 30 days           ${result.totals.quotes_last_30_days}`);

      const groups = groupProjectRowsByPartner(rows);
      console.log(`\n--- By partner: ${groups.length} companies ---`);
      for (const g of groups.slice(0, 8)) {
        console.log(
          `  ${g.company_name.padEnd(34)} ${String(g.project_count).padStart(3)} projects` +
            ` · ${String(g.contact_count).padStart(2)} contacts` +
            ` · open ${money(g.open_pipeline_usd).padStart(12)}` +
            ` · won ${money(g.won_usd).padStart(12)}` +
            (g.needs_price_update_count > 0 ? `  [${g.needs_price_update_count} need pricing updates]` : "") +
            (g.missing_deal_link_count > 0 ? `  [${g.missing_deal_link_count} unlinked]` : ""),
        );
      }
      if (groups.length > 8) console.log(`  ... and ${groups.length - 8} more`);

      const groupedProjects = groups.reduce((n, g) => n + g.project_count, 0);
      record(
        "4a: the By-partner grouping loses no projects",
        groupedProjects === rows.length,
        `${groupedProjects} grouped vs ${rows.length} rows`,
      );

      // Ordering: most recently active first. Checked through created_at as a
      // proxy, which holds for every project with no proposal.
      const noQuote = rows.filter((r) => r.current_quote_version === null);
      const ordered = noQuote.every(
        (r, i) => i === 0 || new Date(noQuote[i - 1].created_at) >= new Date(r.created_at),
      );
      record("4b: proposal-free projects come back newest first", ordered);

      // Print the first few rows in full so the output is reviewable by eye,
      // which is the only way to catch a value that is well-formed and wrong.
      console.log("\n--- First 3 rows, as the page will receive them ---");
      for (const row of rows.slice(0, 3)) {
        console.log(
          `\n  ${row.project_name ?? "(no name)"}  ·  ${row.partner_company_name}\n` +
            `    state       ${row.row_state}\n` +
            `    products    ${row.products_source}: ${row.products_display}\n` +
            `    quote       ${
              row.current_quote_version === null
                ? "none"
                : `v${row.current_quote_version} of ${row.project_quote_version_count}, generated ${row.current_quote_generated_at}${row.needs_price_update ? " (NEEDS PRICE UPDATE)" : ""}`
            }\n` +
            `    deal        ${
              row.pipedrive_deal_id === null
                ? "unlinked"
                : `#${row.pipedrive_deal_id} ${row.pipedrive_deal_status ?? "status unknown"}, ` +
                  `${row.pipedrive_deal_value === null ? "no value" : money(row.pipedrive_deal_value)}, ` +
                  `${row.deal_line_item_count ?? "?"} line items, read ${row.pipedrive_status_as_of ?? "never"}` +
                  `${row.pipedrive_read_ok ? "" : " (STALE)"}`
            }\n` +
            `    drift       ${row.line_item_drift_count} lines differ${
              row.deal_line_items_changed_at ? `, last observed change ${row.deal_line_items_changed_at}` : ""
            }\n` +
            `    task        ${row.available_actions.task.kind}: "${row.available_actions.task.label}"`,
        );
      }
    }

    // -------------------------------------------------------------------
    // 5. INVISIBLE — ADR 0112's premise
    // -------------------------------------------------------------------
    console.log("\n--- Partner invisibility (ADR 0112) ---");

    if (archiveTable) {
      const { data, error } = await partner.client
        .from("submission_internal_archives")
        .select("submission_id");
      record(
        "5a: a partner reads NO archive rows",
        (data?.length ?? 0) === 0,
        error ? `denied: ${error.code ?? error.message}` : `${data?.length ?? 0} rows visible`,
      );

      // The write half. A partner must not be able to archive anything, which is
      // the property a column on `submissions` could not have delivered.
      const { error: writeErr } = await partner.client
        .from("submission_internal_archives")
        .insert({ submission_id: crypto.randomUUID(), archived_by: partner.id });
      record(
        "5b: a partner cannot INSERT an archive row",
        Boolean(writeErr),
        writeErr ? `denied: ${writeErr.code ?? writeErr.message}` : "THE INSERT SUCCEEDED",
      );
    } else {
      skip("5a/5b: partner cannot read or write archive rows", "table not applied yet");
    }

    if (cacheTable) {
      const { data, error } = await partner.client
        .from("pipedrive_deal_cache")
        .select("pipedrive_deal_id");
      record(
        "5c: a partner reads NO cached deal rows",
        (data?.length ?? 0) === 0,
        error ? `denied: ${error.code ?? error.message}` : `${data?.length ?? 0} rows visible`,
      );
    } else {
      skip("5c: partner cannot read cached deal rows", "table not applied yet");
    }

    // And the internal user must be able to, or the queue could never populate.
    if (cacheTable) {
      const { error } = await internal.client.from("pipedrive_deal_cache").select("pipedrive_deal_id");
      record("5d: an internal user CAN read cached deal rows", !error, error?.message);
    } else {
      skip("5d: internal user can read cached deal rows", "table not applied yet");
    }
  } finally {
    await teardownPersona(internal);
    await teardownPersona(partner);
  }

  console.log("\n=== Results ===");
  for (const c of checks) {
    const tag = c.skipped ? "SKIP" : c.pass ? "PASS" : "FAIL";
    console.log(`[${tag}] ${c.name}${c.detail ? `   (${c.detail})` : ""}`);
  }

  const failed = checks.filter((c) => !c.pass);
  const skipped = checks.filter((c) => c.skipped);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exit(1);
  }
  if (skipped.length > 0) {
    console.log(
      `\nAll checks passed, ${skipped.length} skipped. Re-run after applying the migrations:\n` +
        "the skipped ones are the partner-invisibility guarantees, which are the\n" +
        "reason the archive is a side table at all.",
    );
    return;
  }
  console.log("\nAll checks passed.");
}

run().catch((err) => {
  console.error("Verification crashed:", err);
  process.exit(2);
});
