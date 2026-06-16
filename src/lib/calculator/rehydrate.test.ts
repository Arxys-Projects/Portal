import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CODECS, COMPLEXITIES, RESOLUTIONS } from "./tables";
import {
  fromStoredSubmission,
  normalizeInputState,
  INPUT_STATE_VERSION,
} from "./rehydrate";

// Resolve the *current* index of a few known table entries so the assertions
// stay correct even if someone reorders the tables later — the whole point of
// the label/value resolution path is that it tracks the current order.
const IDX = {
  res1080p: RESOLUTIONS.findIndex((r) => r.label === "1080p Full HD (1920×1080)"),
  h264: CODECS.findIndex((c) => c.value === "h264"),
  high: COMPLEXITIES.findIndex((c) => c.tier === "high"),
};

describe("normalizeInputState", () => {
  it("fills defaults for an empty / unknown blob", () => {
    const n = normalizeInputState({});
    assert.equal(n.projectName, "");
    assert.equal(n.vms, "");
    assert.equal(n.retentionDays, 30);
    assert.equal(n.addOnFailoverRecorder, false);
    assert.equal(n.addOnManagementServer, false);
    assert.equal(n.groups.length, 1);
    // The single default group matches newGroup() in the form: a 4MP H.265
    // "Medium detail, low motion" camera recording Constant 24/7.
    assert.deepEqual(n.groups[0], {
      name: "Camera Group 1",
      cameras: 1,
      resolutionIdx: 14,
      codecIdx: 0,
      complexityIdx: 2,
      fps: 15,
      recordingMode: "constant",
      recordingPercent: 100,
      motionPercent: 100,
      // Phase 10 Step 3 — no model loaded by default.
      cameraVendor: null,
      cameraModel: null,
      units: 1,
      sensorsPerCamera: 1,
      cameraModelModified: false,
    });
  });

  it("coerces a non-object blob to defaults", () => {
    assert.equal(normalizeInputState(null).groups.length, 1);
    assert.equal(normalizeInputState("nope").retentionDays, 30);
    assert.equal(normalizeInputState(undefined).vms, "");
  });

  it("coerces an out-of-list vms to empty string", () => {
    assert.equal(normalizeInputState({ vms: "Milestone" }).vms, "Milestone");
    assert.equal(normalizeInputState({ vms: "SomeRetiredVMS" }).vms, "");
    assert.equal(normalizeInputState({ vms: 42 }).vms, "");
  });

  it("clamps out-of-range numerics", () => {
    const n = normalizeInputState({
      retentionDays: 99999,
      groups: [{ cameras: -5, fps: 0, recordingPercent: 9999, motionPercent: -3 }],
    });
    assert.equal(n.retentionDays, 730);
    assert.equal(n.groups[0].cameras, 1);
    assert.equal(n.groups[0].fps, 1);
    assert.equal(n.groups[0].recordingPercent, 100);
    // Motion floor is now 20 (the UI domain), so a sub-floor value clamps up.
    assert.equal(n.groups[0].motionPercent, 20);
  });

  it("clamps out-of-bounds table indices to current array bounds", () => {
    const n = normalizeInputState({
      groups: [{ resolutionIdx: 9999, codecIdx: -1, complexityIdx: 50 }],
    });
    assert.equal(n.groups[0].resolutionIdx, RESOLUTIONS.length - 1);
    assert.equal(n.groups[0].codecIdx, 0);
    assert.equal(n.groups[0].complexityIdx, COMPLEXITIES.length - 1);
  });

  it("gates add-on booleans on the version stamp", () => {
    // Pre-stamp / older rows never stored add-ons — ignore any stray field.
    assert.equal(
      normalizeInputState({ addOnFailoverRecorder: true }).addOnFailoverRecorder,
      false,
    );
    assert.equal(
      normalizeInputState({ version: 0, addOnManagementServer: true }).addOnManagementServer,
      false,
    );
    // v1 rows carry real add-on values.
    const n = normalizeInputState({
      version: INPUT_STATE_VERSION,
      addOnFailoverRecorder: true,
      addOnManagementServer: false,
    });
    assert.equal(n.addOnFailoverRecorder, true);
    assert.equal(n.addOnManagementServer, false);
  });

  it("reads recordingMode, defaulting absent/garbage to constant", () => {
    assert.equal(normalizeInputState({ groups: [{ recordingMode: "motion" }] }).groups[0].recordingMode, "motion");
    assert.equal(normalizeInputState({ groups: [{ recordingMode: "constant" }] }).groups[0].recordingMode, "constant");
    // Absent (pre-change row) and any non-"motion" value read as constant.
    assert.equal(normalizeInputState({ groups: [{}] }).groups[0].recordingMode, "constant");
    assert.equal(normalizeInputState({ groups: [{ recordingMode: "speedup" }] }).groups[0].recordingMode, "constant");
  });
});

