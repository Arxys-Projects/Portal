import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { familyBySlug, productGroupToFamilySlug } from "@/lib/price-book/families";

// Image loading for the System Estimate PDF. @react-pdf/renderer's <Image>
// accepts a base64 data URI string, so we read the PNGs off disk once (cached
// per process) and hand the template ready-to-embed strings.
//
// The files live under public/. On Vercel the serverless function only ships
// files the trace step finds; the hero path is computed at runtime so NFT
// cannot see it statically. next.config.ts adds an outputFileTracingIncludes
// entry for this route so the assets are bundled regardless.

const LOGO_PUBLIC_PATH = "/email/arxys-logo.png";

const cache = new Map<string, string | null>();

// Read a file under public/ and return a PNG data URI. Returns null if the
// file is missing so the template can degrade gracefully (text fallback)
// rather than crash the whole PDF render.
function loadPngDataUri(publicPath: string): string | null {
  if (cache.has(publicPath)) return cache.get(publicPath) ?? null;
  let result: string | null = null;
  try {
    const abs = join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    const buf = readFileSync(abs);
    result = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    result = null;
  }
  cache.set(publicPath, result);
  return result;
}

export function loadLogoDataUri(): string | null {
  return loadPngDataUri(LOGO_PUBLIC_PATH);
}

// Map a product group (e.g. "V500") to its Price Book hero image, returned as
// a data URI. Returns null when the group has no family match or no hero (the
// template then omits the image column).
export function loadHeroDataUri(productGroup: string | null | undefined): string | null {
  if (!productGroup) return null;
  const slug = productGroupToFamilySlug(productGroup);
  if (!slug) return null;
  const heroPath = familyBySlug(slug)?.heroImage;
  if (!heroPath) return null;
  return loadPngDataUri(heroPath);
}
