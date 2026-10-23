import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { env } from "@/lib/env";
import { loadProjectForCalc } from "@/lib/projects/calc-save";
import { gateFingerprintSchema, readPortalBuilt } from "@/lib/projects/pricing-gate";
import { sameGateLines, sameQuotedLines } from "@/lib/projects/deal-lines";
import { readProjectPreparedFor } from "./prepared-for";
import { checkActor, dbRefusal, isRefusal, refuse, type Refusal } from "@/lib/projects/project-deal";
import { projectQuoteExpiryIso } from "./expiry";
import type { ProjectQuoteSnapshot } from "./types";

// Project Portal Step 6 (ADR 0177): the "Quote ready" email to a project's
// primary contact, with the stored quote's PDF attached.
//
// * Behind PROJECT_QUOTE_EMAIL ("true" turns it on; default off).
// * An explicit rep action. Generation never sends it.
// * The recipient comes from the quote's frozen snapshot (preparedFor),
//   lowercased. An internal session can still INSERT a project_quotes row
//   with any snapshot over REST (ADR 0174), so before sending, the snapshot is
//   checked against live rows: the contact must be, read live by id, the
//   quoted calc's own project contact, active, with the same email; the
//   confirmation it names must be the deal's latest, for this calc, and match
//   the snapshot's own lines; and the quote must be its calc's newest,
//   unexpired version (review gate S-1, S-4, S-8). The address sent to is
//   still the snapshot's. `recipientOverride` exists for the live test
//   only: scripts/ construct it; app code never reads it from env, request data
//   or a flag.
// * One quote reaches one address once: the quote_email_sends row is inserted
//   as 'sending' BEFORE the SMTP call (ADR 0175), so a second call finds it and
//   stops. A send with no answer is never retried; Andy clears a failed or
//   stuck row with scripts/resolve-quote-email-send.mts.
// * The SMTP transport (src/lib/email/transport.ts) sets host, port and login
//   only: no CC, BCC or reply-to of its own. This message adds a BCC to
//   SMTP_USER, as every partner-facing email does (ADR 0018), and a reply-to of
//   INTERNAL_NOTIFICATION_EMAIL (sales) so the contact's reply reaches Arxys.

export const PROJECT_QUOTE_EMAIL_FLAG = "PROJECT_QUOTE_EMAIL";
export const PORTAL_URL = "https://portal.arxys.com";

export function quoteEmailEnabled(): boolean {
  return process.env[PROJECT_QUOTE_EMAIL_FLAG] === "true";
}

export type QuoteReadyMail = {
  from: string;
  to: string;
  bcc?: string;
  replyTo: string;
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer; contentType: "application/pdf" }[];
};

export type QuoteEmailDeps = {
  admin: SupabaseClient;
  // The stored quote's PDF, rendered from its snapshot (never a live pull).
  render: (snapshot: ProjectQuoteSnapshot, submissionId: string) => Promise<Uint8Array>;
  filename: (snapshot: ProjectQuoteSnapshot) => string;
  sendMail: (mail: QuoteReadyMail) => Promise<unknown>;
  // Live test only (scripts/). The send log records the address actually used.
  recipientOverride?: string;
  now?: () => Date;
};

