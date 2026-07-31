import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildManagementContent,
  camerasHeadline,
  camerasLadderPhrase,
  camerasPhrase,
  capacityRows,
  commonPrefixWords,
  compliancePills,
  managementGaps,
  managementLadder,
  managementWarnings,
  orderableTable,
  sheetRows,
  variantValue,
} from "./from-management-specs";
import type { ApplianceSpecRow } from "./from-appliance-specs";

// The live V250 and V255 appliance_specs rows, verbatim except for the two
// cameras_managed_* columns, which are null in production until someone enters
// them through the admin form. Both states are tested: the WITH_CAPACITY rows
// below carry the figures the design mockup shows, and the bare rows here carry
// production's nulls, because "renders honestly with the column empty" is the
// behaviour that actually ships today.

const SHARED = {
  os_edition: "Microsoft Windows Server Workgroup 2022 or 2025 (LTSC)",
  storage_summary: "NA",
  db_drive_desc: "2x Mirrored, hot-swap DB SSD",
  drive_bays: 4,
  raid_support:
    "Hardware RAID 5 Fault Tolerance w/ HW XOR Engine, CacheVault protection, patrol read repairs",
  battery_raid: "Yes",
  os_redundancy: "Mirrored",
  hotswap_power: "N+1 hot-swap power, cooling & drives",
  network: "2x (Two) Enterprise 10Gb Eth RJ45 ports + 1Gb IPMI",
  gbe_1_ports: 2,
  gbe_10_ports: 0,
  sfp_addon: "no",
  max_bandwidth_mbps: null,
  remote_mgmt:
    "Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection",
  display_ports: "VGA (Client View applications not supported on server)",
  form_factor: 'Standard 19" Rackmount w/Rails 1U height',
  rack_units: "1U",
  power_wattage: "800W 1+1 redundant PSU",
  power_redundancy: "1+1 redundant",
  power_max_consumption: "800W up to 80% efficient (Platinum) hot-plug redundant",
  power_ac_input: "100-240V~/ 10-5A, 50-60Hz",
  power_dc_input: "240Vdc/ 4A",
  cooling: "5 x 40x40x56mm (29,700rpm)",
  dimensions_mm: "710mm (depth) x 438mm (width) x 44mm (height)",
  dimensions_in: null,
  shipping_weight: "Ship WeightW/ 4x SSDs = 24k/40lbs",
  warranty_years: 5,
  warranty_terms:
    "5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).",
  operating_temp: "10- 30 C / 41 - 86 F",
  storage_temp: "-40 - 65 C / -40 - 149 F",
  humidity: "10 – 80% relative humidity (non-condensing)",
  regulatory_safety: "CE (class A), UKCA, FCC, RCM, UL.",
  regulatory_emissions: null,
  ndaa_text: "NDAA Compliant, no disclosures",
  security_features: [
    "Silicon Root of Trust",
    "Data at Rest Encryption (SEDs with local or external key mgmt)",
    "TPM 2.0 FIPS, CC-TCG certified",
  ],
  gpu_model: null,
  gpu_count: null,
  gpu_vram: null,
  gpu_cuda_cores: null,
  gpu_tensor_cores: null,
  gpu_rt_cores: null,
  gpu_encoders: null,
  gpu_decoders: null,
  monitor_support: null,
  front_io: null,
  rear_io: null,
  camera_matrix: null,
  revision_date: "2026-07-31",
  product_photo_path: "/datasheet/v100-v200-front.png",
  rear_io_photo_path: null,
  usage_paragraph:
    "Management/Directory servers for larger deployments with greater management and uptime considerations. Excellent balance of performance and value to right size your projects.",
  cameras_managed_min: null,
  cameras_managed_max: null,
};

