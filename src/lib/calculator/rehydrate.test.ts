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
    // The single default group matches newGroup() in the form.
    assert.deepEqual(n.groups[0], {
      name: "Camera Group 1",
      cameras: 1,
      resolutionIdx: 14,
      codecIdx: 0,
      complexityIdx: 1,
      fps: 15,
      recordingPercent: 100,
      motionPercent: 50,
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
    assert.equal(n.groups[0].motionPercent, 1);
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
