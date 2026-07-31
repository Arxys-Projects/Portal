// AUTHORED datasheet copy — the sentences a spec column cannot hold.
//
// Every string in this file is marketing prose, not a measurement: headline
// sentences, feature blocks, table captions, compliance pill labels, the general
// information block. Until now they were hardcoded inside the two render scripts
// and inside placeholder.ts, marked AUTHORED, at mockup quality and never
// marketing-reviewed. A script is not a place for customer-facing copy once the
// portal generates these sheets for real.
//
// WHY A CHECKED-IN MODULE AND NOT SPEC COLUMNS (ADR 0110). The admin form is the
// only write path for spec *values* (ADR 0096), and copy columns would follow
// that pattern — but they need a migration and new form sections on both admin
// forms, and the copy has never had a marketing pass, so the first thing the
// form would offer to edit is placeholder prose. A module keyed by model gets the
// copy out of the scripts, under review in a pull request, and unit tested,
// without pretending it is data. It is the same tradeoff ADR 0107 already
// accepted for photo paths: a marketing edit costs a deploy, which is acceptable
// while the copy changes in batches rather than one line at a time.
//
// NUMBERS DO NOT BELONG HERE. Anything measurable — stream counts, capacities,
// RAID levels, warranty terms, regulatory marks — is read from the spec row by
// the adapters. If a string in this file needs a figure interpolated into it, it
// takes it as an argument rather than stating it.

import type { FeatureBlock } from "./types";

// ── Shared, every VideoX sheet ───────────────────────────────────────────

export const RUNNING_MARK = "VIDEOX V5";

export const FOOTER_ADDRESS =
  "Arxys · 1810 Gillespie Way, Suite 108, El Cajon, CA 92020 · 619.258.7800 · arxys.com";

export const FOOTER_NOTE =
  "VMS licensing and support is not included and is provided by the security partner or customer.";

export const RAIL_ADDRESS = [
  "Arxys · 1810 Gillespie Way",
  "Suite 108, El Cajon, CA 92020",
  "619.258.7800 · arxys.com",
];

export const RAIL_FOOTER_NOTE = [
  FOOTER_NOTE,
  "For more information visit arxys.com/videox-appliances",
];

/**
 * The page footer's second line. `revisionDate` is the spec row's own
 * `revision_date` — the sheet states when its figures were last reviewed, so a
 * row with no revision date says nothing rather than implying today's.
 */
export function revisionLine(revisionDate: string | null): string {
  const base = "For more information visit arxys.com/videox-appliances";
  return revisionDate ? `${base} · rev ${revisionDate}` : base;
}

/**
 * The VMS platforms on the page-1 validated row, set large because VMS
 * compatibility is the first qualifying question an integrator asks.
 *
 * Authored, and deliberately NOT parsed out of `vms_certified` — that column
 * holds three product names in full ("Milestone XProtect, Avigilon ACC,
 * Genetec") while the row prints six vendor names as wordmarks. The handoff
 * fixes the six and the order.
 */
export const VMS_VALIDATED = [
  "Milestone",
  "Genetec",
  "Avigilon",
  "Hanwha WAVE",
  "NX Witness",
  "Exacq",
];

// ── Ledger (NVR) ─────────────────────────────────────────────────────────

export const LEDGER_PRODUCT_CLASS =
  "Enterprise Server for Video Surveillance & Video Analytics";

export const LEDGER_USAGE_HEADING = "Recommended usage";
export const LEDGER_FEATURES_HEADING = "VideoX enterprise features";

/**
 * The four page-1 feature blocks. Line-level boilerplate off the shipping
 * factsheets, shared by every VideoX server sheet — not per-SKU copy, which is
 * why they are one constant rather than a per-model entry.
 *
 * The RAID and TPM claims here are true of the V5 server line as a whole. They
 * are the one place this file states something a spec column also carries; if a
 * model ever ships without TPM, this block has to become per-model rather than
 * being left to contradict its own spec grid.
 */
export const LEDGER_FEATURES: FeatureBlock[] = [
  {
    title: "Lower deployment costs — hardware accelerated H.265",
    body: "V5 micro-architecture acceleration delivers up to 2.3× H.265 stream processing per server, and 30–50% storage and bandwidth savings versus H.264 — fewer servers, higher camera density, longer retention, same budget.",
  },
  {
    title: "Flexible & scalable tier-1 enterprise storage",
    body: "Scale to petabytes of tier-1 capacity and tailor retention per project. Enterprise-class HDDs and SSDs throughout, for tier-1 availability and performance.",
  },
  {
    title: "High data availability",
    body: "RAID 6/60 redundancy tolerates up to 6 hard drive failures depending on model and configuration, with hardware XOR, CacheVault protection and patrol read repairs.",
  },
  {
    title: "Strengthen cybersecurity",
    body: "A built-in TPM 2.0 module supports hardware Root of Trust authentication and data encryption. All VideoX are fully NDAA compliant.",
  },
];

export const LEDGER_LADDER_HEADING_SUFFIX = "sits in the VideoX NVR line";
export const LEDGER_LADDER_CAPTION = "Drive bays · max camera streams";

/**
 * The VSR parameter strip — the standardized recording parameters the stream
 * count is validated against, verbatim from the handoff.
 *
 * This is authored but it is NOT decoration: it is what makes the stream count
 * defensible to an integrator, and the handoff is explicit that it stays
 * adjacent to the VSR table and is never dropped. If a recording parameter
 * changes, these values change and every published stream count is wrong.
 */
