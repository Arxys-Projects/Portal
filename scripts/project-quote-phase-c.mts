// Project Portal Step 6 Phase C: the live test of the pricing gate and the
// Quote ready email (ADRs 0176, 0177). Andy runs every step himself.
//
// Each step is its own run. Reads run by default; a write needs --apply, prints
// exactly what it will write, and asks for a typed CONFIRM.
//
//   check     (default) read-only: --deal's claim, ledger, latest confirmation,
//             current lines and fingerprint, and whether they would pass.
//   confirm   Supabase: one quote_pricing_confirmations row for --deal, from
//             the lines printed (confirmDealPricing as Andy).
//   gate      read-only: the gate's answer for --calc's deal right now.
//   generate  Supabase + Pipedrive: a Project Quote for --calc through the real
//             generateProjectQuote action as Andy, with the gate on. Writes the
//             project_quotes row, attaches the PDF to the deal and renames the
//             deal title (both Pipedrive v1).
//   email     Supabase + SMTP: the Quote ready email for --quote, to --to ONLY.
//             The dry run prints From, To, CC, BCC, Reply-To, the subject, the
//             body and the attachment, and writes nothing (no log row).
//   --self-test  no network: the module mocks reach the action.
//
// Run (from the repo root, so the PDF finds its assets):
//   node --env-file=.env.local --experimental-test-module-mocks --import tsx scripts/project-quote-phase-c.mts check --deal=5589
//   ... confirm --deal=5589 --apply
//   ... gate --calc=<uuid>
//   ... generate --calc=<uuid> --apply
//   ... email --quote=<uuid> --to=<address> --apply
//
// THE TEST DEAL'S CONTACT IS A REAL CUSTOMER. The email step requires --to and
// refuses an address equal to the quote's own contact, so a test cannot reach
// him. The address actually used is what the send log records.
//
// generate signs in as Andy the same way the Step 5 script does (ADR 0172): a
// one-time magic-link token exchanged in memory, signed out on every exit.
//
// PROJECT_QUOTE_GATE and PROJECT_QUOTE_EMAIL are set to "true" inside this
// process only. Production keeps both off; Andy turns them on.

import { mock } from "node:test";
import assert from "node:assert/strict";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

mock.module("server-only", { namedExports: {} });
mock.module("next/cache", { namedExports: { revalidatePath: () => {}, revalidateTag: () => {} } });

let sessionClient: SupabaseClient | null = null;
mock.module("@/lib/supabase/server", {
  namedExports: {
    createSupabaseServerClient: async () => {
      if (!sessionClient) throw new Error("No rep session: only generate signs in.");
      return sessionClient;
    },
  },
});

const { env } = await import("../src/lib/env");
const gate = await import("../src/lib/projects/pricing-gate");
const quoteEmail = await import("../src/lib/project-quote/quote-email");

const REP_EMAIL = "andy.newbom@arxys.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

process.env[gate.PROJECT_QUOTE_GATE_FLAG] = "true";
process.env[quoteEmail.PROJECT_QUOTE_EMAIL_FLAG] = "true";

const argv = process.argv.slice(2);
const step = argv.find((a) => !a.startsWith("--")) ?? "check";
function arg(name: string): string | undefined {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
}
const apply = arg("apply") !== undefined;

function uuidArg(name: string): string {
  const v = arg(name);
  if (!v || !UUID.test(v)) throw new Error(`--${name}=<uuid> is required for ${step}.`);
  return v;
}
function dealArg(): number {
  const id = Number(arg("deal") ?? 5589);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("--deal=<id> must be a deal id.");
  return id;
}

async function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(`\n${question} Type CONFIRM to write or anything else to exit: `, (a) => {
      rl.close();
      resolve(a.trim() === "CONFIRM");
    });
  });
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const gateDeps = { admin, pipedriveToken: env.PIPEDRIVE_API_TOKEN };

async function loadActor(): Promise<{ id: string; email: string }> {
  let found: { id: string } | undefined;
  for (let page = 1; page <= 20 && !found; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`list auth users: ${error.message}`);
    found = data.users.find((u) => (u.email ?? "").toLowerCase() === REP_EMAIL);
    if (data.users.length < 200) break;
  }
  if (!found) throw new Error(`No auth user with email ${REP_EMAIL}.`);
  const { data: p, error } = await admin.from("partners").select("id, status, is_internal").eq("id", found.id).maybeSingle();
  if (error || !p) throw new Error(`read the rep's partner row: ${error?.message ?? "none"}`);
  if (p.status !== "active" || p.is_internal !== true) throw new Error("The rep must be active with is_internal = true.");
  return { id: p.id as string, email: REP_EMAIL };
}

