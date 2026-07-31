-- Datasheet automation — photo paths + the usage paragraph (3 columns per table)
--
-- STOP-AND-FLAG. Applied by hand via the Supabase dashboard SQL editor, per the
-- ADR 0083 / 0089 convention (the CLI is unauthenticated in the agent
-- environment). Additive-only, so it is benign — but it still ships in review.
-- Paired rollback: supabase/rollback/datasheet-media-and-usage-rollback.sql
-- Apply note:      docs/apply-notes/0107-datasheet-media-and-usage.md
--
-- Purely ADDITIVE, same pattern as 20260729000002: nullable columns only. Does
-- NOT touch existing columns, existing rows' values, indexes, RLS policies or
-- constraints. Both tables get the same three columns so the one datasheet
-- template can read either archetype through one adapter.
--
-- NO VALUES ARE SEEDED HERE — entered through /admin/specs and
-- /admin/appliance-specs (ADR 0097 §8). Every column is nullable, so the 21
-- product_specs rows and the 7 appliance_specs rows stay valid untouched.
--
-- The ADR 0096 write path covers these automatically: the admin policies, both
-- stamp triggers and the audit tables are row-level and to_jsonb-based, so new
-- columns are audited the moment they exist. The 0090 apply note verified that
-- explicitly when the last 22 columns landed.

-- ── Photo paths ────────────────────────────────────────────────────────────
--
-- PUBLIC PATHS UNDER public/, NOT SUPABASE STORAGE KEYS (ADR 0107). The Price
-- Book heroes these reuse already live there (families.ts heroImage), and the
-- PDF renderer resolves a path to bytes on disk at render time with no network
-- call — the same reason the datasheet fonts are committed rather than fetched
-- (ADR 0106). Text, so a storage key can replace a path later without a schema
-- change; the resolver discriminates on the leading '/'.
--
-- The datasheet holds BOTH slots at a fixed size whether or not a photo exists,
-- so a null here means "frame renders empty", never "section disappears". That
-- is what makes one template safe to render for every SKU.

alter table public.product_specs   add column product_photo_path  text;
alter table public.product_specs   add column rear_io_photo_path  text;
alter table public.appliance_specs add column product_photo_path  text;
alter table public.appliance_specs add column rear_io_photo_path  text;

comment on column public.product_specs.product_photo_path is
  'Public path under public/ to the front-3/4 product photo (e.g. ''/price-book/v700-v800-hero.png''), '
  'or null while none exists. NOT a Supabase storage key — see ADR 0107. Rendered into a fixed '
  '720x240 frame on datasheet page 1; null holds the frame empty rather than reflowing the page.';
comment on column public.product_specs.rear_io_photo_path is
  'Public path under public/ to the rear-I/O panel photo, or null while none exists. Rendered into a '
  'fixed 720x200 frame on datasheet page 2. Rear-panel photography did not exist for any SKU when '
  'this column was added — the slot is held regardless (ADR 0105).';
comment on column public.appliance_specs.product_photo_path is
  'Public path under public/ to the product photo, or null. Matches product_specs.product_photo_path.';
comment on column public.appliance_specs.rear_io_photo_path is
  'Public path under public/ to the rear-I/O panel photo, or null. Matches '
  'product_specs.rear_io_photo_path.';

-- ── Usage paragraph ────────────────────────────────────────────────────────
--
-- The "Recommended usage" paragraph on datasheet page 1. Today the equivalent
-- copy lives in src/lib/price-book/families.ts as `greatFor`, which is
-- per-family TypeScript the Price Book renders and nothing else can reach. A
-- datasheet reading one source and the Price Book another is the exact
-- two-sources-of-truth shape ADR 0096 exists to end, so the datasheet reads
-- this column.
--
-- THE BACKFILL IS NOT HERE AND IS NOT AUTOMATIC. These land null on all 28
-- rows; the copy is entered through the admin forms. `greatFor` stays where it
-- is and keeps serving the Price Book until someone deliberately cuts it over —
-- that is a live customer-facing surface and a separate, reviewable step.

alter table public.product_specs   add column usage_paragraph text;
alter table public.appliance_specs add column usage_paragraph text;

comment on column public.product_specs.usage_paragraph is
  'The "Recommended usage" paragraph on datasheet page 1 — who this SKU is for and where it fits. '
  'Overlaps families.ts `greatFor`, which still independently serves the Price Book; this column '
  'does not backfill from it (ADR 0107).';
comment on column public.appliance_specs.usage_paragraph is
  'The "Recommended usage" paragraph on datasheet page 1. Matches product_specs.usage_paragraph.';
