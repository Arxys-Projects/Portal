import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { SubmissionPdf } from "./SubmissionPdf";
import type { SubmissionPdfInput } from "./types";

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
        complexity: "Medium",
        hoursPerDay: 24,
        motionPercent: 50,
        bandwidthMbps: 180.5,
        storageGb: 26500,
      },
      {
        name: "Parking lot",
        cameras: 100,
        resolutionLabel: "2MP (1920×1080)",
        codec: "H.265",
        fps: 10,
        complexity: "Low",
        hoursPerDay: 24,
        motionPercent: 35,
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
});
