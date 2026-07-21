import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ADR 0089 — partner logo Storage access.
//
// The partner-logos bucket (migration 20260721000002) is the project's first
// Supabase Storage consumer; every other served image is a /public asset loaded
// via readFileSync (src/lib/pdf/assets.ts). This module is the one place that
// talks to the bucket: it uploads a validated logo, resolves a public URL for
// the dashboard <img>, and loads bytes as a base64 data URI for the PDF render
// (react-pdf's <Image> embeds a data URI, matching the /public asset pattern —
// no reliance on the public URL resolving at render time).
//
// Logos are not secret and the bucket is public-read; write is admin-only,
// enforced by the server action's requireAdmin gate plus the storage.objects
// RLS policies. Reads here therefore work with any authenticated client.

export const PARTNER_LOGO_BUCKET = "partner-logos";

// Accepted upload types. Transparent PNG is the expected input; JPG allowed.
// SVG is intentionally unsupported (react-pdf <Image> cannot render it —
// ADR 0089 §5).
const ALLOWED_LOGO_MIME: Record<string, "png" | "jpg"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

// Cap: logos are small marketing assets. 2 MB is generous for a transparent PNG
// and keeps the PDF render (which base64-embeds the bytes) light.
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type LogoValidationError =
  | { ok: false; error: string }
  | { ok: true; ext: "png" | "jpg"; contentType: string };

// Validate an uploaded logo file's type and size. Pure enough to unit-test the
// branches; the action calls it before touching Storage.
export function validateLogoFile(file: { type: string; size: number } | null): LogoValidationError {
  if (!file || file.size === 0) {
    return { ok: false, error: "Choose a PNG or JPG logo file to upload." };
  }
  const ext = ALLOWED_LOGO_MIME[file.type.toLowerCase()];
  if (!ext) {
    return { ok: false, error: "Logo must be a PNG or JPG image. SVG and other formats are not supported." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "Logo is too large. Use an image under 2 MB." };
  }
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  return { ok: true, ext, contentType };
}

// Deterministic object path for a partner's logo: one logo per partner. Reusing
// the same base name means a re-upload of the SAME extension overwrites in
// place (upsert). A different extension leaves the prior object orphaned — the
// row's logo_path points at the new one; cleanup of the old object is a manual
// step (ADR 0089 Task 2: no hard delete from the agent).
export function partnerLogoStoragePath(partnerId: string, ext: "png" | "jpg"): string {
  return `${partnerId}/logo.${ext}`;
}

export type UploadLogoResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

// Upload a validated logo to the bucket and return its stored object path.
// Expects a service-role (admin) client; the caller gates on requireAdmin.
export async function uploadPartnerLogo(
  admin: SupabaseClient,
  partnerId: string,
  file: File,
): Promise<UploadLogoResult> {
  const validation = validateLogoFile(file);
  if (!validation.ok) return validation;

  const path = partnerLogoStoragePath(partnerId, validation.ext);
  const bytes = await file.arrayBuffer();
  const { error } = await admin.storage
    .from(PARTNER_LOGO_BUCKET)
    .upload(path, bytes, { contentType: validation.contentType, upsert: true });
  if (error) {
    return { ok: false, error: `Logo upload failed: ${error.message}` };
  }
  return { ok: true, path };
}

// Public URL for the dashboard <img>. The bucket is public, so this needs no
// signing. null when there is no logo. Never throws.
export function partnerLogoPublicUrl(
  supabase: SupabaseClient,
  logoPath: string | null | undefined,
): string | null {
  if (!logoPath) return null;
  const { data } = supabase.storage.from(PARTNER_LOGO_BUCKET).getPublicUrl(logoPath);
  return data?.publicUrl ?? null;
}

// Download the logo bytes and return a base64 data URI for react-pdf's <Image>.
// Returns null on any failure (missing object, network) so the document
// degrades to the blank header slot rather than failing the whole render — the
// same graceful-null contract as loadPngDataUri in src/lib/pdf/assets.ts.
export async function loadPartnerLogoDataUri(
  supabase: SupabaseClient,
  logoPath: string | null | undefined,
): Promise<string | null> {
  if (!logoPath) return null;
  try {
    const { data, error } = await supabase.storage.from(PARTNER_LOGO_BUCKET).download(logoPath);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    const mime = logoPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// Resolve a partner's logo to a data URI by partner id. Best-effort and
// tolerant of the logo_path column not existing yet (pre-migration): a failed
// read degrades to null. Reads are RLS-scoped to the caller, which is fine here
// because logos are public-read.
export async function loadPartnerLogoDataUriById(
  supabase: SupabaseClient,
  partnerId: string | null | undefined,
): Promise<string | null> {
  if (!partnerId) return null;
  const { data } = await supabase
    .from("partners")
    .select("logo_path")
    .eq("id", partnerId)
    .maybeSingle<{ logo_path: string | null }>();
  return loadPartnerLogoDataUri(supabase, data?.logo_path ?? null);
}

// Resolve the OWNING partner's logo for a submission: the on-behalf target when
// set, otherwise the creator (ADR 0089 §5 — the reseller who hands the document
// to their end customer). Used by the admin download route and the Step-6
// delivery path, which do not otherwise load the submission's owner. Null on any
// miss; never throws.
export async function resolveSubmissionOwnerLogoDataUri(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("submissions")
    .select("partner_id, on_behalf_of_partner_id")
    .eq("id", submissionId)
    .maybeSingle<{ partner_id: string; on_behalf_of_partner_id: string | null }>();
  if (!data) return null;
  const ownerId = data.on_behalf_of_partner_id ?? data.partner_id;
  return loadPartnerLogoDataUriById(supabase, ownerId);
}
