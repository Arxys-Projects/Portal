# Datasheet Phase 2 — build step 6 entry reference

- **Date:** 2026-07-28
- **Purpose:** the transcription sheet Andy reads from while hand-entering data through
  `/admin/specs` and `/admin/appliance-specs`. **This document contains no writes.** Nothing in
  `product_specs`, `appliance_specs`, or any other table was touched to produce it.
- **Build step:** [design §7 step 6](./datasheet-phase2-admin-surface-design.md#7-build-sequence-next-session-mirrors-adr-0096-7) /
  [ADR 0097 decision 5](../docs/decisions/0097-datasheet-surfaces-join-admin-editable-pattern.md)
- **Field lists this follows verbatim:** [`admin/specs/fields.ts`](../src/app/\(app\)/admin/specs/fields.ts)
  (65 fields; only the 22 additive ones appear here) and
  [`admin/appliance-specs/fields.ts`](../src/app/\(app\)/admin/appliance-specs/fields.ts)
  (all 62 fields).

## 0. State verified before writing this (read-only)

| Check | Result |
|---|---|
| `product_specs` row count | **21**, ids exactly as listed in Part A |
| All 22 additive columns on those 21 rows | **null** on every row — nothing entered yet |
| `appliance_specs` row count | **0** — table empty, as build step 5 left it |

## 1. Sources

Twelve factsheets, all V5, all re-fetched today. The two Andy supplied locally were diffed
against the live URLs and the extracted text is **byte-identical**, so the arxys.com copies are
authoritative for every sheet.

| Sheet (page-2 title) | Covers | Source |
|---|---|---|
| V5 V100/150 NVR | V100 rack rows | `…/Arxys-VideoX-Factsheet-V100-V5.pdf` |
| V5 V200/250 NVR | V200 rack rows | `…/Arxys-VideoX-Factsheet-V200-V5.pdf` |
| V400 8 Bay | V400 rack rows | `…/Arxys-VideoX-Factsheet-V400-V5.pdf` (= Andy's local copy) |
| V500 12 Bay | V500 rack rows | `…/Arxys-VideoX-Factsheet-V500-v5.pdf` |
| V600 16 Bay | V600 rack rows | `…/Arxys-VideoX-Factsheet-V600-V5.pdf` |
| V700 24 Bay | V700 rack rows | `…/Arxys-VideoX-Factsheet-V700-V5.pdf` |
| V800 36 Bay | V800 rack rows | `…/Arxys-VideoX-Factsheet-V800-V5.pdf` (= Andy's local copy) |
| V5 V150 ACM | `VX5-V150-ACM` | `…/Arxys-VideoX-Factsheet-V150-ACM-V5.pdf` — **newly found this session** |
| V5 V250/255 Management Server | `VX5-V250-MGM`, `VX5-V255-MGM` | `…/Arxys-VideoX-Factsheet-V250-V5.pdf` |
| V5 V260/V270 ACM | `VX5-V260-ACM`, `VX5-V265-ACM` | `…/Arxys-VideoX-Factsheet-V260-V270-ACM-V5.pdf` |
| SW10 Workstation | `VX5-SW10-100` | `…/Arxys-videoX-Factsheet-SW10-V5.pdf` |
| SW20 Workstation | `VX5-SW20-200` | `…/Arxys-videoX-Factsheet-SW20-V5.pdf` |

Every sheet is 2 pages except SW10/SW20, which are 1. Citations below use **p1** (marketing
page: hero bullets, Key Attributes, Recommended Usage) and **p2** (the spec page: *Hardware
Information* left column, *General Information* / *Environmental Information* / *Regulatory
Information* right column). SW10/SW20 have only one page, cited as **p1**.

The V150 sheet is the one thing the Phase 2 kickoff session did not have. `families.ts` carries
no V150 URL — the V150 sits inside the V100 family as a tier section — and the kickoff recorded
the ACM sheets as "not field-verified". `Arxys-VideoX-Factsheet-V150-ACM-V5.pdf` exists and
returns 200, so `VX5-V150-ACM` below is sourced from its own sheet, not inferred from the V100.

## 2. Read this before you start typing

Nine things on these sheets need a human decision or a stated convention. They are collected
here so each SKU section below can stay a plain list of values.

### 2a. Conventions applied throughout

**(i) The Power Specifications block splits across three or four fields.** The sheets print one
block that runs PSU descriptor → AC input → (sometimes) DC input. The split used below:

| Sheet text (V100) | Field |
|---|---|
| `800W 1+1 redundant PSU` | `power_wattage` |
| `1+1 redundant` | `power_redundancy` |
| `100-240V~/ 10-5A, 50-60Hz` | `power_ac_input` |
| `240Vdc/ 4A` | `power_dc_input` |

`power_redundancy` deliberately repeats a phrase that is also inside `power_wattage`. Keeping it
in both means neither field alone is misleading. If you would rather not duplicate, trim
`power_wattage` to `800W` — but do it consistently across all 21 rows or the round-trip's
per-row values will read inconsistently.

**(ii) `regulatory_safety` gets the whole line; `regulatory_emissions` stays blank.** Every sheet
prints a single combined heading — *"Safety & Emission Standards: CE (class A), UKCA, FCC, RCM,
UL."* — and never separates the two. Splitting `CE`/`UL` into safety and `FCC`/`RCM` into
emissions would be my guess, not the sheet's statement. Put the combined string in
`regulatory_safety`, leave `regulatory_emissions` blank. Duplicating the same string into both is
the other defensible choice; pick one and hold it.

**(iii) `security_features` splits the *Credential & Key Encryption* list on its `·` separators.**
Ten items, identical on all ten server sheets (absent entirely from SW10/SW20):

```
AMD Secure Encrypted Virtualization (SEV)
AMD Secure Memory Encryption (SME)
Cryptographically signed firmware
Data at Rest Encryption (SEDs with local or external key mgmt)
Secure Boot
Secured Component Verification (Hardware integrity check)
Secure Erase
Silicon Root of Trust
System Lockdown
TPM 2.0 FIPS, CC-TCG certified
```

Two notes. The last item is **one** entry, not two — the comma is inside it, the `·` separators
are between items. And the **V400 sheet prints a comma instead of a `·`** between
`Cryptographically signed firmware` and `Data at Rest Encryption`; the ten-item split above is
still what to enter, which is a deliberate normalisation of a typo on that one sheet.

On SW10/SW20 leave the textarea empty. The column is `NOT NULL DEFAULT '{}'` and the
`string-list` kind submits `[]` for a blank box — that is correct and will save.

**(iv) `revision_date` reads the p1 footer `rev:` stamp as MM/DD/YYYY.** Arxys is US-based and
the stamps are consistent with it. Only five sheets carry a date:

| Sheet | Footer | Enter |
|---|---|---|
| V400 | `rev: 05/12/2025` | **leave blank** — ambiguous, see below |
| V500 | `rev: 10/01/2025` | `2025-10-01` |
| V600 | `rev: 10/02/2025` | `2025-10-02` |
| V700 | `rev: 10/01/2025` | `2025-10-01` |
| V800 | `rev: 10/01/2025` | `2025-10-01` |

V500/V700/V800 read as October under either convention, so only **V400 is genuinely ambiguous**
(May 12 vs 5 December). **Decided 2026-07-28: leave the three V400 rows' `revision_date` blank**
until the sheet's convention is confirmed with whoever produces it. Everything else is safe, and
the other 21 V400 values are entered normally.

The other seven sheets get **no** `revision_date`: V100 prints `rev: 2.0` (a version, not a
date), V200 / V250 / V260 / V150 print `rev:` followed by nothing, and SW10 / SW20 print no
`rev:` at all.

**(v) `cpu_base_ghz` / `cpu_turbo_ghz` split the unlabelled GHz pair.** The appliance sheets
print `3.9Ghz/5.1Ghz` with no labels. Base-then-boost is the AMD convention and the second
number is always the larger, so the split below is safe — but the sheet does not say so in
words.

### 2b. Sheet problems that need your call

**(vi) The V265 SKU has no V265 column — the sheet calls that variant V270.** The ACM sheet is
titled *V5 V260/V270* and its per-variant lines read `V260` and `V270`. The Price Book SKU is
`VX5-V265-ACM` (`product_group` `V265`, *"Enterprise Tier"*). The V270 column is almost certainly
the same box, but "almost certainly" is not a factsheet. **Decide before entering
`VX5-V265-ACM`:** either the sheet is stale on the model number and the V270 values apply, or a
V265-specific sheet exists that I could not find. Every V265-only value below is marked
`⚠ from the sheet's V270 column`.

**(vii) The V700 sheet prints the V800's weight.** *"Ship Weight W/ 36x HDDs = 72k/167lbs"* on a
24-bay chassis, and its Dimensions line is also identical to the V800's. Shared 4U chassis is
plausible; 36 drives in a 24-bay box is not. Transcribed verbatim below with the flag — do not
silently correct it, and consider getting the sheet fixed.

**(viii) The V250 sheet contradicts itself on RAID level.** p2's RAID block says *"Hardware RAID
5 Fault Tolerance"*, while p1 says *"HW RAID Mirrored SSDs"* and the drive layout (2 mirrored OS
+ 2 mirrored DB) is mirroring. `raid_support` takes the p2 prose verbatim either way;
**`raid_level_display` is your call** — I have left it marked as a decision rather than picking.

**(ix) Three smaller contradictions, flagged in place, all transcribed as printed:**

- **SW10 RAM** — p1 bullet says `8GB RAM DDR5`, the p2-equivalent RAM block says `16GB DDR5`.
  The detail block wins (and `families.ts` agrees): enter `16GB DDR5`.
- **V150 power redundancy** — p1 says `Single Power Supply`, Power Specifications says `600W PSU`
  with no redundancy, but Max Power Consumption says `600W … hot-plug redundant`. `power_redundancy`
  left blank; contradiction recorded in `notes`.
- **V255 CPU** — the sheet prints `4465 - 6C/24T` (6 cores, 24 threads) and `65W TD12`. Both look
  like typos for `12C/24T` and `65W TDP`. Transcribed **verbatim**; `notes` records it.

---

# Part A — `product_specs`: the 22 additive columns, 21 rack rows

Route: `/admin/specs` → click the SKU → the form's new sections 8–12 plus four fields placed into
existing sections. The other 43 fields are already populated; **do not touch them.**

The sheets are per-model, not per-capacity, so all three capacity SKUs in a family share one
value-set for all 22 columns — the "7 distinct chassis value-sets" the design costed at 21 hand
edits.

**Type each value-set once, then copy it to the two siblings** (ADR 0102). Since 2026-07-28 the
edit page carries a *"Copy the datasheet fields"* control listing the family's other two SKUs,
each labelled with how many of the 22 it already holds:

1. Open the family's first SKU, type the value-set from the table below, Save.
2. Open the second SKU. The control now shows the first as *"22 of 22 filled"* — click it.
3. The 22 fields arrive prefilled with a banner saying nothing is saved yet. Check them against
   the sheet, then Save.
4. Same for the third.

That is **7 real entries and 14 reviewed copies** rather than 21 from scratch. The copy is a UI
convenience only: it seeds the form's defaults and you still save through the same button, the
same validation and the same audit trail. It copies exactly these 22 and never a capacity field —
`storage_raw_tb`, `hdd_count`, `max_cameras` and `model_name` differ per capacity and are
excluded by construction, with tests holding that boundary.

Fields common to **all 21 rows** — stated once here, repeated in each table for transcription:

| Field | Value | Source |
|---|---|---|
| `display_ports` | `VGA (Client View applications not supported on server)` | p2 · Display Ports |
| `remote_mgmt` | `Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection` | p2 · Remote Management |
| `warranty_years` | `5` | p2 · Warranty |
| `warranty_terms` | `5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p2 · Warranty |
| `operating_temp` | `10- 30 C / 41 - 86 F` | p2 · Environmental → Operating Temperatures |
| `storage_temp` | `-40 - 65 C / -40 - 149 F` | p2 · Environmental → Storage Temperatures |
| `regulatory_safety` | `CE (class A), UKCA, FCC, RCM, UL.` | p2 · Regulatory → Safety & Emission Standards |
| `regulatory_emissions` | *blank* (see §2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p2 · Regulatory → Trade Compliance |
| `security_features` | the 10-line list in §2a-iii | p2 · Credential & Key Encryption |
| `dimensions_in` | *not found on any rack sheet — leave blank* | — |

`warranty_years = 5` will not fire the legacy-warranty warning: the existing `warranty` strings
start with `5`.

## A1 · V100 — applies to `VX5-V100-32`, `VX5-V100-40`, `VX5-V100-48`

Sheet: *V5 V100/150 NVR*.

| Field | Value to enter | Source |
|---|---|---|
| `power_wattage` | `800W 1+1 redundant PSU` | p2 · Power Specifications |
| `power_redundancy` | `1+1 redundant` | p2 · Power Specifications |
| `power_max_consumption` | `800W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption |
| `power_ac_input` | `100-240V~/ 10-5A, 50-60Hz` | p2 · Power Specifications |
| `power_dc_input` | `240Vdc/ 4A` | p2 · Power Specifications — **the DC line the pre-pause gap was about** |
| `cooling` | `4 x 40x40x56mm (29,700rpm) / 2 x 40x40x56mm (32,000rpm) all 6- hot swap` | p2 · Cooling (two printed lines) |
| `dimensions_mm` | `710mm (depth) x 438mm (width) x 44mm (height)` | p2 · Dimensions |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship WeightW/ 2x HDDs = 24k/42lbs` | p2 · Weight (`WeightW/` and `24k` are the sheet's own typos) |
| `warranty_years` | `5` | p2 · Warranty |
| `warranty_terms` | `5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p2 · Warranty |
| `operating_temp` | `10- 30 C / 41 - 86 F` | p2 · Environmental |
| `storage_temp` | `-40 - 65 C / -40 - 149 F` | p2 · Environmental |
| `humidity` | `10 – 80% relative humidity (non-condensing)` | p2 · Environmental — **80%, not 90%** |
| `regulatory_safety` | `CE (class A), UKCA, FCC, RCM, UL.` | p2 · Regulatory |
| `regulatory_emissions` | *blank* (§2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p2 · Regulatory |
| `security_features` | the 10-line list (§2a-iii) | p2 · Credential & Key Encryption |
| `remote_mgmt` | `Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection` | p2 · Remote Management |
| `os_drive_desc` | `Dedicated 480GB Enterprise 3D TLC Flash SSD, Dedicated for OS/VMS` | p2 · VMS/OS Drive |
| `display_ports` | `VGA (Client View applications not supported on server)` | p2 · Display Ports |
| `revision_date` | *blank* — the footer prints `rev: 2.0`, a version, not a date | p1 footer |

## A2 · V200 — applies to `VX5-V200-64`, `VX5-V200-80`, `VX5-V200-96`

Sheet: *V5 V200/250 NVR*.

| Field | Value to enter | Source |
|---|---|---|
| `power_wattage` | `800W 1+1 redundant PSU` | p2 · Power Specifications |
| `power_redundancy` | `1+1 redundant` | p2 · Power Specifications |
| `power_max_consumption` | `800W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption |
| `power_ac_input` | `100-240V~/ 10-5A, 50-60Hz` | p2 · Power Specifications |
| `power_dc_input` | `240Vdc/ 4A` | p2 · Power Specifications |
| `cooling` | `5 x 40x40x56mm (29,700rpm)` | p2 · Cooling |
| `dimensions_mm` | `710mm (depth) x 438mm (width) x 44mm (height)` | p2 · Dimensions |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship WeightW/ 4x HDDs = 27k/45lbs` | p2 · Weight |
| `warranty_years` | `5` | p2 · Warranty |
| `warranty_terms` | `5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p2 · Warranty |
| `operating_temp` | `10- 30 C / 41 - 86 F` | p2 · Environmental |
| `storage_temp` | `-40 - 65 C / -40 - 149 F` | p2 · Environmental |
| `humidity` | `10 – 80% relative humidity (non-condensing)` | p2 · Environmental — **80%, not 90%** |
| `regulatory_safety` | `CE (class A), UKCA, FCC, RCM, UL.` | p2 · Regulatory |
| `regulatory_emissions` | *blank* (§2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p2 · Regulatory |
| `security_features` | the 10-line list (§2a-iii) | p2 · Credential & Key Encryption |
| `remote_mgmt` | `Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection` | p2 · Remote Management |
| `os_drive_desc` | `2x Mirrored, 480GB Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS` | p2 · VMS/OS Drive |
| `display_ports` | `VGA (Client View applications not supported on server)` | p2 · Display Ports |
| `revision_date` | *blank* — footer reads `rev:` with nothing after it | p1 footer |

## A3 · V400 — applies to `VX5-V400-128`, `VX5-V400-160`, `VX5-V400-192`

Sheet: *V400 8 Bay*. First sheet with the `PMBus 1.2 80+ Platinum` PSU wording and **no DC line**.

| Field | Value to enter | Source |
|---|---|---|
| `power_wattage` | `800W 1+1 redundant PSU PMBus 1.2 80+ Platinum` | p2 · Power Specifications |
| `power_redundancy` | `1+1 redundant` | p2 · Power Specifications |
| `power_max_consumption` | `800W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption |
| `power_ac_input` | `Output @ 100-240V, 10-5A, 50-60Hz` | p2 · Power Specifications |
| `power_dc_input` | *not found on sheet — leave blank* (no DC line printed) | — |
| `cooling` | `3 x 80x25mm PWM & low-power consumption hot swap fans` | p2 · Cooling — **25mm, the only sheet with 80x25** |
| `dimensions_mm` | `680mm (depth) x 430mm (width) x 88mm (height)` | p2 · Dimensions |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship WeightW/ 8x HDDs = 38k/83lbs` | p2 · Weight |
| `warranty_years` | `5` | p2 · Warranty |
| `warranty_terms` | `5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p2 · Warranty |
| `operating_temp` | `10- 30 C / 41 - 86 F` | p2 · Environmental |
| `storage_temp` | `-40 - 65 C / -40 - 149 F` | p2 · Environmental |
| `humidity` | `10 – 90% relative humidity (non-condensing)` | p2 · Environmental |
| `regulatory_safety` | `CE (class A), UKCA, FCC, RCM, UL.` | p2 · Regulatory |
| `regulatory_emissions` | *blank* (§2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p2 · Regulatory |
| `security_features` | the 10-line list (§2a-iii) — **this is the sheet with the comma typo** | p2 · Credential & Key Encryption |
| `remote_mgmt` | `Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection` | p2 · Remote Management |
| `os_drive_desc` | `Mirrored 480GB Enterprise 3D TLC Flash SSD SATA3, Dedicated for OS/VMS, Hot-swap` | p2 · VMS/OS Drive |
| `display_ports` | `VGA (Client View applications not supported on server)` | p2 · Display Ports |
| `revision_date` | **leave blank** — Andy's call 2026-07-28: the `05/12/2025` read is ambiguous (§2a-iv), so this stays empty until the sheet's date convention is confirmed. Every other V400 field is entered | p1 footer `rev: 05/12/2025` |

## A4 · V500 — applies to `VX5-V500-192`, `VX5-V500-240`, `VX5-V500-288`

Sheet: *V500 12 Bay*.

| Field | Value to enter | Source |
|---|---|---|
| `power_wattage` | `800W 1+1 redundant PSU PMBus 1.2 80+ Platinum` | p2 · Power Specifications |
| `power_redundancy` | `1+1 redundant` | p2 · Power Specifications |
| `power_max_consumption` | `800W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption |
| `power_ac_input` | `Output @ 100-240V, 10-5A, 50-60Hz` | p2 · Power Specifications |
| `power_dc_input` | *not found on sheet — leave blank* | — |
| `cooling` | `3 x 80x38mm PWM & low-power consumption hot swap fans` | p2 · Cooling |
| `dimensions_mm` | `680mm (depth) x 430mm (width) x 88mm (height)` | p2 · Dimensions |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship Weight W/ 12x HDDs = 40k/87lbs` | p2 · Weight |
| `warranty_years` | `5` | p2 · Warranty |
| `warranty_terms` | `5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p2 · Warranty |
| `operating_temp` | `10- 30 C / 41 - 86 F` | p2 · Environmental |
| `storage_temp` | `-40 - 65 C / -40 - 149 F` | p2 · Environmental |
| `humidity` | `10 – 90% relative humidity (non-condensing)` | p2 · Environmental |
| `regulatory_safety` | `CE (class A), UKCA, FCC, RCM, UL.` | p2 · Regulatory |
| `regulatory_emissions` | *blank* (§2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p2 · Regulatory |
| `security_features` | the 10-line list (§2a-iii) | p2 · Credential & Key Encryption |
| `remote_mgmt` | `Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection` | p2 · Remote Management |
| `os_drive_desc` | `Mirrored 480GB Enterprise 3D TLC Flash SSD SATA3, Dedicated for OS/VMS, Hot-swap` | p2 · VMS/OS Drive |
| `display_ports` | `VGA (Client View applications not supported on server)` | p2 · Display Ports |
| `revision_date` | `2025-10-01` | p1 footer `rev: 10/01/2025` |

## A5 · V600 — applies to `VX5-V600-256`, `VX5-V600-320`, `VX5-V600-384`

Sheet: *V600 16 Bay*.

| Field | Value to enter | Source |
|---|---|---|
| `power_wattage` | `800W 1+1 redundant PSU PMBus 1.2 80+ Platinum` | p2 · Power Specifications |
| `power_redundancy` | `1+1 redundant` | p2 · Power Specifications |
| `power_max_consumption` | `800W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption |
| `power_ac_input` | `Output @ 100-240V, 10-5A, 50-60Hz` | p2 · Power Specifications |
| `power_dc_input` | *not found on sheet — leave blank* | — |
| `cooling` | `3 x 80x38mm PWM & low-power consumption hot swap fans` | p2 · Cooling |
| `dimensions_mm` | `680mm (depth) x 430mm (width) x 133mm (height)` | p2 · Dimensions |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship Weight W/ 16x HDDs = 42k/90lbs` | p2 · Weight |
| `warranty_years` | `5` | p2 · Warranty |
| `warranty_terms` | `5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p2 · Warranty |
| `operating_temp` | `10- 30 C / 41 - 86 F` | p2 · Environmental |
| `storage_temp` | `-40 - 65 C / -40 - 149 F` | p2 · Environmental |
| `humidity` | `10 – 90% relative humidity (non-condensing)` | p2 · Environmental |
| `regulatory_safety` | `CE (class A), UKCA, FCC, RCM, UL.` | p2 · Regulatory |
| `regulatory_emissions` | *blank* (§2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p2 · Regulatory |
| `security_features` | the 10-line list (§2a-iii) | p2 · Credential & Key Encryption |
| `remote_mgmt` | `Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection` | p2 · Remote Management |
| `os_drive_desc` | `Mirrored 480GB Enterprise 3D TLC Flash SSD, Dedicated for OS/VMS, Hot-swap` | p2 · VMS/OS Drive |
| `display_ports` | `VGA (Client View applications not supported on server)` | p2 · Display Ports |
| `revision_date` | `2025-10-02` | p1 footer `rev: 10/02/2025` |

## A6 · V700 — applies to `VX5-V700-384`, `VX5-V700-480`, `VX5-V700-576`

Sheet: *V700 24 Bay*. First of the two 1200W sheets. **See §2b-vii on the weight.**

| Field | Value to enter | Source |
|---|---|---|
| `power_wattage` | `1200W 1+1 redundant PSU PMBus 1.2 80+ Platinum` | p2 · Power Specifications |
| `power_redundancy` | `1+1 redundant` | p2 · Power Specifications |
| `power_max_consumption` | `1200W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption |
| `power_ac_input` | `100-127VAC 10A 50-60Hz, 800Watt; 200-240VAC 8A, 50-60Hz, 1200Watt` | p2 · Power Specifications (two printed lines) |
| `power_dc_input` | *not found on sheet — leave blank* | — |
| `cooling` | `6 x 80x38mm PWM & low-power consumption hot swap fans` | p2 · Cooling |
| `dimensions_mm` | `430mm (w) x 680 (d) x 175 H` | p2 · Dimensions (units omitted on d and H by the sheet) |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship Weight W/ 36x HDDs = 72k/167lbs` | p2 · Weight — **⚠ the sheet says 36x on a 24-bay box; transcribed as printed** |
| `warranty_years` | `5` | p2 · Warranty |
| `warranty_terms` | `5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p2 · Warranty |
| `operating_temp` | `10- 30 C / 41 - 86 F` | p2 · Environmental |
| `storage_temp` | `-40 - 65 C / -40 - 149 F` | p2 · Environmental |
| `humidity` | `10 – 90% relative humidity (non-condensing)` | p2 · Environmental |
| `regulatory_safety` | `CE (class A), UKCA, FCC, RCM, UL.` | p2 · Regulatory |
| `regulatory_emissions` | *blank* (§2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p2 · Regulatory |
| `security_features` | the 10-line list (§2a-iii) | p2 · Credential & Key Encryption |
| `remote_mgmt` | `Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection` | p2 · Remote Management |
| `os_drive_desc` | `Mirrored 480GB Enterprise 3D TLC Flash SSD SATA3, Dedicated for OS/VMS, Hot-swap` | p2 · VMS/OS Drive |
| `display_ports` | `VGA (Client View applications not supported on server)` | p2 · Display Ports |
| `revision_date` | `2025-10-01` | p1 footer `rev: 10/01/2025` |

## A7 · V800 — applies to `VX5-V800-576`, `VX5-V800-720`, `VX5-V800-864`

Sheet: *V800 36 Bay*.

| Field | Value to enter | Source |
|---|---|---|
| `power_wattage` | `1200W 1+1 redundant PSU PMBus 1.2 80+ Platinum` | p2 · Power Specifications |
| `power_redundancy` | `1+1 redundant` | p2 · Power Specifications |
| `power_max_consumption` | `1200W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption |
| `power_ac_input` | `100-127VAC 10A 50-60Hz, 800Watt; 200-240VAC 8A, 50-60Hz, 1200Watt` | p2 · Power Specifications (two printed lines) |
| `power_dc_input` | *not found on sheet — leave blank* | — |
| `cooling` | `6 x 80x38mm PWM & low-power consumption hot swap fans` | p2 · Cooling |
| `dimensions_mm` | `430mm (w) x 680 (d) x 175 H` | p2 · Dimensions |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship Weight W/ 36x HDDs = 72k/167lbs` | p2 · Weight |
| `warranty_years` | `5` | p2 · Warranty |
| `warranty_terms` | `5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p2 · Warranty |
| `operating_temp` | `10- 30 C / 41 - 86 F` | p2 · Environmental |
| `storage_temp` | `-40 - 65 C / -40 - 149 F` | p2 · Environmental |
| `humidity` | `10 – 90% relative humidity (non-condensing)` | p2 · Environmental |
| `regulatory_safety` | `CE (class A), UKCA, FCC, RCM, UL.` | p2 · Regulatory |
| `regulatory_emissions` | *blank* (§2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p2 · Regulatory |
| `security_features` | the 10-line list (§2a-iii) | p2 · Credential & Key Encryption |
| `remote_mgmt` | `Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection` | p2 · Remote Management |
| `os_drive_desc` | `Mirrored 480GB Enterprise 3D TLC Flash SSD, Dedicated for OS/VMS, Hot-swap` | p2 · VMS/OS Drive |
| `display_ports` | `VGA (Client View applications not supported on server)` | p2 · Display Ports |
| `revision_date` | `2025-10-01` | p1 footer `rev: 10/01/2025` |

---

# Part B — `appliance_specs`: 7 new rows, all 62 fields

Route: `/admin/appliance-specs/new`, once per row. The table is empty, so every field below is
being set for the first time. Suggested order: **V250 → V255 → V260 → V265 → V150 → SW10 → SW20**
— it enters the paired sheets adjacently, so the cross-row `sheet_group` panel has something to
check the moment the second row of each pair lands.

Nine fields are required (the form will refuse a blank): `id`, `model_name`, `product_group`,
`family_type`, `sheet_group`, `cpu_model`, `ram_spec`, `os_edition`, `form_factor`. All nine have
a sheet value on all seven rows.

**Identity fields are not factsheet fields.** `id`, `product_group`, `family_type`, `sheet_group`
and `model_name` come from `products.sku` / `families.ts` / the ADR's archetype call, not from a
sheet block. They are marked *repo* below so you can see which values a sheet actually backs.
`model_name` in particular is a naming choice — I have proposed one built from the sheet's own
title; change it if you prefer the `products.product_name` wording.

Values shared by all five **server** rows (V150 / V250 / V255 / V260 / V265) — not the two
workstations:

| Field | Value | Source |
|---|---|---|
| `os_edition` | `Microsoft Windows Server Workgroup 2022 or 2025 (LTSC)` | p2 · OS |
| `network` | `2x (Two) Enterprise 10Gb Eth RJ45 ports + 1Gb IPMI` | p2 · Network |
| `gbe_10_ports` | `2` | p2 · Network |
| `gbe_1_ports` | *blank* — the only 1Gb port on the sheet is the IPMI/management port, which `remote_mgmt` already carries. (`families.ts` marketing copy claims "2x 1Gb Ethernet Ports"; the factsheet does not.) | — |
| `sfp_addon` | *not found on any appliance sheet — leave blank* (the SFP upgrade line appears only on V400–V800) | — |
| `remote_mgmt` | `Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection` | p2 · Remote Management |
| `display_ports` | `VGA (Client View applications not supported on server)` | p2 · Display Ports |
| `form_factor` | `Standard 19" Rackmount w/Rails 1U height` | p2 · Form Factor |
| `rack_units` | `1U` | p2 · Form Factor |
| `warranty_years` | `5` | p2 · Warranty |
| `warranty_terms` | `5 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p2 · Warranty |
| `operating_temp` | `10- 30 C / 41 - 86 F` | p2 · Environmental |
| `storage_temp` | `-40 - 65 C / -40 - 149 F` | p2 · Environmental |
| `humidity` | `10 – 80% relative humidity (non-condensing)` | p2 · Environmental |
| `regulatory_safety` | `CE (class A), UKCA, FCC, RCM, UL.` | p2 · Regulatory |
| `regulatory_emissions` | *blank* (§2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p2 · Regulatory |
| `security_features` | the 10-line list (§2a-iii) | p2 · Credential & Key Encryption |
| `max_bandwidth_mbps` | *not found on any server sheet — leave blank* (only SW10/SW20 print a Maximum Bandwidth block) | — |
| `revision_date` | *blank* — none of the five server sheets prints a date (§2a-iv) | — |
| Workstation section — `gpu_model`, `gpu_count`, `gpu_vram`, `gpu_cuda_cores`, `gpu_tensor_cores`, `gpu_rt_cores`, `gpu_encoders`, `gpu_decoders`, `monitor_support`, `front_io`, `rear_io`, `camera_matrix` | *leave all 12 blank.* The section hides itself on a `management`/`acm` row, so there is nothing to type — but anything already in it saves and warns, so do not paste server values here | — |

## B1 · `VX5-V250-MGM`

Sheet: *V5 V250/255 Management Server*. Per-variant lines are marked `V250 =`.

**Identity & sheet**

| Field | Value | Source |
|---|---|---|
| `id` | `VX5-V250-MGM` | *repo* — `products.sku` |
| `model_name` | `VideoX V5 V250 Management Server` | proposed; p1 reads `VideoX© V5 V250 MGT`, p2 `V5 V250/255 Management Server` |
| `product_group` | `V250` | *repo* — `products.product_group`, matches `families.ts` |
| `family_type` | `management` | *repo* — ADR 0090 archetype |
| `sheet_group` | `V250` | *repo* — shares its sheet with `VX5-V255-MGM` |

**Compute**

| Field | Value | Source |
|---|---|---|
| `cpu_model` | `5th Generation Zen5 AMD EPYC 4245` | p2 · CPU, `V250 =` line |
| `cores_threads` | `6C/12T` | p2 · CPU, `V250 =` line |
| `cpu_cache` | `32MB Cache` | p2 · CPU, `V250 =` line |
| `cpu_base_ghz` | `3.9Ghz` | p2 · CPU — first of the unlabelled pair `3.9Ghz/5.1Ghz` (§2a-v) |
| `cpu_turbo_ghz` | `5.1Ghz` | p2 · CPU — second of the pair |
| `ram_spec` | `16GB DRAM DDR5 (minimum)` | p2 · RAM, `V250 =` line |

**OS & storage**

| Field | Value | Source |
|---|---|---|
| `os_edition` | `Microsoft Windows Server Workgroup 2022 or 2025 (LTSC)` | p2 · OS |
| `storage_summary` | `NA` | p2 · Storage Capacties — literally `NA`, exactly the case the field's hint describes |
| `os_drive_desc` | `2x Mirrored, Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS — V250 = 2x 480GB` | p2 · VMS/OS Drive |
| `db_drive_desc` | `2x Mirrored, hot-swap DB SSD` | **p1 · Key Attributes only** — this sheet has no page-2 DB drive block (the V260 sheet does) |
| `drive_bays` | `4` | p1 hero bullets · `4 Bay 1U Rack w/ rails` |

**Availability & RAID**

| Field | Value | Source |
|---|---|---|
| `raid_support` | `Hardware RAID 5 Fault Tolerance w/ HW XOR Engine, CacheVault protection, patrol read repairs` | p2 · RAID, verbatim |
| `raid_level_display` | **your call — see §2b-viii.** p2 says RAID 5; p1 and the drive layout say mirrored (`1`). I have not picked one. | p2 · RAID vs p1 hero bullets |
| `battery_raid` | `CacheVault protection` | p2 · RAID — same block as `raid_support`; enter only if you want it split out, otherwise blank |
| `os_redundancy` | `Mirrored, Hot Swap` | p2 · VMS/OS Drive — same block as `os_drive_desc`; split-or-blank, your call |
| `hotswap_power` | `N+1 hot-swap power, cooling & drives` | p1 hero bullets |

**Networking & management** — all six values from the shared server table above.

**Form factor & power**

| Field | Value | Source |
|---|---|---|
| `form_factor` | `Standard 19" Rackmount w/Rails 1U height` | p2 · Form Factor |
| `rack_units` | `1U` | p2 · Form Factor |
| `power_wattage` | `800W 1+1 redundant PSU` | p2 · Power Specifications |
| `power_redundancy` | `1+1 redundant` | p2 · Power Specifications |
| `power_max_consumption` | `800W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption |
| `power_ac_input` | `100-240V~/ 10-5A, 50-60Hz` | p2 · Power Specifications |
| `power_dc_input` | `240Vdc/ 4A` | p2 · Power Specifications — the field hint is right that the V250 prints DC |
| `cooling` | `5 x 40x40x56mm (29,700rpm)` | p2 · Cooling |

**Physical**

| Field | Value | Source |
|---|---|---|
| `dimensions_mm` | `710mm (depth) x 438mm (width) x 44mm (height)` | p2 · Dimensions |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship WeightW/ 4x SSDs = 24k/40lbs` | p2 · Weight |

**Warranty / Environmental / Regulatory & security** — from the shared server table above.

**Meta**

| Field | Value | Source |
|---|---|---|
| `revision_date` | *blank* — footer reads `rev:` with nothing after it | p1 footer |
| `notes` | Suggested: `Sheet contradicts itself on RAID: p2 RAID block says "Hardware RAID 5 Fault Tolerance", p1 says "HW RAID Mirrored SSDs" and the 2+2 SSD layout is mirroring. DB drive detail is on p1 Key Attributes only — no p2 DB block on this sheet. Sheet footer carries no rev date.` | — |

## B2 · `VX5-V255-MGM`

Same sheet as B1, `V255 =` lines. **Everything not listed here is identical to B1**, including
power, cooling, dimensions, weight, RAID prose, environmental and regulatory — one sheet, one
chassis, two CPU/RAM configurations.

| Field | Value | Source |
|---|---|---|
| `id` | `VX5-V255-MGM` | *repo* |
| `model_name` | `VideoX V5 V255 Management Server` | proposed; p2 title covers both variants |
| `product_group` | `V255` | *repo* |
| `family_type` | `management` | *repo* |
| `sheet_group` | `V250` | *repo* — **the pairing; not `V255`.** This is the row that proves the cross-row check works |
| `cpu_model` | `5th Generation Zen5 AMD EPYC 4465` | p2 · CPU, `V255 =` line |
| `cores_threads` | `6C/24T` | p2 · CPU, `V255 =` line — **⚠ printed as 6C/24T; almost certainly a typo for 12C/24T. Transcribed as printed (§2b-ix)** |
| `cpu_cache` | `64MB Cache` | p2 · CPU, `V255 =` line |
| `cpu_base_ghz` | `3.4Ghz` | p2 · CPU — first of `3.4Ghz/5.4Ghz` |
| `cpu_turbo_ghz` | `5.4Ghz` | p2 · CPU |
| `ram_spec` | `32GB DRAM DDR5 (minimum)` | p2 · RAM, `V255 =` line |
| `os_drive_desc` | `2x Mirrored, Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS — V255 = 2x 960GB` | p2 · VMS/OS Drive |
| `notes` | Suggested: same RAID-contradiction note as the V250, plus `Sheet prints CPU as "6C/24T" and TDP as "65W TD12" — both read as typos (12C/24T, 65W TDP); transcribed as printed. Shares sheet group V250 with VX5-V250-MGM.` | — |

**Copy from B1 unchanged**, field by field so none is missed: `storage_summary` (`NA`),
`db_drive_desc`, `drive_bays` (`4`), `raid_support`, `raid_level_display` (same open question),
`battery_raid`, `os_redundancy`, `hotswap_power`, `power_wattage`, `power_redundancy`,
`power_max_consumption`, `power_ac_input`, `power_dc_input`, `cooling`, `dimensions_mm`,
`dimensions_in` (blank), `shipping_weight`, `form_factor`, `rack_units`, plus everything in the
shared server table (`os_edition`, `network`, `gbe_1_ports`, `gbe_10_ports`, `sfp_addon`,
`remote_mgmt`, `display_ports`, `warranty_years`, `warranty_terms`, `operating_temp`,
`storage_temp`, `humidity`, `regulatory_safety`, `regulatory_emissions`, `ndaa_text`,
`security_features`, `max_bandwidth_mbps`) and a blank `revision_date`. The 12 Workstation fields
stay blank — the section is hidden on a `management` row.

## B3 · `VX5-V260-ACM`

Sheet: *V5 V260/V270 ACM*. Per-variant lines marked `V260`.

**Identity & sheet**

| Field | Value | Source |
|---|---|---|
| `id` | `VX5-V260-ACM` | *repo* |
| `model_name` | `VideoX V5 V260 ACM` | proposed; p1 reads `VideoX © V5 V260/V270` |
| `product_group` | `V260` | *repo* |
| `family_type` | `acm` | *repo* — sheet is titled *Enterprise Servers for Access Control Management* |
| `sheet_group` | `V260` | *repo* — shares its sheet with `VX5-V265-ACM` |

**Compute**

| Field | Value | Source |
|---|---|---|
| `cpu_model` | `5th Generation Zen5 AMD EPYC` | p2 · CPU — **the sheet gives no part number on this sheet**, only the core/cache split per variant |
| `cores_threads` | `6C/12T` | p2 · CPU, `V260` line |
| `cpu_cache` | `32MB Cache` | p2 · CPU, `V260` line |
| `cpu_base_ghz` | `3.9Ghz` | p2 · CPU — first of `3.9Ghz/5.1Ghz` |
| `cpu_turbo_ghz` | `5.1Ghz` | p2 · CPU |
| `ram_spec` | `16GB DRAM DDR5 (minimum)` | p2 · RAM, `V260` line |

**OS & storage**

| Field | Value | Source |
|---|---|---|
| `os_edition` | `Microsoft Windows Server Workgroup 2022 or 2025 (LTSC)` | p2 · OS |
| `storage_summary` | *not found on sheet — leave blank* (this sheet has no Storage Capacties block at all, unlike the V250/V150 which print `NA`) | — |
| `os_drive_desc` | `2x Mirrored, 480GB Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS` | p2 · VMS/OS Drive |
| `db_drive_desc` | `2x Mirrored, 480GB Enterprise 3D TLC Flash SSD, Hot Swap Operation, tool-less Hot-swap` | p2 · **Data SSDs** — this sheet does have its own page-2 block |
| `drive_bays` | *not found on sheet — leave blank.* No bay count printed; the Weight line says `W/ 4x HDDs` and the drive blocks total 4, but neither states a bay count | — |

**Availability & RAID**

| Field | Value | Source |
|---|---|---|
| `raid_support` | `Hardware RAID Mirroring, CacheVault protection, patrol read repairs` | p2 · RAID, verbatim |
| `raid_level_display` | `1` (RAID 1 — mirror) | p2 · RAID — the sheet says `Mirroring` in words, so unlike the V250 this one is unambiguous |
| `battery_raid` | `CacheVault protection` | p2 · RAID — split-or-blank, same convention as B1 |
| `os_redundancy` | `Mirrored, Hot Swap` | p2 · VMS/OS Drive — split-or-blank |
| `hotswap_power` | `N+1 hot-swap power, cooling & drives` | p1 hero bullets |

**Networking & management** — from the shared server table.

**Form factor & power**

| Field | Value | Source |
|---|---|---|
| `form_factor` | `Standard 19" Rackmount w/Rails 1U height` | p2 · Form Factor |
| `rack_units` | `1U` | p2 · Form Factor |
| `power_wattage` | `800W 1+1 redundant PSU` | p2 · Power Specifications |
| `power_redundancy` | `1+1 redundant` | p2 · Power Specifications |
| `power_max_consumption` | `800W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption |
| `power_ac_input` | `100-240V~/ 10-5A, 50-60Hz` | p2 · Power Specifications |
| `power_dc_input` | `240Vdc/ 4A` | p2 · Power Specifications — **the field hint says "only the V250 sheet"; the V260, V150 and V200 sheets print it too** |
| `cooling` | `5 x 40x40x56mm (29,700rpm)` | p2 · Cooling |

**Physical**

| Field | Value | Source |
|---|---|---|
| `dimensions_mm` | `710mm (depth) x 438mm (width) x 44mm (height)` | p2 · Dimensions |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship WeightW/ 4x HDDs = 27k/45lbs` | p2 · Weight (the drives are SSDs; the sheet says HDDs) |

**Warranty / Environmental / Regulatory & security** — from the shared server table.

**Meta**

| Field | Value | Source |
|---|---|---|
| `revision_date` | *blank* — footer reads `rev:` with nothing after it | p1 footer |
| `notes` | Suggested: `Sheet is titled V260/V270; the V265 SKU maps to this sheet's V270 column (see build-step-6 reference §2b-vi). CPU part number not printed on this sheet. No Storage Capacties block. Max door support: "Up to 500 door support" (p1 Key Attributes) has no column yet — deferred ACM schema, ADR 0097 §1.` | — |

Note on `max_doors`: p1 states *"Up to 500 door support"* and *"Maximum door support is ACM &
configuration dependant"*. There is deliberately **no column** for it — ACM-specific schema stays
deferred per ADR 0097 §1. Do not try to squeeze it into another field; the `notes` line above is
where it lives until that phase.

## B4 · `VX5-V265-ACM`

⚠ **Read §2b-vi before entering this row.** Same sheet as B3, but its second variant is printed
as **V270**, not V265. Every value below marked `⚠ V270 column` is that mapping.

**Everything not listed here is identical to B3** — one sheet, one chassis.

| Field | Value | Source |
|---|---|---|
| `id` | `VX5-V265-ACM` | *repo* |
| `model_name` | `VideoX V5 V265 ACM` | proposed; `products.product_name` calls it *Enterprise Tier* |
| `product_group` | `V265` | *repo* |
| `family_type` | `acm` | *repo* |
| `sheet_group` | `V260` | *repo* — the pairing |
| `cpu_model` | `5th Generation Zen5 AMD EPYC` | p2 · CPU — no part number printed |
| `cores_threads` | `12C/24T` | p2 · CPU — ⚠ V270 column |
| `cpu_cache` | `64MB Cache` | p2 · CPU — ⚠ V270 column |
| `cpu_base_ghz` | `3.4Ghz` | p2 · CPU — ⚠ V270 column, first of `3.4Ghz/5.4Ghz` |
| `cpu_turbo_ghz` | `5.4Ghz` | p2 · CPU — ⚠ V270 column |
| `ram_spec` | `32GB DRAM DDR5 (minimum)` | p2 · RAM — ⚠ V270 column |
| `db_drive_desc` | `2x Mirrored, 960GB Enterprise 3D TLC Flash SSD, Hot Swap Operation, tool-less Hot-swap` | p2 · Data SSDs — ⚠ the `(V270 = 960GB)` parenthetical |
| `os_drive_desc` | `2x Mirrored, 480GB Enterprise 3D TLC Flash SSD, Hot Swap, Dedicated for OS/VMS` | p2 · VMS/OS Drive — **not** varied by the sheet; 480GB on both variants |
| `notes` | Suggested: `Values taken from this sheet's V270 column — the sheet is titled V260/V270 and has no V265 column. Confirm the V270-is-V265 mapping or get a V265 sheet. CPU part number not printed.` | — |

**Copy from B3 unchanged**, field by field: `storage_summary` (blank), `drive_bays` (blank),
`raid_support`, `raid_level_display` (`1`), `battery_raid`, `os_redundancy`, `hotswap_power`,
`power_wattage`, `power_redundancy`, `power_max_consumption`, `power_ac_input`, `power_dc_input`,
`cooling`, `dimensions_mm`, `dimensions_in` (blank), `shipping_weight`, `form_factor`,
`rack_units`, plus everything in the shared server table (`os_edition`, `network`, `gbe_1_ports`,
`gbe_10_ports`, `sfp_addon`, `remote_mgmt`, `display_ports`, `warranty_years`, `warranty_terms`,
`operating_temp`, `storage_temp`, `humidity`, `regulatory_safety`, `regulatory_emissions`,
`ndaa_text`, `security_features`, `max_bandwidth_mbps`) and a blank `revision_date`. The 12
Workstation fields stay blank — the section is hidden on an `acm` row.

## B5 · `VX5-V150-ACM`

Sheet: *V5 V150 ACM — Value Access Control Manager Server*, its own dedicated 2-page sheet.
Single-SKU sheet, so `sheet_group` is its own.

**Identity & sheet**

| Field | Value | Source |
|---|---|---|
| `id` | `VX5-V150-ACM` | *repo* |
| `model_name` | `VideoX V5 V150 ACM` | proposed; p1 reads `VideoX© V5 V150 ACM` |
| `product_group` | `V150` | *repo* — `families.ts` V100 tier section |
| `family_type` | `acm` | *repo* — **this is the entry-time call ADR 0097 §4a moved out of the migration.** The sheet is titled *V5 V150 ACM / Access Control Server* throughout, so `acm` is what the sheet supports over `management`, despite the Price Book naming it *"Access Control ~ Value Management Server"* |
| `sheet_group` | `V150` | *repo* — single-SKU sheet |

**Compute**

| Field | Value | Source |
|---|---|---|
| `cpu_model` | `5th Generation Zen5 AMD EPYC 4245` | p2 · CPU |
| `cores_threads` | `6C/12T` | p2 · CPU |
| `cpu_cache` | `32MB Cache` | p2 · CPU |
| `cpu_base_ghz` | `3.9Ghz` | p2 · CPU — first of `3.9Ghz/5.1Ghz` |
| `cpu_turbo_ghz` | `5.1Ghz` | p2 · CPU |
| `ram_spec` | `8GB DRAM DDR5` | p2 · RAM — **8GB, the smallest of the seven; p1 Key Attributes agrees** |

**OS & storage**

| Field | Value | Source |
|---|---|---|
| `os_edition` | `Microsoft Windows Server Workgroup 2022 or 2025 (LTSC)` | p2 · OS |
| `storage_summary` | `NA` | p2 · Storage Capacties — literally `NA` |
| `os_drive_desc` | `Dedicated 480GB Enterprise 3D TLC Flash SSD, Dedicated for OS/ACM, Certified 24/7 Operation, tool-less Hot-swap` | p2 · VMS/OS Drive — **singular, not mirrored.** Note `families.ts` `skuExtraData` publishes `ssdStorage: "2x 480GB"` for this SKU, which the sheet does not support; worth reconciling when the override retires |
| `db_drive_desc` | *not found on sheet — leave blank.* No DB/Data SSD block and no p1 DB bullet on this sheet | — |
| `drive_bays` | *not found on sheet — leave blank.* p1 says only `1U Rack w/ rails`, no bay count | — |

**Availability & RAID**

| Field | Value | Source |
|---|---|---|
| `raid_support` | *not found on sheet — leave blank.* This sheet has **no RAID block** (single OS SSD, no array) | — |
| `raid_level_display` | *blank* — no array. The field is optional; `— none —` is correct | — |
| `battery_raid` | *not found on sheet — leave blank* | — |
| `os_redundancy` | *not found on sheet — leave blank.* The OS drive is single, not mirrored | — |
| `hotswap_power` | *not found on sheet — leave blank.* p1 says `Single Power Supply`; the OS drive is `tool-less Hot-swap` but that is a drive, not power | — |

**Networking & management** — from the shared server table.

**Form factor & power**

| Field | Value | Source |
|---|---|---|
| `form_factor` | `Standard 19" Rackmount w/Rails 1U height` | p2 · Form Factor |
| `rack_units` | `1U` | p2 · Form Factor |
| `power_wattage` | `600W PSU` | p2 · Power Specifications — **600W, the only non-800W server** |
| `power_redundancy` | *blank — the sheet contradicts itself (§2b-ix).* p1 says `Single Power Supply`; Power Specifications says `600W PSU` with no redundancy word; Max Power Consumption says `hot-plug redundant`. Record it in `notes` rather than picking | p1 vs p2 |
| `power_max_consumption` | `600W up to 80% efficient (Platinum) hot-plug redundant` | p2 · Max Power Consumption, verbatim including the contradictory `redundant` |
| `power_ac_input` | `100-240V~/ 10-5A, 50-60Hz` | p2 · Power Specifications |
| `power_dc_input` | `240Vdc/ 4A` | p2 · Power Specifications |
| `cooling` | `4 x 40x40x56mm (29,700rpm) / 2 x 40x40x56mm (32,000rpm) all 6- hot swap` | p2 · Cooling (two printed lines — same two-line pattern as the V100) |

**Physical**

| Field | Value | Source |
|---|---|---|
| `dimensions_mm` | `710mm (depth) x 438mm (width) x 44mm (height)` | p2 · Dimensions |
| `dimensions_in` | *not found on sheet — leave blank* | — |
| `shipping_weight` | `Ship Weight = 22k/40lbs` | p2 · Weight — no drive-count qualifier on this sheet |

**Warranty / Environmental / Regulatory & security** — from the shared server table.

**Meta**

| Field | Value | Source |
|---|---|---|
| `revision_date` | *blank* — footer reads `rev:` with nothing after it | p1 footer |
| `notes` | Suggested: `Own dedicated sheet (Arxys-VideoX-Factsheet-V150-ACM-V5.pdf), found 2026-07-28 — families.ts carries no V150 datasheet URL. Sheet contradicts itself on power: p1 "Single Power Supply", Power Spec "600W PSU", Max Power Consumption "hot-plug redundant"; power_redundancy left blank. No RAID block — single OS SSD, no array. Sheet shows ONE 480GB OS SSD; families.ts skuExtraData publishes "2x 480GB". Max door support: "Up to 100 Access Doors" (p1) — no column, deferred ACM schema. Classified acm not management on the sheet's own branding.` | — |

## B6 · `VX5-SW10-100`

Sheet: *SW10 Workstation*, single page, cited **p1**. First of the two `workstation` rows — the
Workstation section is visible and must be filled.

**Identity & sheet**

| Field | Value | Source |
|---|---|---|
| `id` | `VX5-SW10-100` | *repo* |
| `model_name` | `VideoX V5 SW10 Security Workstation` | proposed; sheet header reads `SW10 Workstation` |
| `product_group` | `SW10` | *repo* |
| `family_type` | `workstation` | *repo* |
| `sheet_group` | `SW10` | *repo* — single-SKU sheet |

**Compute**

| Field | Value | Source |
|---|---|---|
| `cpu_model` | `AMD Ryzen 7 9700X` | p1 · CPU |
| `cores_threads` | `8C/16T` | p1 · CPU |
| `cpu_cache` | `32MB Cache` | p1 · CPU |
| `cpu_base_ghz` | `3.8Ghz` | p1 · CPU — first of `3.8Ghz/5.5Ghz` |
| `cpu_turbo_ghz` | `5.5Ghz` | p1 · CPU |
| `ram_spec` | `16GB DDR5` | p1 · RAM — **⚠ the hero bullet says `8GB RAM DDR5`; the RAM block says 16GB. Detail block wins (§2b-ix)** |

**OS & storage**

| Field | Value | Source |
|---|---|---|
| `os_edition` | `Microsoft Windows 11 IoT Enterprise (LTSC)` | p1 · OS |
| `storage_summary` | *not found on sheet — leave blank.* No Storage Capacties block; the Hard Drives block describes an optional upgrade, not a capacity | — |
| `os_drive_desc` | `Dedicated 480GB Enterprise 3D TLC Flash SSD NVMe, Dedicated for OS/VMS.` | p1 · VMS/OS Drive |
| `db_drive_desc` | *leave blank* — workstations have no DB drive, and filling it fires a warning | — |
| `drive_bays` | *not found on sheet — leave blank* | — |

**Availability & RAID** — all five blank.

| Field | Value | Source |
|---|---|---|
| `raid_support` | *not found on sheet — leave blank.* No RAID block (tower, no array) | — |
| `raid_level_display` | *blank* — `— none —` | — |
| `battery_raid` | *not found on sheet — leave blank* | — |
| `os_redundancy` | *not found on sheet — leave blank.* The OS drive is `Dedicated`, i.e. single | — |
| `hotswap_power` | *not found on sheet — leave blank* | — |

**Networking & management**

| Field | Value | Source |
|---|---|---|
| `network` | `2 x 10Gb Ethernet (10 Gbps/5 Gbps/2.5 Gbps/1 Gbps/100 Mbps) RJ45 ports` | p1 · Network |
| `gbe_1_ports` | *not found on sheet — leave blank.* The two ports are 10Gb multi-rate, not separate 1Gb ports | — |
| `gbe_10_ports` | `2` | p1 · Network |
| `sfp_addon` | *not found on sheet — leave blank* | — |
| `max_bandwidth_mbps` | `125` | p1 · Maximum Bandwidth — `125Mb/s maximum bandwidth for video decoding and display`. **This is where the `bandwidth: "125 Mbit/s"` Price Book override retires to** |
| `remote_mgmt` | *not found on sheet — leave blank.* No Remote Management block (workstation, no IPMI) | — |
| `display_ports` | textarea, four lines: | p1 · Display Ports |

```
Primary Ports from GPUS:
4x Mini DP with 4x Mini DP to DP Adapters included
AMD Radeon™ Graphics support:
- 1 x USB Type-C® port with DisplayPort video output
- 1 x HDMI port
```

**Form factor & power**

| Field | Value | Source |
|---|---|---|
| `form_factor` | `Performance Tower, with enhanced cooling, EPEAT Bronze certified` | p1 · Form Factor |
| `rack_units` | *blank* — tower, exactly the case the field's hint names | — |
| `power_wattage` | `Up to 850W Gold ATX Power Supply` | p1 · Power Specifications |
| `power_redundancy` | *not found on sheet — leave blank.* Single ATX supply; no redundancy stated | — |
| `power_max_consumption` | `850W up to 80% efficient (Gold)` | p1 · Max Power Consumption |
| `power_ac_input` | `100-240Vac, 9-4.5A, 50-60Hz` | p1 · Power Specifications — the parenthetical on the PSU line (the sheet's trailing comma dropped) |
| `power_dc_input` | *not found on sheet — leave blank* | — |
| `cooling` | *not found on sheet — leave blank.* No Cooling block; Form Factor says only `with enhanced cooling`, which is already captured there | — |

**Physical** — the only sheets that print inches.

| Field | Value | Source |
|---|---|---|
| `dimensions_mm` | `470 x 230 x 518.5mm` | p1 · Dimensions |
| `dimensions_in` | `18.5" x 9.6" x 20.3" inches` | p1 · Dimensions — **the one sheet with an inches figure**; the sheet prints `x20.3”` unspaced |
| `shipping_weight` | `Gross Weight : 9.6 Kg, 24.5lb` | p1 · Weight |

**Warranty**

| Field | Value | Source |
|---|---|---|
| `warranty_years` | `3` | p1 · Warranty — **3, not 5**, exactly as the field's hint says |
| `warranty_terms` | `3 Years Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).` | p1 · Warranty |

**Environmental**

| Field | Value | Source |
|---|---|---|
| `operating_temp` | `10- 35 C` | p1 · Environmental — **35 C, and no Fahrenheit**, unlike the server sheets |
| `storage_temp` | *not found on sheet — leave blank*, exactly as the field's hint predicts | — |
| `humidity` | `20 – 90% relative humidity (non-condensing)` | p1 · Environmental — **20% floor**, not the servers' 10% |

**Regulatory & security**

| Field | Value | Source |
|---|---|---|
| `regulatory_safety` | `BSMI, CE, FCC(Class B), Energy Star.` | p1 · Safety & Emission Standards — **a different list from the servers'** |
| `regulatory_emissions` | *blank* (§2a-ii) | — |
| `ndaa_text` | `NDAA Compliant, no disclosures` | p1 · Trade Compliance |
| `security_features` | *leave the textarea empty.* No Credential & Key Encryption block on this sheet — saves as `[]`, not null | — |

**Workstation**

| Field | Value | Source |
|---|---|---|
| `gpu_model` | `Nvidia A1000` | p1 · GPU's |
| `gpu_count` | `1` | p1 · GPU's — `1x Nvidia A1000 GPU` |
| `gpu_vram` | `8 GB GDDR6 with ECC - 128-bit - 192 GB/sec` | p1 · GPU's |
| `gpu_cuda_cores` | `2307` | p1 · GPU's |
| `gpu_tensor_cores` | `72` | p1 · GPU's |
| `gpu_rt_cores` | `18` | p1 · GPU's |
| `gpu_encoders` | `1` | p1 · GPU's — `1x Encode` |
| `gpu_decoders` | `2` | p1 · GPU's — `2x Decode` |
| `monitor_support` | `Up to 4x Monitors (monitors not included). VMS and configuration dependant.` | p1 · Monitor Support |
| `front_io` | `2 x USB 3.2 Gen 2x2 Type-C, 2 x USB 3.0, HD Audio` | p1 · Front IO Ports |
| `rear_io` | textarea, two lines: `3 x USB 3.2 Gen 2 Type-A ports (red), 4 x USB 3.2 Gen 1 ports` / `4 x USB 2.0/1.1 ports` | p1 · Rear IO Ports |

`camera_matrix` — four rows, in the row editor's five columns. **`fps` is not in the table**: the
table's third column header reads *"FPS"* but holds codec values; the frame rate comes from the
note above it, *"Performance parameters = 4MP & 8MP cameras @15fps on 4 monitors"*. This is the
trap the design flagged.

| Resolution | Codec | FPS | Cameras | Bandwidth (Mbps) |
|---|---|---|---|---|
| `4MP` | `H.264` | `15` | `28` | `125` |
| `4MP` | `H.265` | `15` | `48` | `125` |
| `8MP` | `H.264` | `15` | `16` | `108` |
| `8MP` | `H.265` | `15` | `32` | `125` |

Source: p1 · *Camera Count Matrix - 125Mb/s* table, plus the `@15fps` footnote for the FPS
column. The Bandwidth column is printed as `125Mb/s` / `108Mb/s`; the field is an integer, so
enter the number only.

**Meta**

| Field | Value | Source |
|---|---|---|
| `revision_date` | *blank* — this sheet prints no `rev:` stamp at all | — |
| `notes` | Suggested: `Hero bullet says 8GB RAM; RAM block says 16GB DDR5 — entered 16GB (families.ts agrees). Camera matrix column header reads "FPS" but holds codec values; fps 15 comes from the "@15fps" footnote. Only sheet family that prints an inches dimension. No Credential & Key Encryption, RAID, Cooling, Storage Capacties, Remote Management or Storage Temperature block. No rev stamp.` | — |

## B7 · `VX5-SW20-200`

Sheet: *SW20 Workstation*, single page. **Differs from B6 only in the fields below** — same
chassis, same PSU, same dimensions, same weight, same environmental and regulatory values, same
CPU, same absent blocks.

| Field | Value | Source |
|---|---|---|
| `id` | `VX5-SW20-200` | *repo* |
| `model_name` | `VideoX V5 SW20 Security Workstation` | proposed; sheet header reads `SW20 Workstation` |
| `product_group` | `SW20` | *repo* |
| `family_type` | `workstation` | *repo* |
| `sheet_group` | `SW20` | *repo* — **its own group, not `SW10`.** Two separate physical sheets, so this is not a pair |
| `cpu_model` | `AMD Ryzen 7 9700X` | p1 · CPU |
| `cores_threads` | `8C/16T` | p1 · CPU |
| `cpu_cache` | `32MB Cache` | p1 · CPU — this sheet also prints `65W`, which the SW10 sheet omits |
| `ram_spec` | `16GB DDR5` | p1 · RAM — **hero bullet and RAM block agree here**, unlike the SW10 |
| `max_bandwidth_mbps` | `225` | p1 · Maximum Bandwidth — retires the `bandwidth: "225 Mbit/s"` override |
| `monitor_support` | `Up to 8x Monitors (monitors not included). VMS and configuration dependant. More than 4 monitors may reduce total bandwidth.` | p1 · Monitor Support |
| `gpu_count` | `2` | p1 · GPU's — `2x Nvidia A1000 GPU's` |
| `display_ports` | as B6 but with `8x Mini DP` on the first port line — see below | p1 · Display Ports |

```
Primary Ports from GPUS:
8x Mini DP with 4x Mini DP to DP Adapters included
AMD Radeon™ Graphics support:
- 1 x USB Type-C® port with DisplayPort video output
- 1 x HDMI port
```

⚠ The sheet prints `8x Mini DP with 4x Mini DP to DP Adapters included` — eight ports, four
adapters. Transcribed as printed; flag it if the adapter count is wrong.

`gpu_model`, `gpu_vram`, `gpu_cuda_cores` (`2307`), `gpu_tensor_cores` (`72`), `gpu_rt_cores`
(`18`), `gpu_encoders` (`1`), `gpu_decoders` (`2`) — **identical strings to B6.** The sheet states
these once for a 2-GPU box, so they are per-GPU figures; enter them as printed rather than
doubling.

`camera_matrix` — four rows, different numbers from the SW10:

| Resolution | Codec | FPS | Cameras | Bandwidth (Mbps) |
|---|---|---|---|---|
| `4MP` | `H.264` | `15` | `48` | `225` |
| `4MP` | `H.265` | `15` | `64` | `147` |
| `8MP` | `H.264` | `15` | `20` | `202` |
| `8MP` | `H.265` | `15` | `48` | `225` |

Source: p1 · *Camera Count Matrix - Up to 225Mb/s* table, plus the same `@15fps` footnote.

| Field | Value |
|---|---|
| `notes` | Suggested: `Display Ports says 8x Mini DP with only 4x adapters included — as printed. GPU per-unit figures (2307 CUDA / 72 Tensor / 18 RT / 1 encode / 2 decode) are stated once for a 2-GPU box; entered per-GPU, not doubled. Camera matrix "FPS" header holds codec values; fps 15 from the "@15fps" footnote. Own sheet group SW20 — the SW sheets are two separate PDFs, not a pair.` |

**Copy from B6 unchanged**, field by field: `cpu_base_ghz` (`3.8Ghz`), `cpu_turbo_ghz` (`5.5Ghz`),
`os_edition`, `storage_summary` (blank), `os_drive_desc`, `db_drive_desc` (blank), `drive_bays`
(blank), `raid_support` (blank), `raid_level_display` (blank), `battery_raid` (blank),
`os_redundancy` (blank), `hotswap_power` (blank), `network`, `gbe_1_ports` (blank), `gbe_10_ports`
(`2`), `sfp_addon` (blank), `remote_mgmt` (blank), `form_factor`, `rack_units` (blank),
`power_wattage`, `power_redundancy` (blank), `power_max_consumption`, `power_ac_input`,
`power_dc_input` (blank), `cooling` (blank), `dimensions_mm`, `dimensions_in`, `shipping_weight`,
`warranty_years` (`3`), `warranty_terms`, `operating_temp`, `storage_temp` (blank), `humidity`,
`regulatory_safety`, `regulatory_emissions` (blank), `ndaa_text`, `security_features` (empty),
`gpu_model`, `gpu_vram`, `gpu_cuda_cores`, `gpu_tensor_cores`, `gpu_rt_cores`, `gpu_encoders`,
`gpu_decoders`, `front_io`, `rear_io`, `revision_date` (blank).

---

# 3. What to expect from the forms while entering

Warnings you should see, and which are expected rather than mistakes:

- **`VX5-V255-MGM` and `VX5-V265-ACM`** — after saving, the edit page's sheet-group panel should
  report the pairing (*"Sheet group V250 — shares its datasheet with VX5-V250-MGM"*). That
  message appearing is the cross-row check working. If you instead see *"mixes family types"* or
  *"now holds 3 rows"*, a `sheet_group` is typo'd.
- **`VX5-SW10-100` / `VX5-SW20-200`** — no warnings expected: both have a `gpu_model` and a
  populated `camera_matrix`, and `db_drive_desc` is blank.
- **The five server rows** — no warnings expected, provided you left the Workstation section
  entirely blank. If a GPU field or the matrix is filled on a `management`/`acm` row, the form
  will name the field and save it anyway; clear it.
- **`VX5-V150-ACM`** — no warning fires for the blank RAID fields. That is correct; nothing on
  this table refuses a row, and a value-tier box with no array is legitimate.
- **On `/admin/specs`** — `warranty_years = 5` agrees with the existing legacy `warranty` strings,
  so no drift warning. The dimensions warning only fires on inches-without-mm, and no rack sheet
  has an inches figure, so blank `dimensions_in` stays silent.

# 4. Acceptance, after entry

Both round-trips are the check, per design §6:

```bash
npx tsx --env-file=.env.local scripts/roundtrip-product-specs.mts
```

```bash
npx tsx --env-file=.env.local scripts/roundtrip-appliance-specs.mts
```

Expect **21 rows × 65 fields** on the first and **7 rows × 62 fields** on the second — the
appliance script's current `0 rows — coverage unchecked` exit is what it prints today and should
stop printing once the first row lands. The appliance script also prints the sheet-group map;
`V250` and `V260` should each hold two rows, and `V150`, `SW10`, `SW20` one each.

# 5. Open items this reference could not close

1. **`VX5-V265-ACM` ↔ V270** (§2b-vi) — needs a decision or a V265-specific sheet. Blocks nothing
   mechanically; the row will save either way.
2. **V400 `revision_date` 05/12/2025** (§2a-iv) — May 12 or 5 December. *Decided 2026-07-28: enter
   nothing for now.* Still open as a question for whoever produces the sheets; the three V400 rows
   get every other value.
3. **V250 `raid_level_display`** (§2b-viii) — the sheet says both RAID 5 and mirrored.
4. **V700's 36-drive weight** (§2b-vii) — a sheet correction, not an entry decision.
5. **`regulatory_emissions`** (§2a-ii) — stays blank on all 28 rows unless you prefer duplicating
   the combined line. No sheet separates safety from emissions.
6. **V150 `ssdStorage` override vs the sheet** — `families.ts` publishes `2x 480GB`; the sheet
   shows one 480GB SSD. Worth settling before the skuExtraData retirement reads
   `os_drive_desc` for that string.
7. **`max_doors` / certified platforms** — present on all three ACM sheets (V150 100 doors, V260
   500 doors, plus the Lenel / Genetec / Avigilon / Milestone / Keyscan list), deliberately
   without columns. Recorded in `notes` until the ACM phase.