const V250: ApplianceSpecRow = {
  ...SHARED,
  id: "VX5-V250-MGM",
  model_name: "VideoX V5 V250 Management Server",
  product_group: "V250",
  family_type: "management",
  sheet_group: "V250",
  cpu_model: "5th Generation Zen5 AMD EPYC 4245",
  cores_threads: "6C/12T",
  cpu_cache: "32MB Cache",
  cpu_base_ghz: "3.9Ghz",
  cpu_turbo_ghz: "5.1Ghz",
  ram_spec: "16GB DRAM DDR5 (minimum)",
  os_drive_desc:
    "2x Mirrored, Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS — V250 = 2x 480GB",
  raid_level_display: "1",
};

const V255: ApplianceSpecRow = {
  ...SHARED,
  id: "VX5-V255-MGM",
  model_name: "VideoX V5 V255 Management Server",
  product_group: "V255",
  family_type: "management",
  sheet_group: "V250",
  cpu_model: "5th Generation Zen5 AMD EPYC 4465",
  cores_threads: "12C/24T",
  cpu_cache: "64MB Cache",
  cpu_base_ghz: "3.4Ghz",
  cpu_turbo_ghz: "5.4Ghz",
  ram_spec: "32GB DRAM DDR5 (minimum)",
  os_drive_desc:
    "2x Mirrored, Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS — V255 = 2x 960GB",
  raid_level_display: "1",
};

/** The ACM rows, which exist here only so the 5-cell ladder has its other cells. */
function acm(group: string): ApplianceSpecRow {
  return {
    ...SHARED,
    id: `VX5-${group}-ACM`,
    model_name: `VideoX V5 ${group} ACM`,
    product_group: group,
    family_type: "acm",
    sheet_group: group === "V265" ? "V260" : group,
    cpu_model: "5th Generation Zen5 AMD EPYC 4245",
    cores_threads: "6C/12T",
    cpu_cache: "32MB Cache",
    cpu_base_ghz: "3.9Ghz",
    cpu_turbo_ghz: "5.1Ghz",
    ram_spec: "16GB DRAM DDR5 (minimum)",
    os_drive_desc: "2x Mirrored SSD",
    raid_level_display: "1",
  };
}

const ALL_ROWS = [V250, V255, acm("V150"), acm("V260"), acm("V265")];

/** The same sheet with the figures the design mockup shows, once entered. */
const WITH_CAPACITY = [
  { ...V250, cameras_managed_max: 250, max_bandwidth_mbps: 1000 },
  { ...V255, cameras_managed_min: 250, max_bandwidth_mbps: 1000 },
  ...ALL_ROWS.slice(2),
];

describe("sheetRows", () => {
  it("collects both variants of a shared sheet_group, in product order", () => {
    assert.deepEqual(
      sheetRows("V250", ALL_ROWS).map((r) => r.product_group),
      ["V250", "V255"],
    );
  });

  it("matches sheet_group exactly, not the product_group that looks like it", () => {
    // V150's sheet group is its own; V260's covers V260 and V265. Matching on
    // product_group instead would put V255 on no sheet and V150 on V150's twice.
    assert.deepEqual(
      sheetRows("V260", ALL_ROWS).map((r) => r.product_group),
      ["V260", "V265"],
    );
    assert.deepEqual(
      sheetRows("V150", ALL_ROWS).map((r) => r.product_group),
      ["V150"],
    );
    assert.deepEqual(sheetRows("V255", ALL_ROWS), []);
  });
});

