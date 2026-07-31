import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLedgerContent,
  canonicalRow,
  compliancePills,
  groupByModel,
  ledgerGaps,
  LEDGER_USAGE_MAX_CHARS,
  ledgerWarnings,
  modelOf,
  nvrLadder,
  orderableRows,
  streamsAt8Mp,
  vsrRows,
  warrantyBlock,
  type ProductSpecRow,
} from "./from-product-specs";

// Fixtures are the LIVE product_specs values, read out of the table and trimmed
// to the columns the adapter touches. They are literals rather than a database
// read so the adapter stays testable with no network — which is the whole reason
// the fetch lives outside it.
//
// Two models, not one, and deliberately so: the handoff's single most important
// gotcha is that the RAID level is a template variable, and it was caught only by
// testing the template against a SECOND model. V800 is RAID 60 at 36 bays, V400
// is RAID 6 at 8 bays, and the level appears in the ordering table's column
// header, in its caption, and in a page-1 attribute bullet.

const V800_BASE: ProductSpecRow = {
  id: "VX5-V800-864",
  model_name: "VideoX V800 864TB 4U 36Bay",
  storage_raw_tb: 864,
  drive_bays: 36,
  rack_units: "4U",
  hdd_count: 36,
  hdd_mtbf: "2.5 Million",
  max_bandwidth_mbps: 4000,
  max_cameras_h265: 325,
  raid_level_display: "60",
  raid_level_alt_display: null,
  raid_support: "RAID 0/1/5/6/10",
  battery_raid: "YES",
  cpu_model_full: "AMD EPYC 9005 4.3Ghz 16/32 Core",
  cpu_turbo_ghz: "4.55 Ghz",
  cores_threads: "16C/32T",
  cpu_cache: "64MB",
  mem_bandwidth: "614 GB/s",
  avx_512: "Yes",
  chiplet_arch: "Yes",
  infinity_guard: "Yes",
  hotswap_power: "Yes",
  ram_spec: "32GB ECC DDR5",
  os_edition: "Windows Server 2022 OR 2025 LTSC",
  os_ssd_type: "2x Enterprise SSD",
  os_redundancy: "Mirrored, hot-swap",
  os_drive_desc: null,
  network: "4 × 10GbE + 1 IPMI",
  gbe_10_ports: 4,
  sfp_addon: "Optional",
  display_ports: "VGA (Client View applications not supported on server)",
  remote_mgmt:
    "Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection",
  security_features: [
    "AMD Secure Encrypted Virtualization (SEV) • AMD Secure Memory",
    "Encryption (SME) • Secure Boot • Silicon Root of Trust • System Lockdown",
    "• TPM 2.0 FIPS, CC-TCG certified",
  ],
  form_factor: "4U Rackmount",
  power_wattage: "1200W 1+1 redundant PSU PMBus 1.2 80+ Platinum",
  power_redundancy: "1+1 redundant, hot swap",
  power_ac_input: "100-127VAC 10A 50-60Hz, 800Watt 200-240VAC 8A, 50-60Hz, 1200Watt",
  power_max_consumption: "1200W up to 80% efficient (Platinum) hot-plug redundant",
  cooling: "6 x 80x38mm PWM & low-power consumption hot swap fans",
  dimensions_mm: "430mm (w) x 680 (d) x 175 H",
  dimensions_in: "16.9 x 26.8 x 6.9",
  shipping_weight: "Ship Weight W/ 36x HDDs = 72k/167lbs",
  warranty_years: 5,
  warranty_terms:
    "Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).",
  operating_temp: "10- 30 C / 41 - 86 F",
  storage_temp: "-40 - 65 C / -40 - 149 F",
  humidity: "10 – 90% relative humidity (non-condensing)",
  regulatory_safety: "CE (class A), UKCA, FCC, RCM, UL",
  regulatory_emissions: null,
  ndaa_text: "NDAA Compliant, no disclosures",
  revision_date: "2026-07-31",
  product_photo_path: "/datasheet/v800-front.png",
  rear_io_photo_path: "/datasheet/v800-rear.png",
  usage_paragraph:
    "Designed for campus-wide deployments with centralized management, this solution delivers critical protection, high performance, and top-tier security.",
};

