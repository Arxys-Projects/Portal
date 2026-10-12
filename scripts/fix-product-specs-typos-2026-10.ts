// One-off product_specs data corrections found by the 2026-10-09 Price Book
// spec drift audit (docs/audits/price-book-spec-drift-audit.md §7). Every one is
// a typo or a self-contradiction that prints on a live datasheet today.
//
//   node --env-file=.env.local --import tsx scripts/fix-product-specs-typos-2026-10.ts            # dry run
//   node --env-file=.env.local --import tsx scripts/fix-product-specs-typos-2026-10.ts --apply    # write
//   node --env-file=.env.local --import tsx scripts/fix-product-specs-typos-2026-10.ts --rollback # undo
//
// Requested by Andy 2026-10-09 ("fix any data mistakes"), as an exception to ADR
// 0096's admin-form-only write path, because the form cannot be driven from the
// agent's machine. The audit trigger still records every change; the rows carry
// `updated_by = null` because a service-role connection has no auth.uid(), the
// same as the 2026-09-14 CPU refresh. Not a precedent.
//
// APPLIED 2026-10-12 (61 field updates). The guarded read-check-write engine is
// in product-specs-guarded-fix.ts.
//
// Deliberately NOT corrected here, because the right value was a product call:
// VX5-V400-128 max_bandwidth_mbps 1600 vs 2000 on its siblings and VX5-V100-32
// vms_certified missing Genetec (both decided and fixed in
// fix-product-specs-decisions-2026-10.ts), and the identical V700/V800 shipping
// weights (left as they are, by Andy's call).

import { runSpecFixes, type SpecFix } from "./product-specs-guarded-fix";

const V100 = ["VX5-V100-32", "VX5-V100-40", "VX5-V100-48"];
const V200 = ["VX5-V200-64", "VX5-V200-80", "VX5-V200-96"];
const V400 = ["VX5-V400-128", "VX5-V400-128-NCD", "VX5-V400-160", "VX5-V400-192", "VX5-V400-192-NCD"];
const V500 = ["VX5-V500-192", "VX5-V500-240", "VX5-V500-288", "VX5-V500-288-NCD"];
const V600 = ["VX5-V600-256", "VX5-V600-320", "VX5-V600-384"];
const V700 = ["VX5-V700-384", "VX5-V700-480", "VX5-V700-576"];
const V800 = ["VX5-V800-576", "VX5-V800-720", "VX5-V800-864"];
const ALL = [...V100, ...V200, ...V400, ...V500, ...V600, ...V700, ...V800];

const SFP = "2x 10Gb SFP+ or 2x 25Gb SFP28 upgrade available";

const V400_SECURITY_FROM = [
  "AMD Secure Encrypted Virtualization (SEV) • AMD Secure",
  "Memory Encryption (SME) • Cryptographically signed firmware ,",
  "Data at Rest Encryption (SEDs with local or external key mgmt)",
  "• Secure Boot • Secured Component Verification (Hardware",
  "integrity check) • Secure Erase • Silicon Root of Trust • System",
  "Lockdown • TPM 2.0 FIPS, CC-TCG certified",
];
const V400_SECURITY_TO = V400_SECURITY_FROM.map((line) =>
  line === "Memory Encryption (SME) • Cryptographically signed firmware ,"
    ? "Memory Encryption (SME) • Cryptographically signed firmware •"
    : line,
);

const FIXES: SpecFix[] = [
  {
    column: "warranty_terms",
    ids: V500,
    from: "dvanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).",
    to: "Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).",
    why: "first letter lost; the V500 warranty band reads 'dvanced'",
  },
  {
    column: "remote_mgmt",
    ids: V600,
    from: "Dedicted Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection",
    to: "Dedicated Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection",
    why: "typo 'Dedicted'",
  },
  {
    column: "sfp_addon",
    ids: ["VX5-V600-256"],
    from: `Optional -${SFP}`,
    to: `Optional - ${SFP}`,
    why: "missing space after the dash",
  },
  {
    column: "sfp_addon",
    ids: ["VX5-V700-384"],
    from: `Optional -${SFP})`,
    to: `Optional - ${SFP}`,
    why: "missing space and a stray closing parenthesis",
  },
  {
    column: "power_wattage",
    ids: V200,
    from: "800W 1+1 redundant PSU -",
    to: "800W 1+1 redundant PSU",
    why: "trailing dash",
  },
  {
    column: "network",
    ids: ["VX5-V100-40", "VX5-V100-48"],
    from: "2 × 10GbE + 1 IPMI",
    to: "2 × 1GbE + 1 IPMI",
    why: "gbe_10_ports = 0 and gbe_1_ports = 2 on these rows; VX5-V100-32 was corrected the same way on 2026-07-31",
  },
  {
    column: "cpu_cores_threads",
    ids: ["VX5-V100-40", "VX5-V100-48"],
    from: "8C/16T",
    to: "6C/12T",
    why: "cpu_model_full says 6/12 Core and cores_threads says 6C/12T; /comparison reads this column",
  },
  {
    column: "hotswap_power",
    ids: ["VX5-V800-576"],
    from: "Yes 1+1",
    to: "Yes",
    why: "flag column; canonicalRow() prefix-extends the -864's 'Yes' to 'Yes 1+1', isYes() rejects it, and the V800 datasheet loses its hot-swap power bullet",
  },
  {
    column: "warranty",
    ids: ["VX5-V400-160"],
    from: "5yr",
    to: "5yr NBD, Advanced Replacement",
    why: "legacy string truncated; every other row carries the full one",
  },
  {
    column: "security_features",
    ids: V400,
    from: V400_SECURITY_FROM,
    to: V400_SECURITY_TO,
    why: "a stray comma where the bullet separator belongs ('signed firmware , Data at Rest')",
  },
  {
    column: "shipping_weight",
    ids: V100,
    from: "Ship WeightW/ 2x HDDs = 24k/42lbs",
    to: "Ship Weight W/ 2x HDDs = 24k/42lbs",
    why: "missing space",
  },
  {
    column: "shipping_weight",
    ids: V200,
    from: "Ship WeightW/ 4x HDDs = 27k/45lbs",
    to: "Ship Weight W/ 4x HDDs = 27k/45lbs",
    why: "missing space",
  },
  {
    column: "shipping_weight",
    ids: V400,
    from: "Ship WeightW/ 8x HDDs = 38k/83lbs",
    to: "Ship Weight W/ 8x HDDs = 38k/83lbs",
    why: "missing space",
  },
  {
    column: "operating_temp",
    ids: ALL,
    from: "10- 30 C / 41 - 86 F",
    to: "10 - 30 C / 41 - 86 F",
    why: "missing space; storage_temp beside it is spaced",
  },
  {
    column: "regulatory_safety",
    ids: V100,
    from: "CE (class A), UKCA, FCC, RCM, UL.",
    to: "CE (class A), UKCA, FCC, RCM, UL",
    why: "trailing period; every other row has none",
  },
];

runSpecFixes(FIXES, process.argv.slice(2)).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
