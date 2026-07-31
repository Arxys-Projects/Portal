import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { datasheetCatalogue, findCatalogueEntry, railGaps } from "./catalogue";
import type { ApplianceSpecRow } from "./from-appliance-specs";
import type { ProductSpecRow } from "./from-product-specs";

// Minimal rows — the catalogue reads only enough of each to decide the template
// and describe the entry. The adapters' own tests cover the full mappings.

function nvr(model: string, bays: number, rackUnits: string, raws: number[]): ProductSpecRow[] {
  return raws.map(
    (raw) =>
      ({
        id: `VX5-${model}-${raw}`,
        storage_raw_tb: raw,
        drive_bays: bays,
        rack_units: rackUnits,
        hdd_count: bays,
        raid_level_display: "6",
        max_cameras_h265: 200,
        max_bandwidth_mbps: 2000,
        warranty_years: 5,
        warranty_terms: "NBD advanced parts replacement",
        regulatory_safety: "CE (class A), UKCA, FCC, RCM, UL",
        ndaa_text: "NDAA Compliant",
        usage_paragraph: "Prose.",
        product_photo_path: `/datasheet/${model.toLowerCase()}-front.png`,
        rear_io_photo_path: `/datasheet/${model.toLowerCase()}-rear.png`,
        form_factor: `${rackUnits} Rackmount`,
        power_wattage: "800W",
        power_max_consumption: "800W",
        cooling: "fans",
        dimensions_mm: "1x2x3",
        shipping_weight: "20kg",
        operating_temp: "10-30 C",
        storage_temp: "-40-65 C",
        humidity: "10-90%",
      }) as unknown as ProductSpecRow,
  );
}

function appliance(
  productGroup: string,
  familyType: string,
  modelName: string,
  extra: Partial<ApplianceSpecRow> = {},
): ApplianceSpecRow {
  return {
    id: `VX5-${productGroup}-X`,
    product_group: productGroup,
    // Every row here is its own sheet except the two management variants, which
    // the callers below override to share one.
    sheet_group: productGroup,
    family_type: familyType,
    model_name: modelName,
    warranty_years: 3,
    usage_paragraph: "Prose.",
    product_photo_path: "/datasheet/sw-front.png",
    camera_matrix: [{ resolution: "4MP", codec: "H.265", cameras: 48, fps: 15, bandwidth_mbps: 125 }],
    ...extra,
  } as unknown as ApplianceSpecRow;
}

const PRODUCT_ROWS = [
  ...nvr("V400", 8, "2U", [128, 160, 192]),
  ...nvr("V100", 2, "1U", [32, 40, 48]),
  ...nvr("V800", 36, "4U", [576, 720, 864]),
];

const APPLIANCE_ROWS = [
  appliance("SW10", "workstation", "VideoX V5 SW10 Security Workstation"),
  appliance("SW20", "workstation", "VideoX V5 SW20 Security Workstation"),
  appliance("V150", "acm", "VideoX V5 V150 ACM"),
  appliance("V250", "management", "VideoX V5 V250 Management Server", {
    sheet_group: "V250",
    rack_units: "1U",
    cameras_managed_max: 250,
  }),
  // The row that proves the grouping: its own group is V255, its SHEET is V250.
  appliance("V255", "management", "VideoX V5 V255 Management Server", {
    sheet_group: "V250",
    rack_units: "1U",
    cameras_managed_min: 250,
  }),
  appliance("V260", "acm", "VideoX V5 V260 ACM"),
  appliance("V265", "acm", "VideoX V5 V265 ACM"),
];

const CATALOGUE = datasheetCatalogue(PRODUCT_ROWS, APPLIANCE_ROWS);

