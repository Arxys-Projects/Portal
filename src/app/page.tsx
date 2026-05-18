import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The proxy at src/proxy.ts already redirects most cases, but this page
// also runs the same check so direct hits to "/" are handled correctly.
export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
