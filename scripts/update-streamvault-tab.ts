// scripts/update-streamvault-tab.ts
// Enriches the StreamVault tab in exports/comparison-data.xlsx with CPU specs,
// form factor, network, RAID, and OS data extracted from the Genetec StreamVault
// 2026 H1R1 product catalog plus Intel ARK / Passmark lookups.
//
// Only the StreamVault worksheet is modified. All other tabs are untouched.
// Safe to re-run — overwrites by matching on model_name.
//
// Run: node --import tsx scripts/update-streamvault-tab.ts
//
// Sources:
//   form_factor, cpu_model, network, raid_support, os:
//     Genetec StreamVault Product Catalog 2026 H1R1 (streamvault-product-catalog.pdf)
//   cpu_base_ghz:
//     Intel ARK (ark.intel.com) — product title frequency for each SKU
//   cpu_cores, cpu_threads, cpu_passmark:
//     Passmark CPU Benchmark (cpubenchmark.net) — CPU Mark (multi-thread), fetched 2026-06-24
//   Dell Core Ultra 5 235 platform confirmation:
//     Dell Pro Slim XE5 → CDW DPQCS1250: "Core Ultra 5 235 3.4 GHz"
//     Dell Pro Max Tower T2 → CDW DPFCT2250: "Core Ultra 5 235 3.4 GHz"

import ExcelJS from "exceljs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const XLSX_PATH = resolve(ROOT, "exports", "comparison-data.xlsx");

// ─── Style constants ─────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: "FFFFFFFF" }, bold: true,
};
const YELLOW_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" },
};
const NO_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "none",
};

// ─── StreamVault enrichment data ─────────────────────────────────────────────
//
// cpu_cores/cpu_threads: per-physical-CPU values (not totals for dual-CPU systems)
// cpu_passmark: single-CPU score × 2 for dual-CPU models (per brief)

type SvData = {
  form_factor: string;
  cpu_model: string;
  cpu_cores: number;
  cpu_threads: number;
  cpu_base_ghz: number;
  cpu_passmark: number;
  cpu_passmark_notes: string | null;
  cpu_cores_threads: string;
  network: string;
  raid_support: string;
  os: string;
};

