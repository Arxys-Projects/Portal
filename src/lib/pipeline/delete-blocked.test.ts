import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deleteBlockedMessage } from "./delete-blocked";

const fk = (table: string) => ({
  message: `update or delete on table "submissions" violates foreign key constraint "${table}_submission_id_fkey" on table "${table}"`,
  details: `Key (id)=(55555555-5555-4555-8555-000000000001) is still referenced from table "${table}".`,
});

describe("deleteBlockedMessage", () => {
  it("names the record that keeps the submission", () => {
    assert.match(deleteBlockedMessage(fk("project_quotes")), /a Project Quote has been generated from it/);
    assert.match(deleteBlockedMessage(fk("project_deal_claims")), /a Pipedrive deal was built from it/);
    assert.match(deleteBlockedMessage(fk("deal_line_syncs")), /added lines to a Pipedrive deal/);
    assert.match(deleteBlockedMessage(fk("quote_pricing_confirmations")), /pricing was confirmed/);
  });

  it("falls back to a plain reason, never to a quote it cannot name", () => {
    const msg = deleteBlockedMessage({ message: "violates foreign key constraint", details: null });
    assert.equal(msg, "This submission can't be deleted because other records still point to it.");
  });
});
