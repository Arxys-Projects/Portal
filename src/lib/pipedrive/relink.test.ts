import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRelinkInputs, type RelinkSubmissionRow } from "./relink";

// A realistic stored row, shaped like what PostgREST returns (numerics may
// arrive as strings).
function row(overrides: Partial<RelinkSubmissionRow> = {}): RelinkSubmissionRow {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    project_name: "North Bergen SD - Grant Quote",
    vms: "Milestone",
    retention_days: 30,
    cameras_count: 120,
    bandwidth_mbps: "432.50",
    storage_tb: "171.53",
    recommended_product_id: "VX5-V800-720",
    recommended_units: 2,
    total_list_price_usd: "171532.00",
    created_at: "2026-07-24T18:09:09.368123+00:00",
    groups_payload: {
      retentionDays: 30,
      groups: [
        {
          name: "Main",
          cameras: 120,
          resolutionLabel: "4MP (2560×1440)",
          codec: "h265",
          complexity: "med",
          fps: 15,
          recordingPercent: 100,
          motionPercent: 35,
        },
      ],
    },
    input_state: { addOnFailoverRecorder: true, addOnManagementServer: false },
    ...overrides,
  };
}

describe("buildRelinkInputs (ADR 0093 step 3)", () => {
  it("rebuilds the deal inputs from stored columns, coercing PostgREST numeric strings", () => {
    const res = buildRelinkInputs(row(), "V800", "VideoX V800 720TB");
    assert.equal(res.ok, true);
    if (!res.ok) return;
    const { submission, recommendation } = res.inputs;

    assert.equal(submission.submissionId, "11111111-2222-3333-4444-555555555555");
    assert.equal(submission.retentionDays, 30);
    assert.equal(submission.totals.cameras, 120);
    assert.equal(submission.totals.bandwidthMbps, 432.5);
    // storage_tb → GB (×1000), the inverse of what submitCalculation persisted.
    assert.equal(submission.totals.storageGb, 171530);
    assert.equal(submission.groups.length, 1);
    assert.equal(submission.groups[0].cameras, 120);
    assert.equal(submission.groups[0].codec, "h265");
    assert.equal(submission.addOnFailoverRecorder, true);
    assert.equal(submission.addOnManagementServer, false);

    // The three fields buildDealFields actually reads.
    assert.equal(recommendation.winner.units, 2);
    assert.equal(recommendation.winner.productGroup, "V800");
    assert.equal(recommendation.winner.totalCostUsd, 171532);
  });

  it("uses the ORIGINAL submission date, not today — the deal title must match the row", () => {
    const res = buildRelinkInputs(row(), "V800", null);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.inputs.submission.submissionDate, "2026-07-24");
  });

  it("refuses a legacy UUID-shaped recommended_product_id instead of inventing a deal", () => {
    const res = buildRelinkInputs(
      row({ recommended_product_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
      null,
      null,
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error, /legacy/i);
  });

  it("refuses when the SKU no longer resolves in the price book", () => {
    const res = buildRelinkInputs(row(), null, null);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error, /price book/i);
  });

  it("refuses a submission with no list price rather than sending a NaN deal value", () => {
    const res = buildRelinkInputs(row({ total_list_price_usd: null }), "V800", null);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.error, /no list price/i);
  });

  it("refuses when groups_payload has no usable groups", () => {
    for (const payload of [null, {}, { groups: [] }, { groups: "nope" }, { groups: [{ cameras: 0 }] }]) {
      const res = buildRelinkInputs(row({ groups_payload: payload }), "V800", null);
      assert.equal(res.ok, false, `payload ${JSON.stringify(payload)} must be refused`);
    }
  });

  it("defaults a missing motionPercent to 100, not 0 — 0 would understate the deal", () => {
    const res = buildRelinkInputs(
      row({
        groups_payload: {
          groups: [{ cameras: 10, resolutionLabel: "2MP", codec: "h264", complexity: "low", fps: 10 }],
        },
      }),
      "V800",
      null,
    );
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.inputs.submission.groups[0].motionPercent, 100);
    assert.equal(res.inputs.submission.groups[0].recordingPercent, 100);
  });

  it("treats a missing input_state as no add-ons rather than throwing", () => {
    for (const st of [null, undefined, "junk", 42]) {
      const res = buildRelinkInputs(row({ input_state: st }), "V800", null);
      assert.equal(res.ok, true);
      if (!res.ok) return;
      assert.equal(res.inputs.submission.addOnFailoverRecorder, false);
      assert.equal(res.inputs.submission.addOnManagementServer, false);
    }
  });

  it("derives unitMsrp from the persisted total without dividing by zero", () => {
    const res = buildRelinkInputs(row({ recommended_units: 0 }), "V800", null);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    // recommended_units 0 falls back to 1 unit, so msrp === total.
    assert.equal(res.inputs.recommendation.winner.units, 1);
    assert.equal(res.inputs.recommendation.winner.unitMsrp, 171532);
  });
});