describe("fromStoredSubmission", () => {
  it("recovers the correct selection via banked labels when raw indices are stale (index-shift resilience)", () => {
    // Synthetic OLD row: the raw indices were written against a differently
    // ordered table, so today they point at the WRONG entries. The banked
    // resolved values in groups_payload still name the right selections.
    const row = {
      input_state: {
        version: 1,
        projectName: "Legacy Project",
        vms: "Genetec",
        retentionDays: 45,
        groups: [
          {
            name: "Lobby",
            cameras: 12,
            // Stale raw indices — deliberately NOT the current positions.
            resolutionIdx: 5, // current[5] != 1080p
            codecIdx: 0, // current[0] = h265, not h264
            complexityIdx: 0, // current[0] = low, not high
            fps: 20,
            recordingPercent: 100,
            motionPercent: 60,
          },
        ],
      },
      groups_payload: {
        retentionDays: 45,
        groups: [
          {
            name: "Lobby",
            cameras: 12,
            resolutionIdx: 5,
            resolutionLabel: "1080p Full HD (1920×1080)",
            codec: "h264",
            complexity: "high",
            fps: 20,
            recordingPercent: 100,
            motionPercent: 60,
          },
        ],
      },
    };

    const state = fromStoredSubmission(row);
    const g = state.groups[0];

    // Banked labels win over stale raw indices.
    assert.equal(g.resolutionIdx, IDX.res1080p);
    assert.equal(g.codecIdx, IDX.h264);
    assert.equal(g.complexityIdx, IDX.high);
    // Sanity: the label path actually moved off the raw values.
    assert.notEqual(g.resolutionIdx, 5);
    assert.notEqual(g.codecIdx, 0);
    assert.notEqual(g.complexityIdx, 0);

    // Non-index fields carry through.
    assert.equal(state.projectName, "Legacy Project");
    assert.equal(state.vms, "Genetec");
    assert.equal(state.retentionDays, 45);
    assert.equal(g.name, "Lobby");
    assert.equal(g.cameras, 12);
    assert.equal(g.fps, 20);
  });

  it("recovers the exact 1-of-6 complexity level from complexityLabel when the tier is ambiguous", () => {
    // The "med" tier now maps to TWO levels (low- and high-motion). The banked
    // complexityLabel disambiguates; tier alone would collapse to the first med.
    const medHighIdx = COMPLEXITIES.findIndex((c) => c.label === "Medium detail, high motion");
    const medLowIdx = COMPLEXITIES.findIndex((c) => c.label === "Medium detail, low motion");
    assert.notEqual(medHighIdx, medLowIdx); // sanity: two distinct "med" levels
    const row = {
      input_state: {
        version: 1,
        groups: [{ complexityIdx: 0, recordingMode: "motion", recordingPercent: 50, motionPercent: 40 }],
      },
      groups_payload: {
        groups: [{ complexity: "med", complexityLabel: "Medium detail, high motion" }],
      },
    };
    const g = fromStoredSubmission(row).groups[0];
    assert.equal(g.complexityIdx, medHighIdx); // label wins
    assert.notEqual(g.complexityIdx, medLowIdx);
    // recordingMode + the hours/motion knobs round-trip from input_state.
    assert.equal(g.recordingMode, "motion");
    assert.equal(g.recordingPercent, 50);
    assert.equal(g.motionPercent, 40);
  });

  it("falls back to the raw index when groups_payload is absent", () => {
    const row = {
      input_state: {
        version: 1,
        groups: [{ resolutionIdx: 8, codecIdx: 2, complexityIdx: 2 }],
      },
      // no groups_payload
    };
    const g = fromStoredSubmission(row).groups[0];
    assert.equal(g.resolutionIdx, 8);
    assert.equal(g.codecIdx, 2);
    assert.equal(g.complexityIdx, 2);
  });

  it("falls back to the raw index when a banked label no longer exists", () => {
    const row = {
      input_state: {
        version: 1,
        groups: [{ resolutionIdx: 3, codecIdx: 1, complexityIdx: 1 }],
      },
      groups_payload: {
        groups: [
          {
            resolutionLabel: "Obsolete Resolution That Was Removed",
            codec: "vp9-not-a-real-codec",
            complexity: "extreme-not-a-real-tier",
          },
        ],
      },
    };
    const g = fromStoredSubmission(row).groups[0];
    assert.equal(g.resolutionIdx, 3);
    assert.equal(g.codecIdx, 1);
    assert.equal(g.complexityIdx, 1);
  });

  it("rehydrates a pre-add-on (version 0) row with add-ons defaulted off", () => {
    const row = {
      input_state: {
        // no version, no add-on fields — a pre-Phase-4 row
        projectName: "Old Quote",
        retentionDays: 30,
        groups: [{ cameras: 4, resolutionIdx: 11, codecIdx: 0, complexityIdx: 1, fps: 15, recordingPercent: 100, motionPercent: 50 }],
      },
      groups_payload: {
        groups: [
          {
            resolutionLabel: "1080p Full HD (1920×1080)",
            codec: "h265",
            complexity: "med",
          },
        ],
      },
    };
    const state = fromStoredSubmission(row);
    assert.equal(state.addOnFailoverRecorder, false);
    assert.equal(state.addOnManagementServer, false);
    assert.equal(state.groups[0].resolutionIdx, IDX.res1080p);
  });
});