const V400_BASE: ProductSpecRow = {
  ...V800_BASE,
  id: "VX5-V400-192",
  model_name: "VideoX V400 192TB 2U 8Bay",
  storage_raw_tb: 192,
  drive_bays: 8,
  rack_units: "2U",
  hdd_count: 8,
  max_bandwidth_mbps: 2000,
  max_cameras_h265: 200,
  raid_level_display: "6",
  cpu_model_full: "AMD EPYC 9005 3.3Ghz 16/32 Core",
  cpu_turbo_ghz: "3.3 Ghz",
  ram_spec: "16GB ECC DDR5",
  form_factor: "2U Rackmount",
  product_photo_path: "/datasheet/v400-front.png",
  rear_io_photo_path: "/datasheet/v400-rear.png",
};

/** The V100 as it actually is today: warranty, regulatory and environmental columns blank. */
const V100_BASE: ProductSpecRow = {
  ...V800_BASE,
  id: "VX5-V100-48",
  model_name: "VideoX V100 48TB 1U 2Bay",
  storage_raw_tb: 48,
  drive_bays: 2,
  rack_units: "1U",
  hdd_count: 2,
  max_bandwidth_mbps: 500,
  max_cameras_h265: 25,
  raid_level_display: "1",
  raid_level_alt_display: "JBOD",
  raid_support: "Software RAID 0/1",
  os_ssd_type: "1x NVMe",
  os_redundancy: "NO",
  sfp_addon: "No",
  gbe_10_ports: 2,
  warranty_years: null,
  warranty_terms: null,
  regulatory_safety: null,
  regulatory_emissions: null,
  ndaa_text: null,
  display_ports: null,
  remote_mgmt: null,
  power_wattage: null,
  power_redundancy: null,
  power_ac_input: null,
  power_max_consumption: null,
  cooling: null,
  dimensions_mm: null,
  dimensions_in: null,
  shipping_weight: null,
  operating_temp: null,
  storage_temp: null,
  humidity: null,
  revision_date: null,
  product_photo_path: null,
  rear_io_photo_path: null,
  usage_paragraph: null,
};

/** The three drive capacities of a model, as the table holds them. */
function skus(base: ProductSpecRow, raws: number[]): ProductSpecRow[] {
  return raws.map((raw) => ({
    ...base,
    id: `VX5-${modelOf(base)}-${raw}`,
    storage_raw_tb: raw,
  }));
}

// The real sfp_addon split, which is the same in all six models that have it:
// the LOWEST-capacity row carries the full upgrade sentence and the higher two
// are truncated to a bare "Optional". canonicalRow() exists because of this.
const V800_SKUS = skus(V800_BASE, [576, 720, 864]).map((r, i) => ({
  ...r,
  sfp_addon: i === 0 ? "Optional - 2x 10Gb SFP+ or 2x 25Gb SFP28 upgrade available" : "Optional",
}));
const V400_SKUS = skus(V400_BASE, [128, 160, 192]);
const V100_SKUS = skus(V100_BASE, [32, 40, 48]);
const ALL_ROWS = [...V100_SKUS, ...V400_SKUS, ...V800_SKUS];

describe("modelOf / groupByModel", () => {
  it("reads the model out of the VX5-{MODEL}-{RAW_TB} part number", () => {
    assert.equal(modelOf({ id: "VX5-V800-864" }), "V800");
    assert.equal(modelOf({ id: "VX5-SW10-100" }), "SW10");
  });

  it("groups the three SKUs of a model into one entry, capacity ascending", () => {
    const groups = groupByModel(ALL_ROWS);
    assert.deepEqual([...groups.keys()].sort(), ["V100", "V400", "V800"]);
    assert.deepEqual(
      groups.get("V800")!.map((r) => r.storage_raw_tb),
      [576, 720, 864],
    );
  });

  it("orders ascending regardless of input order — the canonical row is the last", () => {
    const shuffled = [V800_SKUS[2], V800_SKUS[0], V800_SKUS[1]];
    const rows = groupByModel(shuffled).get("V800")!;
    assert.equal(rows[rows.length - 1].storage_raw_tb, 864);
  });
});

