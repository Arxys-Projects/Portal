// RLS verification suite for the Arxys Partner Portal.
// Creates two ephemeral users (partner A and B), exercises the policies on
// partners / products / server_specs / submissions, and tears the users down.
// Run with: npx tsx scripts/test-rls.ts

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";

type CheckResult = { name: string; pass: boolean; detail?: string };

const results: CheckResult[] = [];
const record = (name: string, pass: boolean, detail?: string) => {
  results.push({ name, pass, detail });
};

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const admin: SupabaseClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Persona = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

async function provisionPersona(suffix: string): Promise<Persona> {
  const email = `rls-test-${suffix}-${Date.now()}@arxys-rls-test.invalid`;
  const password = `RLS_test_${suffix}_${Math.random().toString(36).slice(2)}`;

  const { data: createData, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createErr || !createData.user) {
    throw new Error(`createUser failed: ${createErr?.message}`);
  }
  const id = createData.user.id;

  const { error: partnerErr } = await admin.from("partners").insert({
    id,
    company_name: `RLS Test Co ${suffix}`,
    contact_name: `Tester ${suffix}`,
    role: "partner",
    status: "active",
  });
  if (partnerErr) throw new Error(`partners insert failed: ${partnerErr.message}`);

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);

  return { id, email, password, client };
}

async function teardownPersona(p: Persona): Promise<void> {
  await admin.from("submissions").delete().eq("partner_id", p.id);
  await admin.from("partners").delete().eq("id", p.id);
  await admin.auth.admin.deleteUser(p.id);
}

async function run() {
  console.log("Provisioning two ephemeral partners...");
  const a = await provisionPersona("A");
  const b = await provisionPersona("B");

  try {
    // Test 6a: A sees own partners row, not B's.
    {
      const { data, error } = await a.client
        .from("partners")
        .select("id")
        .order("id");
      if (error) {
        record("6a: A SELECT partners", false, error.message);
      } else {
        const ids = data.map((r) => r.id);
        record(
          "6a: A SELECT partners returns only self",
          ids.length === 1 && ids[0] === a.id,
          `got ${JSON.stringify(ids)}`,
        );
      }
    }

    // Test 6b: B sees only own partners row.
    {
      const { data, error } = await b.client.from("partners").select("id");
      if (error) {
        record("6b: B SELECT partners", false, error.message);
      } else {
        const ids = data.map((r) => r.id);
        record(
          "6b: B SELECT partners returns only self",
          ids.length === 1 && ids[0] === b.id,
          `got ${JSON.stringify(ids)}`,
        );
      }
    }

    // Test 7a: A INSERT submission with partner_id=A succeeds.
    {
      const { data, error } = await a.client
        .from("submissions")
        .insert({
          partner_id: a.id,
          project_name: "self-insert-A",
          cameras_count: 10,
          resolution_code: "4K",
          codec: "H.265",
          complexity: "MED",
          retention_days: 30,
          bandwidth_mbps: 250,
          storage_tb: 5,
        })
        .select("id")
        .single();
      record(
        "7a: A INSERT own submission",
        !error && Boolean(data?.id),
        error?.message,
      );
    }

    // Test 7b: A INSERT submission with partner_id=B is blocked.
    {
      const { error } = await a.client.from("submissions").insert({
        partner_id: b.id,
        project_name: "cross-insert-attempt",
        cameras_count: 10,
        resolution_code: "4K",
        codec: "H.265",
        complexity: "MED",
        retention_days: 30,
        bandwidth_mbps: 250,
        storage_tb: 5,
      });
      record(
        "7b: A INSERT submission for B is blocked",
        Boolean(error),
        error ? `blocked: ${error.code}` : "INSERTED (should not have)",
      );
    }

    // Test 7c: A SELECT submissions returns only own rows.
    {
      // First seed one of B's submissions via service_role.
      await admin.from("submissions").insert({
        partner_id: b.id,
        project_name: "B-owned",
        cameras_count: 5,
        resolution_code: "1080p",
        codec: "H.264",
        complexity: "LOW",
        retention_days: 14,
        bandwidth_mbps: 50,
        storage_tb: 1,
      });
      const { data, error } = await a.client
        .from("submissions")
        .select("id, partner_id");
      if (error) {
        record("7c: A SELECT submissions", false, error.message);
      } else {
        const allMine = data.every((r) => r.partner_id === a.id);
        record(
          "7c: A SELECT submissions returns only own rows",
          allMine && data.length >= 1,
          `count=${data.length} allMine=${allMine}`,
        );
      }
    }
  } finally {
    await teardownPersona(a);
    await teardownPersona(b);
  }

  console.log("\n=== RLS test results ===");
  for (const r of results) {
    const tag = r.pass ? "PASS" : "FAIL";
    console.log(`[${tag}] ${r.name}${r.detail ? `   (${r.detail})` : ""}`);
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.error(`\n${failed.length} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll authenticated RLS tests passed.");
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(2);
});
