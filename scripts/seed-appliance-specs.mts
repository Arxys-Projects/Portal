// One-time seed of the seven appliance_specs rows from the build-step-6 entry
// reference (datasheets/datasheet-phase2-step6-entry-reference.md, Part B).
//
// WHY THIS EXISTS. ADR 0097 §8 said these rows are hand-entered through
// /admin/appliance-specs/new, and ADR 0102/0103 built a sibling prefill to cut
// the retyping. Andy's call (2026-07-29): the data is already fully transcribed
// in the reference, so a reviewed one-pass import is faster and less error-prone
// than seven form entries, and he does not need attribution correct on this
// first seed. This is ADR 0097's own named revisit condition — "a reviewed
// import path" — with two properties kept:
//
//   1. VALIDATION. Every row goes through parseApplianceForm — the SAME zod the
//      form uses — before anything is written. A bad RAID level, a wrong
//      archetype, or a malformed camera matrix is caught here, not in the table.
//   2. NO SURPRISE WRITES. Dry-run by default: it parses all seven and prints
//      them, writing nothing. Only `--write` inserts, and only into an EMPTY
//      table (it aborts if any appliance_specs row already exists), so it cannot
//      double-insert or partially clobber.
//
// What it does NOT keep is attribution: it writes with the service_role key, so
// the appliance_specs_stamp_updated trigger stamps updated_by = auth.uid() =
// NULL on all seven rows. Accepted for the first seed (Andy, 2026-07-29); a
// later real edit through the form stamps a real editor.
//
// DECISIONS baked in where the reference left a value open (all trivially
// editable afterward through /admin/appliance-specs/[sku]):
//   - V250 / V255 raid_level_display: BLANK. The sheet contradicts itself
//     (§2b-viii); raid_support already carries the RAID-5 prose. (Open item #3.)
//   - battery_raid / os_redundancy on the four server rows: BLANK. The strings
//     are already inside raid_support / os_drive_desc; splitting them out is the
//     reference's "your call", and duplication invites drift.
//   - V260 / V265 raid_level_display: "1" — the sheet says "Mirroring" plainly.
//   - model_name on all seven: the reference's proposed names.
//
// Run:
//   npx tsx --env-file=.env.local scripts/seed-appliance-specs.mts            # dry-run
//   npx tsx --env-file=.env.local scripts/seed-appliance-specs.mts --write    # insert
//
// The `.mts` extension is load-bearing: tsx transforms plain `.ts` as CommonJS
// and rejects top-level await.

import { createClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";
import { APPLIANCE_FIELD_NAMES } from "../src/app/(app)/admin/appliance-specs/fields";
import { parseApplianceForm } from "../src/app/(app)/admin/appliance-specs/schema";

// The ten-item Credential & Key Encryption list, identical on all five server
// sheets (§2a-iii). The last item is one entry — the comma is inside it.
const SECURITY_FEATURES = [
  "AMD Secure Encrypted Virtualization (SEV)",
  "AMD Secure Memory Encryption (SME)",
  "Cryptographically signed firmware",
  "Data at Rest Encryption (SEDs with local or external key mgmt)",
  "Secure Boot",
  "Secured Component Verification (Hardware integrity check)",
  "Secure Erase",
  "Silicon Root of Trust",
  "System Lockdown",
  "TPM 2.0 FIPS, CC-TCG certified",
];

// Values shared by all five server rows (V150 / V250 / V255 / V260 / V265) —
// the "shared server table" of the reference (Part B preamble).
const SERVER_SHARED = {
  os_edition: "Microsoft Windows Server Workgroup 2022 or 2025 (LTSC)",
  network: "2x (Two) Enterprise 10Gb Eth RJ45 ports + 1Gb IPMI",
  gbe_1_ports: null,
  gbe_10_ports: 2,
  sfp_addon: null,
  remote_mgmt:
    "Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection",
  display_ports: "VGA (Client View applications not supported on server)",
  form_factor: 'Standard 19" Rackmount w/Rails 1U height',
  rack_units: "1U",
  warranty_years: 5,
  warranty_terms:
    "5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).",
  operating_temp: "10- 30 C / 41 - 86 F",
  storage_temp: "-40 - 65 C / -40 - 149 F",
  humidity: "10 – 80% relative humidity (non-condensing)",
  regulatory_safety: "CE (class A), UKCA, FCC, RCM, UL.",
  regulatory_emissions: null,
  ndaa_text: "NDAA Compliant, no disclosures",
  security_features: SECURITY_FEATURES,
  max_bandwidth_mbps: null,
  revision_date: null,
  // The twelve Workstation-only columns stay blank on a server row.
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
};

// The V250/V260 chassis power/physical block, shared by the four V-server rows.
const V_SERVER_CHASSIS = {
  power_wattage: "800W 1+1 redundant PSU",
  power_redundancy: "1+1 redundant",
  power_max_consumption: "800W up to 80% efficient (Platinum) hot-plug redundant",
  power_ac_input: "100-240V~/ 10-5A, 50-60Hz",
  power_dc_input: "240Vdc/ 4A",
  cooling: "5 x 40x40x56mm (29,700rpm)",
  dimensions_mm: "710mm (depth) x 438mm (width) x 44mm (height)",
  dimensions_in: null,
  battery_raid: null,
  os_redundancy: null,
  hotswap_power: "N+1 hot-swap power, cooling & drives",
};

const V250 = {
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
  storage_summary: "NA",
  os_drive_desc:
    "2x Mirrored, Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS — V250 = 2x 480GB",
  db_drive_desc: "2x Mirrored, hot-swap DB SSD",
  drive_bays: 4,
  raid_support:
    "Hardware RAID 5 Fault Tolerance w/ HW XOR Engine, CacheVault protection, patrol read repairs",
  raid_level_display: null, // OPEN §2b-viii — sheet contradicts itself; editable later
  shipping_weight: "Ship WeightW/ 4x SSDs = 24k/40lbs",
  notes:
    'Sheet contradicts itself on RAID: p2 RAID block says "Hardware RAID 5 Fault Tolerance", p1 says "HW RAID Mirrored SSDs" and the 2+2 SSD layout is mirroring — raid_level_display left blank. DB drive detail is on p1 Key Attributes only — no p2 DB block on this sheet. Sheet footer carries no rev date.',
  ...V_SERVER_CHASSIS,
  ...SERVER_SHARED,
};

const V255 = {
  id: "VX5-V255-MGM",
  model_name: "VideoX V5 V255 Management Server",
  product_group: "V255",
  family_type: "management",
  sheet_group: "V250", // the pairing — shares V250's sheet, not its own group
  cpu_model: "5th Generation Zen5 AMD EPYC 4465",
  cores_threads: "6C/24T", // verbatim; almost certainly a typo for 12C/24T (§2b-ix)
  cpu_cache: "64MB Cache",
  cpu_base_ghz: "3.4Ghz",
  cpu_turbo_ghz: "5.4Ghz",
  ram_spec: "32GB DRAM DDR5 (minimum)",
  storage_summary: "NA",
  os_drive_desc:
    "2x Mirrored, Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS — V255 = 2x 960GB",
  db_drive_desc: "2x Mirrored, hot-swap DB SSD",
  drive_bays: 4,
  raid_support:
    "Hardware RAID 5 Fault Tolerance w/ HW XOR Engine, CacheVault protection, patrol read repairs",
  raid_level_display: null, // OPEN §2b-viii, same as V250
  shipping_weight: "Ship WeightW/ 4x SSDs = 24k/40lbs",
  notes:
    'Same RAID contradiction as VX5-V250-MGM; raid_level_display left blank. Sheet prints CPU as "6C/24T" and TDP as "65W TD12" — both read as typos (12C/24T, 65W TDP); transcribed as printed. Shares sheet group V250 with VX5-V250-MGM.',
  ...V_SERVER_CHASSIS,
  ...SERVER_SHARED,
};

const V260 = {
  id: "VX5-V260-ACM",
  model_name: "VideoX V5 V260 ACM",
  product_group: "V260",
  family_type: "acm",
  sheet_group: "V260",
  cpu_model: "5th Generation Zen5 AMD EPYC",
  cores_threads: "6C/12T",
  cpu_cache: "32MB Cache",
  cpu_base_ghz: "3.9Ghz",
  cpu_turbo_ghz: "5.1Ghz",
  ram_spec: "16GB DRAM DDR5 (minimum)",
  storage_summary: null, // this sheet has no Storage Capacties block
  os_drive_desc:
    "2x Mirrored, 480GB Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS",
  db_drive_desc:
    "2x Mirrored, 480GB Enterprise 3D TLC Flash SSD, Hot Swap Operation, tool-less Hot-swap",
  drive_bays: null,
  raid_support: "Hardware RAID Mirroring, CacheVault protection, patrol read repairs",
  raid_level_display: "1", // sheet says "Mirroring" plainly
  shipping_weight: "Ship WeightW/ 4x HDDs = 27k/45lbs",
  notes:
    "Sheet is titled V260/V270; the V265 SKU maps to this sheet's V270 column (reference §2b-vi). CPU part number not printed on this sheet. No Storage Capacties block. Max door support: \"Up to 500 door support\" (p1) has no column yet — deferred ACM schema, ADR 0097 §1.",
  ...V_SERVER_CHASSIS,
  ...SERVER_SHARED,
};

const V265 = {
  id: "VX5-V265-ACM",
  model_name: "VideoX V5 V265 ACM",
  product_group: "V265",
  family_type: "acm",
  sheet_group: "V260",
  cpu_model: "5th Generation Zen5 AMD EPYC",
  cores_threads: "12C/24T", // ⚠ from the sheet's V270 column (§2b-vi)
  cpu_cache: "64MB Cache",
  cpu_base_ghz: "3.4Ghz",
  cpu_turbo_ghz: "5.4Ghz",
  ram_spec: "32GB DRAM DDR5 (minimum)",
  storage_summary: null,
  os_drive_desc:
    "2x Mirrored, 480GB Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS",
  db_drive_desc:
    "2x Mirrored, 960GB Enterprise 3D TLC Flash SSD, Hot Swap Operation, tool-less Hot-swap",
  drive_bays: null,
  raid_support: "Hardware RAID Mirroring, CacheVault protection, patrol read repairs",
  raid_level_display: "1",
  shipping_weight: "Ship WeightW/ 4x HDDs = 27k/45lbs",
  notes:
    "Values taken from this sheet's V270 column — the sheet is titled V260/V270 and has no V265 column. Confirm the V270-is-V265 mapping or get a V265 sheet. CPU part number not printed.",
  ...V_SERVER_CHASSIS,
  ...SERVER_SHARED,
};

const V150 = {
  id: "VX5-V150-ACM",
  model_name: "VideoX V5 V150 ACM",
  product_group: "V150",
  family_type: "acm",
  sheet_group: "V150",
  cpu_model: "5th Generation Zen5 AMD EPYC 4245",
  cores_threads: "6C/12T",
  cpu_cache: "32MB Cache",
  cpu_base_ghz: "3.9Ghz",
  cpu_turbo_ghz: "5.1Ghz",
  ram_spec: "8GB DRAM DDR5",
  storage_summary: "NA",
  os_drive_desc:
    "Dedicated 480GB Enterprise 3D TLC Flash SSD, Dedicated for OS/ACM, Certified 24/7 Operation, tool-less Hot-swap",
  db_drive_desc: null,
  drive_bays: null,
  raid_support: null, // no RAID block — single OS SSD, no array
  raid_level_display: null,
  battery_raid: null,
  os_redundancy: null,
  hotswap_power: null, // p1 says "Single Power Supply"
  power_wattage: "600W PSU", // the only non-800W server
  power_redundancy: null, // sheet contradicts itself (§2b-ix)
  power_max_consumption: "600W up to 80% efficient (Platinum) hot-plug redundant",
  power_ac_input: "100-240V~/ 10-5A, 50-60Hz",
  power_dc_input: "240Vdc/ 4A",
  cooling:
    "4 x 40x40x56mm (29,700rpm) / 2 x 40x40x56mm (32,000rpm) all 6- hot swap",
  dimensions_mm: "710mm (depth) x 438mm (width) x 44mm (height)",
  dimensions_in: null,
  shipping_weight: "Ship Weight = 22k/40lbs",
  notes:
    'Own dedicated sheet (Arxys-VideoX-Factsheet-V150-ACM-V5.pdf), found 2026-07-28 — families.ts carries no V150 datasheet URL. Sheet contradicts itself on power: p1 "Single Power Supply", Power Spec "600W PSU", Max Power Consumption "hot-plug redundant"; power_redundancy left blank. No RAID block — single OS SSD, no array. Sheet shows ONE 480GB OS SSD; families.ts skuExtraData publishes "2x 480GB". Max door support: "Up to 100 Access Doors" (p1) — no column, deferred ACM schema. Classified acm not management on the sheet\'s own branding.',
  ...SERVER_SHARED,
};

// The SW10/SW20 shared block — same chassis, PSU, dimensions, weight, CPU,
// environmental and regulatory, and the per-GPU figures the SW20 states once.
const SW_SHARED = {
  cpu_model: "AMD Ryzen 7 9700X",
  cores_threads: "8C/16T",
  cpu_cache: "32MB Cache",
  cpu_base_ghz: "3.8Ghz",
  cpu_turbo_ghz: "5.5Ghz",
  ram_spec: "16GB DDR5",
  os_edition: "Microsoft Windows 11 IoT Enterprise (LTSC)",
  storage_summary: null,
  os_drive_desc: "Dedicated 480GB Enterprise 3D TLC Flash SSD NVMe, Dedicated for OS/VMS.",
  db_drive_desc: null,
  drive_bays: null,
  raid_support: null,
  raid_level_display: null,
  battery_raid: null,
  os_redundancy: null,
  hotswap_power: null,
  network: "2 x 10Gb Ethernet (10 Gbps/5 Gbps/2.5 Gbps/1 Gbps/100 Mbps) RJ45 ports",
  gbe_1_ports: null,
  gbe_10_ports: 2,
  sfp_addon: null,
  remote_mgmt: null,
  form_factor: "Performance Tower, with enhanced cooling, EPEAT Bronze certified",
  rack_units: null,
  power_wattage: "Up to 850W Gold ATX Power Supply",
  power_redundancy: null,
  power_max_consumption: "850W up to 80% efficient (Gold)",
  power_ac_input: "100-240Vac, 9-4.5A, 50-60Hz",
  power_dc_input: null,
  cooling: null,
  dimensions_mm: "470 x 230 x 518.5mm",
  dimensions_in: '18.5" x 9.6" x 20.3" inches',
  shipping_weight: "Gross Weight : 9.6 Kg, 24.5lb",
  warranty_years: 3,
  warranty_terms:
    "3 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).",
  operating_temp: "10- 35 C",
  storage_temp: null,
  humidity: "20 – 90% relative humidity (non-condensing)",
  regulatory_safety: "BSMI, CE, FCC(Class B), Energy Star.",
  regulatory_emissions: null,
  ndaa_text: "NDAA Compliant, no disclosures",
  security_features: [], // no Credential & Key Encryption block — saves as []
  gpu_model: "Nvidia A1000",
  gpu_vram: "8 GB GDDR6 with ECC - 128-bit - 192 GB/sec",
  gpu_cuda_cores: 2307,
  gpu_tensor_cores: 72,
  gpu_rt_cores: 18,
  gpu_encoders: 1,
  gpu_decoders: 2,
  front_io: "2 x USB 3.2 Gen 2x2 Type-C, 2 x USB 3.0, HD Audio",
  rear_io:
    "3 x USB 3.2 Gen 2 Type-A ports (red), 4 x USB 3.2 Gen 1 ports\n4 x USB 2.0/1.1 ports",
  revision_date: null,
};

const SW10_DISPLAY_PORTS = `Primary Ports from GPUS:
4x Mini DP with 4x Mini DP to DP Adapters included
AMD Radeon™ Graphics support:
- 1 x USB Type-C® port with DisplayPort video output
- 1 x HDMI port`;

const SW20_DISPLAY_PORTS = `Primary Ports from GPUS:
8x Mini DP with 4x Mini DP to DP Adapters included
AMD Radeon™ Graphics support:
- 1 x USB Type-C® port with DisplayPort video output
- 1 x HDMI port`;

const SW10 = {
  id: "VX5-SW10-100",
  model_name: "VideoX V5 SW10 Security Workstation",
  product_group: "SW10",
  family_type: "workstation",
  sheet_group: "SW10",
  max_bandwidth_mbps: 125,
  display_ports: SW10_DISPLAY_PORTS,
  gpu_count: 1,
  monitor_support:
    "Up to 4x Monitors (monitors not included). VMS and configuration dependant.",
  camera_matrix: [
    { resolution: "4MP", codec: "H.264", fps: 15, cameras: 28, bandwidth_mbps: 125 },
    { resolution: "4MP", codec: "H.265", fps: 15, cameras: 48, bandwidth_mbps: 125 },
    { resolution: "8MP", codec: "H.264", fps: 15, cameras: 16, bandwidth_mbps: 108 },
    { resolution: "8MP", codec: "H.265", fps: 15, cameras: 32, bandwidth_mbps: 125 },
  ],
  notes:
    'Hero bullet says 8GB RAM; RAM block says 16GB DDR5 — entered 16GB (families.ts agrees). Camera matrix column header reads "FPS" but holds codec values; fps 15 comes from the "@15fps" footnote. Only sheet family that prints an inches dimension. No Credential & Key Encryption, RAID, Cooling, Storage Capacties, Remote Management or Storage Temperature block. No rev stamp.',
  ...SW_SHARED,
};

const SW20 = {
  id: "VX5-SW20-200",
  model_name: "VideoX V5 SW20 Security Workstation",
  product_group: "SW20",
  family_type: "workstation",
  sheet_group: "SW20", // its own group — two separate PDFs, not a pair
  max_bandwidth_mbps: 225,
  display_ports: SW20_DISPLAY_PORTS,
  gpu_count: 2,
  monitor_support:
    "Up to 8x Monitors (monitors not included). VMS and configuration dependant. More than 4 monitors may reduce total bandwidth.",
  camera_matrix: [
    { resolution: "4MP", codec: "H.264", fps: 15, cameras: 48, bandwidth_mbps: 225 },
    { resolution: "4MP", codec: "H.265", fps: 15, cameras: 64, bandwidth_mbps: 147 },
    { resolution: "8MP", codec: "H.264", fps: 15, cameras: 20, bandwidth_mbps: 202 },
    { resolution: "8MP", codec: "H.265", fps: 15, cameras: 48, bandwidth_mbps: 225 },
  ],
  notes:
    'Display Ports says 8x Mini DP with only 4x adapters included — as printed. GPU per-unit figures (2307 CUDA / 72 Tensor / 18 RT / 1 encode / 2 decode) are stated once for a 2-GPU box; entered per-GPU, not doubled. Camera matrix "FPS" header holds codec values; fps 15 from the "@15fps" footnote. Own sheet group SW20 — the SW sheets are two separate PDFs, not a pair.',
  ...SW_SHARED,
};

// Entry order matches the reference: paired sheets adjacent.
const ROWS = [V250, V255, V260, V265, V150, SW10, SW20];

// ---------------------------------------------------------------------------

const write = process.argv.includes("--write");

console.log(
  `Seeding appliance_specs — ${ROWS.length} rows, ${write ? "WRITE" : "DRY-RUN"} mode.\n`,
);

// 1. Validate every row through the form's own schema BEFORE any write.
const parsedRows: Record<string, unknown>[] = [];
let failed = false;
for (const row of ROWS) {
  const result = parseApplianceForm(row);
  const id = String(row.id);
  if (!result.ok) {
    failed = true;
    for (const [field, messages] of Object.entries(result.fieldErrors)) {
      console.error(`  FAIL  ${id}: ${field} — ${messages.join(" / ")}`);
    }
    continue;
  }
  parsedRows.push(result.values as Record<string, unknown>);
  const filled = APPLIANCE_FIELD_NAMES.filter((f) => {
    const v = (result.values as Record<string, unknown>)[f];
    return v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
  }).length;
  console.log(
    `  OK    ${id.padEnd(14)} ${String(row.family_type).padEnd(11)} group ${String(
      row.sheet_group,
    ).padEnd(6)} ${filled}/${APPLIANCE_FIELD_NAMES.length} fields set`,
  );
}

if (failed) {
  console.error("\nOne or more rows failed the form schema. Nothing written. Fix and re-run.");
  process.exit(1);
}
console.log(`\nAll ${parsedRows.length} rows parse clean through parseApplianceForm.`);

if (!write) {
  console.log(
    "\nDRY-RUN — nothing written. Re-run with --write to insert into the (empty) table.",
  );
  process.exit(0);
}

// 2. Guard: only ever write into an empty table, so this cannot double-insert
//    or partially clobber a table someone has started entering by hand.
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { count, error: countError } = await supabase
  .from("appliance_specs")
  .select("id", { count: "exact", head: true });
if (countError) {
  console.error(`Could not read appliance_specs count: ${countError.message}`);
  process.exit(1);
}
if ((count ?? 0) !== 0) {
  console.error(
    `\nappliance_specs already has ${count} row(s). This seed only writes into an EMPTY table — aborting so nothing is clobbered. Use the admin form for individual rows.`,
  );
  process.exit(1);
}

// 3. One atomic insert of all seven. updated_at / updated_by are trigger-owned
//    and are not in the payload.
const { data, error } = await supabase
  .from("appliance_specs")
  .insert(parsedRows)
  .select("id");
if (error) {
  console.error(`\nInsert failed: ${error.message}`);
  process.exit(1);
}

console.log(`\nInserted ${data?.length ?? 0} rows:`);
for (const r of data ?? []) console.log(`  ${(r as { id: string }).id}`);
console.log(
  "\nDone. Run scripts/roundtrip-appliance-specs.mts to confirm the 7 rows round-trip.",
);