describe("orderable configurations", () => {
  // The handoff's own table, which is the acceptance criterion for this piece:
  //   V800 | RAID 60 | 36 bays | 83.3% | VX5-V800-576/-720/-864 -> 480/600/720 TB
  //   V400 | RAID 6  |  8 bays | 75%   | VX5-V400-128/-160/-192 ->  96/120/144 TB
  it("V800 at RAID 60 matches the handoff's published usable capacities", () => {
    assert.deepEqual(orderableRows(V800_SKUS), [
      {
        partNumber: "VX5-V800-576",
        driveConfig: "36 × 16TB enterprise HDD",
        raw: "576 TB",
        usable: "480 TB",
      },
      {
        partNumber: "VX5-V800-720",
        driveConfig: "36 × 20TB enterprise HDD",
        raw: "720 TB",
        usable: "600 TB",
      },
      {
        partNumber: "VX5-V800-864",
        driveConfig: "36 × 24TB enterprise HDD",
        raw: "864 TB",
        usable: "720 TB",
      },
    ]);
  });

  it("V400 at RAID 6 matches the handoff's published usable capacities", () => {
    assert.deepEqual(
      orderableRows(V400_SKUS).map((r) => [r.partNumber, r.raw, r.usable]),
      [
        ["VX5-V400-128", "128 TB", "96 TB"],
        ["VX5-V400-160", "160 TB", "120 TB"],
        ["VX5-V400-192", "192 TB", "144 TB"],
      ],
    );
  });

  it("derives the drive capacity from raw ÷ drives rather than assuming 16/20/24", () => {
    // A hypothetical 4-bay model at 128 TB raw is 32TB drives, not 16.
    const odd: ProductSpecRow = {
      ...V400_BASE,
      id: "VX5-V400-128",
      storage_raw_tb: 128,
      hdd_count: 4,
      drive_bays: 4,
    };
    assert.equal(orderableRows([odd])[0].driveConfig, "4 × 32TB enterprise HDD");
  });
});

describe("VSR table", () => {
  it("8MP costs 45% of the streams — round(baseline × 0.55)", () => {
    assert.equal(streamsAt8Mp(325), 179);
    assert.equal(streamsAt8Mp(200), 110);
    assert.equal(streamsAt8Mp(25), 14);
  });

  it("is two rows, H.265 only — Ledger never splits codecs", () => {
    const rows = vsrRows(325);
    assert.equal(rows.length, 2);
    assert.deepEqual([...new Set(rows.map((r) => r.codec))], ["H.265-20"]);
  });

  it("labels 4MP as 2560×1440 — Ledger's dimensions, NOT the workstation's 2592×1944", () => {
    assert.match(vsrRows(325)[0].resolution, /2560×1440/);
  });

  it("emits no rows at all when the row has no 4MP baseline", () => {
    assert.deepEqual(vsrRows(null), []);
  });
});

describe("compliance pills", () => {
  it("derives the handoff's three pills from the regulatory columns", () => {
    assert.deepEqual(compliancePills(V800_BASE), ["NDAA", "CE / UKCA", "FCC / UL / RCM"]);
  });

  it("names only the marks the row actually lists", () => {
    // Dropping UKCA must drop it from the pill, not leave a false conformity claim.
    const noUkca = { ...V800_BASE, regulatory_safety: "CE (class A), FCC, UL" };
    assert.deepEqual(compliancePills(noUkca), ["NDAA", "CE", "FCC / UL"]);
  });

  it("emits no pills when the row has no regulatory columns (the V100 today)", () => {
    assert.deepEqual(compliancePills(V100_BASE), []);
  });

  it("drops NDAA when ndaa_text is blank rather than assuming compliance", () => {
    assert.deepEqual(compliancePills({ ...V800_BASE, ndaa_text: "  " }), [
      "CE / UKCA",
      "FCC / UL / RCM",
    ]);
  });
});