export const LEDGER_VSR_PARAMETERS = [
  { label: "Resolution", value: "4MP · 2560×1440" },
  { label: "Frame rate", value: "15 fps" },
  { label: "Codec", value: "H.265-20 (Good) · ~3.2 Mbit/s" },
  { label: "Recording", value: "On motion, VMD + metadata" },
  { label: "Motion activity", value: "75% average per day" },
  { label: "Retention", value: "30 days" },
];

export const LEDGER_VSR_CAPTION =
  "Max VSR is camera streams, not cameras — a multisensor device presents several streams. If a recording parameter changes, revise the calculation. Validated for Avigilon, Milestone, Hanwha/NXWitness and Genetec; other platforms vary.";

/**
 * The orderable-configurations caption. The RAID level is interpolated, never
 * literal: the handoff calls it "a template variable, not a constant" and names
 * it the single most important gotcha in the whole design. `raidAlt` carries the
 * V100's second shipping configuration (RAID 1 with a JBOD alternative), which
 * would otherwise go unstated.
 */
export function ledgerOrderableCaption(raidLevel: string, raidAlt: string | null): string {
  const alt = raidAlt ? ` ${raidAlt} is also available, at full raw capacity.` : "";
  return (
    "Three drive capacities per NVR — same chassis and performance, different retention. " +
    `Usable capacity is ${raidLevel}, excluding the mirrored OS SSD pair.${alt}`
  );
}

export const LEDGER_GENERAL_INFO =
  "Systems ship with Microsoft Windows pre-installed without media and not set up; the installer is responsible for setup, VMS installation, and configuration of users, cameras and databases. VMS installers are included but not installed. Milestone and Avigilon best practice is SQL Standard above 300 cameras — optional, not included. Client View application on server is not supported; a dedicated Client View workstation is required.";

/** Placeholder text inside a held photo frame — the frame keeps its space either way. */
export function ledgerPhotoPlaceholder(model: string, rackUnits: string | null): string {
  return rackUnits
    ? `${model} front 3/4 — ${rackUnits} product photography`
    : `${model} front 3/4 — product photography`;
}

export function ledgerRearPlaceholder(model: string): string {
  return `${model} rear I/O panel — product photography`;
}

/**
 * The warranty band's title and body.
 *
 * `years` comes from `warranty_years`, never from the legacy free-text
 * `warranty` column and never from this file. A sheet whose row has no
 * `warranty_years` gets no band at all rather than an assumed term — see
 * `warrantyBlock()` in from-product-specs.ts.
 */
export function warrantyTitle(years: number): string {
  return `${years}-Year NBD Advanced Parts Warranty`;
}

export function warrantyBody(years: number, terms: string | null): string {
  const stated = terms
    ? terms.replace(/\.?$/, ".")
    : `${years} Years, Next Business Day, Advanced Parts Replacement.`;
  return `${stated} Secure remote management & advanced support delivers rapid response & uptime.`;
}

// ── Rail (workstation) ───────────────────────────────────────────────────

/**
 * The navy headline sentence over the 56px gold rule. Per-model because the
 * handoff draws a different sentence per workstation; the fallback is what an
 * unrecognised SW model gets rather than an empty line.
 */
const RAIL_HEADLINES: Record<string, string> = {
  SW10: "Client View workstation for high-density, multi-monitor monitoring",
  SW20: "Dual-GPU Client View workstation for the largest video walls",
};

export function railHeadline(model: string): string {
  return (
    RAIL_HEADLINES[model] ??
    "Client View workstation for high-density, multi-monitor monitoring"
  );
}

export const RAIL_ATTRIBUTES_HEADING = "Key attributes";
export const RAIL_MATRIX_HEADING = "Camera stream matrix";
export const RAIL_HARDWARE_HEADING = "Hardware";
export const RAIL_PERFORMANCE_HEADING = "Performance & environmental";
export const RAIL_COMPLIANCE_HEADING = "Compliance";

/**
 * The rail's compliance pills. Condensed labels: three pills is what the rail's
 * 170px inner measure holds without wrapping, so the full regulatory string
 * cannot go here — it appears verbatim in the Safety spec row instead.
 *
 * Unlike Ledger's pills, these are authored rather than derived. The
 * workstation's `regulatory_safety` reads "BSMI, CE, FCC(Class B), Energy Star."
 * — four marks in a different vocabulary from the servers', which the Ledger
 * condenser would mangle. Reviewed against the SW10 factsheet.
 */
export const RAIL_COMPLIANCE = ["NDAA", "CE / FCC", "ENERGY STAR"];

/**
 * The matrix caption. The two figures are interpolated from the row; the rest is
 * authored. "Streams, not cameras" is load-bearing terminology per the handoff —
 * never relabel this column "Cameras".
 */
export function railMatrixCaption(monitors: string, fps: number): string {
  return (
    "Counts are camera streams, not cameras — a multisensor or multi-head device presents several streams to the VMS. " +
    "Counts are approximations within the limits of maximum supported bandwidth and always VMS dependant. " +
    `Testing performed with ${monitors} monitors at ${fps}fps; connecting additional monitors may reduce total counts. ` +
    "A VMS may require monitors be load balanced across GPUs, or all monitors on one GPU."
  );
}

/** The workstation warranty body — the upgrade policy is the handoff's statement of it. */
export function railWarrantyBody(terms: string): string {
  return `${terms}. Optional 5-year upgrade must be purchased with the unit.`;
}

export function railPhotoPlaceholder(model: string): string {
  return `${model} tower — product photography`;
}
