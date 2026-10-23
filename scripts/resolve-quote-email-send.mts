// Clear a failed or stuck Quote ready send (Project Portal Step 6, ADR 0175).
//
// sendQuoteReadyEmail records each send in quote_email_sends as 'sending'
// before the SMTP call, then 'sent' or 'failed'. A 'failed' row, or a 'sending'
// row a crash left behind, blocks that quote from that address, and the portal
// never retries a send on its own. This script is how Andy clears one so the
// rep can send again. It never sends email and never touches a 'sent' row.
//
// Before clearing a row, look for the BCC copy in the SMTP mailbox: a send with
// no answer, or one that failed after the message was handed over, may still
// have been delivered.
//
// Run:
//   Dry run (default; reads Supabase, writes nothing):
//     node --env-file=.env.local --import tsx scripts/resolve-quote-email-send.mts --quote=<uuid> --email=<address>
//   Write (typed CONFIRM): add --apply.

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { env } from "../src/lib/env";
import { planSendClear } from "../src/lib/project-quote/send-resolution";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
}

async function promptConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(`\n${question} Type CONFIRM to write or anything else to exit: `, (a) => {
      rl.close();
      resolve(a.trim() === "CONFIRM");
    });
  });
}

async function main() {
  const quoteId = arg("quote");
  const address = arg("email")?.trim().toLowerCase();
  const apply = arg("apply") !== undefined;
  if (!quoteId || !/^[0-9a-f-]{36}$/i.test(quoteId) || !address) {
    console.error("Usage: --quote=<uuid> --email=<address> [--apply]");
    process.exit(2);
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: row, error } = await admin
    .from("quote_email_sends")
    .select("id, project_quote_id, to_email, sent_by, status, error, created_at")
    .eq("project_quote_id", quoteId)
    .eq("to_email", address)
    .maybeSingle();
  if (error) throw new Error(`read send: ${error.message}`);
  console.log("Send:", row ?? "(none)");

  const plan = planSendClear(
    row
      ? { id: Number(row.id), toEmail: row.to_email, status: row.status, error: row.error, createdAt: row.created_at }
      : null,
    new Date(),
  );
  if (!plan.ok) {
    console.log(plan.message);
    return;
  }
  // A send can fail after the message was already handed over (a timeout
  // before the server's reply), so a 'failed' row may have been delivered too.
  console.log(
    plan.status === "sending"
      ? "This send never reported back."
      : `This send was marked failed: ${row?.error ?? "(no error recorded)"}. A failure can still have been delivered.`,
  );
  console.log(`Check the SMTP mailbox (${env.SMTP_USER}) for its BCC copy first: if it arrived, the contact has the email, and clearing lets the rep send it again.`);
  console.log("The row is printed above; it is deleted, so keep that output if you want the record.");
  console.log(`Will delete send row ${plan.sendId} (${plan.status}) so the rep can send this quote to ${address} again. No email is sent.`);
  if (!apply) {
    console.log("Dry run: nothing written. Add --apply.");
    return;
  }
  if (!(await promptConfirm("Clear this send?"))) {
    console.log("Nothing written.");
    return;
  }
  const { data: deleted, error: delError } = await admin
    .from("quote_email_sends")
    .delete()
    .eq("id", plan.sendId)
    .eq("status", plan.status)
    .select("id");
  if (delError) throw new Error(`delete send: ${delError.message}`);
  console.log(deleted?.length === 1 ? "Cleared." : "Nothing cleared: the row changed since it was read. Run the dry run again.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