describe("warranty block — the seal is chosen by term", () => {
  it("a 5-year term gets the 5-year seal", () => {
    const w = warrantyBlock(V800_BASE)!;
    assert.equal(w.years, 5);
    assert.equal(w.sealPath, "/price-book/5_year_warranty-circle-2.png");
    assert.match(w.title, /^5-Year/);
  });

  it("a 3-year term gets the 3-year seal, never its 5-year neighbour", () => {
    const w = warrantyBlock({ ...V800_BASE, warranty_years: 3 })!;
    assert.equal(w.sealPath, "/price-book/3_year_warranty-circle.png");
    assert.match(w.title, /^3-Year/);
  });

  it("a term with no graphic holds the circle rather than borrowing a seal", () => {
    assert.equal(warrantyBlock({ ...V800_BASE, warranty_years: 4 })!.sealPath, null);
  });

  it("no warranty_years means NO BAND — a term is never inferred", () => {
    // The V100 rows are in exactly this state. Its legacy free-text `warranty`
    // column reads "5yr NBD, Advanced Replacement", and parsing a term out of
    // that to pick a seal is how a false warranty claim reaches a customer.
    assert.equal(warrantyBlock(V100_BASE), null);
    assert.equal(warrantyBlock({ ...V800_BASE, warranty_years: 0 }), null);
    assert.equal(warrantyBlock({ ...V800_BASE, warranty_years: "" }), null);
  });

  it("accepts the numeric-as-string form PostgREST returns", () => {
    assert.equal(warrantyBlock({ ...V800_BASE, warranty_years: "5" })!.years, 5);
  });
});

describe("model ladder", () => {
  it("orders cells by drive bays and marks exactly one active", () => {
    const ladder = nvrLadder(groupByModel(ALL_ROWS), "V400");
    assert.deepEqual(
      ladder.map((c) => c.model),
      ["V100", "V400", "V800"],
    );
    assert.deepEqual(
      ladder.filter((c) => c.active).map((c) => c.model),
      ["V400"],
    );
  });

  it("shows bays · rack units and the max camera streams", () => {
    const v800 = nvrLadder(groupByModel(ALL_ROWS), "V800").at(-1)!;
    assert.equal(v800.detail, "36 bay · 4U");
    assert.equal(v800.capacity, "325");
  });

  it("marks nothing active for a model that is not in the line", () => {
    const ladder = nvrLadder(groupByModel(ALL_ROWS), "V250");
    assert.equal(
      ladder.filter((c) => c.active).length,
      0,
      "V250 is a management server and has no cell in the NVR ladder",
    );
  });
});