function printLines(lines: { id: number; product_id: number; quantity?: number | null; item_price?: number | null; discount?: number | null; discount_type?: string | null; sum?: number | null; comments?: string | null }[]) {
  console.table(
    lines.map((l) => ({
      line: l.id,
      product: l.product_id,
      qty: l.quantity,
      item_price: l.item_price,
      discount: l.discount == null ? "" : `${l.discount} ${l.discount_type ?? ""}`.trim(),
      sum: l.sum,
      comment: l.comments,
    })),
  );
}

// ---------------------------------------------------------------------------

async function check() {
  const actor = await loadActor();
  const dealId = dealArg();
  const built = await gate.readPortalBuilt(admin, dealId);
  console.log(`Deal #${dealId}: portal-built=${built.status === "ok" ? built.portalBuilt : `READ FAILED ${String(built.error)}`}`);
  const { data: ledger } = await admin.from("deal_line_syncs").select("sku, role, qty, status").eq("pipedrive_deal_id", dealId);
  console.log("Ledger:", ledger);
  const { data: confs } = await admin
    .from("quote_pricing_confirmations")
    .select("id, confirmed_by, confirmed_at, submission_id")
    .eq("pipedrive_deal_id", dealId)
    .order("confirmed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(3);
  console.log("Latest confirmations:", confs);
  const pricing = await gate.readDealPricing(gateDeps, dealId, actor.id);
  if (!pricing.ok) {
    console.log(`Would not confirm: ${pricing.message}`);
    if (pricing.diff) {
      console.log("\nThe deal's lines now:");
      printLines(await gate.readDealLines(env.PIPEDRIVE_API_TOKEN, dealId));
      const d = pricing.diff;
      console.log("\nChanges to make by hand in Pipedrive so the deal matches the calc's design:");
      for (const m of d.missing) console.log(`  ADD     ${m.qty} x ${m.sku}, comment "Arxys role: ${m.role}"`);
      for (const e of d.extra) {
        console.log(`  EXTRA   line ${e.attachmentId}: product ${e.productId} (${e.sku ?? "no code"}), qty ${e.qty ?? "?"}, role ${e.role ?? "none in the comment"}. Remove it, or set its comment if it is a design line.`);
      }
      for (const q of d.quantity) console.log(`  QTY     line ${q.attachmentId}: ${q.sku} (${q.role}) is ${q.actual ?? "?"}, the design says ${q.expected}`);
      for (const r of d.role) console.log(`  ROLE    line ${r.attachmentId}: ${r.sku} is marked ${r.actual}, the design says ${r.expected}; change its comment to "Arxys role: ${r.expected}"`);
    }
    return;
  }
  console.log(`Current calc for the deal: ${pricing.calcId}. Lines now:`);
  printLines(pricing.lines);
  const now = await gate.checkQuoteGate(gateDeps, dealId, pricing.calcId);
  console.log("Gate now:", "kind" in now ? now.kind : `refused (${now.reason}): ${now.message}`);
  await compareV1V2(dealId, pricing.lines);
}

// Review gate A-2: a gated quote is built from the v2 line read. Before relying
// on it, the same deal read through v1 (as today's quotes are) must give the
// same line items. Prints the v2 field names so a missing one is visible.
async function compareV1V2(dealId: number, v2Lines: import("../src/lib/pipedrive/project-deal-api").PdV2DealProduct[]) {
  const { getDealForQuote } = await import("../src/lib/pipedrive/quote");
  const { toQuoteLines } = await import("../src/lib/projects/deal-lines");
  console.log("v2 line fields:", v2Lines[0] ? Object.keys(v2Lines[0]).sort().join(", ") : "(no lines)");
  const [v1, v2] = await Promise.all([
    getDealForQuote(dealId),
    getDealForQuote(dealId, toQuoteLines(v2Lines)),
  ]);
  if (!v1.ok || !v2.ok) return console.log("v1/v2 comparison: a read failed.", v1.ok ? "" : v1.error, v2.ok ? "" : v2.error);
  const key = (l: (typeof v1.deal.lineItems)[number]) =>
    JSON.stringify([l.productId, l.productName, l.quantity, l.unitPrice, l.discount, l.discountType, l.lineAmount, l.currency, l.orderNr]);
  // In array order: the gated PDF prints v2's order_nr order, the preview v1's.
  const a = v1.deal.lineItems.map(key);
  const b = v2.deal.lineItems.map(key);
  const sameSet = a.length === b.length && [...a].sort().every((k, i) => k === [...b].sort()[i]);
  const sameOrder = sameSet && a.every((k, i) => k === b[i]);
  // The check the email makes later: the quote's lines against the fingerprint.
  const { fingerprintGateLines, sameQuotedLines } = await import("../src/lib/projects/deal-lines");
  const emailOk = sameQuotedLines(v2.deal.lineItems, fingerprintGateLines(v2Lines));
  console.log(`v1/v2 comparison: lines ${sameSet ? "identical" : "DIFFERENT"}; order ${sameOrder ? "identical" : "DIFFERENT"}; email line check ${emailOk ? "passes" : "FAILS"}.`);
  if (sameOrder && emailOk) return;
  process.exitCode = 1;
  console.log("Do not generate a gated quote until this is understood.");
  console.log("v1:", a);
  console.log("v2:", b);
}

async function confirmStep() {
  const actor = await loadActor();
  const dealId = dealArg();
  const pricing = await gate.readDealPricing(gateDeps, dealId, actor.id);
  if (!pricing.ok) return console.log(`Refused: ${pricing.message}`);
  console.log(`Deal #${dealId}, current calc ${pricing.calcId}. These are the lines you are confirming (Pipedrive's values, as read now):`);
  printLines(pricing.lines);
  console.log(`Writes: one quote_pricing_confirmations row (service role) with this fingerprint and these lines, confirmed_by ${actor.id}. No Pipedrive write.`);
  if (!apply) return console.log("Dry run: nothing written. Add --apply.");
  if (!(await confirm("Confirm this deal's pricing?"))) return console.log("Nothing written.");
  const r = await gate.confirmDealPricing(gateDeps, dealId, pricing.fingerprint, actor.id);
  console.log(r.ok ? `Confirmed: confirmation #${r.confirmationId}.` : `Refused (${r.reason}): ${r.message}`);
  if (!r.ok) process.exitCode = 1;
}

async function calcDeal(calcId: string): Promise<number> {
  const { data, error } = await admin.from("submissions").select("pipedrive_deal_id").eq("id", calcId).maybeSingle();
  if (error || !data?.pipedrive_deal_id) throw new Error(`Calc ${calcId} has no deal (${error?.message ?? "none"}).`);
  return Number(data.pipedrive_deal_id);
}

async function gateStep() {
  const calcId = uuidArg("calc");
  const dealId = await calcDeal(calcId);
  const r = await gate.checkQuoteGate(gateDeps, dealId, calcId);
  console.log(`Gate for calc ${calcId} (deal #${dealId}):`, "kind" in r ? r.kind : `REFUSED (${r.reason}): ${r.message}`);
}

async function generate() {
  const actor = await loadActor();
  const calcId = uuidArg("calc");
  const dealId = await calcDeal(calcId);
  const { data: last } = await admin.from("project_quotes").select("version").eq("submission_id", calcId).order("version", { ascending: false }).limit(1);
  console.log(`Will generate version ${((last ?? [])[0]?.version ?? 0) + 1} of the Project Quote for calc ${calcId} on deal #${dealId}, as ${actor.email}, with the pricing gate ON in this process.`);
  console.log(
    [
      "External calls, in order:",
      "  Supabase reads (Andy's session): the submission, partners, current_products, product_specs, the latest version, the signed-in user, the partner logo.",
      "  Supabase reads (service role): the project link, project, company, contact; the deal's claim, ledger and latest confirmation.",
      "  Pipedrive reads: v2 GET /deals/{id}/products?sort_by=order_nr (every page, once, gated deals only); v1 GET /deals/{id}; v1 GET /products/{id} per distinct product.",
      "  WRITE Supabase: one project_quotes row (pin trigger checks deal and version).",
      "  WRITE Pipedrive v1: POST /files (the PDF, attached to the deal); PUT /deals/{id} (title set to the quote's file name).",
      "  No email, no note, no stage change.",
    ].join("\n"),
  );
  if (!apply) return console.log("Dry run: nothing written, no sign-in. Add --apply.");
  if (!(await confirm("Generate the quote?"))) return console.log("Nothing written.");

  sessionClient = await signIn(actor);
  try {
    const { generateProjectQuote } = (await import("../src/app/(app)/admin/submissions/[id]/project-quote-actions")) as unknown as {
      generateProjectQuote: (id: string) => Promise<Record<string, unknown>>;
    };
    const r = await generateProjectQuote(calcId);
    console.log(JSON.stringify(r, null, 2));
    if (r.ok !== true) process.exitCode = 1;
    const { data: q } = await admin
      .from("project_quotes")
      .select("id, version, snapshot->pricingGate, snapshot->preparedFor")
      .eq("submission_id", calcId)
      .order("version", { ascending: false })
      .limit(1);
    console.log("Latest quote row:", JSON.stringify(q?.[0] ?? null, null, 2));
  } finally {
    await signOut();
  }
}

async function email() {
  const actor = await loadActor();
  const quoteId = uuidArg("quote");
  const to = arg("to");
  if (!to) throw new Error("--to=<address> is required. The email goes to that address only.");
  const { data: q, error } = await admin.from("project_quotes").select("snapshot->preparedFor").eq("id", quoteId).maybeSingle();
  if (error) throw new Error(`read quote: ${error.message}`);
  const realContact = String((q?.preparedFor as { contactEmail?: string } | null)?.contactEmail ?? "").trim().toLowerCase();
  if (realContact && to.trim().toLowerCase() === realContact) {
    throw new Error("Refused: --to is the quote's real contact. A test never emails the customer.");
  }

  const { renderProjectQuotePdfBuffer, projectQuotePdfFilename } = await import("../src/lib/project-quote/render");
  const { resolveSubmissionOwnerLogoDataUri } = await import("../src/lib/storage/partner-logo");
  const { getMailer } = await import("../src/lib/email/transport");
  const deps = {
    admin,
    render: async (snapshot: Parameters<typeof renderProjectQuotePdfBuffer>[0], submissionId: string) =>
      renderProjectQuotePdfBuffer(snapshot, { partnerLogoDataUri: await resolveSubmissionOwnerLogoDataUri(admin, submissionId) }),
    filename: projectQuotePdfFilename,
    sendMail: (mail: Parameters<ReturnType<typeof getMailer>["sendMail"]>[0]) => getMailer().sendMail(mail),
    recipientOverride: to,
  };

  const plan = await quoteEmail.planQuoteReadyEmail(deps, quoteId, actor.id);
  if (!plan.ok) {
    process.exitCode = 1;
    return console.log(`Refused (${plan.reason}): ${plan.message}`);
  }
  const m = plan.mail;
  console.log(`From:     ${m.from}`);
  console.log(`To:       ${m.to}`);
  console.log("CC:       (none)");
  console.log(`BCC:      ${m.bcc ?? "(none)"}`);
  console.log(`Reply-To: ${m.replyTo}`);
  console.log(`Subject:  ${m.subject}`);
  console.log(`Attached: ${m.attachments[0].filename} (${m.attachments[0].content.length} bytes)`);
  console.log(`Link:     ${plan.portalLink ? "portal (the contact's login sees this calc)" : "access request (no single login sees this calc)"}`);
  console.log(`\n${m.text}\n`);
  console.log(`Writes: one quote_email_sends row (${quoteId}, ${m.to}) as sending, then sent or failed. Sends ONE email.`);
  if (!apply) return console.log("Dry run: nothing written, nothing sent. Add --apply.");
  if (!(await confirm(`Send this email to ${m.to}?`))) return console.log("Nothing sent.");
  const r = await quoteEmail.sendQuoteReadyEmail(deps, quoteId, actor.id);
  console.log(r.ok ? `Sent to ${r.to} (send #${r.sendId}).${r.warning ? ` ${r.warning}` : ""}` : `Refused (${r.reason}): ${r.message}`);
  if (!r.ok) process.exitCode = 1;
}

// ---------------------------------------------------------------------------

async function signIn(actor: { id: string; email: string }): Promise<SupabaseClient> {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: actor.email });
  if (error || !link?.properties?.hashed_token) throw new Error(`one-time sign-in token: ${error?.message ?? "none returned"}`);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error: verifyError } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (verifyError || data.user?.id !== actor.id) {
    if (data?.session) await client.auth.signOut({ scope: "local" });
    throw new Error(`sign-in as ${actor.email} failed: ${verifyError?.message ?? "wrong user"}`);
  }
  return client;
}

