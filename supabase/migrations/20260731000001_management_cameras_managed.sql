-- Cameras-managed capacity for the management server datasheet.
--
-- The V250/V255 sheet's defining figure is how many cameras each variant is
-- sized to manage, and it appears in FOUR places on the rendered sheet: the
-- page-1 headline strip, the model ladder cell, the Management Capacity table
-- and the orderable-configurations table. It was in no column, which is one of
-- the two reasons ADR 0110 deferred the template.
--
-- TWO COLUMNS, NOT ONE STRING. The obvious shape is a single text column holding
-- the phrase the sheet prints ("Up to 250", "250 and above"), and it was
-- rejected: the four renderings above are four DIFFERENT phrasings of the same
-- fact ("250 / 250+" in the strip, "≤ 250 cameras" in the ladder, "Up to 250" in
-- the tables), so one stored phrase would have to be re-parsed into the other
-- three. Prose-parsing to produce a customer-facing capacity claim is exactly
-- what this schema avoids everywhere else.
--
-- The two columns carry the SEMANTICS the sheet actually states, and the
-- renderer derives every phrasing from them:
--
--   V250  max = 250, min = null   a CEILING — sized for up to 250 cameras
--   V255  min = 250, max = null   a FLOOR   — for deployments above 250
--
-- Both nullable, and neither is seeded here. The figures are not on the V250
-- factsheet — the phase-2 transcription reads "not found on any server sheet"
-- for bandwidth, and no camera count is transcribed for either variant — so the
-- numbers on the design mockup are the designer's, not the manufacturer's. A
-- capacity claim printed on a customer datasheet is not something a migration
-- gets to invent. They are entered through the admin form (ADR 0096), and the
-- datasheet picker names them as a gap until they are.
--
-- Every other archetype leaves both null: an NVR's capacity is camera STREAMS
-- and lives in product_specs.max_cameras_h265, a workstation's is its
-- camera_matrix, and the ACM line manages doors rather than cameras.

alter table public.appliance_specs
  add column cameras_managed_min integer,
  add column cameras_managed_max integer;

comment on column public.appliance_specs.cameras_managed_min is
  'Lower bound of the cameras-under-management range, when the sheet states a FLOOR '
  '(the V255 is "250 and above" — min 250, max null). Null on every archetype whose '
  'capacity is not measured in managed cameras. Distinct from camera STREAMS, which is '
  'an NVR figure in product_specs.max_cameras_h265.';

comment on column public.appliance_specs.cameras_managed_max is
  'Upper bound of the cameras-under-management range, when the sheet states a CEILING '
  '(the V250 is "up to 250" — max 250, min null). Set both to the same number for a '
  'variant that states an exact figure rather than a bound.';