describe("buildLedgerContent — V800", () => {
  const content = buildLedgerContent("V800", ALL_ROWS);

  it("derives the descriptor the handoff lists as a SKU-specific literal", () => {
    assert.equal(content.descriptor, "36 Bay · 4U Rack · V5 Video Server");
  });

  it("derives the page-2 ceiling line", () => {
    assert.equal(content.performance.ceilingLine, "4,000 Mbit/s · 864 TB raw · 720 TB usable");
  });

  it("builds a VSR performance section, not the management capacity one", () => {
    assert.equal(content.performance.kind, "vsr");
  });

  it("fills the headline strip from the model's maximum, thousands-separated", () => {
    assert.deepEqual(content.headline, [
      { key: "Throughput", value: "4,000 Mbit/s" },
      { key: "Max Storage", value: "864 TB" },
      { key: "Drive Bays", value: "36" },
      { key: "Max Camera Streams", value: "325" },
    ]);
  });

  it("carries the RAID level into the ordering header variable and the caption", () => {
    assert.equal(content.orderable.columns[3].header, "Usable · RAID 60");
    assert.match(content.orderable.caption, /RAID 60/);
  });

  it("orders by drive capacity: Part Number / Drive Configuration / Raw / Usable", () => {
    assert.deepEqual(
      content.orderable.columns.map((c) => c.header),
      ["Part Number", "Drive Configuration", "Raw", "Usable · RAID 60"],
    );
  });

  it("says camera STREAMS, never cameras, in the VSR caption", () => {
    assert.match(content.performance.caption, /camera streams, not cameras/);
  });

  it("keeps the VSR parameter strip — it is what makes the count defensible", () => {
    assert.equal(content.performance.kind, "vsr");
    if (content.performance.kind !== "vsr") return;
    assert.equal(content.performance.parameters.length, 6);
    assert.deepEqual(
      content.performance.parameters.map((p) => p.label),
      ["Resolution", "Frame rate", "Codec", "Recording", "Motion activity", "Retention"],
    );
  });

  it("balances the spec grid by row count, as the handoff requires", () => {
    assert.equal(content.hardware.length, 12);
    assert.equal(content.environmental.length, 11);
  });

  it("reads the photo paths off the row and never invents one", () => {
    assert.equal(content.productPhoto.path, "/datasheet/v800-front.png");
    assert.equal(content.rearIo.path, "/datasheet/v800-rear.png");
  });

  it("interpolates the row's revision date into the footer", () => {
    assert.match(content.revisionLine, /rev 2026-07-31/);
  });

  it("claims TPM only because the row's security_features names it", () => {
    assert.ok(content.attributes.includes("TCG 2.0 cybersecurity w/ TPM"));
    const noTpm = buildLedgerContent("V800", [
      ...V100_SKUS,
      ...V400_SKUS,
      ...V800_SKUS.map((r) => ({ ...r, security_features: ["Secure Boot"] })),
    ]);
    assert.ok(
      !noTpm.attributes.some((a) => /TPM/.test(a)),
      "a product whose row does not list TPM must not claim it",
    );
  });

  it("takes the highest-capacity SKU as the canonical spec row", () => {
    // -864 says "4 × 10GbE + 1 IPMI"; give -576 different wording and the sheet
    // must still read the top row's.
    const rows = ALL_ROWS.map((r) =>
      r.id === "VX5-V800-576" ? { ...r, network: "WRONG ROW" } : r,
    );
    const network = buildLedgerContent("V800", rows).hardware.find((h) => h.label === "Network");
    assert.ok(!network!.value.includes("WRONG ROW"));
  });
});

describe("buildLedgerContent — V400 (the second model, which is the point)", () => {
  const content = buildLedgerContent("V400", ALL_ROWS);

  it("has RAID 6, not the V800's RAID 60", () => {
    assert.equal(content.orderable.columns[3].header, "Usable · RAID 6");
    assert.match(content.orderable.caption, /RAID 6,/);
    assert.ok(content.attributes.includes("RAID 6 data protection"));
  });

  it("has its own descriptor, ceiling and headline", () => {
    assert.equal(content.descriptor, "8 Bay · 2U Rack · V5 Video Server");
    assert.equal(content.performance.ceilingLine, "2,000 Mbit/s · 192 TB raw · 144 TB usable");
    assert.equal(content.headline[3].value, "200");
  });

  it("carries no stray V800 references outside the ladder", () => {
    // The handoff's V400 test pass checked for exactly this. Two fields are
    // excluded on purpose: the model ladder names all seven models because
    // showing where this SKU sits in the line IS its job, and the shared feature
    // blocks mention "RAID 6/60" as a property of the V5 server line.
    const flat = JSON.stringify({ ...content, ladder: null, features: null });
    assert.ok(!/V800/.test(flat), "a V400 sheet must not mention the V800");
    assert.ok(!/864|576|720 TB/.test(flat), "no V800 capacities on a V400 sheet");
  });

  it("puts the V400 cell active in a ladder that still shows the whole line", () => {
    assert.equal(content.ladder.length, 3);
    assert.equal(content.ladder.find((c) => c.active)!.model, "V400");
  });
});

