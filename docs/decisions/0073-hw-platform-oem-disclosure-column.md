# 0073 — Add hw_platform column to surface Dell OEM rebadging

- **Status**: Accepted
- **Date**: 2026-06-24

## Context

All three major VMS hardware vendors in the comparison (Milestone, Avigilon, Genetec) sell rebadged Dell PowerEdge servers under their own branding. Arxys VideoX runs on purpose-configured hardware with AMD EPYC CPUs — a genuinely differentiated platform. The portal comparison currently shows only the vendor's appliance name, obscuring this structural similarity among competitors.

Research confirmed vendor-to-Dell model mappings from official spec sheets and iDRAC/chassis evidence:

| Competitor | Appliance | Dell Platform | Evidence |
|---|---|---|---|
| Milestone | Husky IVO 700R | PowerEdge R360 | Spec sheet footer verbatim |
| Milestone | Husky IVO 1000R | PowerEdge R760xs | Spec sheet footer verbatim |
| Milestone | Husky IVO 1800R | PowerEdge R760xd2 | Spec sheet footer verbatim |
| Avigilon | NVR6 Standard/Premium Form D | PowerEdge R760 | iDRAC 9 Enterprise + 28.4" depth match |
| Avigilon | NVR6 Premium Plus Form H | HP (iLO Advanced) | iLO Advanced management; not Dell |
| Genetec | SV-2041E-R4 | PowerEdge R360 | Explicit in streamvault_specs_for_portal.xlsx |
| Genetec | SV-4041EX-R28 | PowerEdge R760xd2 OEMR | Explicit in streamvault_specs_for_portal.xlsx |

Cross-vendor coincidences: Milestone 1800R and Genetec SV-4041EX-R28 use the **same chassis** (R760xd2); Milestone 700R and Genetec SV-2041E-R4 are both on the R360.

## Options considered

- **Add hw_platform column to competitor_products + StreamVault**: straightforward; portal app can expose it when display_specs is updated.
- **Separate "OEM mapping" tab**: more visibility in the spreadsheet, but duplicates data and requires portal code changes to read an additional sheet.
- **Inline note in model_name**: e.g. "Husky IVO 1000R (Dell R760xs)". Simple but dirty — conflates the vendor name with the platform.

## Decision

Add `hw_platform` as a new column after `form_factor` in both `competitor_products` and `StreamVault` sheets. Values are the confirmed Dell model name (or "HP (iLO Advanced; model unconfirmed)" for Avigilon Form H). Avigilon Form D values are labelled "(inferred from iDRAC + chassis dims)" because Avigilon does not name the underlying Dell model in their published spec sheets.

## Consequences

**Positive:** The "all competitors are rebadged Dell" insight is captured in the data, ready for the portal to surface once `display_specs` is updated with a `hw_platform` entry.

**Negative:** Avigilon Form D values are inferred (not confirmed by Avigilon directly). If Avigilon ever publishes explicit model names, the values should be updated and the "(inferred)" qualifier removed.

**When to revisit:** If Avigilon or Milestone releases a new hardware generation on a different platform. The script `scripts/update_comparison_data.py` is the canonical place to update `HW_PLATFORM` mappings.
