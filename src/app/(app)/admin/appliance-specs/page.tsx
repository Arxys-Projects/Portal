// /admin/appliance-specs — the appliance_specs index, grouped by sheet_group
// (design §3).
//
// Admin-only, NOT admin-or-internal: the /admin layout gate admits both, so this
// page checks gate.isAdmin specifically and 404s otherwise. RLS is still the
// real enforcement point for writes; this is the surface check.
//
// THE GROUPING IS THE POINT, not decoration. A datasheet renders one
// sheet_group, and two rows sharing a group (V250 + V255) are its two CPU
// variants. Grouping the seven rows the way the sheets read them makes a row
// typo'd into its own group, or a workstation filed under 'V250', visible at a
// glance — the always-on half of the cross-row check the save action warns about
// (design §4b).

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buttonClasses, Table, THead, TBody, TR, TH, TD } from "@/app/(app)/_components/ui";
import { FAMILY_TYPE_OPTIONS, sheetGroupWarnings, type SheetGroupRow } from "./fields";

type ApplianceIndexRow = {
  id: string;
  model_name: string;
  product_group: string;
  family_type: string | null;
  sheet_group: string;
  updated_at: string | null;
  updated_by: string | null;
};

const FAMILY_TYPE_LABELS = new Map(
  FAMILY_TYPE_OPTIONS.map((o) => [o.value as string, o.label]),
);

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export default async function AdminApplianceSpecsPage() {
  const gate = await requireAdminOrInternal();
  if (!gate.ok || !gate.isAdmin) notFound();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appliance_specs")
    .select("id, model_name, product_group, family_type, sheet_group, updated_at, updated_by")
    .order("sheet_group")
    .order("id");

  if (error) {
    console.error("[load appliance_specs index]", error);
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Appliance specs</h1>
        <p className="mt-3 text-sm text-danger">
          Failed to load appliance specs. If migration 20260729000001 has not
          been applied yet, this table does not exist.
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as ApplianceIndexRow[];

  // "Edited by" resolves through partners. updated_by is null until the first
  // form save (a service_role write has no auth.uid()).
  const editorIds = [...new Set(rows.map((r) => r.updated_by).filter(Boolean))] as string[];
  const editorNames = new Map<string, string>();
  if (editorIds.length > 0) {
    const { data: partners } = await supabase
      .from("partners")
      .select("id, contact_name")
      .in("id", editorIds);
    for (const p of (partners ?? []) as { id: string; contact_name: string | null }[]) {
      if (p.contact_name) editorNames.set(p.id, p.contact_name);
    }
  }

  const groups = new Map<string, ApplianceIndexRow[]>();
  for (const row of rows) {
    const list = groups.get(row.sheet_group);
    if (list) list.push(row);
    else groups.set(row.sheet_group, [row]);
  }
  const groupNames = [...groups.keys()].sort();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Appliance specs</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            The management, ACM and workstation hardware specs — the archetypes
            product_specs cannot hold, because its storage and camera columns are
            NOT NULL and greater than zero (ADR 0090). Rows are grouped the way
            the physical datasheets are: the two SKUs on one sheet share a sheet
            group.
          </p>
        </div>
        <Link href="/admin/appliance-specs/new" className={buttonClasses("primary", "sm")}>
          New appliance row
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-[14px] border border-dashed border-line bg-surface p-6">
          <p className="text-sm font-semibold text-ink">
            No appliance rows yet.
          </p>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            This table starts empty on purpose. All seven rows — V150, V250,
            V255, V260, V265, SW10 and SW20 — are typed in through this form from
            the physical factsheets; none of them is seeded by a migration (ADR
            0097 §8). Start with <strong>New appliance row</strong>.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink-soft">
            {rows.length} {rows.length === 1 ? "row" : "rows"} across{" "}
            {groupNames.length}{" "}
            {groupNames.length === 1 ? "sheet group" : "sheet groups"}
          </p>

          <div className="mt-3 space-y-5">
            {groupNames.map((groupName) => {
              const groupRows = groups.get(groupName) ?? [];
              const warnings = sheetGroupWarnings(
                groupName,
                groupRows as SheetGroupRow[],
              );
              return (
                <section key={groupName}>
                  <div className="mb-2 flex flex-wrap items-baseline gap-2">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
                      Sheet group {groupName}
                    </h2>
                    <span className="text-xs text-ink-soft">
                      {groupRows.length === 1
                        ? "one SKU on this sheet"
                        : `${groupRows.length} SKUs on this sheet`}
                    </span>
                  </div>

                  {warnings.length > 0 ? (
                    <div className="mb-2 rounded-[14px] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      <ul className="list-disc space-y-1 pl-5">
                        {warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <Table>
                    <THead>
                      <TR>
                        <TH>SKU</TH>
                        <TH>Model</TH>
                        <TH>Family type</TH>
                        <TH>Product group</TH>
                        <TH>Last edited</TH>
                        <TH>Edited by</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {groupRows.map((row) => (
                        <TR key={row.id}>
                          <TD>
                            <Link
                              href={`/admin/appliance-specs/${encodeURIComponent(row.id)}`}
                              className="font-mono text-xs font-semibold text-arxys-navy hover:underline"
                            >
                              {row.id}
                            </Link>
                          </TD>
                          <TD>{row.model_name}</TD>
                          <TD>
                            {row.family_type
                              ? (FAMILY_TYPE_LABELS.get(row.family_type) ?? row.family_type)
                              : "—"}
                          </TD>
                          <TD>
                            <span className="font-mono text-xs">{row.product_group}</span>
                          </TD>
                          <TD>
                            <span className="text-xs text-ink-soft">
                              {formatTimestamp(row.updated_at)}
                            </span>
                          </TD>
                          <TD>
                            {row.updated_by
                              ? (editorNames.get(row.updated_by) ?? row.updated_by)
                              : "—"}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </section>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-5 text-xs leading-relaxed text-ink-soft">
        Appliance rows cannot be deleted. Once the Price Book overrides retire,
        these rows are the only source for the management, ACM and workstation
        strings and for the datasheets, so a deletion would blank those surfaces
        with no error anywhere — the DELETE grant is withheld at the database
        level. Retire a model with{" "}
        <code className="font-mono">products.active</code> instead.
      </p>
    </div>
  );
}
