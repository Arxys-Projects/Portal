import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  selectCandidates,
  type ProductPriceRow,
  type SpecCapacityRow,
} from "./candidates";

// Shapes mirror the live rows: price/naming from current_products, capacity and
// RAID configuration from product_specs.
const price = (
  sku: string,
  product_group: string,
  msrp: number,
): ProductPriceRow => ({ sku, product_group, product_name: `VideoX ${sku}`, msrp });

const spec = (
  id: string,
  max_cameras: number,
  storage_raw_tb: number,
  hdd_count: number,
  raid_level_display: string,
): SpecCapacityRow => ({ id, max_cameras, storage_raw_tb, hdd_count, raid_level_display });

describe("selectCandidates (pool assembly, ADR 0094)", () => {
  it("takes capacity from product_specs, not the products row", () => {
    // The whole point of ADR 0094: current_products carries no capacity here at
    // all, and the SKU is still poolable because product_specs has it.
    const specs = selectCandidates(
      [price("VX5-V200-96", "V200", 23685)],
      [spec("VX5-V200-96", 100, 96, 4, "5")],
    );
    assert.equal(specs.length, 1);
    assert.equal(specs[0].maxCameras, 100);
    assert.equal(specs[0].maxStorageTb, 96); // raw nameplate
    assert.equal(specs[0].usableStorageTb, 72); // 96 × 3/4, RAID 5
    assert.equal(specs[0].priceType, "numeric");
  });

  it("admits all three capacity tiers of a family, not just one", () => {
    // The regression this change exists to prevent: pre-ADR-0094 only the
    // mid-tier of each family reached the pool.
    const specs = selectCandidates(
      [
        price("VX5-V500-192", "V500", 42577),
        price("VX5-V500-240", "V500", 47334),
        price("VX5-V500-288", "V500", 52220),
      ],
      [
        spec("VX5-V500-192", 275, 192, 12, "6"),
        spec("VX5-V500-240", 275, 240, 12, "6"),
        spec("VX5-V500-288", 275, 288, 12, "6"),
      ],
    );
    assert.deepEqual(
      specs.map((s) => s.usableStorageTb),
      [160, 200, 240],
    );
  });

  it("excludes V100 — the recommender sizes V200–V800 only", () => {
    const specs = selectCandidates(
      [price("VX5-V100-48", "V100", 11955), price("VX5-V200-64", "V200", 20470)],
      [spec("VX5-V100-48", 25, 48, 2, "NA"), spec("VX5-V200-64", 100, 64, 4, "5")],
    );
    assert.deepEqual(
      specs.map((s) => s.sku),
      ["VX5-V200-64"],
    );
  });

  it("excludes non-video archetypes and accessories via the allowlist", () => {
    const specs = selectCandidates(
      [
        price("VX5-V250-MGM", "V250", 14020),
        price("VX5-V265-ACM", "V265", 15060),
        price("VX5-SW20-200", "SW20", 7873),
        price("VX5-GPU-A1000", "GPU", 1706),
      ],
      [],
    );
    assert.deepEqual(specs, []);
  });

  it("skips an allowlisted SKU with no product_specs row rather than guessing raw", () => {
    // Falling back to the raw nameplate would overstate usable storage and could
    // under-spec the recommendation, so the SKU drops out entirely.
    const specs = selectCandidates(
      [price("VX5-V600-320", "V600", 56461), price("VX5-V900-999", "V600", 99999)],
      [spec("VX5-V600-320", 275, 320, 16, "6")],
    );
    assert.deepEqual(
      specs.map((s) => s.sku),
      ["VX5-V600-320"],
    );
  });

  it("applies the RAID 60 span math to V700 and V800 (ADR 0092)", () => {
    const specs = selectCandidates(
      [price("VX5-V700-480", "V700", 75995), price("VX5-V800-720", "V800", 102398)],
      [
        spec("VX5-V700-480", 325, 480, 24, "60"), // 2 spans -> 4 parity
        spec("VX5-V800-720", 325, 720, 36, "60"), // 3 spans -> 6 parity
      ],
    );
    assert.deepEqual(
      specs.map((s) => s.usableStorageTb),
      [400, 600],
    );
  });

  it("returns an empty pool when nothing joins, leaving the caller to report it", () => {
    assert.deepEqual(selectCandidates([price("VX5-V400-160", "V400", 34206)], []), []);
    assert.deepEqual(selectCandidates([], [spec("VX5-V400-160", 200, 160, 8, "6")]), []);
  });
});
