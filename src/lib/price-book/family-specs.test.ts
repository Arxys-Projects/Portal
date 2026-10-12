import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLedgerContent } from "../datasheet/from-product-specs";
import { familyBySlug } from "./families";
import {
  datasheetMismatches,
  deriveFamilyDisplay,
  PLACEHOLDER,
  resolveFamilyDisplay,
  type FamilySpecRow,
} from "./family-specs";
import {
  LIVE_TOP_ROWS,
  V100_48,
  V400_192,
  V800_864,
} from "./family-specs.test-fixtures";

const ALL_TOP_ROWS = Object.values(LIVE_TOP_ROWS);

/** Hero stats as "value unit" strings, which is how a reader sees them. */
const stats = (rows: FamilySpecRow[], model: string) =>
  deriveFamilyDisplay(rows, model).kpis.map((k) => `${k.value} ${k.unit}`);

// One expectation per model, from the live rows read 2026-10-09. These are the
// "after" column of the Gate B table in docs/audits/price-book-spec-drift-audit.md.
const EXPECTED: Record<string, { kpis: string[]; keyFeatures: string[]; technicalSpecs: string[] }> = {
  V100: {
    kpis: ["25 streams", "500 Mbit/s", "5 Years Next Business Day Parts"],
    keyFeatures: [
      "Windows Server 2022 or 2025 WKGP LTSC",
      "2x Enterprise HDD's, RAID 1 or JBOD",
      "500 Mbit/s max possible throughput",
      "1U Rack mount w/ rails",
      "Max VSR = 25 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 4005 4.0GHz 6/12 Core CPU",
      "16GB ECC DDR5 DRAM",
      "1x NVMe, dedicated for OS/VMS",
      "2x 1Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "Single PSU 400W",
    ],
  },
  V200: {
    kpis: ["100 streams", "1,000 Mbit/s", "5 Years Next Business Day Parts"],
    keyFeatures: [
      "Windows Server 2022 or 2025 WKGP LTSC",
      "4x Enterprise HDD's, RAID 5 & Cachevault",
      "1,000 Mbit/s max possible throughput",
      "1U Rack mount w/ rails",
      "Max VSR = 100 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 4005 4.0GHz 6/12 Core CPU",
      "16GB ECC DDR5 DRAM",
      "2x Enterprise SSD, Mirrored, hot-swap, dedicated for OS/VMS",
      "2x 10Gb & 2x 1Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
  },
  V400: {
    kpis: ["150 streams", "1,600 Mbit/s", "5 Years Next Business Day Parts"],
    keyFeatures: [
      "Windows Server 2022 or 2025 LTSC",
      "8x Enterprise HDD's, RAID 6 & Cachevault",
      "1,600 Mbit/s max possible throughput",
      "2U Rack mount w/ rails",
      "Max VSR = 150 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9015 3.6GHz 8/16 Core CPU",
      "16GB ECC DDR5 DRAM",
      "2x Enterprise SSD, Mirrored, hot-swap, dedicated for OS/VMS",
      "4x 10Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
  },
  V500: {
    kpis: ["275 streams", "3,000 Mbit/s", "5 Years Next Business Day Parts"],
    keyFeatures: [
      "Windows Server 2022 or 2025 LTSC",
      "12x Enterprise HDD's, RAID 6 & Cachevault",
      "3,000 Mbit/s max possible throughput",
      "2U Rack mount w/ rails",
      "Max VSR = 275 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9005 3.3GHz 16/32 Core CPU",
      "32GB ECC DDR5 DRAM",
      "2x Enterprise SSD, Mirrored, hot-swap, dedicated for OS/VMS",
      "4x 10Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
  },
  V600: {
    kpis: ["275 streams", "3,000 Mbit/s", "5 Years Next Business Day Parts"],
    keyFeatures: [
      "Windows Server 2022 or 2025 LTSC",
      "16x Enterprise HDD's, RAID 6 & Cachevault",
      "3,000 Mbit/s max possible throughput",
      "3U Rack mount w/ rails",
      "Max VSR = 275 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9005 3.3GHz 16/32 Core CPU",
      "32GB ECC DDR5 DRAM",
      "2x Enterprise SSD, Mirrored, hot-swap, dedicated for OS/VMS",
      "4x 10Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
  },
  V700: {
    kpis: ["275 streams", "4,000 Mbit/s", "5 Years Next Business Day Parts"],
    keyFeatures: [
      "Windows Server 2022 or 2025 LTSC",
      "24x Enterprise HDD's, RAID 60 & Cachevault",
      "4,000 Mbit/s max possible throughput",
      "4U Rack mount w/ rails",
      "Max VSR = 275 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9005 3.3GHz 16/32 Core CPU",
      "32GB ECC DDR5 DRAM",
      "2x Enterprise SSD, Mirrored, hot-swap, dedicated for OS/VMS",
      "4x 10Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
  },
  V800: {
    kpis: ["275 streams", "4,000 Mbit/s", "5 Years Next Business Day Parts"],
    keyFeatures: [
      "Windows Server 2022 or 2025 LTSC",
      "36x Enterprise HDD's, RAID 60 & Cachevault",
      "4,000 Mbit/s max possible throughput",
      "4U Rack mount w/ rails",
      "Max VSR = 275 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9005 3.3GHz 16/32 Core CPU",
      "32GB ECC DDR5 DRAM",
      "2x Enterprise SSD, Mirrored, hot-swap, dedicated for OS/VMS",
      "4x 10Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
  },
};

describe("deriveFamilyDisplay: one fixture per model, from live rows", () => {
  for (const [model, expected] of Object.entries(EXPECTED)) {
    it(`${model} reads its facts from its canonical row`, () => {
      const display = deriveFamilyDisplay(ALL_TOP_ROWS, model);
      assert.equal(display.sourceSku, LIVE_TOP_ROWS[model].id);
      assert.deepEqual(stats(ALL_TOP_ROWS, model), expected.kpis);
      assert.deepEqual(display.keyFeatures, expected.keyFeatures);
      assert.deepEqual(display.technicalSpecs, expected.technicalSpecs);
    });
  }

  it("keeps the VSR tooltip on the Max VSR stat only", () => {
    const { kpis } = deriveFamilyDisplay([V800_864], "V800");
    assert.deepEqual(kpis.map((k) => Boolean(k.vsrTooltip)), [true, false, false]);
  });

  it("writes no em dash into any generated string", () => {
    for (const model of Object.keys(EXPECTED)) {
      const d = deriveFamilyDisplay(ALL_TOP_ROWS, model);
      for (const text of [...d.keyFeatures, ...d.technicalSpecs, ...d.kpis.map((k) => k.unit)]) {
        assert.ok(!text.includes("—"), `${model}: ${text}`);
      }
    }
  });
});

describe("the refreshes the authored strings missed", () => {
  it("V400 is the 9015 at 8C/16T and 150 streams", () => {
    const d = deriveFamilyDisplay([V400_192], "V400");
    assert.equal(d.kpis[0].value, "150");
    assert.ok(d.keyFeatures.includes("Max VSR = 150 streams h.265 or h.264"));
    assert.equal(d.technicalSpecs[0], "AMD EPYC 9015 3.6GHz 8/16 Core CPU");
  });

  it("V700 and V800 are on the V500's 3.3GHz 16/32 part at 275 streams", () => {
    for (const model of ["V700", "V800"]) {
      const d = deriveFamilyDisplay(ALL_TOP_ROWS, model);
      assert.equal(d.kpis[0].value, "275");
      assert.equal(d.technicalSpecs[0], "AMD EPYC 9005 3.3GHz 16/32 Core CPU");
    }
  });

  it("V400 says RAID 6, which is what the row and ADR 0092 say", () => {
    const d = deriveFamilyDisplay([V400_192], "V400");
    assert.ok(d.keyFeatures.includes("8x Enterprise HDD's, RAID 6 & Cachevault"));
  });
});

describe("a blank column drops its bullet", () => {
  it("drops each bullet when its column is blank, and nothing stale replaces it", () => {
    const blank: FamilySpecRow = {
      ...V400_192,
      os_edition: null,
      hdd_count: null,
      rack_units: "  ",
      cpu_model_full: null,
      ram_spec: "",
      os_ssd_type: null,
      gbe_10_ports: 0,
      gbe_1_ports: null,
      remote_mgmt: null,
      hotswap_power: null,
    };
    const d = deriveFamilyDisplay([blank], "V400");
    assert.deepEqual(d.keyFeatures, [
      "1,600 Mbit/s max possible throughput",
      "Max VSR = 150 streams h.265 or h.264",
    ]);
    assert.deepEqual(d.technicalSpecs, []);
    // No authored V400 wording survives anywhere.
    const all = [...d.keyFeatures, ...d.technicalSpecs].join(" | ");
    assert.doesNotMatch(all, /IoT|Mbps|9005|200 streams|Mirrored Enterprise OS SSD/);
  });

  it("shows the placeholder in a stat whose column is blank", () => {
    const d = deriveFamilyDisplay(
      [{ ...V400_192, max_cameras_h265: null, max_bandwidth_mbps: null, warranty_years: null }],
      "V400",
    );
    assert.deepEqual(d.kpis.map((k) => k.value), [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER]);
    assert.equal(d.kpis.length, 3);
  });

  it("shows placeholders and empty lists when the model has no rows at all", () => {
    const d = deriveFamilyDisplay([V800_864], "V400");
    assert.equal(d.sourceSku, null);
    assert.deepEqual(d.kpis.map((k) => k.value), [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER]);
    assert.deepEqual(d.keyFeatures, []);
    assert.deepEqual(d.technicalSpecs, []);
  });
});

describe("RAID levels", () => {
  it("composes the V100's 'RAID 1 or JBOD' from the primary and alternate levels", () => {
    const d = deriveFamilyDisplay([V100_48], "V100");
    assert.equal(d.keyFeatures[1], "2x Enterprise HDD's, RAID 1 or JBOD");
  });

  it("never prints the deprecated 'NA' level", () => {
    const d = deriveFamilyDisplay([{ ...V100_48, raid_level_display: "NA" }], "V100");
    assert.equal(d.keyFeatures[1], "2x Enterprise HDD's, JBOD");
    const none = deriveFamilyDisplay(
      [{ ...V100_48, raid_level_display: "NA", raid_level_alt_display: null }],
      "V100",
    );
    assert.equal(none.keyFeatures[1], "2x Enterprise HDD's");
    assert.doesNotMatch([...d.keyFeatures, ...none.keyFeatures].join(" "), /\bNA\b/);
  });

  it("does not repeat an alternate level that matches the primary", () => {
    const d = deriveFamilyDisplay([{ ...V400_192, raid_level_alt_display: "6" }], "V400");
    assert.equal(d.keyFeatures[1], "8x Enterprise HDD's, RAID 6 & Cachevault");
  });
});

describe("power", () => {
  it("keeps the hot-swap claim when a sibling's 'Yes 1+1' extends the canonical row", () => {
    // Live today: VX5-V800-576 holds "Yes 1+1", and canonicalRow() extends the
    // -864's "Yes" to it. isYes() rejects that, which is why the V800 datasheet
    // drops its hot-swap bullet; the page must not.
    const sibling: FamilySpecRow = {
      ...V800_864,
      id: "VX5-V800-576",
      storage_raw_tb: 576,
      hotswap_power: "Yes 1+1",
    };
    const d = deriveFamilyDisplay([sibling, V800_864], "V800");
    assert.equal(d.technicalSpecs.at(-1), "2x Hot-swap, Redundant Power Supply");
  });

  it("states a single PSU from power_redundancy when hot-swap is a negative", () => {
    assert.equal(deriveFamilyDisplay([V100_48], "V100").technicalSpecs.at(-1), "Single PSU 400W");
  });

  it("drops the bullet when the flag is neither yes nor a negative", () => {
    const d = deriveFamilyDisplay([{ ...V400_192, hotswap_power: "Maybe" }], "V400");
    assert.ok(!d.technicalSpecs.some((b) => /Power Supply|PSU/.test(b)));
  });
});

describe("hidden -NCD rows", () => {
  // A hidden semi-custom copy of the V400-192 (ADR 0137), as live, but with one
  // fact drifted to show the effect. It sorts after its twin, so when it is in
  // the input it becomes the canonical row.
  const ncd: FamilySpecRow = { ...V400_192, id: "VX5-V400-192-NCD", max_cameras_h265: 999 };

  it("changes nothing when the visible-SKU filter excludes it, as the page does", () => {
    const visible = new Set(["VX5-V400-192"]);
    const rows = [V400_192, ncd].filter((r) => visible.has(r.id));
    assert.deepEqual(deriveFamilyDisplay(rows, "V400"), deriveFamilyDisplay([V400_192], "V400"));
  });

  it("speaks for the model when it is not excluded, which is what the datasheet does today", () => {
    const d = deriveFamilyDisplay([V400_192, ncd], "V400");
    assert.equal(d.sourceSku, "VX5-V400-192-NCD");
    assert.equal(d.kpis[0].value, "999");
  });
});

describe("parity with the datasheet (the regression guard)", () => {
  for (const model of Object.keys(EXPECTED)) {
    it(`${model}: page and datasheet agree on every shared fact`, () => {
      const page = deriveFamilyDisplay(ALL_TOP_ROWS, model);
      const sheet = buildLedgerContent(model, ALL_TOP_ROWS);
      assert.deepEqual(datasheetMismatches(page, sheet), []);
    });
  }

  it("moves both surfaces together when one value changes", () => {
    const edited = ALL_TOP_ROWS.map((r) =>
      r.id === "VX5-V400-192" ? { ...r, max_cameras_h265: 151 } : r,
    );
    const page = deriveFamilyDisplay(edited, "V400");
    const sheet = buildLedgerContent("V400", edited);
    assert.equal(page.kpis[0].value, "151");
    assert.equal(sheet.headline.find((h) => h.key === "Max Camera Streams")?.value, "151");
    assert.ok(page.keyFeatures.includes("Max VSR = 151 streams h.265 or h.264"));
    assert.deepEqual(datasheetMismatches(page, sheet), []);
  });

  it("reports a disagreement when the two surfaces read different rows", () => {
    // The live -NCD shape: the datasheet sees a drifted hidden twin, the page does not.
    const ncd: FamilySpecRow = { ...V400_192, id: "VX5-V400-192-NCD", ram_spec: "32GB ECC DDR5" };
    const page = deriveFamilyDisplay([V400_192], "V400");
    const sheet = buildLedgerContent("V400", [V400_192, ncd]);
    assert.deepEqual(datasheetMismatches(page, sheet), [
      'RAM: page "16GB ECC DDR5 DRAM" vs datasheet "32GB ECC DDR5 DRAM"',
    ]);
  });
});

describe("resolveFamilyDisplay", () => {
  it("returns the authored arrays for an authored family", () => {
    const v250 = familyBySlug("v250");
    assert.ok(v250 && v250.specSource === "authored");
    const d = resolveFamilyDisplay(v250, ALL_TOP_ROWS);
    assert.equal(d.kpis, v250.kpis);
    assert.equal(d.keyFeatures, v250.keyFeatures);
    assert.equal(d.technicalSpecs, v250.technicalSpecs);
  });

  it("derives a product_specs family from its own model's rows", () => {
    const v400 = familyBySlug("v400");
    assert.ok(v400 && v400.specSource === "product_specs");
    assert.deepEqual(resolveFamilyDisplay(v400, ALL_TOP_ROWS), deriveFamilyDisplay(ALL_TOP_ROWS, "V400"));
  });
});