describe("cameras managed — one fact, four phrasings", () => {
  it("reads a ceiling as 'Up to N' and a floor as 'N and above'", () => {
    assert.equal(camerasPhrase({ ...V250, cameras_managed_max: 250 }), "Up to 250");
    assert.equal(camerasPhrase({ ...V255, cameras_managed_min: 250 }), "250 and above");
  });

  it("shortens both for the ladder cell, which is a fifth of the measure wide", () => {
    assert.equal(camerasLadderPhrase({ ...V250, cameras_managed_max: 250 }), "≤ 250 cameras");
    assert.equal(camerasLadderPhrase({ ...V255, cameras_managed_min: 250 }), "250+ cameras");
  });

  it("merges the variants for the headline strip", () => {
    assert.equal(camerasHeadline(sheetRows("V250", WITH_CAPACITY)), "250 / 250+");
  });

  it("states a bounded range once, and an exact figure as a bare number", () => {
    const row = { ...V250, cameras_managed_min: 100, cameras_managed_max: 250 };
    assert.equal(camerasPhrase(row), "100–250");
    assert.equal(camerasPhrase({ ...row, cameras_managed_min: 250 }), "250");
  });

  it("thousands-separates, so a four-figure count is not printed bare", () => {
    assert.equal(camerasPhrase({ ...V250, cameras_managed_max: 2500 }), "Up to 2,500");
  });

  it("says em dash rather than guessing when the column is empty", () => {
    assert.equal(camerasPhrase(V250), "—");
    assert.equal(camerasLadderPhrase(V250), "—");
  });

  it("refuses a half-filled headline: '250 / —' would read as a real second figure", () => {
    const half = [{ ...V250, cameras_managed_max: 250 }, V255];
    assert.equal(camerasHeadline(half), "—");
  });
});

describe("commonPrefixWords", () => {
  it("keeps whole words, never a partial one", () => {
    // "4245" and "4465" share the digit 4, and taking it would print "EPYC 4".
    assert.equal(
      commonPrefixWords([
        "5th Generation Zen5 AMD EPYC 4245",
        "5th Generation Zen5 AMD EPYC 4465",
      ]),
      "5th Generation Zen5 AMD EPYC",
    );
  });

  it("drops a trailing separator that belonged to the tail", () => {
    assert.equal(commonPrefixWords(["Dedicated for OS/VMS — V250", "Dedicated for OS/VMS — V255"]),
      "Dedicated for OS/VMS");
  });

  it("is empty when the first word already differs", () => {
    assert.equal(commonPrefixWords(["16GB DDR5", "32GB DDR5"]), "");
  });
});

describe("variantValue — merging two SKUs into one spec value", () => {
  const rows = sheetRows("V250", ALL_ROWS);

  it("states a value both variants agree on exactly once", () => {
    assert.equal(
      variantValue(rows, (r) => r.network),
      "2x (Two) Enterprise 10Gb Eth RJ45 ports + 1Gb IPMI",
    );
  });

  it("hoists the shared words out and labels only the tails", () => {
    assert.equal(
      variantValue(rows, (r) => `${r.cpu_model}, ${r.cores_threads}`),
      "5th Generation Zen5 AMD EPYC · V250 = 4245, 6C/12T · V255 = 4465, 12C/24T",
    );
  });

  it("labels the whole value when the variants share no leading words", () => {
    assert.equal(
      variantValue(rows, (r) => r.ram_spec),
      "V250 = 16GB DRAM DDR5 (minimum) · V255 = 32GB DRAM DDR5 (minimum)",
    );
  });

  it("does not label twice when the source column already labels in place", () => {
    // os_drive_desc ends "… — V250 = 2x 480GB", so a naive composition prints
    // "V250 = V250 = 2x 480GB".
    const value = variantValue(rows, (r) => r.os_drive_desc);
    assert.ok(!/V250 = V250/.test(value), value);
    assert.equal(
      value,
      "2x Mirrored, Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS · " +
        "V250 = 2x 480GB · V255 = 2x 960GB",
    );
  });

  it("never picks a winner — a difference here is the product, not a typo", () => {
    const value = variantValue(rows, (r) => r.cpu_cache);
    assert.match(value, /32MB/);
    assert.match(value, /64MB/);
  });

  it("skips a variant whose column is blank rather than printing an empty label", () => {
    const value = variantValue([{ ...V250, cooling: null }, V255], (r) => r.cooling);
    assert.equal(value, "5 x 40x40x56mm (29,700rpm)");
  });

  it("is empty when no variant has the column", () => {
    assert.equal(variantValue(rows, (r) => r.gpu_model), "");
  });
});

