import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Welcome back{user?.email ? `, ${user.email}` : ""}.
      </p>
      <div className="mt-8 rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
        <p className="text-sm text-neutral-500">
          Calculator and submissions will land here in Step 4.
        </p>
      </div>
    </div>
  );
}