describe("datasheetCatalogue", () => {
  it("has one entry per SHEET, not one per SKU", () => {
    // 9 product_specs rows across 3 models = 3 entries, plus 7 appliance rows
    // across 6 sheet groups (V250 and V255 share one) = 9 entries.
    assert.equal(CATALOGUE.length, 9);
    assert.equal(CATALOGUE.filter((e) => e.model === "V400").length, 1);
  });

  it("collapses the two management variants into one V250 / V255 sheet", () => {
    const entries = CATALOGUE.filter((e) => e.displayName.includes("V255"));
    assert.equal(entries.length, 1, "V255 must not also have a sheet of its own");
    const sheet = entries[0];
    assert.equal(sheet.model, "V250", "the sheet group is the URL segment");
    assert.equal(sheet.displayName, "V250 / V255");
    assert.deepEqual(sheet.aliases, ["V255"]);
    assert.deepEqual(sheet.skus, ["VX5-V250-X", "VX5-V255-X"]);
  });

  it("renders the management sheet through Ledger, not a template of its own", () => {
    assert.equal(findCatalogueEntry(CATALOGUE, "V250")!.template, "ledger");
    assert.equal(findCatalogueEntry(CATALOGUE, "V250")!.source, "appliance_specs");
  });

  it("lists the three SKUs that make up an NVR sheet's ordering table", () => {
    const v400 = findCatalogueEntry(CATALOGUE, "V400")!;
    assert.deepEqual(v400.skus, ["VX5-V400-128", "VX5-V400-160", "VX5-V400-192"]);
  });

  it("orders the NVRs by drive bays, smallest first", () => {
    assert.deepEqual(
      CATALOGUE.filter((e) => e.source === "product_specs").map((e) => e.model),
      ["V100", "V400", "V800"],
    );
  });

  it("routes NVRs to Ledger and workstations to Rail", () => {
    assert.equal(findCatalogueEntry(CATALOGUE, "V800")!.template, "ledger");
    assert.equal(findCatalogueEntry(CATALOGUE, "SW10")!.template, "rail");
    assert.equal(findCatalogueEntry(CATALOGUE, "SW20")!.template, "rail");
  });

  it("describes an NVR by bays and rack units", () => {
    assert.equal(findCatalogueEntry(CATALOGUE, "V800")!.description, "36 bay · 4U · NVR");
  });
});

describe("models with no datasheet are LISTED, with a reason in words", () => {
  const unavailable = CATALOGUE.filter((e) => e.template === null);

  it("is the three ACM rows and nothing else — the management sheet now builds", () => {
    assert.deepEqual(unavailable.map((e) => e.model).sort(), ["V150", "V260", "V265"]);
  });

  it("never leaves a reason empty — an unavailable sheet always explains itself", () => {
    for (const entry of unavailable) {
      assert.ok(
        entry.unavailableReason && entry.unavailableReason.length > 40,
        `${entry.model} has no stated reason`,
      );
    }
  });

  it("states the ACM reason as never-designed, which is not the management one", () => {
    const acm = findCatalogueEntry(CATALOGUE, "V150")!.unavailableReason!;
    assert.match(acm, /no datasheet template has been designed/i);
    // ADR 0110 carried a second, different reason for the management servers —
    // designed but not built. ADR 0111 built them, so it is gone.
    for (const entry of unavailable) {
      assert.doesNotMatch(entry.unavailableReason!, /designed but not yet built/i);
    }
  });

  it("carries no gap list for a model that cannot render at all", () => {
    for (const entry of unavailable) assert.deepEqual(entry.gaps, []);
  });
});

describe("findCatalogueEntry", () => {
  it("is case- and whitespace-insensitive, since the model arrives from a URL", () => {
    assert.equal(findCatalogueEntry(CATALOGUE, "v800")!.model, "V800");
    assert.equal(findCatalogueEntry(CATALOGUE, "  sw10 ")!.model, "SW10");
  });

  it("resolves a variant that shares a sheet to the sheet that covers it", () => {
    // Without the alias, a real product answers 404 because its sibling happens
    // to name the sheet.
    assert.equal(findCatalogueEntry(CATALOGUE, "V255")!.model, "V250");
    assert.equal(findCatalogueEntry(CATALOGUE, "v255")!.displayName, "V250 / V255");
  });

  it("returns undefined for a model in neither table", () => {
    assert.equal(findCatalogueEntry(CATALOGUE, "SW30"), undefined);
    assert.equal(findCatalogueEntry(CATALOGUE, "V900"), undefined);
  });
});

describe("railGaps", () => {
  it("is empty for a complete workstation row", () => {
    assert.deepEqual(railGaps(APPLIANCE_ROWS[0]), []);
  });

  it("names an empty camera matrix, which would render an empty table", () => {
    const gaps = railGaps({ ...APPLIANCE_ROWS[0], camera_matrix: [] });
    assert.ok(gaps.some((g) => /camera stream matrix/.test(g)));
  });

  it("names a missing warranty term and photo", () => {
    const gaps = railGaps({
      ...APPLIANCE_ROWS[0],
      warranty_years: null,
      product_photo_path: null,
    });
    assert.ok(gaps.some((g) => /warranty/.test(g)));
    assert.ok(gaps.some((g) => /front photo/.test(g)));
  });
});