describe("managementLadder", () => {
  const ladder = managementLadder(WITH_CAPACITY, ["V250", "V255"]);

  it("is the 5-cell management & ACM ladder, never merged with the NVR one", () => {
    assert.deepEqual(ladder.map((c) => c.model), ["V150", "V250", "V255", "V260", "V265"]);
  });

  it("bars BOTH of the sheet's SKUs, because the sheet is titled for both", () => {
    assert.deepEqual(
      ladder.filter((c) => c.active).map((c) => c.model),
      ["V250", "V255"],
    );
  });

  it("shows the ACM cells as a role, since no capacity figure applies to them", () => {
    const v150 = ladder.find((c) => c.model === "V150")!;
    assert.equal(v150.detail, "Access control");
    assert.equal(v150.capacity, "ACM");
  });

  it("shows the management cells as role over capacity", () => {
    const v255 = ladder.find((c) => c.model === "V255")!;
    assert.equal(v255.detail, "Management");
    assert.equal(v255.capacity, "250+ cameras");
  });
});

describe("compliancePills", () => {
  it("derives the three pills from the regulatory columns, never authored", () => {
    assert.deepEqual(compliancePills(sheetRows("V250", ALL_ROWS)), [
      "NDAA",
      "CE / UKCA",
      "FCC / UL / RCM",
    ]);
  });

  it("prints no pill for a mark the row does not name", () => {
    const bare = [{ ...V250, regulatory_safety: "CE", ndaa_text: null }];
    assert.deepEqual(compliancePills(bare), ["CE"]);
  });
});

describe("capacityRows — the table that replaces Max Video Stream Rate", () => {
  const rows = capacityRows(sheetRows("V250", WITH_CAPACITY));

  it("is one row per variant plus the two that describe the sheet", () => {
    assert.deepEqual(rows.map((r) => r.role), [
      "V250 management server",
      "V255 management server",
      "Management w/ failover",
      "Client View on server",
    ]);
  });

  it("says None in every Recording cell — that is the point of the table", () => {
    assert.ok(rows.every((r) => r.recording === "None"));
  });

  it("derives the note from the shape of the bound, not from a per-model literal", () => {
    assert.equal(rows[0].notes, "Directory + management only");
    assert.equal(rows[1].notes, "For deployments over 250 cameras");
  });

  it("still lists both variants when the capacity column is empty", () => {
    const bare = capacityRows(sheetRows("V250", ALL_ROWS));
    assert.equal(bare.length, 4);
    assert.equal(bare[0].cameras, "—");
  });
});

describe("orderableTable — a different shape from the NVR one", () => {
  const table = orderableTable(sheetRows("V250", WITH_CAPACITY));

  it("orders by CPU/RAM tier, not by drive capacity", () => {
    assert.deepEqual(table.columns.map((c) => c.header), [
      "Part Number",
      "Model",
      "Configuration",
      "Cameras Managed",
    ]);
  });

  it("lists one row per SKU, part number first", () => {
    assert.deepEqual(table.rows.map((r) => r[0]), ["VX5-V250-MGM", "VX5-V255-MGM"]);
    assert.deepEqual(table.rows.map((r) => r[1]), ["V250", "V255"]);
  });

  it("composes the configuration cell from typed columns, not from prose", () => {
    assert.equal(table.rows[0][2], "6C/12T, 16GB DRAM DDR5 (minimum), 32MB Cache");
    assert.equal(table.rows[1][2], "12C/24T, 32GB DRAM DDR5 (minimum), 64MB Cache");
  });

  it("carries the capacity phrase into the last column", () => {
    assert.deepEqual(table.rows.map((r) => r[3]), ["Up to 250", "250 and above"]);
  });

  it("says how many variants share the chassis in the caption", () => {
    assert.match(table.caption, /V250 and V255 share one chassis/);
  });
});