describe("buildLedgerContent — V100, the incomplete row", () => {
  const content = buildLedgerContent("V100", ALL_ROWS);

  it("omits the warranty band entirely rather than assuming a term", () => {
    assert.equal(content.warranty, null);
  });

  it("omits the compliance pills rather than borrowing another model's", () => {
    assert.deepEqual(content.compliance, []);
  });

  it("leaves the usage paragraph empty rather than borrowing prose", () => {
    assert.equal(content.usage, "");
  });

  it("holds both photo frames — the layout never reflows around a missing asset", () => {
    assert.equal(content.productPhoto.path, null);
    assert.match(content.productPhoto.placeholder, /V100 front 3\/4/);
    assert.equal(content.rearIo.path, null);
  });

  it("drops the spec rows whose columns are blank instead of printing dashes", () => {
    const labels = content.environmental.map((r) => r.label);
    assert.ok(!labels.includes("Cooling"));
    assert.ok(!labels.includes("Operating temp"));
    assert.ok(!labels.includes("Safety"));
    assert.ok(content.environmental.length < 11);
    for (const row of [...content.hardware, ...content.environmental]) {
      assert.ok(row.value.trim() !== "" && row.value !== "—", `${row.label} is empty`);
    }
  });

  it("does not claim a mirrored OS pair — the V100 has one NVMe", () => {
    assert.ok(!content.attributes.some((a) => /OS SSD/i.test(a)));
  });

  it("does not print the 'No' in sfp_addon as an available upgrade", () => {
    const network = content.hardware.find((h) => h.label === "Network")!;
    assert.ok(!/\bNo\b/.test(network.value), network.value);
  });

  it("states the JBOD alternative the raid_level_alt_display column holds", () => {
    assert.equal(content.orderable.columns[3].header, "Usable · RAID 1");
    assert.match(content.orderable.caption, /JBOD/);
  });

  it("omits the revision date rather than implying today's", () => {
    assert.ok(!/rev/.test(content.revisionLine));
  });
});

describe("buildLedgerContent — failure modes", () => {
  it("throws for a model with no rows rather than rendering a sheet of dashes", () => {
    assert.throws(() => buildLedgerContent("V999", ALL_ROWS), /no product_specs rows for V999|no product_specs rows for model V999/);
  });

  it("names the models that ARE available, so the error is actionable", () => {
    assert.throws(() => buildLedgerContent("V999", ALL_ROWS), /V100, V400, V800/);
  });
});

describe("ledgerGaps", () => {
  it("is empty for a complete model", () => {
    assert.deepEqual(ledgerGaps("V800", ALL_ROWS), []);
  });

  it("names every visible gap on the V100, in words", () => {
    const gaps = ledgerGaps("V100", ALL_ROWS);
    assert.ok(gaps.some((g) => /usage/.test(g)));
    assert.ok(gaps.some((g) => /warranty/.test(g)));
    assert.ok(gaps.some((g) => /regulatory/.test(g)));
    assert.ok(gaps.some((g) => /front photo/.test(g)));
    assert.ok(gaps.some((g) => /environmental/.test(g)));
  });
});

describe("ledgerWarnings — the page-fit guard", () => {
  it("is silent for a usage paragraph page 1 can hold", () => {
    assert.deepEqual(ledgerWarnings("V800", ALL_ROWS), []);
  });

  it("flags a paragraph over the measured limit, and says by how much", () => {
    // The V700 sat at 369 characters and rendered a fourth page. The guard exists
    // so the picker says so before anyone sends the PDF to a customer, rather than
    // the spill being discovered in the reader.
    const long = "x".repeat(LEDGER_USAGE_MAX_CHARS + 45);
    const rows = ALL_ROWS.map((r) =>
      modelOf(r) === "V800" ? { ...r, usage_paragraph: long } : r,
    );
    const warnings = ledgerWarnings("V800", rows);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /fourth page/);
    assert.match(warnings[0], /shorten it by at least 45 characters/);
  });

  it("measures the CLEANED length, not the raw column", () => {
    // The columns were transcribed with CRLFs and doubled spaces; a paragraph
    // that is only over the limit before cleaning is not actually over it.
    const padded = `${"x".repeat(LEDGER_USAGE_MAX_CHARS - 10)}${"  \r\n  ".repeat(10)}`;
    const rows = ALL_ROWS.map((r) =>
      modelOf(r) === "V800" ? { ...r, usage_paragraph: padded } : r,
    );
    assert.deepEqual(ledgerWarnings("V800", rows), []);
  });

  it("is silent for a model with no usage paragraph at all", () => {
    assert.deepEqual(ledgerWarnings("V100", ALL_ROWS), []);
  });
});

