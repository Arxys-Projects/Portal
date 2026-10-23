// What scripts/resolve-quote-email-send.mts may do with a Quote ready send-log
// row (ADR 0175). Pure, so the rules are unit-tested; the script does the read
// and the delete.
//
// A 'failed' row, or a 'sending' row a crash left, blocks that quote from that
// address. Clearing it lets the rep send again. Either may still have been
// delivered (a failure can come after the message was handed over), so Andy
// checks the BCC copy in the SMTP mailbox first.

export type SendForResolution = {
  id: number;
  toEmail: string;
  status: string;
  error: string | null;
  createdAt: string;
};

// A 'sending' row younger than this may be a send still running.
export const SENDING_MIN_AGE_MS = 15 * 60 * 1000;

export type SendClear = { ok: true; sendId: number; status: "failed" | "sending" } | { ok: false; message: string };

export function planSendClear(row: SendForResolution | null, now: Date): SendClear {
  if (!row) return { ok: false, message: "No send of this quote to that address is recorded. Nothing to clear." };
  if (row.status === "sent") {
    return { ok: false, message: `This quote was sent to ${row.toEmail}. A sent email is never cleared.` };
  }
  if (row.status === "failed") return { ok: true, sendId: row.id, status: "failed" };
  if (row.status === "sending") {
    const ageMs = now.getTime() - Date.parse(row.createdAt);
    if (!(ageMs >= SENDING_MIN_AGE_MS)) {
      return {
        ok: false,
        message: `The send started ${Math.max(0, Math.round(ageMs / 60000))} minute(s) ago and may still be running. Wait until it is ${SENDING_MIN_AGE_MS / 60000} minutes old.`,
      };
    }
    return { ok: true, sendId: row.id, status: "sending" };
  }
  return { ok: false, message: `Unknown status "${row.status}". Nothing cleared.` };
}