describe("buildManagementContent — the production rows, capacity not yet entered", () => {
  const content = buildManagementContent("V250", ALL_ROWS);

  it("titles the sheet for both variants", () => {
    assert.equal(content.model, "V250 / V255");
  });

  it("derives the descriptor rather than carrying a literal", () => {
    assert.equal(content.descriptor, "4 Bay · 1U Rack · Management / Directory Server");
  });

  it("swaps the two NVR headline labels for the management ones", () => {
    assert.deepEqual(
      content.headline.map((h) => h.key),
      ["Throughput", "Cameras Managed", "Drive Bays", "Form Factor"],
    );
  });

  it("shows an em dash for the two figures nobody has entered, and invents neither", () => {
    // The 1,000 Mbit/s and "250 / 250+" on the design mockup are the designer's:
    // the phase-2 transcription records no bandwidth block on any server sheet
    // and no camera count for either variant.
    assert.equal(content.headline[0].value, "—");
    assert.equal(content.headline[1].value, "—");
    const flat = JSON.stringify(content);
    assert.ok(!/1,000 Mbit/.test(flat), "no invented throughput anywhere on the sheet");
  });

  it("builds a capacity performance section with NO parameter strip", () => {
    assert.equal(content.performance.kind, "capacity");
    // The strip states what a stream count was measured against, and this
    // machine records nothing. `kind` is what makes it unrepresentable here.
    assert.ok(!("parameters" in content.performance));
  });

  it("reads the real bays, rack height and photo off the rows", () => {
    assert.equal(content.headline[2].value, "4");
    assert.equal(content.headline[3].value, "1U Rack");
    assert.equal(content.productPhoto.path, "/datasheet/v100-v200-front.png");
  });

  it("carries the 5-year band and the seal chosen by term", () => {
    assert.equal(content.warranty!.years, 5);
    assert.equal(content.warranty!.sealPath, "/price-book/5_year_warranty-circle-2.png");
  });

  it("expands the storage sentinel instead of printing a bare 'NA'", () => {
    const storage = content.hardware.find((h) => h.label === "Storage capacity")!;
    assert.equal(storage.value, "Not applicable — no video recording volume");
  });

  it("does not say CacheVault twice — the RAID prose already names it", () => {
    const raid = content.hardware.find((h) => h.label === "RAID")!;
    assert.equal(raid.value.match(/CacheVault/gi)!.length, 1);
  });

  it("states both variants' CPU, cache and RAM on page 3, where the factsheet does", () => {
    const cpu = content.hardware.find((h) => h.label === "CPU")!;
    assert.match(cpu.value, /V250 = 4245/);
    assert.match(cpu.value, /V255 = 4465/);
    const ram = content.hardware.find((h) => h.label === "RAM")!;
    assert.match(ram.value, /16GB/);
    assert.match(ram.value, /32GB/);
  });

  it("prints the DC input the NVR sheet has no column for", () => {
    const power = content.environmental.find((h) => h.label === "Power")!;
    assert.match(power.value, /240Vdc/);
  });

  it("does not print the 'no' in sfp_addon as an available upgrade", () => {
    const network = content.hardware.find((h) => h.label === "Network")!;
    assert.ok(!/\bno\b/i.test(network.value), network.value);
  });

  it("lowercases the shouting OR the OS column was transcribed with", () => {
    const os = content.hardware.find((h) => h.label === "Operating system")!;
    assert.match(os.value, /2022 or 2025/);
  });

  it("uses the management feature blocks, not the NVR ones", () => {
    const titles = content.features.map((f) => f.title);
    assert.ok(titles.some((t) => /management & directory roles/.test(t)));
    // The NVR sheet sells petabyte video storage and H.265 throughput. This
    // machine has neither, so those two blocks must not appear.
    assert.ok(!titles.some((t) => /tier-1 enterprise storage/.test(t)));
    assert.ok(!titles.some((t) => /hardware accelerated H.265/.test(t)));
  });

  it("carries no NVR vocabulary — no stream rate, no RAID usable capacity", () => {
    const flat = JSON.stringify(content);
    assert.ok(!/Video Stream Rate/i.test(flat));
    assert.ok(!/TB raw|TB usable/i.test(flat));
    assert.ok(!/Drive Configuration/.test(flat));
  });

  it("holds a page-1 usage paragraph inside the measured spill point", () => {
    assert.deepEqual(managementWarnings("V250", ALL_ROWS), []);
  });

  it("throws for a sheet group with no rows rather than rendering dashes", () => {
    assert.throws(() => buildManagementContent("V999", ALL_ROWS), /no appliance_specs rows/);
  });
});