async function signOut() {
  if (!sessionClient) return;
  const client = sessionClient;
  sessionClient = null;
  const { error } = await client.auth.signOut({ scope: "local" });
  console.log(error ? `Sign-out of the script session FAILED: ${error.message}. Revoke it in Supabase Auth.` : "Script session signed out (this session only).");
}

async function selfTest() {
  const viewer = (await import("../src/lib/auth/viewer")) as { requireStaff: () => Promise<unknown> };
  await assert.rejects(viewer.requireStaff(), /No rep session/);
  const actions = (await import("../src/app/(app)/admin/submissions/[id]/project-quote-actions")) as { generateProjectQuote?: unknown };
  assert.equal(typeof actions.generateProjectQuote, "function");
  assert.equal(gate.quoteGateEnabled(), true);
  assert.equal(quoteEmail.quoteEmailEnabled(), true);
  console.log("Self-test: the action loads, its account gate uses the script's client, both flags are on in this process only.");
}

const steps: Record<string, () => Promise<unknown>> = { check, confirm: confirmStep, gate: gateStep, generate, email };

process.on("SIGINT", () => {
  void signOut().finally(() => process.exit(130));
});

try {
  if (arg("as") !== undefined) throw new Error("--as is not supported: the script acts as Andy only.");
  if (arg("self-test") !== undefined) await selfTest();
  else if (!steps[step]) throw new Error(`Unknown step "${step}". Steps: ${Object.keys(steps).join(", ")}.`);
  else await steps[step]();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await signOut();
}
