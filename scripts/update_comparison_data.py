"""
Update comparison-data.xlsx:
1. Fix Milestone CPU model names + clock speeds (confirmed from spec sheet footers)
2. Fix Avigilon NVR6 Premium cpu_base_ghz (4410Y is 2.0 GHz, not 2.8)
3. Correct dual-CPU Passmark scores from actual cpubenchmark.net measurements
4. Add hw_platform column (the underlying Dell/HP server model for each competitor appliance)
5. Expand Genetec StreamVault rows by storage capacity tier
6. Expand StreamVault sheet by storage tier
"""

import pandas as pd
from openpyxl import load_workbook
import numpy as np

WB_PATH = "/Users/andynewbom/Developer/Arxys Portal/exports/comparison-data.xlsx"

# ── Storage tier breakpoints from streamvault_specs_for_portal.xlsx ──────────
STORAGE_TIERS = {
    "SV-300E":       [2, 8, 16],
    "SV-300E-T4":    [24, 36, 48, 60],
    "SV-1041E-RS2":  [8, 16, 32],
    "SV-1041E-T3":   [24, 48],
    "SV-2041E-R4":   [36, 48, 64],
    "SV-2041E-R15":  [72, 144, 216, 288, 360],   # 15-bay, 24 TB drives, 3→6→9→12→15
    "SV-4041EX-R28": [320, 368, 416, 480, 560, 672],
    "SV-7041EX-R6S": [0.96],                      # directory server, OS drives only
}

# ── Confirmed HW platform for every competitor model ─────────────────────────
# Milestone: from spec sheet document footers (named explicitly)
# Avigilon:  from iDRAC/iLO management tier + chassis dimensions
# Genetec:   from streamvault_specs_for_portal.xlsx "HW Platform (Dell)" column
HW_PLATFORM = {
    # Milestone
    "HE350R":  "Dell PowerEdge R260",
    "HE700R":  "Dell PowerEdge R360",
    "HE1000R": "Dell PowerEdge R760xs",
    "HE1800R": "Dell PowerEdge R760xd2",
    # Avigilon
    "NVR6-STD":          "Dell PowerEdge R760 (inferred from iDRAC + chassis dims)",
    "NVR6-PRM-FORM-D":   "Dell PowerEdge R760 (inferred from iDRAC + chassis dims)",
    "NVR6-PRM-PLUS-FORM-H": "HP (iLO Advanced; model unconfirmed)",
    # Genetec
    "SV-300E":       "Dell Pro Slim XE5",
    "SV-300E-T4":    "Dell Pro Max Tower T2",
    "SV-1041E-RS2":  "Dell PowerEdge R260 OEMR",
    "SV-1041E-T3":   "Dell PowerEdge T160 OEMR",
    "SV-2041E-R4":   "Dell PowerEdge R360",
    "SV-2041E-R15":  "Dell PowerEdge R760xs XL",
    "SV-4041EX-R28": "Dell PowerEdge R760xd2 OEMR",
    "SV-7041EX-R6S": "Dell PowerEdge R660xs",
}


def make_id(model: str, tb: float) -> str:
    tb_str = "0.96" if tb < 1 else str(int(tb))
    return f"{model}-{tb_str}TB"


def resolve_hw_platform(row_id, model_name):
    if not isinstance(row_id, str):
        row_id = ""
    if not isinstance(model_name, str):
        model_name = ""

    # Milestone: IDs start with the model prefix
    for prefix in ("HE350R", "HE700R", "HE1000R", "HE1800R"):
        if row_id.startswith(prefix):
            return HW_PLATFORM[prefix]

    # Avigilon
    if "NVR6-PRM-PLUS-FORM-H" in row_id:
        return HW_PLATFORM["NVR6-PRM-PLUS-FORM-H"]
    if "NVR6-PRM-FORM-D" in row_id:
        return HW_PLATFORM["NVR6-PRM-FORM-D"]
    if "NVR6-STD" in row_id:
        return HW_PLATFORM["NVR6-STD"]

    # Genetec: matched by model_name
    return HW_PLATFORM.get(model_name)


def expand_by_storage(df: pd.DataFrame, include_id: bool = True) -> pd.DataFrame:
    """Expand rows with multiple storage tiers into one row each."""
    rows = []
    for _, row in df.iterrows():
        model = row.get("model_name", "")
        if not isinstance(model, str):
            model = ""
        tiers = STORAGE_TIERS.get(model)
        if tiers:
            for tb in tiers:
                new_row = row.copy()
                new_row["storage_raw_tb"] = float(tb)
                if include_id:
                    new_row["id"] = make_id(model, tb)
                rows.append(new_row)
        else:
            rows.append(row.copy())
    return pd.DataFrame(rows, columns=df.columns)


# ── Load ──────────────────────────────────────────────────────────────────────
print("Loading workbook …")
xl = pd.read_excel(WB_PATH, sheet_name=None)

# ── competitor_products ───────────────────────────────────────────────────────
df = xl["competitor_products"].copy()

# Drop unnamed padding columns
df = df[[c for c in df.columns if not c.startswith("Unnamed:")]]

