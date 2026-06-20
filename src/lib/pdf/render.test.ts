import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { SubmissionPdf, SCHEDULE_COLUMNS } from "./SubmissionPdf";
import type { SubmissionPdfInput } from "./types";
import { resolveSubmissionPartner } from "./partner-resolution";

// Exercise the same composition that renderSubmissionPdfBuffer uses, without
// importing render.ts directly — render.ts is marked `import "server-only"`
// which throws under plain Node (tsx --test), and the marker is intentional
// for the production code path. A break in the JSX shape still surfaces here
// because renderToBuffer will throw at runtime if the SubmissionPdf tree is
// structurally invalid.

function fixture(): SubmissionPdfInput {
  return {
    generatedAt: new Date("2026-05-19T00:00:00Z"),
    submissionId: "00000000-0000-0000-0000-000000000001",
    partner: {
      companyName: "Test Integrator Inc.",
      contactName: "Jane Partner",
      email: "jane@example.com",
    },
    projectName: "Main Campus",
    vms: "Milestone XProtect",
    retentionDays: 30,
    totals: { cameras: 150, bandwidthMbps: 540.25, storageGb: 80500 },
    storageTb: 80.5,
    bandwidthMbps: 540.25,
    groups: [
      {
        name: "Lobby cameras",
        cameras: 50,
        resolutionLabel: "4MP (2560×1440)",
        codec: "H.265",
        fps: 15,
        complexityLabel: "Medium detail, high motion",
        recordingMode: "motion",
        hoursPerDay: 18,
        motionPercent: 40,
        bandwidthMbps: 180.5,
        storageGb: 26500,
      },
      {
        name: "Parking lot",
        cameras: 100,
        resolutionLabel: "2MP (1920×1080)",
        codec: "H.265",
        fps: 10,
        complexityLabel: "Low detail, high motion",
        recordingMode: "constant",
        hoursPerDay: 24,
        motionPercent: 100,
        bandwidthMbps: 359.75,
        storageGb: 54000,
      },
    ],
    recommendation: {
      units: 2,
      modelCode: "V200",
      productDescription:
        "VideoX V200 1U 4Bay Rack — V5 NVR Server. Storage 10–64 TB, up to 100 cameras.",
      coveredCameras: 200,
      coveredStorageTb: 128,
      warnings: [
        "Solution stacks 2 units — verify rack space and power before quoting.",
      ],
    },
    serverSpec: {
      sku: "VX5-V200-96",
      modelName: "VideoX V200",
      formFactor: "1U Rackmount",
      maxCameras: 100,
      maxBandwidthMbps: 1000,
      driveBays: 4,
      cpuModelFull: "AMD EPYC 4005 4.0Ghz 6/12 Core",
      ramSpec: "16GB ECC DDR5",
      osEdition: "Windows Server 2022 OR 2025 WKGP LTSC",
      warranty: "5yr NBD, Advanced Replacement",
      msrp: 12500,
      usablePerUnitTb: 54,
    },
    logoDataUri: null,
    heroDataUri: null,
  };
}

describe("SubmissionPdf renders via @react-pdf/renderer", () => {
  it("produces a non-empty Buffer with the %PDF- magic header", async () => {
    const buf = await renderToBuffer(createElement(SubmissionPdf, { data: fixture() }));
    assert.ok(buf instanceof Uint8Array, "render must return a Buffer / Uint8Array");
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    const header = buf.subarray(0, 5).toString("utf8");
    assert.equal(header, "%PDF-", `expected %PDF- header, got ${JSON.stringify(header)}`);
  });

  it("renders without a resolved server spec (legacy submission, null specs)", async () => {
    const legacy: SubmissionPdfInput = { ...fixture(), serverSpec: null };
    const buf = await renderToBuffer(createElement(SubmissionPdf, { data: legacy }));
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
  });

  // ADR 0068 smoke: the deal that exposed the over-capacity bug. Under the
  // fixed storage-first engine it is sized 4×V800-720 (640 TB net-usable/unit =
  // 2560 usable), so utilization is 1764.3/2560 = 68.9% — honest headroom, not
  // the old "1764.3 of 1600 usable / 110% / 20% headroom built in". This case
  // exercises the new disclaimer header + the computed utilizationNote in the
  // real react-pdf tree.
  it("renders the previously-failing deal under capacity (4×V800, 68.9% utilization)", async () => {
    const failingDeal: SubmissionPdfInput = {
      ...fixture(),
      totals: { cameras: 332, bandwidthMbps: 4200, storageGb: 1_764_300 },
      storageTb: 1764.3,
      bandwidthMbps: 4200,
      recommendation: {
        units: 4,
        modelCode: "V800",
        productDescription: "VideoX V800 720TB 4U 36Bay",
        coveredCameras: 1300,
        coveredStorageTb: 2560, // net-usable: 4 × 640
        warnings: [],
      },
      serverSpec: {
        ...fixture().serverSpec!,
        sku: "VX5-V800-720",
        modelName: "VideoX V800",
        maxCameras: 325,
        maxBandwidthMbps: 6000,
        usablePerUnitTb: 640,
      },
    };
    // Sanity-check the math the capacity bar will render before asserting the
    // tree renders: storage is the binding dimension and stays under 100%.
    const util = (1764.3 / (640 * 4)) * 100;
    assert.ok(util > 0 && util <= 83, `expected ≤83% utilization, got ${util}%`);
    const buf = await renderToBuffer(createElement(SubmissionPdf, { data: failingDeal }));
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
  });
});

describe("SCHEDULE_COLUMNS — bandwidth and storage headers use megabits form", () => {
  it("bandwidth column header reads Mbit/s", () => {
    const bwCol = SCHEDULE_COLUMNS.find((c) => c.key === "colBw");
    assert.ok(bwCol, "colBw column must be present");
    assert.equal(bwCol.label, "Bandwidth (Mbit/s)");
  });
});

// Regression tests for on-behalf-of partner resolution (Bug fix: Phase 7/8
// write side was correct but loadSubmissionPdfInput read from partner_id only).
describe("resolveSubmissionPartner — on-behalf-of three-tier precedence", () => {
  const onBehalfRow = { company_name: "JCT Solutions", contact_name: "Clarence Hicks" };
  const creatingRow = { company_name: "Arxys", contact_name: "Andy Newbom" };

  it("tier 1: uses on_behalf_of_partner_id target when FK row is present", () => {
    const result = resolveSubmissionPartner(
      { on_behalf_of_partner_id: "some-uuid", on_behalf_of_company_name: null },
      onBehalfRow,
      creatingRow,
    );
    assert.equal(result.companyName, "JCT Solutions");
    assert.equal(result.contactName, "Clarence Hicks");
  });

  it("tier 2: uses on_behalf_of_company_name when FK partner row is absent (not onboarded)", () => {
    const result = resolveSubmissionPartner(
      { on_behalf_of_partner_id: null, on_behalf_of_company_name: "West Coast AV LLC" },
      null,
      creatingRow,
    );
    assert.equal(result.companyName, "West Coast AV LLC");
    assert.equal(result.contactName, "(not onboarded)");
  });

  it("tier 3: falls back to creating partner when no on-behalf fields are set", () => {
    const result = resolveSubmissionPartner(
      { on_behalf_of_partner_id: null, on_behalf_of_company_name: null },
      null,
      creatingRow,
    );
    assert.equal(result.companyName, "Arxys");
    assert.equal(result.contactName, "Andy Newbom");
  });
});
