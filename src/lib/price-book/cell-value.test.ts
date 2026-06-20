import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cellValue,
  formatMsrp,
  type ProductRow,
  type ProductSpecLite,
} from "./cell-value";

// A V700-shaped row: products.max_storage_tb is the RAW nameplate (480) and
// max_cameras is a stream count (325) — the two fields the old renderer
// mislabeled as "Net Usable Storage" and "Max Camera Bandwidth".
const v700Row: ProductRow = {
  sku: "VX5-V700-480",
  product_name: "VideoX V700 480TB 4U 24Bay",
  msrp: 54512,
  price_type: "numeric",
  max_storage_tb: 480,
  max_cameras: 325,
};

// product_specs config for the V700: 480 raw, 24 drives, RAID 60 -> 400 usable.
const v700Spec: ProductSpecLite = {
  storage_raw_tb: 480,
  hdd_count: 24,
  raid_level_display: "60",
  max_bandwidth_mbps: 4000,
};

describe("cellValue — netStorage (Net Usable Storage)", () => {
  it("renders RAID net-usable, NOT the raw nameplate", () => {
    // Bug was 480 TB (raw). RAID 60 over 24 drives nets 400 TB.
    assert.equal(cellValue("netStorage", v700Row, v700Spec), "400 TB");
    assert.notEqual(cellValue("netStorage", v700Row, v700Spec), "480 TB");
  });

  it("applies RAID 5 parity (V200: 80 raw, 4 drives -> 60)", () => {
    const row: ProductRow = { ...v700Row, max_storage_tb: 80 };
    const spec: ProductSpecLite = {
      storage_raw_tb: 80,
      hdd_count: 4,
      raid_level_display: "5",
      max_bandwidth_mbps: 1000,
    };
    assert.equal(cellValue("netStorage", row, spec), "60 TB");
  });

  it("drops a trailing .0 but keeps a real fraction", () => {
    // 100 raw, 3 drives, RAID 5 -> 100 * 2/3 = 66.67 -> "66.7 TB"
    const spec: ProductSpecLite = {
      storage_raw_tb: 100,
      hdd_count: 3,
      raid_level_display: "5",
      max_bandwidth_mbps: null,
    };
    assert.equal(cellValue("netStorage", v700Row, spec), "66.7 TB");
  });

  it("falls back to — when no product_specs row joined", () => {
    assert.equal(cellValue("netStorage", v700Row, undefined), "—");
  });

  it("skuExtraData override wins over the computed value", () => {
    assert.equal(
      cellValue("netStorage", v700Row, v700Spec, { netStorage: "336 TB" }),
      "336 TB",
    );
  });
});

describe("cellValue — ssdStorage (SSD Storage)", () => {
  it("never shows the HDD video nameplate; — without an override", () => {
    assert.equal(cellValue("ssdStorage", v700Row, v700Spec), "—");
    assert.notEqual(cellValue("ssdStorage", v700Row, v700Spec), "480 TB");
  });

  it("renders the skuExtraData override string verbatim", () => {
    assert.equal(
      cellValue("ssdStorage", v700Row, undefined, { ssdStorage: "2x DB & 2x OS" }),
      "2x DB & 2x OS",
    );
  });
});

describe("cellValue — bandwidth (Max Camera Bandwidth)", () => {
  it("renders max_bandwidth_mbps, NOT the camera count", () => {
    // Bug was 325 Mbit/s (the camera count). Real bandwidth is 4000.
    assert.equal(cellValue("bandwidth", v700Row, v700Spec), "4000 Mbit/s");
    assert.notEqual(cellValue("bandwidth", v700Row, v700Spec), "325 Mbit/s");
  });

  it("falls back to — when bandwidth is unavailable", () => {
    const spec: ProductSpecLite = { ...v700Spec, max_bandwidth_mbps: null };
    assert.equal(cellValue("bandwidth", v700Row, spec), "—");
    assert.equal(cellValue("bandwidth", v700Row, undefined), "—");
  });

  it("skuExtraData override wins (SW workstations)", () => {
    assert.equal(
      cellValue("bandwidth", v700Row, v700Spec, { bandwidth: "125 Mbit/s" }),
      "125 Mbit/s",
    );
  });
});

describe("cellValue — passthrough columns", () => {
  it("sku / product / monitors / msrp unchanged", () => {
    assert.equal(cellValue("sku", v700Row, v700Spec), "VX5-V700-480");
    assert.equal(cellValue("product", v700Row, v700Spec), "VideoX V700 480TB 4U 24Bay");
    assert.equal(cellValue("monitors", v700Row, v700Spec), "—");
    assert.equal(cellValue("msrp", v700Row, v700Spec), "$54,512");
  });
});

describe("formatMsrp", () => {
  it("formats numeric, market, call-for-quote, and null", () => {
    assert.equal(formatMsrp(v700Row), "$54,512");
    assert.equal(formatMsrp({ ...v700Row, price_type: "market" }), "Market");
    assert.equal(
      formatMsrp({ ...v700Row, price_type: "call_for_quote" }),
      "Call for Quote",
    );
    assert.equal(formatMsrp({ ...v700Row, msrp: null }), "—");
  });
});