# 1. Milestone – CPU model names (confirmed from spec sheet footers)
df.loc[df["id"].str.startswith("HE700R",  na=False), "cpu_model"] = "Intel Xeon E-2436"
df.loc[df["id"].str.startswith("HE1000R", na=False), "cpu_model"] = "Intel Xeon Silver 4410Y"
df.loc[df["id"].str.startswith("HE1800R", na=False), "cpu_model"] = "Intel Xeon Silver 4410Y"

# 2. Milestone – CPU base clock (spec sheets say 2.0 GHz, not 2.1)
df.loc[df["id"].str.startswith("HE1000R", na=False), "cpu_base_ghz"] = 2.0
df.loc[df["id"].str.startswith("HE1800R", na=False), "cpu_base_ghz"] = 2.0

# 3. Avigilon – NVR6 Premium base clock (Xeon Silver 4410Y is 2.0 GHz, not 2.8)
df.loc[df["id"].str.startswith("NVR6-PRM", na=False), "cpu_base_ghz"] = 2.0

# 4. Genetec – dual-CPU Passmark: replace 2× single with actual dual-socket scores
#    Single: 4416+ = 43,659 → Dual actual = 70,032 (cpubenchmark.net)
#    Single: 5416S ≈ 26,875 → Dual actual = 53,750 (cpubenchmark.net)
#    (old values were exact 2× which inflates by 25–32%)
df.loc[df["model_name"] == "SV-4041EX-R28", "cpu_passmark"] = 53750
df.loc[df["model_name"] == "SV-7041EX-R6S", "cpu_passmark"] = 70032

# 5. Add hw_platform column (after form_factor)
df["hw_platform"] = df.apply(
    lambda r: resolve_hw_platform(str(r["id"]) if pd.notna(r["id"]) else "",
                                  str(r["model_name"]) if pd.notna(r["model_name"]) else ""),
    axis=1,
)

# Reorder: insert hw_platform after form_factor
cols = list(df.columns)
cols.remove("hw_platform")
ff_idx = cols.index("form_factor")
cols.insert(ff_idx + 1, "hw_platform")
df = df[cols]

# 6. Expand Genetec rows by storage tier
#    Split: Milestone + Avigilon rows stay as-is; separator row; Genetec rows expand.
is_genetec = df["vendor"].str.lower() == "genetec"
is_sep     = df["id"].isna() & df["vendor"].isna()

df_non_g   = df[~is_genetec & ~is_sep].reset_index(drop=True)
df_sep     = df[is_sep].reset_index(drop=True)
df_genetec = df[is_genetec].reset_index(drop=True)

df_genetec_expanded = expand_by_storage(df_genetec, include_id=True)

df_comp_final = pd.concat(
    [df_non_g, df_sep, df_genetec_expanded], ignore_index=True
)

print(f"competitor_products: {len(df)} → {len(df_comp_final)} rows")

# ── StreamVault sheet ─────────────────────────────────────────────────────────
df_sv = xl["StreamVault"].copy()

# Fix dual-CPU Passmarks
df_sv.loc[df_sv["model_name"] == "SV-4041EX-R28", "cpu_passmark"] = 53750
df_sv.loc[df_sv["model_name"] == "SV-7041EX-R6S", "cpu_passmark"] = 70032
df_sv.loc[df_sv["model_name"] == "SV-4041EX-R28", "cpu_passmark_notes"] = (
    "2x CPU; actual dual-socket score (cpubenchmark.net) — replaces prior 2× single estimate"
)
df_sv.loc[df_sv["model_name"] == "SV-7041EX-R6S", "cpu_passmark_notes"] = (
    "2x CPU; actual dual-socket score (cpubenchmark.net) — replaces prior 2× single estimate"
)

# Add hw_platform
df_sv["hw_platform"] = df_sv["model_name"].map(HW_PLATFORM)

cols_sv = list(df_sv.columns)
cols_sv.remove("hw_platform")
ff_idx_sv = cols_sv.index("form_factor")
cols_sv.insert(ff_idx_sv + 1, "hw_platform")
df_sv = df_sv[cols_sv]

# Expand by storage tier
df_sv_final = expand_by_storage(df_sv, include_id=True)
print(f"StreamVault: {len(df_sv)} → {len(df_sv_final)} rows")

# ── Write back ────────────────────────────────────────────────────────────────
print("Writing updated workbook …")
with pd.ExcelWriter(WB_PATH, engine="openpyxl") as writer:
    xl["product_specs"].to_excel(writer,  sheet_name="product_specs",       index=False)
    df_comp_final.to_excel(writer,        sheet_name="competitor_products",  index=False)
    df_sv_final.to_excel(writer,          sheet_name="StreamVault",          index=False)
    xl["display_specs"].to_excel(writer,  sheet_name="display_specs",        index=False)

print("Done. Verifying …")

# ── Quick verification ────────────────────────────────────────────────────────
check = pd.read_excel(WB_PATH, sheet_name="competitor_products")
print(f"\ncompetitor_products columns: {list(check.columns)}")
print(f"Total rows: {len(check)}")
print("\nSample hw_platform values:")
print(check[["id", "model_name", "hw_platform", "cpu_model", "cpu_base_ghz", "cpu_passmark"]].to_string())
