import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readProjectLink } from "@/lib/projects/calc-save";
import type { ProjectPreparedFor } from "./types";

// "Prepared for" on a project calc's Project Quote (Step 6, ADR 0177): the
// project's company and primary contact, read by id from the project tables
// and frozen into the snapshot. Never resolved by name. A calc outside any
// project returns "none", and the quote keeps the 2026-10-15 resolver.
//
// `admin` is the service-role client, so RLS cannot hide a project link and
// send a project calc down the legacy path.

export type PreparedForRead =
  | { status: "project"; preparedFor: ProjectPreparedFor }
  | { status: "none" }
  | { status: "error"; context: string; error: unknown };

export async function readProjectPreparedFor(admin: SupabaseClient, submissionId: string): Promise<PreparedForRead> {
  const link = await readProjectLink(admin, submissionId);
  if (link.status === "db-error") return { status: "error", context: "read the calc's project link", error: link.error };
  if (!link.projectId) return { status: "none" };

  const { data: project, error } = await admin
    .from("projects")
    .select("id, company_id, primary_contact_id")
    .eq("id", link.projectId)
    .maybeSingle();
  if (error || !project) return { status: "error", context: "read the project", error: error ?? "not found" };

  const [company, contact] = await Promise.all([
    admin.from("companies").select("id, name").eq("id", project.company_id).maybeSingle(),
    project.primary_contact_id
      ? admin
          .from("contacts")
          .select("id, name, email, active, company_id")
          .eq("id", project.primary_contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (company.error || !company.data) {
    return { status: "error", context: "read the project's company", error: company.error ?? "not found" };
  }
  if (contact.error) return { status: "error", context: "read the project's primary contact", error: contact.error };

  const c = contact.data as { id: string; name: string | null; email: string | null; active: boolean; company_id: string } | null;
  return {
    status: "project",
    preparedFor: {
      projectId: project.id as string,
      companyId: company.data.id as string,
      companyName: company.data.name as string,
      contactId: c?.id ?? null,
      contactName: c?.name ?? null,
      contactEmail: c?.email ?? null,
      // A contact the sync deactivated, or moved to another company, is not
      // this project's contact any more (the same test as ADR 0152's).
      contactActive: !!c && c.active === true && c.company_id === project.company_id,
    },
  };
}