describe("canonicalRow — highest capacity, extended by prefix", () => {
  it("takes the highest-capacity SKU", () => {
    assert.equal(canonicalRow(V800_SKUS).id, "VX5-V800-864");
  });

  it("extends a truncated value from a sibling SKU", () => {
    // The real shape of sfp_addon in every model that has it: the LOWEST-capacity
    // row carries the full sentence and the higher two are cut to "Optional".
    const full = "Optional - 2x 10Gb SFP+ or 2x 25Gb SFP28 upgrade available";
    const rows = [
      { ...V800_SKUS[0], sfp_addon: full },
      { ...V800_SKUS[1], sfp_addon: "Optional" },
      { ...V800_SKUS[2], sfp_addon: "Optional" },
    ];
    assert.equal(canonicalRow(rows).sfp_addon, full);
  });

  it("does NOT substitute a merely re-worded value — that would pick a fact at random", () => {
    // Neither of these prefixes the other; the canonical row's own wording stands.
    const rows = [
      { ...V800_SKUS[0], network: "4 × 10GbE RJ45 ports + 1 IPMI" },
      { ...V800_SKUS[1], network: "4 × 10GbE RJ45 ports + 1 IPMI" },
      { ...V800_SKUS[2], network: "4 × 10GbE + 1 IPMI" },
    ];
    assert.equal(canonicalRow(rows).network, "4 × 10GbE + 1 IPMI");
  });

  it("never merges a per-SKU capacity or identity column", () => {
    const row = canonicalRow(V800_SKUS);
    assert.equal(row.storage_raw_tb, 864);
    assert.equal(row.id, "VX5-V800-864");
  });

  it("is a no-op for a single-SKU model", () => {
    assert.equal(canonicalRow([V800_SKUS[0]]).id, V800_SKUS[0].id);
  });
});

describe("composed spec values do not leak negatives or shouted conjunctions", () => {
  it("lowercases the transcribed 'OR' in the OS line", () => {
    const content = buildLedgerContent("V800", ALL_ROWS);
    const os = content.hardware.find((h) => h.label === "Operating system")!;
    assert.equal(os.value, "Windows Server 2022 or 2025 LTSC");
    assert.ok(!/\bOR\b/.test(os.value));
  });

  it("drops a bare 'Optional' rather than rendering a dangling separator", () => {
    const rows = ALL_ROWS.map((r) =>
      modelOf(r) === "V800" ? { ...r, sfp_addon: "Optional" } : r,
    );
    const network = buildLedgerContent("V800", rows).hardware.find(
      (h) => h.label === "Network",
    )!;
    assert.equal(network.value, "4 × 10GbE + 1 IPMI");
  });

  it("keeps a real SFP upgrade sentence", () => {
    const network = buildLedgerContent("V800", ALL_ROWS).hardware.find(
      (h) => h.label === "Network",
    )!;
    assert.match(network.value, /SFP\+/);
  });

  it("omits 'NO' from the composed OS-drive value (the V100 has one NVMe)", () => {
    const osDrive = buildLedgerContent("V100", ALL_ROWS).hardware.find(
      (h) => h.label === "VMS / OS drive",
    )!;
    assert.equal(osDrive.value, "1x NVMe, dedicated for OS/VMS");
  });
});