const SV_DATA: Record<string, SvData> = {
  // 300E Series — Dell Pro Slim XE5 / Dell Pro Max Tower T2
  // Both ship with Intel Core Ultra 5 235 (lowest-tier Core Ultra 5 on each platform)
  // OS: Windows 11 Enterprise LTSC (300E series key specs, p.4 PDF)
  // RAID: None — no RAID configuration mentioned, single-drive entry appliances (p.4-5)
  "SV-300E": {
    form_factor: "Small Form Factor",
    cpu_model: "Intel Core Ultra 5 235",
    cpu_cores: 14, cpu_threads: 14,
    cpu_base_ghz: 3.4,
    cpu_passmark: 38138,
    cpu_passmark_notes: null,
    cpu_cores_threads: "14C/14T",
    network: "1x 1GbE RJ45",
    raid_support: "None",
    os: "Windows 11 Enterprise LTSC",
  },
  "SV-300E-T4": {
    form_factor: "Mid Tower",
    cpu_model: "Intel Core Ultra 5 235",
    cpu_cores: 14, cpu_threads: 14,
    cpu_base_ghz: 3.4,
    cpu_passmark: 38138,
    cpu_passmark_notes: null,
    cpu_cores_threads: "14C/14T",
    network: "1x 1GbE RJ45",
    raid_support: "None",
    os: "Windows 11 Enterprise LTSC",
  },
  // 1000E Series — Dell PowerEdge R260 / T160
  // OS: Windows Server 2025 Standard IoT (1000E series key specs, p.6 PDF)
  "SV-1041E-RS2": {
    form_factor: "1U",
    cpu_model: "Xeon E-2434",
    cpu_cores: 4, cpu_threads: 8,
    cpu_base_ghz: 3.4,
    cpu_passmark: 15228,
    cpu_passmark_notes: null,
    cpu_cores_threads: "4C/8T",
    network: "2x 1GbE RJ45",
    raid_support: "JBOD (No RAID)",  // p.7: "JBOD (No RAID), RAID 0/1 option for 2-drive configs"
    os: "Windows Server 2025 Standard IoT",
  },
  "SV-1041E-T3": {
    form_factor: "Mini Tower",
    cpu_model: "Xeon E-2436",
    cpu_cores: 6, cpu_threads: 12,
    cpu_base_ghz: 2.9,
    cpu_passmark: 21635,
    cpu_passmark_notes: null,
    cpu_cores_threads: "6C/12T",
    network: "2x 1GbE RJ45",
    raid_support: "RAID 5",         // p.8: "RAID configuration: RAID5"
    os: "Windows Server 2025 Standard IoT",
  },
  // 2000E Series — Dell PowerEdge R360 / R760xs XL
  // OS: Windows Server 2025 Standard IoT (2000E series key specs, p.10 PDF)
  "SV-2041E-R4": {
    form_factor: "1U",
    cpu_model: "Xeon E-2436",
    cpu_cores: 6, cpu_threads: 12,
    cpu_base_ghz: 2.9,
    cpu_passmark: 21635,
    cpu_passmark_notes: null,
    cpu_cores_threads: "6C/12T",
    network: "2x 1GbE RJ45",
    raid_support: "RAID 5",         // p.11: RAID 5 base config
    os: "Windows Server 2025 Standard IoT",
  },
  "SV-2041E-R15": {
    form_factor: "2U",
    cpu_model: "Xeon Silver 4416+",
    cpu_cores: 20, cpu_threads: 40,
    cpu_base_ghz: 2.0,
    cpu_passmark: 43659,
    cpu_passmark_notes: null,
    cpu_cores_threads: "20C/40T",
    network: "2x 1GbE RJ45, 2x 10/25GbE SFP28", // p.12
    raid_support: "RAID 5/6",       // p.12: RAID 5 (3-8 drives), RAID 6 (9+ drives)
    os: "Windows Server 2025 Standard IoT",
  },
  // 4000E Series — Dell PowerEdge R760xd2 OEMR
  // OS: Windows Server 2025 Standard IoT (4000E series key specs, p.13 PDF)
  // cpu_passmark = 35,581 × 2 = 71,162 (per brief: single-CPU score × 2 for dual-CPU)
  "SV-4041EX-R28": {
    form_factor: "2U",
    cpu_model: "2x Xeon Gold 5416S",
    cpu_cores: 16, cpu_threads: 32,   // per-CPU
    cpu_base_ghz: 2.0,
    cpu_passmark: 71162,              // 2 × 35,581
    cpu_passmark_notes: "2x CPU, score doubled",
    cpu_cores_threads: "16C/32T per CPU",
    network: "2x 1GbE RJ45, 2x 10/25GbE SFP28", // p.15
    raid_support: "RAID 6/60",       // p.15: <27 drives RAID 6 + hot spare, 28 drives RAID 60
    os: "Windows Server 2025 Standard IoT",
  },
  // 7000E Series — Dell PowerEdge R660xs OEMR
  // OS: Windows Server 2025 Standard IoT (7000E series key specs, p.16 PDF)
  // Director/Federation node — no data storage RAID stated in catalog spec block
  // cpu_passmark = 43,659 × 2 = 87,318
  "SV-7041EX-R6S": {
    form_factor: "1U",
    cpu_model: "2x Xeon Silver 4416+",
    cpu_cores: 20, cpu_threads: 40,   // per-CPU
    cpu_base_ghz: 2.0,
    cpu_passmark: 87318,              // 2 × 43,659
    cpu_passmark_notes: "2x CPU, score doubled",
    cpu_cores_threads: "20C/40T per CPU",
    network: "2x 1GbE RJ45, 4x 10/25GbE SFP28", // p.16
    raid_support: "None",             // no data RAID configuration stated in 7000E spec block
    os: "Windows Server 2025 Standard IoT",
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== update-streamvault-tab.ts ===\n");
  console.log(`Source: ${XLSX_PATH}\n`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  const ws = wb.getWorksheet("StreamVault");
  if (!ws) {
    console.error("ERROR: StreamVault worksheet not found.");
    process.exit(1);
  }

  // ── Discover existing columns ──────────────────────────────────────────────
  const headerRow = ws.getRow(1);
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNum) => {
    if (cell.value) colMap[String(cell.value)] = colNum;
  });

  let lastCol = headerRow.cellCount;

  function ensureCol(name: string): number {
    if (colMap[name]) return colMap[name];
    lastCol += 1;
    colMap[name] = lastCol;
    const cell = headerRow.getCell(lastCol);
    cell.value = name;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle" };
    console.log(`  Added new column: ${name} (col ${lastCol})`);
    return lastCol;
  }

  // Ensure new columns exist (append if not already present)
  const COL_CPU_CORES         = ensureCol("cpu_cores");
  const COL_CPU_THREADS       = ensureCol("cpu_threads");
  const COL_CPU_PASSMARK_NOTES = ensureCol("cpu_passmark_notes");

  // Existing column positions (must already exist — error if missing)
  const required = ["model_name", "form_factor", "cpu_model", "cpu_cores_threads",
                     "cpu_base_ghz", "cpu_passmark", "network", "raid_support", "os"];
  for (const col of required) {
    if (!colMap[col]) {
      console.error(`ERROR: Expected column "${col}" not found in StreamVault tab.`);
      process.exit(1);
    }
  }

  // ── Update data rows ───────────────────────────────────────────────────────
  const updated: string[] = [];
  const missing: string[] = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;

    const modelNameCell = row.getCell(colMap["model_name"]);
    const modelName = String(modelNameCell.value ?? "").trim();
    if (!modelName) return;

    const data = SV_DATA[modelName];
    if (!data) {
      missing.push(modelName);
      return;
    }

    function set(colName: string, value: unknown, clearYellow = false) {
      const cell = row.getCell(colMap[colName]);
      cell.value = value as ExcelJS.CellValue;
      if (clearYellow) {
        // Only clear if it currently has yellow fill
        const f = cell.fill as ExcelJS.FillPattern | undefined;
        if (f?.fgColor?.argb === "FFFFFF00") {
          cell.fill = NO_FILL;
        }
      }
    }

    set("form_factor",       data.form_factor);
    set("cpu_model",         data.cpu_model);
    set("cpu_cores_threads", data.cpu_cores_threads);
    set("cpu_base_ghz",      data.cpu_base_ghz, true);   // clear yellow fill
    set("cpu_passmark",      data.cpu_passmark,  true);   // clear yellow fill
    set("network",           data.network);
    set("raid_support",      data.raid_support);
    set("os",                data.os);

    row.getCell(COL_CPU_CORES).value          = data.cpu_cores;
    row.getCell(COL_CPU_THREADS).value        = data.cpu_threads;
    row.getCell(COL_CPU_PASSMARK_NOTES).value = data.cpu_passmark_notes ?? null;

    // Apply yellow fill to any remaining blank cells in the data columns
    for (const [, colNum] of Object.entries(colMap)) {
      const cell = row.getCell(colNum);
      const v = cell.value;
      if ((v === null || v === undefined || v === "") && colNum > 1) {
        cell.fill = YELLOW_FILL;
      }
    }

    updated.push(modelName);
  });

  // Auto-width the new columns
  [COL_CPU_CORES, COL_CPU_THREADS, COL_CPU_PASSMARK_NOTES].forEach((colNum) => {
    const col = ws.getColumn(colNum);
    let maxLen = 12;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 50);
  });

  await wb.xlsx.writeFile(XLSX_PATH);

  // ── Summary table ──────────────────────────────────────────────────────────
  console.log("\n── Summary ────────────────────────────────────────────────────");
  console.log(
    `${"model_name".padEnd(22)} ${"cpu_model".padEnd(26)} ${"cpu_base_ghz".padEnd(14)} ${"cpu_cores".padEnd(10)} ${"cpu_passmark".padEnd(13)} ${"form_factor".padEnd(22)} os`
  );
  console.log("─".repeat(130));
  for (const model of updated) {
    const d = SV_DATA[model];
    console.log(
      `${model.padEnd(22)} ${d.cpu_model.padEnd(26)} ${String(d.cpu_base_ghz).padEnd(14)} ${String(d.cpu_cores).padEnd(10)} ${String(d.cpu_passmark).padEnd(13)} ${d.form_factor.padEnd(22)} ${d.os}`
    );
  }

  if (missing.length > 0) {
    console.log(`\n⚠  Models in sheet not found in SV_DATA (cells left blank/yellow):`);
    missing.forEach((m) => console.log(`   - ${m}`));
  }

  console.log(`\n✓ ${updated.length}/${Object.keys(SV_DATA).length} rows updated`);
  console.log(`✓ ${XLSX_PATH}`);
  console.log("=== Complete ===");
}

main().catch((err) => {
  console.error("update-streamvault-tab failed:", err);
  process.exit(1);
});
