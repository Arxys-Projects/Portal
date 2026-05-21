# 0034 — XLSX library choice for partner price book download

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

Step 7 adds a "Download price list" button that streams an XLSX of the `products` table to any authenticated partner. The generator runs server-side only (Next.js Route Handler, Node.js runtime). We need a library that handles cell-level currency formatting (`numFmt`) so partners get Excel-native `$16,640.00` cells they can SUM and sort — not pre-formatted strings.

## Options considered

- **`exceljs`** (~620 KB installed) — mature, streaming API, full `numFmt` / fill / font styling. Widely recognized in the Node ecosystem. Pure JavaScript, no native bindings, so no Turbopack/Next.js 16 compatibility risk.
- **`write-excel-file`** (~100 KB) — smaller, modern API, single-purpose. Less ecosystem depth; no `numFmt` on individual cells in older versions.
- **`xlsx` (SheetJS CE)** (~1.6 MB) — famous but large; license changed to Apache-2.0 in 2024 after a period of ambiguity; historically CVE-prone.
- **`xlsx-populate`** (~250 KB) — compact but lower activity; would have worked.

## Decision

`exceljs`. Server-side only (zero client-bundle impact); `numFmt` API is exactly what's needed for currency cells; widely documented; pure JavaScript avoids native-binding issues with Turbopack + Next.js 16.

## Consequences

**Positive:** currency cells are numeric in the workbook — partners can SUM/sort/formula-reference them natively in Excel, Numbers, and LibreOffice.

**Negative:** 90 transitive packages added (many with deprecation notices — `fstream`, `uuid@8`, `glob@7` — but all runtime-safe for our use). Larger than `write-excel-file`.

**When to revisit:** if the deprecated transitive deps ever surface real CVEs, evaluate replacing with `write-excel-file` or `xlsx-populate`.