describe("camera-model fields (Phase 10 Step 3)", () => {
  it("defaults a pre-feature row to no-model, preserving cameras", () => {
    // A row written before the picker existed carries none of the camera fields
    // in input_state OR groups_payload. It must default to the no-model path and
    // leave the stored camera count untouched.
    const row = {
      input_state: {
        version: 1,
        groups: [{ cameras: 17, resolutionIdx: 11, codecIdx: 0, complexityIdx: 2, fps: 15, recordingPercent: 100, motionPercent: 100 }],
      },
      groups_payload: {
        groups: [{ resolutionLabel: "1080p Full HD (1920×1080)", codec: "h265", complexity: "med" }],
      },
    };
    const g = fromStoredSubmission(row).groups[0];
    assert.equal(g.cameraVendor, null);
    assert.equal(g.cameraModel, null);
    assert.equal(g.units, 1);
    assert.equal(g.sensorsPerCamera, 1);
    assert.equal(g.cameraModelModified, false);
    // cameras is NOT recomputed from units × sensors — the banked count wins.
    assert.equal(g.cameras, 17);
  });

  it("round-trips all five camera fields, preferring the banked (groups_payload) copy", () => {
    const row = {
      input_state: {
        version: 1,
        groups: [
          {
            name: "North Lot",
            cameras: 12,
            resolutionIdx: 19,
            codecIdx: 0,
            complexityIdx: 2,
            fps: 15,
            recordingPercent: 100,
            motionPercent: 100,
            // Stale raw camera values — the banked copy below should win.
            cameraVendor: "Hanwha",
            cameraModel: "OLD-MODEL",
            units: 99,
            sensorsPerCamera: 99,
            cameraModelModified: false,
          },
        ],
      },
      groups_payload: {
        groups: [
          {
            resolutionLabel: "4K/8MP (3840×2160)",
            codec: "h265",
            complexity: "med",
            cameraVendor: "Axis",
            cameraModel: "P3268-LV",
            units: 6,
            sensorsPerCamera: 2,
            cameraModelModified: true,
          },
        ],
      },
    };
    const g = fromStoredSubmission(row).groups[0];
    assert.equal(g.cameraVendor, "Axis");
    assert.equal(g.cameraModel, "P3268-LV");
    assert.equal(g.units, 6);
    assert.equal(g.sensorsPerCamera, 2);
    // modified=true survives the round-trip (a stored fact, never recomputed).
    assert.equal(g.cameraModelModified, true);
    // cameras stays the banked count, not units × sensors.
    assert.equal(g.cameras, 12);
  });

  it("falls back to the raw input_state camera fields when groups_payload omits them", () => {
    const row = {
      input_state: {
        version: 1,
        groups: [
          {
            cameras: 8,
            cameraVendor: "Axis",
            cameraModel: "M3215-LVE",
            units: 4,
            sensorsPerCamera: 2,
            cameraModelModified: true,
          },
        ],
      },
      // groups_payload present but without the camera fields (e.g. a partial row)
      groups_payload: { groups: [{ resolutionLabel: "4MP (2560×1440)" }] },
    };
    const g = fromStoredSubmission(row).groups[0];
    assert.equal(g.cameraVendor, "Axis");
    assert.equal(g.cameraModel, "M3215-LVE");
    assert.equal(g.units, 4);
    assert.equal(g.sensorsPerCamera, 2);
    assert.equal(g.cameraModelModified, true);
  });

  it("coerces bad units/sensors/vendor/model/modified values", () => {
    const n = normalizeInputState({
      groups: [
        {
          cameraVendor: "Sony", // not one of the three → null
          cameraModel: "   ", // blank → null
          units: -5, // < 1 → 1
          sensorsPerCamera: 0, // < 1 → 1
          cameraModelModified: "yes", // not strict boolean → false
        },
      ],
    });
    const g = n.groups[0];
    assert.equal(g.cameraVendor, null);
    assert.equal(g.cameraModel, null);
    assert.equal(g.units, 1);
    assert.equal(g.sensorsPerCamera, 1);
    assert.equal(g.cameraModelModified, false);
  });

  it("clamps an oversized sensor count to the 64 ceiling and accepts a valid vendor", () => {
    const g = normalizeInputState({
      groups: [{ cameraVendor: "Avigilon", cameraModel: "H6A", sensorsPerCamera: 9999, units: 3 }],
    }).groups[0];
    assert.equal(g.cameraVendor, "Avigilon");
    assert.equal(g.cameraModel, "H6A");
    assert.equal(g.sensorsPerCamera, 64);
    assert.equal(g.units, 3);
  });
});
