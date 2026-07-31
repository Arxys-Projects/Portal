import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRailContent,
  streamMatrix,
  type ApplianceSpecRow,
  type CameraMatrixRow,
} from "./from-appliance-specs";

// The live SW10 appliance_specs row, trimmed to the columns the adapter reads.
// This mapping shipped untested — it was checked by eye against the handoff's
// reference render (screenshots/05-sw10-workstation.png) and then moved here out
// of scripts/render-rail-mockup.ts. These tests pin what that render established.

const SW10: ApplianceSpecRow = {
  id: "VX5-SW10-100",
  model_name: "VideoX V5 SW10 Security Workstation",
  product_group: "SW10",
  family_type: "workstation",
  cpu_model: "AMD Ryzen 7 9700X",
  cores_threads: "8C/16T",
  cpu_cache: "40MB Cache",
  cpu_base_ghz: "3.8Ghz",
  cpu_turbo_ghz: "5.5Ghz",
  ram_spec: "32GB DDR5",
  os_edition: "Microsoft Windows 11 Pro",
  os_drive_desc: "1TB NVMe Gen4 SSD",
  raid_support: null,
  network: "2x 10Gb Ethernet RJ45",
  gbe_10_ports: 2,
  max_bandwidth_mbps: 125,
  display_ports: "4x DisplayPort 1.4a",
  form_factor: "Performance Tower, with enhanced cooling, 3x 120mm fans",
  power_wattage: "850W 80+ Gold",
  power_ac_input: "100-240VAC 50-60Hz",
  power_max_consumption: "850W",
  cooling: null,
  dimensions_mm: "210mm (w) x 480mm (d) x 480mm (h)",
  dimensions_in: "8.3 x 18.9 x 18.9",
  shipping_weight: "Ship weight = 16kg/35lbs",
  warranty_years: 3,
  warranty_terms:
    "3 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).",
  operating_temp: "10 - 35 C / 50 - 95 F",
  storage_temp: null,
  humidity: "20 - 80% relative humidity (non-condensing)",
  regulatory_safety: "BSMI, CE, FCC(Class B), Energy Star.",
  regulatory_emissions: null,
  ndaa_text: "NDAA Compliant, no disclosures",
  security_features: null,
  gpu_model: "NVIDIA RTX A2000",
  gpu_count: 1,
  gpu_vram: "8 GB GDDR6 with ECC - 128-bit - 192 GB/sec",
  gpu_cuda_cores: "3328",
  gpu_tensor_cores: "104",
  gpu_rt_cores: "26",
  gpu_encoders: 1,
  gpu_decoders: 2,
  monitor_support: "Up to 4x Monitors (monitors not included). VMS and configuration dependant.",
  front_io: "2x USB 3.2, 1x USB-C, audio",
  rear_io: "4x USB 3.2, 2x USB 2.0, 2x 10GbE",
  camera_matrix: [
    { resolution: "4MP", codec: "H.264", cameras: 28, fps: 15, bandwidth_mbps: 125 },
    { resolution: "4MP", codec: "H.265", cameras: 48, fps: 15, bandwidth_mbps: 125 },
    { resolution: "8MP", codec: "H.264", cameras: 16, fps: 15, bandwidth_mbps: 108 },
    { resolution: "8MP", codec: "H.265", cameras: 32, fps: 15, bandwidth_mbps: 125 },
  ],
  remote_mgmt: null,
  product_photo_path: "/datasheet/sw-front.png",
  usage_paragraph:
    "Powerhouse security workstations engineered for high performance and maximum bandwidth.",
};

describe("streamMatrix", () => {
  it("lists H.264 and H.265 as separate rows — Rail does split codecs, unlike Ledger", () => {
    const rows = streamMatrix(SW10.camera_matrix);
    assert.equal(rows.length, 4);
    assert.deepEqual([...new Set(rows.map((r) => r.codec))].sort(), ["H.264", "H.265"]);
  });

  it("labels 4MP as 2592×1944 — the WORKSTATION factsheet's dimensions", () => {
    // Not a typo and not a drift from Ledger's 2560×1440: the two source
    // factsheets genuinely differ on what 4MP means.
    assert.match(streamMatrix(SW10.camera_matrix)[0].resolution, /2592×1944/);
  });

  it("sorts deterministically, so two SKUs never present the rows in a different order", () => {
    const shuffled = [...SW10.camera_matrix!].reverse() as CameraMatrixRow[];
    assert.deepEqual(streamMatrix(shuffled), streamMatrix(SW10.camera_matrix));
    assert.deepEqual(
      streamMatrix(SW10.camera_matrix).map((r) => `${r.resolution} ${r.codec}`),
      [
        "4MP (2592×1944) H.264",
        "4MP (2592×1944) H.265",
        "8MP (3840×2160) H.264",
        "8MP (3840×2160) H.265",
      ],
    );
  });

  it("carries the stream counts through unchanged — nothing here is derived", () => {
    assert.deepEqual(
      streamMatrix(SW10.camera_matrix).map((r) => r.streams),
      [28, 48, 16, 32],
    );
  });

  it("returns no rows for a null matrix rather than throwing", () => {
    assert.deepEqual(streamMatrix(null), []);
  });
});

