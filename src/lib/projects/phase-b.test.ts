import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CalculatorInitialState } from "@/lib/calculator/rehydrate";
import type { PdProduct } from "@/lib/pipedrive/product-sync";
import { buildProjectCalcPayload, checkDealHeader, checkDealValue, checkLedger, checkLinePrices, dealFieldMatches } from "./phase-b";

// Step 5 Phase B (ADR 0172): the pure checks behind the live test script.

const STATE: CalculatorInitialState = {
  projectName: "Escambia Men's Prison",
  vms: "Genetec",
  retentionDays: 30,
  utilizationPct: 90,
  addOnFailoverRecorder: true,
  addOnManagementServer: true,
  groups: [
    {
      name: "Housing",
      cameras: 100,
      resolutionIdx: 2,
      codecIdx: 1,
      complexityIdx: 1,
      fps: 15,
      retentionDays: 30,
      recordingMode: "motion",
      recordingPercent: 100,
      motionPercent: 80,
      cameraVendor: null,
      cameraModel: null,
      units: 1,
      sensorsPerCamera: 1,
      cameraModelModified: false,
    },
  ],
};

const product = (id: number, price: number): PdProduct => ({
  id,
  name: `P${id}`,
  code: `SKU-${id}`,
  is_linkable: true,
  prices: [{ price, currency: "USD" }],
});

describe("buildProjectCalcPayload", () => {
  it("is a fresh project calc with the stored groups and no legacy add-ons", () => {
    const payload = buildProjectCalcPayload(STATE, "p-1", { gpu: true });
    assert.equal(payload.projectId, "p-1");
    assert.deepEqual(payload.systemDesign, { gpu: true });
    assert.equal(payload.isRevision, false);
    assert.equal(payload.sourceSubmissionId, null);
    assert.equal(payload.addOnFailoverRecorder, false);
    assert.equal(payload.addOnManagementServer, false);
    assert.deepEqual(payload.groups, STATE.groups);
    assert.notEqual((payload.groups as unknown[])[0], STATE.groups[0]);
    assert.equal(payload.vms, "Genetec");
  });
});

describe("checkLinePrices", () => {
  it("passes a line priced exactly as its product, and flags any other", () => {
    const products = [product(1, 117054.37), product(2, 1706)];
    assert.deepEqual(checkLinePrices([{ id: 10, product_id: 1, item_price: 117054.37 }], products), []);
    assert.deepEqual(checkLinePrices([{ id: 11, product_id: 2, item_price: 1700 }], products), [
      { attachmentId: 11, productId: 2, itemPrice: 1700, productPrice: 1706 },
    ]);
    assert.equal(checkLinePrices([{ id: 12, product_id: 3, item_price: 5 }], products).length, 1);
  });
});

describe("checkDealValue", () => {
  it("matches the deal value with Pipedrive's line sums in cents", () => {
    const lines = [
      { id: 1, product_id: 1, sum: 0.1 },
      { id: 2, product_id: 2, sum: 0.2 },
    ];
    assert.deepEqual(checkDealValue(0.3, lines), { ok: true, dealValue: 0.3, linesSum: 0.3 });
    assert.equal(checkDealValue(0.31, lines).ok, false);
  });

  it("fails when a value or a line sum is missing", () => {
    assert.equal(checkDealValue(null, [{ id: 1, product_id: 1, sum: 1 }]).ok, false);
    assert.equal(checkDealValue(1, [{ id: 1, product_id: 1, sum: null }]).ok, false);
  });
});

describe("dealFieldMatches", () => {
  it("lists every exact-name match with its code and type, v2 or v1 names", () => {
    const fields = [
      { field_name: "arxys_project_id", field_code: "abc", field_type: "varchar" },
      { name: "arxys_project_id", key: "def", field_type: "text" },
      { field_name: "arxys_project_id_old", field_code: "x" },
    ];
    assert.deepEqual(dealFieldMatches(fields, "arxys_project_id"), [
      { code: "abc", type: "varchar" },
      { code: "def", type: "text" },
    ]);
  });
});

describe("checkDealHeader", () => {
  const want = { pipelineId: 7, stageId: 71, orgId: 101, personId: 201, ownerId: 13, fieldCode: "abc", projectId: "p-1" };
  const good = { pipeline_id: 7, stage_id: 71, org_id: 101, person_id: 201, owner_id: 13, currency: "USD", custom_fields: { abc: "p-1" } };

  it("is clean when the deal is what the portal meant to create", () => {
    assert.deepEqual(checkDealHeader(good, want), []);
  });

  it("names every difference, the project field included", () => {
    const problems = checkDealHeader({ ...good, person_id: 999, custom_fields: {} }, want);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /person_id: 999/);
    assert.match(problems[1], /arxys_project_id/);
  });

  it("skips the owner when the default owner applies, and fails an unread deal", () => {
    assert.deepEqual(checkDealHeader({ ...good, owner_id: 1 }, { ...want, ownerId: null }), []);
    assert.deepEqual(checkDealHeader(null, want), ["the deal could not be read"]);
  });
});

describe("checkLedger", () => {
  const lines = [
    { id: 1, product_id: 10, item_price: 117054.37 },
    { id: 2, product_id: 11, item_price: 1706 },
  ];
  const row = (id: number | null, price: number | string, status = "added") => ({
    sku: `S${id}`, role: "recorder", status, pipedrive_deal_product_id: id, item_price_sent: price,
  });

  it("is clean when every row is added, on the deal, at its sent price", () => {
    assert.deepEqual(checkLedger([row(1, "117054.37"), row(2, 1706)], lines), []);
  });

  it("flags a pending row, a missing attachment, a price change and an unaccounted line", () => {
    const problems = checkLedger([row(1, 117000), row(3, 5), row(null, 1, "failed")], lines);
    assert.equal(problems.length, 4);
    assert.ok(problems.some((p) => /ledger sent 117000/.test(p)));
    assert.ok(problems.some((p) => /line #3/.test(p)));
    assert.ok(problems.some((p) => /is failed/.test(p)));
    assert.ok(problems.some((p) => /deal line #2/.test(p)));
  });
});