const uuid = z.string().uuid();
const email = z.string().trim().toLowerCase().email().max(320);

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function longDate(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Plain and short, to a partner contact as a peer: what is attached and where
// to find it. House rules: no em dashes, no "not X, but Y".
export function buildQuoteReadyText(input: {
  contactName: string | null;
  projectName: string | null;
  identifier: string;
  validThrough: string;
  submissionId: string;
  portalLink: boolean;
}): { subject: string; text: string } {
  // Typed by whoever saved the calc: capped so it cannot carry a long message.
  const project = input.projectName?.replace(/\s+/g, " ").trim().slice(0, 120) || "your project";
  const firstName = input.contactName?.trim().split(/\s+/)[0];
  const lines = [
    firstName ? `Hi ${firstName},` : "Hello,",
    "",
    `Your Arxys quote for ${project} is attached (${input.identifier}). It is valid through ${longDate(input.validThrough)}.`,
    "",
    ...(input.portalLink
      ? ["You can also open it any time in the Arxys Partner Portal, under Pipeline:", `${PORTAL_URL}/submissions/${input.submissionId}`]
      : ["To see your Arxys quotes in the Partner Portal, request access on the sign-in page:", `${PORTAL_URL}/login`]),
    "",
    "Reply to this email with any questions about the quote.",
    "",
    "Thanks,",
    "Arxys",
  ];
  return { subject: `Arxys quote for ${project}`, text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Plan (every check; no write)
// ---------------------------------------------------------------------------

export type QuoteReadyPlan = {
  ok: true;
  quoteId: string;
  submissionId: string;
  dealId: number;
  portalLink: boolean;
  mail: QuoteReadyMail;
};

type QuoteRow = { id: string; submission_id: string; pipedrive_deal_id: number; version: number; snapshot: ProjectQuoteSnapshot };

/** Every check sendQuoteReadyEmail makes, and the exact message. Writes nothing. */
export async function planQuoteReadyEmail(
  deps: QuoteEmailDeps,
  projectQuoteId: string,
  actorId: string,
): Promise<QuoteReadyPlan | Refusal> {
  const { admin } = deps;
  if (!quoteEmailEnabled()) return refuse("flag-off", "The Quote ready email is turned off.");
  const actor = await checkActor(admin, actorId);
  if (isRefusal(actor)) return actor;
  if (!uuid.safeParse(projectQuoteId).success) return refuse("bad-input", "Invalid quote id.");

  const { data, error } = await admin
    .from("project_quotes")
    .select("id, submission_id, pipedrive_deal_id, version, snapshot")
    .eq("id", projectQuoteId)
    .maybeSingle();
  if (error) return dbRefusal("load the quote", error);
  if (!data) return refuse("bad-input", "That quote could not be found.");
  const quote = data as QuoteRow;
  const snapshot = quote.snapshot;
  const dealId = Number(quote.pipedrive_deal_id);

  // Only the calc's newest quote, and only while it is valid.
  const { data: newest, error: newestError } = await admin
    .from("project_quotes")
    .select("version")
    .eq("submission_id", quote.submission_id)
    .order("version", { ascending: false })
    .limit(1);
  if (newestError) return dbRefusal("check the quote's version", newestError, dealId);
  if (Number((newest ?? [])[0]?.version) !== Number(quote.version)) {
    return refuse("bad-input", "A newer version of this quote exists. Send the newest one.", { dealId });
  }
  const validThrough = projectQuoteExpiryIso(snapshot.generation.generatedAt, snapshot.generation.validityDays);
  if (validThrough < (deps.now?.() ?? new Date()).toISOString().slice(0, 10)) {
    return refuse("bad-input", `This quote expired on ${validThrough}. Generate a new one.`, { dealId });
  }

  const pf = snapshot.preparedFor;
  if (!pf?.contactId) {
    return refuse("no-recipient", "This quote was not prepared for a project contact, so it has no one to send to.");
  }
  const fromSnapshot = email.safeParse(pf.contactEmail ?? "");
  if (!fromSnapshot.success) return refuse("no-recipient", `${pf.contactName ?? "The contact"} has no email address on file.`);
  if (!pf.contactActive) return refuse("no-recipient", `${pf.contactName ?? "The contact"} was not an active contact at ${pf.companyName} when the quote was made.`);
  // Still active and at the company now, with the same email. The address sent
  // to stays the snapshot's; the live one only has to agree.
  const { data: live, error: liveError } = await admin
    .from("contacts")
    .select("active, company_id, email")
    .eq("id", pf.contactId)
    .maybeSingle();
  if (liveError) return dbRefusal("check the contact", liveError, dealId);
  if (!live || live.active !== true || live.company_id !== pf.companyId) {
    return refuse("no-recipient", `${pf.contactName ?? "The contact"} is no longer an active contact at ${pf.companyName}.`);
  }
  if (String(live.email ?? "").trim().toLowerCase() !== fromSnapshot.data) {
    return refuse("no-recipient", `${pf.contactName ?? "The contact"}'s email has changed since this quote was made. Generate the quote again.`);
  }
  // And this contact is the quoted calc's own project contact, read live by id.
  const current = await readProjectPreparedFor(admin, quote.submission_id);
  if (current.status === "error") return dbRefusal(current.context, current.error, dealId);
  if (
    current.status !== "project" ||
    current.preparedFor.projectId !== pf.projectId ||
    current.preparedFor.companyId !== pf.companyId ||
    current.preparedFor.contactId !== pf.contactId
  ) {
    return refuse("no-recipient", "This quote's contact is not the primary contact of its calc's project. Generate the quote again.");
  }

  const built = await readPortalBuilt(admin, dealId);
  if (built.status === "error") return dbRefusal("check whether the portal built this deal", built.error, dealId);
  if (built.portalBuilt && !snapshot.pricingGate?.confirmationId) {
    return refuse("no-confirmation", "This quote was generated before the deal's pricing was confirmed. Confirm the pricing, generate the quote again, and send that one.", { dealId });
  }
  if (built.portalBuilt) {
    // The confirmation the snapshot names must be real, for this deal and calc,
    // and its lines must be the ones the PDF prints.
    const { data: conf, error: confError } = await admin
      .from("quote_pricing_confirmations")
      .select("id, pipedrive_deal_id, submission_id, deal_lines_fingerprint, deal_lines")
      .eq("id", snapshot.pricingGate!.confirmationId)
      .maybeSingle();
    if (confError) return dbRefusal("check the quote's pricing confirmation", confError, dealId);
    const fp = gateFingerprintSchema.safeParse(conf?.deal_lines_fingerprint);
    const genuine =
      !!conf &&
      conf.deal_lines != null &&
      Number(conf.pipedrive_deal_id) === dealId &&
      conf.submission_id === quote.submission_id &&
      fp.success &&
      sameGateLines(fp.data, snapshot.pricingGate!.fingerprint ?? []) &&
      sameQuotedLines(snapshot.commercial?.lineItems, fp.data);
    if (!genuine) {
      return refuse("no-confirmation", "This quote's lines do not match a pricing confirmation for this deal. Generate the quote again.", { dealId });
    }
    // Only a quote made from the deal's latest confirmation: after a later
    // confirmation (a revision, a price change) an older quote is stale.
    const { data: latest, error: latestError } = await admin
      .from("quote_pricing_confirmations")
      .select("id")
      .eq("pipedrive_deal_id", dealId)
      .not("deal_lines", "is", null)
      .order("confirmed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    if (latestError) return dbRefusal("check the deal's latest pricing confirmation", latestError, dealId);
    if (Number((latest ?? [])[0]?.id) !== Number(snapshot.pricingGate!.confirmationId)) {
      return refuse("no-confirmation", "The deal's pricing was confirmed again after this quote was made. Generate the quote again and send that one.", { dealId });
    }
  }

  let to = fromSnapshot.data;
  if (deps.recipientOverride !== undefined) {
    const override = email.safeParse(deps.recipientOverride);
    if (!override.success) return refuse("bad-input", "The test recipient is not a valid email address.");
    to = override.data;
  }

  // The portal link only when the contact's one login sees this calc (ADR
  // 0152): the rule's login, and the grant on the row itself.
  const [project, sub] = await Promise.all([
    loadProjectForCalc(admin, pf.projectId),
    admin.from("submissions").select("on_behalf_of_partner_id").eq("id", quote.submission_id).maybeSingle(),
  ]);
  if (project.status === "db-error") return dbRefusal("check the contact's portal access", project.error, dealId);
  if (sub.error) return dbRefusal("check the contact's portal access", sub.error, dealId);
  const visible = project.status === "ok" ? project.project.visibleToPartnerId : null;
  const portalLink = !!visible && visible === (sub.data?.on_behalf_of_partner_id ?? null);

  let pdf: Uint8Array;
  try {
    pdf = await deps.render(snapshot, quote.submission_id);
  } catch (err) {
    console.error("[quote email render]", err);
    return refuse("send-failed", "The quote's PDF could not be rendered. Nothing was sent.", { dealId });
  }

  const copy = buildQuoteReadyText({
    contactName: pf.contactName,
    projectName: snapshot.sizing?.projectName ?? null,
    identifier: snapshot.generation.identifier,
    validThrough,
    submissionId: quote.submission_id,
    portalLink,
  });
  const auditCopy = env.SMTP_USER.trim().toLowerCase();
  return {
    ok: true,
    quoteId: quote.id,
    submissionId: quote.submission_id,
    dealId,
    portalLink,
    mail: {
      from: env.SMTP_FROM,
      to,
      bcc: auditCopy !== to ? env.SMTP_USER : undefined,
      replyTo: env.INTERNAL_NOTIFICATION_EMAIL,
      subject: copy.subject,
      text: copy.text,
      attachments: [{ filename: deps.filename(snapshot), content: Buffer.from(pdf), contentType: "application/pdf" }],
    },
  };
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export type QuoteReadySent = { ok: true; sendId: number; to: string; portalLink: boolean; warning?: string };

export async function sendQuoteReadyEmail(
  deps: QuoteEmailDeps,
  projectQuoteId: string,
  actorId: string,
): Promise<QuoteReadySent | Refusal> {
  const { admin } = deps;
  const plan = await planQuoteReadyEmail(deps, projectQuoteId, actorId);
  if (isRefusal(plan)) return plan;
  const { mail, dealId } = plan;

  const { data: logged, error } = await admin
    .from("quote_email_sends")
    .insert({ project_quote_id: plan.quoteId, to_email: mail.to, sent_by: actorId, status: "sending" })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const { data: prior } = await admin
      .from("quote_email_sends")
      .select("status")
      .eq("project_quote_id", plan.quoteId)
      .eq("to_email", mail.to)
      .maybeSingle();
    if (prior?.status === "sent") return refuse("already-sent", `This quote was already sent to ${mail.to}.`, { dealId });
    return refuse(
      "send-blocked",
      `A send of this quote to ${mail.to} is in progress or did not finish. It is never retried on its own; ask Andy to check and clear it.`,
      { dealId },
    );
  }
  if (error || !logged) return dbRefusal("record the send", error, dealId);
  const sendId = Number((logged as { id: number }).id);

  try {
    await deps.sendMail(mail);
  } catch (err) {
    const detail = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("[quote email send]", err);
    const { error: markError } = await admin
      .from("quote_email_sends")
      .update({ status: "failed", error: detail })
      .eq("id", sendId)
      .eq("status", "sending");
    if (markError) console.error("[quote email mark failed]", markError);
    return refuse(
      "send-failed",
      `The email to ${mail.to} could not be sent: ${detail}. It will not be retried on its own; ask Andy to clear the send before trying again.`,
      { dealId },
    );
  }

  const { error: markError } = await admin
    .from("quote_email_sends")
    .update({ status: "sent" })
    .eq("id", sendId)
    .eq("status", "sending");
  if (markError) {
    console.error("[quote email mark sent]", markError);
    return { ok: true, sendId, to: mail.to, portalLink: plan.portalLink, warning: "The email was sent, but its log row could not be marked sent. It still blocks a second send." };
  }
  return { ok: true, sendId, to: mail.to, portalLink: plan.portalLink };
}
