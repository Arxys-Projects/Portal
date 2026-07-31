// appliance_specs -> RailContent. The Rail (workstation) adapter.
//
// LIFTED, NOT REWRITTEN. This is `buildContent()` from
// scripts/render-rail-mockup.ts, moved here unchanged in behavior. That function
// was correct and checked by eye against the handoff's SW10 reference render
// (screenshots/05-sw10-workstation.png); it was only in the wrong place — a
// script, with no unit test, and about to be copied into a route. The script now
// imports this, so there is one mapping rather than two that drift.
//
// One deliberate change from the lifted original: bandwidth figures go through
// thousands(), so a 4-digit value would not print unformatted next to Ledger's
// "4,000 Mbit/s". It is a no-op for both live workstations — SW10 peaks at 125
// Mbit/s and SW20 at 225 — so the rendered output is byte-identical to the
// reference SW10 render. Nothing else about the mapping moved.
//
// Takes an ALREADY-FETCHED row and returns content: no Supabase import, no
// react-pdf, no `server-only`, so it is testable without a network.
//
// ONE SHEET PER PRODUCT GROUP. Unlike the NVRs, a workstation group is a single
// row — SW10 and SW20 are separate chassis, not drive-capacity variants of one.
// SW25/SW30/SW35 appear in old test fixtures; they were EOL'd from the Price Book
// and have no rows. Only SW10 and SW20 are live.

import * as copy from "./copy";
import { clean, specRow, thousands } from "./spec-text";
import type { RailContent, RailSpecRow, StreamRow } from "./rail-types";

/** A row of `appliance_specs.camera_matrix`, the JSON column that drives the matrix. */
export type CameraMatrixRow = {
  resolution: string;
  codec: string;
  cameras: number;
  fps: number;
  bandwidth_mbps: number;
};

/** The appliance_specs columns the Rail sheet reads. */
export type ApplianceSpecRow = {
  id: string;
  model_name: string | null;
  product_group: string;
  family_type: string | null;
  cpu_model: string | null;
  cores_threads: string | null;
  cpu_cache: string | null;
  cpu_base_ghz: string | null;
  cpu_turbo_ghz: string | null;
  ram_spec: string | null;
  os_edition: string | null;
  os_drive_desc: string | null;
  raid_support: string | null;
  network: string | null;
  gbe_10_ports: number | null;
  max_bandwidth_mbps: number | null;
  display_ports: string | null;
  form_factor: string | null;
  power_wattage: string | null;
  power_ac_input: string | null;
  power_max_consumption: string | null;
  cooling: string | null;
  dimensions_mm: string | null;
  dimensions_in: string | null;
  shipping_weight: string | null;
  warranty_years: number | string | null;
  warranty_terms: string | null;
  operating_temp: string | null;
  storage_temp: string | null;
  humidity: string | null;
  regulatory_safety: string | null;
  regulatory_emissions: string | null;
  ndaa_text: string | null;
  security_features: string[] | null;
  gpu_model: string | null;
  gpu_count: number | null;
  gpu_vram: string | null;
  gpu_cuda_cores: string | number | null;
  gpu_tensor_cores: string | number | null;
  gpu_rt_cores: string | number | null;
  gpu_encoders: number | null;
  gpu_decoders: number | null;
  monitor_support: string | null;
  front_io: string | null;
  rear_io: string | null;
  camera_matrix: CameraMatrixRow[] | null;
  remote_mgmt: string | null;
  product_photo_path: string | null;
  usage_paragraph: string | null;
  /** Not rendered — reported by the mockup script so a review names its source row. */
  updated_at?: string | null;
};

/**
 * Resolution labels for the matrix.
 *
 * The pixel dimensions are the WORKSTATION factsheet's own — 4MP here is
 * 2592×1944, NOT the Ledger sheet's 2560×1440. That is not a typo: the two
 * source factsheets genuinely differ, so the two templates carry different
 * labels for the same nominal resolution.
 */
const RESOLUTION_LABEL: Record<string, string> = {
  "4MP": "4MP (2592×1944)",
  "8MP": "8MP (3840×2160)",
};

/**
 * Warranty seal graphics, keyed by term in years.
 *
 * Workstations are 3-year (with an optional 5-year upgrade that must be bought
 * with the unit); everything else is 5-year. The two files sit next to each other
 * in the same folder under near-identical names, so the path is derived from
 * `warranty_years` and never hardcoded — pointing a 3-year sheet at the 5-year
 * mark would print a false warranty claim on a customer-facing document, which
 * is not a cosmetic slip. A term with no graphic gets the template's held circle,
 * never the nearest available seal.
 */
const SEAL_BY_TERM: Record<number, string> = {
  3: "/price-book/3_year_warranty-circle.png",
  5: "/price-book/5_year_warranty-circle-2.png",
};

/** The four matrix rows: H.264 and H.265 as separate rows, unlike Ledger's VSR table. */
export function streamMatrix(matrix: CameraMatrixRow[] | null): StreamRow[] {
  return (matrix ?? [])
    // Sorted rather than left in insertion order, so two SKUs never present the
    // same four rows in a different sequence.
    .slice()
    .sort((a, b) => a.resolution.localeCompare(b.resolution) || a.codec.localeCompare(b.codec))
    .map((m) => ({
      resolution: RESOLUTION_LABEL[m.resolution] ?? m.resolution,
      codec: m.codec,
      streams: m.cameras,
      bandwidth: `${thousands(m.bandwidth_mbps)} Mbit/s`,
    }));
}

