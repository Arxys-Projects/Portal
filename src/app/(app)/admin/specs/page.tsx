// /admin/specs — the product_specs index (design §3).
//
// Admin-only, NOT admin-or-internal. The /admin layout gate admits both, so this
// page checks gate.isAdmin specifically and 404s otherwise — the same
// admin-only-existence treatment project-quote-actions.ts and the admin XLSX
// export use. RLS is still the real enforcement point for writes; this is the
// surface check.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { usableCapacityTb } from "@/lib/capacity-utils";
import { formatTb } from "@/lib/price-book/cell-value";
import { buttonClasses, Table, THead, TBody, TR, TH, TD } from "@/app/(app)/_components/ui";

type SpecIndexRow = {
  id: string;
  model_name: string;
  storage_raw_tb: number | null;
  hdd_count: number | null;
  raid_level_display: string | null;
  raid_level_alt_display: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export default async function AdminSpecsPage() {
  const gate = await requireAdminOrInternal();
  if (!gate.ok || !gate.isAdmin) notFound();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_specs")
    .select(
      "id, model_name, storage_raw_tb, hdd_count, raid_level_display, raid_level_alt_display, updated_at, updated_by",
    )
    .order("id");

  if (error) {
    console.error("[load product_specs index]", error);
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Product specs</h1>
        <p className="mt-3 text-sm text-danger">
          Failed to load product specs. If migration 20260727000001 has not been
          applied yet, the provenance columns this page reads do not exist.
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as SpecIndexRow[];

  // "Edited by" resolves through partners. updated_by is null on every row until
  // the first form save (migration and service_role writes have no auth.uid()),
  // so this is empty on a freshly applied database rather than broken.
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Product specs</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            The canonical Arxys rack-video spec source (ADR 0096). Net usable is
            computed from raw storage, HDD count and RAID level — the same figure
            the Price Book, the System Estimate PDF, the Project Quote and the
            Customer Proposal publish, and the one the Calculator sizes against.
          </p>
        </div>
        <Link href="/admin/specs/new" className={buttonClasses("primary", "sm")}>
          New spec row
        </Link>
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        {rows.length} {rows.length === 1 ? "model" : "models"}
      </p>

      <div className="mt-3">
        <Table>
          <THead>
            <TR>
              <TH>SKU</TH>
              <TH>Model</TH>
              <TH numeric>Net usable</TH>
              <TH>Last edited</TH>
              <TH>Edited by</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => {
              const usable = usableCapacityTb(
                row.storage_raw_tb,
                row.hdd_count,
                row.raid_level_display,
              );
              const altUsable = row.raid_level_alt_display
                ? usableCapacityTb(
                    row.storage_raw_tb,
                    row.hdd_count,
                    row.raid_level_alt_display,
                  )
                : null;
              return (
                <TR key={row.id}>
                  <TD>
                    <Link
                      href={`/admin/specs/${encodeURIComponent(row.id)}`}
                      className="font-mono text-xs font-semibold text-arxys-navy hover:underline"
                    >
                      {row.id}
                    </Link>
                  </TD>
                  <TD>{row.model_name}</TD>
                  <TD numeric>
                    {usable == null ? (
                      "—"
                    ) : (
                      <>
                        <span className="font-semibold">{formatTb(usable)} TB</span>
                        <span className="ml-1.5 text-xs text-ink-soft">
                          RAID {row.raid_level_display ?? "—"}
                        </span>
                        {altUsable != null ? (
                          <span className="block text-xs text-ink-soft">
                            {formatTb(altUsable)} TB {row.raid_level_alt_display}
                          </span>
                        ) : null}
                      </>
                    )}
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
              );
            })}
          </TBody>
        </Table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Spec rows cannot be deleted. A SKU with no spec row is skipped by the
        recommender with no error anywhere (ADR 0094), so the DELETE grant is
        withheld at the database level — retire a model with{" "}
        <code className="font-mono">products.active</code> instead.
      </p>
    </div>
  );
}
