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

  const [queue, rawParams] = await Promise.all([
    loadProjectQueue(supabase, gate.userId, { refresh: "none" }),
    searchParams,
  ]);

  return (
    <ProjectsBoard
      queue={queue}
      viewerId={gate.userId}
      isAdmin={gate.isAdmin}
      nowIso={new Date().toISOString()}
      initialFilters={parseFiltersFromRecord(rawParams)}
    />
  );
}
