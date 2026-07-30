import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Font } from "@react-pdf/renderer";

// Design tokens for the data-driven product datasheet, transcribed from the
// Phase 2 design handoff:
//   datasheets/design_handoff_videox_datasheet/README.md
//
// UNITS. The design is specified in CSS px at 96dpi — a page is 816 × 1056 px,
// i.e. US Letter. @react-pdf/renderer works in PostScript points, where Letter
// is 612 × 792 pt. The two differ by exactly 0.75, so every measurement from
// the handoff is written here in its original px and passed through px().
// Keeping the design's own numbers in the source is what makes the template
// checkable against the handoff line by line; converting them by hand once
// would make every future diff a guess. The handoff's own arithmetic agrees:
// it says the 9px spec value "lands at ~6.8pt", and 9 × 0.75 = 6.75.
export const px = (n: number): number => n * 0.75;

// ── Color ────────────────────────────────────────────────────────────────
// Handoff §"Design tokens · Color". Contrast ratios in comments are the
// handoff's measured values on white.
export const C = {
  navy: "#054A91", // 8.6:1 — headings, rules, table headers, part numbers
  gold: "#FCB23E", // accent — band tint, bullets, ladder active bar
  goldDark: "#8A6A1F", // 5.0:1 — seal label text only
  goldWash: "#FFF8EC", // warranty band background
  goldWashBorder: "#F2DDB6", // warranty band top/bottom rule
  sealRing: "#E0C795", // held-slot dashed ring
  ink: "#23272B", // 14.6:1 — spec values, headline values
  body: "#3D444B", // 9.8:1 — paragraphs, feature copy
  muted: "#5F6B76", // 5.36:1 — spec labels, footers, captions
  brandGrey: "#828386", // 3.79:1 — SECONDARY TEXT AT 10px AND ABOVE ONLY
  caption: "#4A5560", // 7.7:1 — table captions
  hairline: "#DCE1E6", // all borders and rules
  tableRule: "#EDF0F3", // table row dividers
  specRule: "#F1F4F6", // spec row dividers
  wash: "#F5F7F9", // table header rows, photo slot background
} as const;

// The accessibility constraint the handoff calls out as a fixed defect: the
// brand grey fails WCAG AA under 18px, so it is used at 10px and above only.
// Anything smaller uses C.muted. Do not reintroduce it into fine print.

// ── Type ─────────────────────────────────────────────────────────────────
// Two families. Poppins carries numerals, feature titles, headline values and
// VMS names; Montserrat carries everything else.
export const F = {
  sans: "Montserrat",
  display: "Poppins",
} as const;

let registered = false;

/**
 * Register the two families with @react-pdf/renderer. Idempotent — the module
 * is imported by both the render script and (eventually) the route handler,
 * and Font.register throws on a duplicate family/weight pair.
 *
 * The TTFs are committed under public/fonts/ rather than fetched from Google
 * at render time: a PDF route that reaches out to fonts.gstatic.com fails
 * closed on a cold serverless start with no network egress, and would make
 * every render depend on a third party being up.
 */
export function registerDatasheetFonts(): void {
  if (registered) return;
  const fontPath = (file: string) => join(process.cwd(), "public", "fonts", file);
  Font.register({
    family: F.sans,
    fonts: [
      { src: fontPath("Montserrat-Regular.ttf"), fontWeight: 400 },
      { src: fontPath("Montserrat-Medium.ttf"), fontWeight: 500 },
      { src: fontPath("Montserrat-SemiBold.ttf"), fontWeight: 600 },
      { src: fontPath("Montserrat-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: F.display,
    fonts: [{ src: fontPath("Poppins-SemiBold.ttf"), fontWeight: 600 }],
  });
  // Without this every hyphen-free long token (part numbers, "Hanwha WAVE")
  // is broken mid-word by the default hyphenation callback.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

// ── Assets ───────────────────────────────────────────────────────────────
const assetCache = new Map<string, string | null>();

/**
 * Read a PNG under public/ and return a data URI, or null when the file is
 * missing so the template can hold the slot rather than crash the render.
 */
export function loadPng(publicPath: string): string | null {
  if (assetCache.has(publicPath)) return assetCache.get(publicPath) ?? null;
  let result: string | null = null;
  try {
    const abs = join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    result = `data:image/png;base64,${readFileSync(abs).toString("base64")}`;
  } catch {
    result = null;
  }
  assetCache.set(publicPath, result);
  return result;
}
