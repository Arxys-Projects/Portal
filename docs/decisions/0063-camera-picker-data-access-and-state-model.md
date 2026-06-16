# 0063 — Camera-model picker: search RPC and group state model

- **Status**: Accepted
- **Date**: 2026-06-16

## Context

Phase 10 Step 3 adds a per-group camera-model picker to the calculator: a vendor
select gates a model typeahead over `camera_specs`, and selecting a model fills
the resolution bucket and sensor count. Two design questions had non-obvious
answers.

First, data access. The alias trigram index from Step 1 is built over the
IMMUTABLE helper `public.camera_aliases_text(model_aliases)`, not over the array.
PostgREST cannot express a `WHERE` clause through that helper on its own, so a
plain `.from("camera_specs").ilike(...)` against the alias array would not be
index-backed (ADR 0057, and the Step-1 Detours note). Some server-side object
has to own the alias match.

Second, the camera count. The engine consumes a single `cameras` integer
(`GroupInput.cameras`). A loaded model introduces two new user-facing numbers,
units and sensors-per-camera, whose product is the camera count. Where those
live relative to `cameras` decides how rehydration and the engine behave.

## Options considered

- **Data access: client-side browser Supabase `.rpc()`** vs **a server action
  calling the RPC**. The browser client exists but is unused anywhere; every
  authenticated read in the app goes through the server.
- **Search surface: a search RPC** vs **a view exposing an `aliases_text`
  column** vs **a PostgREST computed column**. A computed column needs a
  `function(camera_specs)` signature, which the existing `text[]` helper is not.
- **State: `cameras` stays the source of truth (units × sensors derives into
  it)** vs **store units/sensors and derive `cameras` everywhere on read**.

## Decision

A `SECURITY INVOKER` SQL function `public.search_camera_specs(vendor, query,
limit)` owns the match, filtering model with ILIKE and aliases through
`public.camera_aliases_text(model_aliases)` so both trigram indexes are used. It
is called from a `searchCameraModels` server action (the established
authenticated-read path), which the client calls debounced. RLS still applies
(SELECT open to authenticated); the function only reads.

`cameras` remains the engine input and the payload field. On the model-loaded
path it is kept equal to `units × sensorsPerCamera` as those change; on the
no-model path it is the direct editable input, byte-identical to before. On
rehydration `cameras` is read from its banked value and never recomputed from
units × sensors, because a banked quote's camera count is authoritative.
`cameraModelModified` is a stored boolean (set when the user overrides the
auto-filled resolution or sensors), never recomputed against `camera_specs`,
which can change under a re-seed.

The five new per-group fields default cleanly on absent (null / null / 1 / 1 /
false), so no `INPUT_STATE_VERSION` bump is needed (same approach as
`recordingMode`).

## Consequences

**Positive:** alias search is index-backed and authorization stays under RLS;
the engine contract and the no-model UX are unchanged; pre-feature rows rehydrate
exactly as before; the modified flag survives a library re-seed.

**Negative:** Step 3 is not pure UI as the Step-1 entry hoped — it adds one DB
object (the search RPC), which must be deployed via the gated `db push` before
the picker returns results. Typeahead latency is a server-action round-trip
rather than a direct client query.

**When to revisit:** if typeahead latency proves too high, move the read to the
browser Supabase client calling the same RPC (no schema change); if alias search
needs ranking (similarity score) rather than substring match, extend the RPC to
order by `similarity()`.