describe("buildRailContent", () => {
  const content = buildRailContent(SW10);

  it("reads the part number and model off the row", () => {
    assert.equal(content.model, "SW10");
    assert.equal(content.partNumber, "VX5-SW10-100");
  });

  it("splits the two product-class lines out of form_factor and model_name", () => {
    assert.deepEqual(content.productClass, ["Performance Tower", "Security Workstation"]);
  });

  it("gives a 3-year workstation the 3-YEAR seal, never its 5-year neighbour", () => {
    // The two files sit side by side under near-identical names. The wrong one is
    // a false warranty claim on a customer-facing document.
    assert.equal(content.warranty.years, 3);
    assert.equal(content.warranty.sealPath, "/price-book/3_year_warranty-circle.png");
    assert.match(content.warranty.title, /^3-Year/);
  });

  it("states the 5-year upgrade must be bought with the unit", () => {
    assert.match(content.warranty.body, /Optional 5-year upgrade must be purchased with the unit/);
  });

  it("would give a 5-year row the 5-year seal — the path is derived, not hardcoded", () => {
    const upgraded = buildRailContent({ ...SW10, warranty_years: 5 });
    assert.equal(upgraded.warranty.sealPath, "/price-book/5_year_warranty-circle-2.png");
  });

  it("holds the circle for a term with no graphic", () => {
    assert.equal(buildRailContent({ ...SW10, warranty_years: 4 }).warranty.sealPath, null);
  });

  it("pulls the monitor count out of monitor_support for the ceiling line", () => {
    assert.equal(content.ceilingLine, "Ceiling: 125 Mbit/s · 4 monitors");
  });

  it("says camera STREAMS, never cameras, in the matrix caption", () => {
    assert.match(content.matrixCaption, /camera streams, not cameras/);
    assert.match(content.matrixCaption, /with 4 monitors at 15fps/);
  });

  it("shortens the GPU VRAM for the attribute bullet but keeps it whole in the spec row", () => {
    assert.ok(content.attributes.some((a) => a === "1× NVIDIA RTX A2000 GPU, 8 GB GDDR6 with ECC"));
    const gpu = content.hardware.find((h) => h.label === "GPU")!;
    assert.match(gpu.value, /8 GB GDDR6 with ECC - 128-bit - 192 GB\/sec/);
  });

  it("omits the spec rows whose columns are blank rather than inventing them", () => {
    // SW10's raid_support, cooling, remote_mgmt, storage_temp,
    // regulatory_emissions and security_features are all empty; its own `notes`
    // column records that the source factsheet lacks those blocks. A shorter
    // table is correct — a fabricated TPM claim would be worse than either.
    const labels = [...content.hardware, ...content.performance].map((r) => r.label);
    assert.ok(!labels.includes("RAID"));
    assert.ok(!labels.includes("Cooling"));
    assert.ok(!labels.includes("Storage temp"));
    for (const row of [...content.hardware, ...content.performance]) {
      assert.ok(row.value.trim() !== "", `${row.label} rendered empty`);
    }
  });

  it("balances the two spec columns by row count, as the handoff requires", () => {
    assert.equal(content.hardware.length, 10);
    assert.equal(content.performance.length, 10);
  });

  it("reads the photo path off the row and holds a frame when there is none", () => {
    assert.equal(content.productPhoto.path, "/datasheet/sw-front.png");
    const noPhoto = buildRailContent({ ...SW10, product_photo_path: null });
    assert.equal(noPhoto.productPhoto.path, null);
    assert.match(noPhoto.productPhoto.placeholder, /SW10 tower/);
  });

  it("carries a per-model headline sentence", () => {
    assert.match(content.headline, /Client View workstation/);
    assert.notEqual(buildRailContent({ ...SW10, product_group: "SW20" }).headline, content.headline);
  });

  it("formats bandwidth identically to Ledger, and unchanged for the live rows", () => {
    // thousands() is the one change from the lifted original; both live
    // workstations are under 1000 Mbit/s, so the output is unaffected.
    assert.match(content.ceilingLine, /125 Mbit\/s/);
    assert.equal(
      buildRailContent({ ...SW10, max_bandwidth_mbps: 4000 }).ceilingLine,
      "Ceiling: 4,000 Mbit/s · 4 monitors",
    );
  });
});
