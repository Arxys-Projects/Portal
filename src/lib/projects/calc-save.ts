import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The reads a project calc save makes before it writes (Project Portal Step 4;
// ADRs 0152, 0165). `admin` is the service-role client: the project tables are
// internal-only, and one caller here (a partner revising a calc prepared for
// them) cannot see them. The server action decides who gets this far.

export type ProjectLink =
  | { status: "ok"; projectId: string | null }
  | { status: "db-error"; error: unknown };

/** The project a submission is linked to, or null for a calc outside any project. */
export async function readProjectLink(admin: SupabaseClient, submissionId: string): Promise<ProjectLink> {
  const { data, error } = await admin
    .from("project_submissions")
    .select("project_id")
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (error) return { status: "db-error", error };
  return { status: "ok", projectId: (data?.project_id as string | undefined) ?? null };
}

export type ProjectForCalc = {
  id: string;
  name: string;
  vms: string | null;
  // The primary contact's portal login, when the contact is active and still
  // at the project's company, and exactly one login is linked, an active,
  // non-internal partner: the value for on_behalf_of_partner_id, which is how
  // that login sees the calc (ADR 0152). Null otherwise.
  visibleToPartnerId: string | null;
};

export type LoadedProject =
  | { status: "ok"; project: ProjectForCalc }
  | { status: "not-found" }
  | { status: "db-error"; context: string; error: unknown };

export async function loadProjectForCalc(admin: SupabaseClient, projectId: string): Promise<LoadedProject> {
  const { data: row, error } = await admin
    .from("projects")
    .select("id, name, vms, company_id, primary_contact_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) return { status: "db-error", context: "load project", error };
  if (!row) return { status: "not-found" };

  let visibleToPartnerId: string | null = null;
  // The project checks its contact's company only when the contact is set, and
  // the sync can later move the person to another org or deactivate them. A
  // contact who has left the company gets no view of new quotes.
  let contactCurrent = false;
  if (row.primary_contact_id) {
    const { data: contact, error: contactError } = await admin
      .from("contacts")
      .select("company_id, active")
      .eq("id", row.primary_contact_id)
      .maybeSingle();
    if (contactError) return { status: "db-error", context: "load primary contact", error: contactError };
    contactCurrent = !!contact && contact.active === true && contact.company_id === row.company_id;
  }
  if (contactCurrent) {
    const { data: links, error: linkError } = await admin
      .from("partner_contact_links")
      .select("partner_id")
      .eq("contact_id", row.primary_contact_id)
      .eq("company_id", row.company_id);
    if (linkError) return { status: "db-error", context: "load contact logins", error: linkError };
    // None or several: no portal visibility; the contact gets the quote by
    // email (Step 6).
    if (links && links.length === 1) {
      // The same eligibility the on-behalf picker checks: active, not internal.
      const { data: login, error: loginError } = await admin
        .from("partners")
        .select("id, status, is_internal")
        .eq("id", links[0].partner_id)
        .maybeSingle();
      if (loginError) return { status: "db-error", context: "load contact login", error: loginError };
      if (login && login.status === "active" && !login.is_internal) {
        visibleToPartnerId = login.id as string;
      }
    }
  }

  return {
    status: "ok",
    project: {
      id: row.id as string,
      name: row.name as string,
      vms: (row.vms as string | null) ?? null,
      visibleToPartnerId,
    },
  };
}

const DUPLICATE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The 14-day duplicate guard, scoped to one project (ADR 0093's guardrail).
 * Warns, never blocks. Counts the project's other CURRENT calcs: open, saved in
 * the last 14 days, and not superseded by a revision. A row some other project
 * calc names as its parent is an earlier version of a calc, and so is
 * `revisingId`, the source this save revises; neither is a second quote.
 */
export async function projectDuplicateWarnings(
  admin: SupabaseClient,
  projectId: string,
  revisingId: string | null,
  now: Date,
): Promise<string[]> {
  const { data: links, error: linkError } = await admin
    .from("project_submissions")
    .select("submission_id")
    .eq("project_id", projectId);
  if (linkError) {
    console.error("[project duplicate guard: load links]", linkError);
    return [];
  }
  const ids = (links ?? []).map((l) => l.submission_id as string);
  if (ids.length === 0) return [];

  const { data: rows, error } = await admin
    .from("submissions")
    .select("id, project_name, created_at, status, parent_submission_id")
    .in("id", ids);
  if (error) {
    console.error("[project duplicate guard: load calcs]", error);
    return [];
  }
  const all = rows ?? [];
  const superseded = new Set(all.map((r) => r.parent_submission_id as string | null).filter(Boolean));
  const since = now.getTime() - DUPLICATE_WINDOW_MS;
  const others = all.filter(
    (r) =>
      r.id !== revisingId &&
      !superseded.has(r.id as string) &&
      r.status === "open" &&
      Date.parse(r.created_at as string) >= since,
  );
  if (others.length === 0) return [];
  const names = others.map((r) => `"${(r.project_name as string | null) ?? "(untitled)"}"`).join(", ");
  return [
    `This project already has ${others.length} other open calc${others.length > 1 ? "s" : ""} ` +
      `from the last 14 days (${names}). Check the project before quoting it twice.`,
  ];
}