describe("buildManagementContent — once the capacity figures are entered", () => {
  const content = buildManagementContent("V250", WITH_CAPACITY);

  it("fills the headline strip the way the design mockup shows it", () => {
    assert.deepEqual(content.headline, [
      { key: "Throughput", value: "1,000 Mbit/s" },
      { key: "Cameras Managed", value: "250 / 250+" },
      { key: "Drive Bays", value: "4" },
      { key: "Form Factor", value: "1U Rack" },
    ]);
  });

  it("composes the ceiling line beside the capacity heading", () => {
    assert.equal(
      content.performance.ceilingLine,
      "V250 ≤ 250 · V255 250+ · 1,000 Mbit/s",
    );
  });

  it("drops a missing part of the ceiling line rather than dashing it", () => {
    const noBandwidth = buildManagementContent(
      "V250",
      WITH_CAPACITY.map((r) => ({ ...r, max_bandwidth_mbps: null })),
    );
    assert.equal(noBandwidth.performance.ceilingLine, "V250 ≤ 250 · V255 250+");
    assert.ok(!/—/.test(noBandwidth.performance.ceilingLine));
  });
});

describe("managementGaps", () => {
  it("names both unentered figures and the missing rear photo", () => {
    const gaps = managementGaps("V250", ALL_ROWS);
    assert.ok(gaps.some((g) => /cameras managed on V250 and V255/.test(g)));
    assert.ok(gaps.some((g) => /throughput/.test(g)));
    assert.ok(gaps.some((g) => /rear I\/O photo/.test(g)));
  });

  it("goes quiet on the two figures once they are entered", () => {
    const gaps = managementGaps("V250", WITH_CAPACITY);
    assert.ok(!gaps.some((g) => /cameras managed/.test(g)));
    assert.ok(!gaps.some((g) => /throughput/.test(g)));
  });

  it("names a chassis column the two variants disagree on", () => {
    // One chassis, so a differing cooling spec is a data-entry slip — and it
    // renders as "V250 = … · V255 = …" as though the difference were meant.
    const skewed = [{ ...V250, cooling: "4 x 40mm" }, V255, ...ALL_ROWS.slice(2)];
    const gaps = managementGaps("V250", skewed);
    assert.ok(gaps.some((g) => /cooling/.test(g) && /one chassis/.test(g)), gaps.join(" | "));
  });

  it("does not flag CPU, cache or RAM, which are supposed to differ", () => {
    const gaps = managementGaps("V250", WITH_CAPACITY);
    assert.ok(!gaps.some((g) => /one chassis/.test(g)), gaps.join(" | "));
  });
});

describe("managementWarnings", () => {
  it("measures the composed paragraph against Ledger's own spill point", () => {
    const long = "x".repeat(400);
    const warnings = managementWarnings("V250", [
      { ...V250, usage_paragraph: long },
      { ...V255, usage_paragraph: long },
      ...ALL_ROWS.slice(2),
    ]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /spills onto a fourth page/);
  });
});
