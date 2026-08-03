import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadProjectQueue } from "@/lib/projects/queue";
import { parseFiltersFromRecord } from "./filter";
import ProjectsBoard from "./projects-board";

type Search = Promise<Record<string, string | string[] | undefined>>;

// /projects — the internal sales surface. Same existence-hiding pattern as
// /admin: a partner (or anyone failing the internal-or-admin gate) gets a 404,
// not a 403, so the route's existence isn't disclosed either.
export default async function ProjectsPage({ searchParams }: { searchParams: Search }) {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) notFound();

  const supabase = await createSupabaseServerClient();

  // "Projects I created" has no id field in the data contract to match against
  // (created_by_user_name is a name, not a uuid — see types.ts), so the chip
  // compares against the viewer's OWN contact_name.
  const [{ data: viewerPartner }, queue, rawParams] = await Promise.all([
    supabase.from("partners").select("contact_name").eq("id", gate.userId).maybeSingle(),
    loadProjectQueue(supabase, gate.userId, { refresh: "none" }),
    searchParams,
  ]);

  return (
    <ProjectsBoard
      queue={queue}
      viewerId={gate.userId}
      viewerName={viewerPartner?.contact_name ?? null}
      isAdmin={gate.isAdmin}
      nowIso={new Date().toISOString()}
      initialFilters={parseFiltersFromRecord(rawParams)}
    />
  );
}