/** Build the Rail content for one workstation row. */
export function buildRailContent(sw: ApplianceSpecRow): RailContent {
  const bandwidth = Number(sw.max_bandwidth_mbps); // DB
  const gpuCount = Number(sw.gpu_count); // DB
  const model = sw.product_group; // DB, e.g. "SW10"
  const monitorSupport = String(sw.monitor_support ?? "");
  const monitors = monitorSupport.match(/Up to (\d+)x/)?.[1] ?? "—"; // DB
  // "8 GB GDDR6 with ECC - 128-bit - 192 GB/sec" -> the headline half only; the
  // full string still appears verbatim in the GPU spec row.
  const vramShort = String(sw.gpu_vram ?? "").split(" - ")[0].trim();
  const matrix = streamMatrix(sw.camera_matrix);
  const fps = (sw.camera_matrix ?? [])[0]?.fps ?? 15; // DB
  const warrantyYears = Number(sw.warranty_years);

  return {
    model,
    runningMark: copy.RUNNING_MARK,
    // DB — "Performance Tower, with enhanced cooling, ..." and
    // "VideoX V5 SW10 Security Workstation" respectively.
    productClass: [
      String(sw.form_factor ?? "").split(",")[0].trim(),
      String(sw.model_name ?? "").split(`${model} `)[1] ?? "Security Workstation",
    ],
    partNumber: sw.id, // DB

    attributesHeading: copy.RAIL_ATTRIBUTES_HEADING,
    // All seven are DB values, reworded only for length.
    attributes: [
      `Up to ${thousands(bandwidth)} Mbit/s decode bandwidth`,
      `${gpuCount}× ${sw.gpu_model} GPU, ${vramShort}`,
      `${sw.cpu_model}, ${sw.cores_threads}, ${sw.cpu_turbo_ghz}`,
      `${sw.ram_spec} RAM`,
      `${sw.gbe_10_ports}× 10Gb Ethernet connectivity`,
      `Up to ${monitors} monitors supported`,
      String(sw.os_edition).replace("Microsoft ", ""),
    ],

    warranty: {
      years: warrantyYears,
      title: `${warrantyYears}-Year NBD Warranty`,
      body: copy.railWarrantyBody(clean(sw.warranty_terms)),
      sealPath: SEAL_BY_TERM[warrantyYears] ?? null,
    },

    complianceHeading: copy.RAIL_COMPLIANCE_HEADING,
    compliance: copy.RAIL_COMPLIANCE,
    address: copy.RAIL_ADDRESS,

    headline: copy.railHeadline(model),
    usage: clean(sw.usage_paragraph), // DB
    productPhoto: {
      path: sw.product_photo_path || null, // DB
      placeholder: copy.railPhotoPlaceholder(model),
    },

    matrixHeading: copy.RAIL_MATRIX_HEADING,
    ceilingLine: `Ceiling: ${thousands(bandwidth)} Mbit/s · ${monitors} monitors`, // DB
    matrix,
    matrixCaption: copy.railMatrixCaption(monitors, fps),

    // Ten rows each. Balanced BY ROW COUNT, not semantics — Bandwidth and
    // Monitors sit on the right purely for balance, exactly as the handoff says,
    // because an unbalanced grid is what overflowed the page in design.
    hardwareHeading: copy.RAIL_HARDWARE_HEADING,
    hardware: [
      ...specRow<RailSpecRow>("Form factor", sw.form_factor),
      ...specRow<RailSpecRow>(
        "CPU",
        `${sw.cpu_model} · ${sw.cores_threads} · ${sw.cpu_base_ghz}/${sw.cpu_turbo_ghz} · ${sw.cpu_cache}`,
      ),
      ...specRow<RailSpecRow>(
        "GPU",
        `${gpuCount}× ${sw.gpu_model}, ${sw.gpu_vram}, ${sw.gpu_encoders}× encode / ${sw.gpu_decoders}× decode, ` +
          `${sw.gpu_cuda_cores} CUDA, ${sw.gpu_tensor_cores} Tensor, ${sw.gpu_rt_cores} RT`,
      ),
      ...specRow<RailSpecRow>("RAM", sw.ram_spec),
      ...specRow<RailSpecRow>("OS", sw.os_edition),
      ...specRow<RailSpecRow>("VMS / OS drive", sw.os_drive_desc),
      ...specRow<RailSpecRow>("Network", sw.network),
      ...specRow<RailSpecRow>("Display", sw.display_ports),
      ...specRow<RailSpecRow>("Front I/O", sw.front_io),
      ...specRow<RailSpecRow>("Rear I/O", sw.rear_io),
    ],
    performanceHeading: copy.RAIL_PERFORMANCE_HEADING,
    performance: [
      ...specRow<RailSpecRow>(
        "Bandwidth",
        `${thousands(bandwidth)} Mbit/s maximum for video decoding and display — VMS and configuration dependant`,
      ),
      ...specRow<RailSpecRow>("Monitors", sw.monitor_support),
      ...specRow<RailSpecRow>("Power", `${sw.power_wattage}, ${sw.power_ac_input}`),
      ...specRow<RailSpecRow>("Max draw", sw.power_max_consumption),
      ...specRow<RailSpecRow>("Dimensions", `${sw.dimensions_mm} · ${sw.dimensions_in}`),
      ...specRow<RailSpecRow>("Weight", sw.shipping_weight),
      ...specRow<RailSpecRow>("Operating temp", sw.operating_temp),
      ...specRow<RailSpecRow>("Humidity", sw.humidity),
      ...specRow<RailSpecRow>("Safety", sw.regulatory_safety),
      ...specRow<RailSpecRow>("Trade", sw.ndaa_text),
    ],

    footerNote: copy.RAIL_FOOTER_NOTE,
  };
}
