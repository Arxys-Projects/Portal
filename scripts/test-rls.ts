// RLS verification suite for the Arxys Partner Portal.
// Creates two ephemeral users (partner A and B), exercises the policies on
// partners / products / submissions / camera_specs / project_quotes /
// access_requests / product_specs / the Project Portal tables, and tears the
// users down.
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

type PersonaOptions = {
  role?: "partner" | "admin";
  status?: "active" | "invited" | "suspended";
  isInternal?: boolean;
};

async function provisionPersona(
  suffix: string,
  options: PersonaOptions = {},
): Promise<Persona> {
  const role = options.role ?? "partner";
  const status = options.status ?? "active";
  const isInternal = options.isInternal ?? false;
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
    role,
    status,
    is_internal: isInternal,
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
  // Rows another persona prepared on p's behalf reference p with no ON DELETE
  // action, so they would block the partners delete below (gap 22).
  await admin.from("submissions").delete().eq("on_behalf_of_partner_id", p.id);
  await admin.from("partners").delete().eq("id", p.id);
  await admin.auth.admin.deleteUser(p.id);
}

// Seed a submission with a known status via service-role (bypasses RLS). Used
// by the Step 5 UPDATE/DELETE policy tests. Cleaned up by teardownPersona,
// which deletes all submissions for a partner_id regardless of status.
async function seedSubmission(
  partnerId: string,
  status: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from("submissions")
    .insert({
      partner_id: partnerId,
      project_name: "RLS-step5-status-test",
      cameras_count: 10,
      resolution_code: "4K",
      codec: "H.265",
      complexity: "MED",
      retention_days: 30,
      bandwidth_mbps: 250,
      storage_tb: 5,
      status,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seedSubmission failed: ${error?.message}`);
  }
  return data.id as string;
}

async function run() {
  console.log("Provisioning two ephemeral partners + one admin...");
  const a = await provisionPersona("A");
  const b = await provisionPersona("B");
  const adminPersona = await provisionPersona("ADMIN", { role: "admin" });
  // Phase 8 Step C — internal users are role=partner with is_internal=true.
  const internalPersona = await provisionPersona("INT", { isInternal: true });

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

    // Test 8a: admin SELECTs every partner row (at least A, B, admin).
    {
      const { data, error } = await adminPersona.client
        .from("partners")
        .select("id");
      if (error) {
        record("8a: admin SELECT partners", false, error.message);
      } else {
        const ids = new Set(data.map((r) => r.id));
        record(
          "8a: admin SELECT partners returns A, B, and self",
          ids.has(a.id) && ids.has(b.id) && ids.has(adminPersona.id),
          `count=${data.length}`,
        );
      }
    }

    // Test 8b: admin SELECTs both A's and B's submissions.
    {
      const { data, error } = await adminPersona.client
        .from("submissions")
        .select("id, partner_id");
      if (error) {
        record("8b: admin SELECT submissions", false, error.message);
      } else {
        const owners = new Set(data.map((r) => r.partner_id));
        record(
          "8b: admin SELECT submissions returns rows for A and B",
          owners.has(a.id) && owners.has(b.id),
          `count=${data.length} owners=${JSON.stringify([...owners])}`,
        );
      }
    }

    // Test 9a: partner A can SELECT active products (new SKU-PK shape).
    // After Phase 2 Step 3+4 the products table has columns
    // (sku, product_name, msrp, product_group, max_cameras, max_storage_tb, ...);
    // the products_select_active_or_admin policy carries over from the
    // pre-migration schema. Partner-scoped reads must see active rows.
    {
      const { data, error } = await a.client
        .from("products")
        .select("sku, product_name, msrp, product_group, max_cameras, max_storage_tb")
        .eq("active", true)
        .order("sort_order");
      if (error) {
        record("9a: partner SELECT active products", false, error.message);
      } else {
        const skuShape = (data ?? []).every(
          (r) =>
            typeof r.sku === "string" &&
            typeof r.product_name === "string" &&
            typeof r.product_group === "string",
        );
        record(
          "9a: partner SELECT active products (SKU-PK shape)",
          (data?.length ?? 0) > 0 && skuShape,
          `count=${data?.length} skuShape=${skuShape}`,
        );
      }
    }

    // Test 9b: an inactive product is invisible to a partner. Seed one via
    // service-role, verify partner doesn't see it, then clean up.
    {
      const tempSku = `RLS-TEST-INACTIVE-${Date.now()}`;
      await admin.from("products").insert({
        sku: tempSku,
        product_name: "RLS inactive test row",
        msrp: 1,
        price_type: "numeric",
        product_group: "RLS",
        sort_order: 9999,
        active: false,
        max_cameras: 1,
        max_storage_tb: 1,
      });
      const { data, error } = await a.client
        .from("products")
        .select("sku")
        .eq("sku", tempSku);
      record(
        "9b: partner cannot SELECT inactive products",
        !error && (data?.length ?? 0) === 0,
        error?.message ?? `count=${data?.length}`,
      );
      await admin.from("products").delete().eq("sku", tempSku);
    }

    // --- Phase 3 Step 5 + ADR 0081: submissions UPDATE / DELETE policies -----
    // submissions_update_authorized allows a partner to UPDATE their own rows;
    // submissions_delete_authorized allows DELETE only when status = 'open'
    // (Won/Lost are protected — ADR 0081 replaced the old draft/NULL guard).
    // RLS-blocked UPDATE/DELETE return zero affected rows (not an error).

    // Test 11: A UPDATE own submission status → allowed.
    {
      const id = await seedSubmission(a.id, "open");
      const { data, error } = await a.client
        .from("submissions")
        .update({ status: "won" })
        .eq("id", id)
        .select("id");
      record(
        "11: A UPDATE own submission status",
        !error && (data?.length ?? 0) === 1,
        error?.message ?? `rows=${data?.length}`,
      );
    }

    // Test 12: A UPDATE own submission is_preferred → allowed.
    {
      const id = await seedSubmission(a.id, "open");
      const { data, error } = await a.client
        .from("submissions")
        .update({ is_preferred: true })
        .eq("id", id)
        .select("id");
      record(
        "12: A UPDATE own submission is_preferred",
        !error && (data?.length ?? 0) === 1,
        error?.message ?? `rows=${data?.length}`,
      );
    }

    // Test 13: A UPDATE B's submission status → blocked (RLS filters to 0 rows).
    {
      const id = await seedSubmission(b.id, "open");
      const { data, error } = await a.client
        .from("submissions")
        .update({ status: "won" })
        .eq("id", id)
        .select("id");
      const { data: after } = await admin
        .from("submissions")
        .select("status")
        .eq("id", id)
        .single();
      record(
        "13: A UPDATE B's submission is blocked",
        !error && (data?.length ?? 0) === 0 && after?.status === "open",
        `rows=${data?.length} afterStatus=${after?.status}`,
      );
    }

    // Test 14: A DELETE own submission with status='lost' → blocked (guard).
    {
      const id = await seedSubmission(a.id, "lost");
      const { data, error } = await a.client
        .from("submissions")
        .delete()
        .eq("id", id)
        .select("id");
      const { data: after } = await admin
        .from("submissions")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      record(
        "14: A DELETE own 'lost' submission is blocked by status guard",
        !error && (data?.length ?? 0) === 0 && Boolean(after),
        `rows=${data?.length} stillExists=${Boolean(after)}`,
      );
    }

    // Test 15: A DELETE own submission with status='open' → allowed.
    {
      const id = await seedSubmission(a.id, "open");
      const { data, error } = await a.client
        .from("submissions")
        .delete()
        .eq("id", id)
        .select("id");
      record(
        "15: A DELETE own submission status='open'",
        !error && (data?.length ?? 0) === 1,
        error?.message ?? `rows=${data?.length}`,
      );
    }

    // Test 16: A DELETE own submission with status='won' → blocked (guard).
    {
      const id = await seedSubmission(a.id, "won");
      const { data, error } = await a.client
        .from("submissions")
        .delete()
        .eq("id", id)
        .select("id");
      const { data: after } = await admin
        .from("submissions")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      record(
        "16: A DELETE own 'won' submission is blocked by status guard",
        !error && (data?.length ?? 0) === 0 && Boolean(after),
        `rows=${data?.length} stillExists=${Boolean(after)}`,
      );
    }

    // Test 17: A DELETE B's submission → blocked (ownership).
    {
      const id = await seedSubmission(b.id, "open");
      const { data, error } = await a.client
        .from("submissions")
        .delete()
        .eq("id", id)
        .select("id");
      const { data: after } = await admin
        .from("submissions")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      record(
        "17: A DELETE B's submission is blocked",
        !error && (data?.length ?? 0) === 0 && Boolean(after),
        `rows=${data?.length} stillExists=${Boolean(after)}`,
      );
    }

    // Test 18: A cannot SELECT B's submission by id (revise-loader guard).
    // The /calculator?revise= loader reads the source row RLS-scoped
    // (select input_state, groups_payload, pipedrive_deal_id .eq id). RLS must
    // return nothing for someone else's row, so A can never rehydrate B's quote
    // or inherit B's Pipedrive deal id into a revision.
    {
      const { data: seeded } = await admin
        .from("submissions")
        .insert({
          partner_id: b.id,
          project_name: "B-revise-target",
          cameras_count: 8,
          resolution_code: "4K",
          codec: "H.265",
          complexity: "MED",
          retention_days: 30,
          bandwidth_mbps: 120,
          storage_tb: 3,
          status: "open",
          pipedrive_deal_id: 999999,
        })
        .select("id")
        .single();
      const id = seeded!.id as string;
      const { data, error } = await a.client
        .from("submissions")
        .select("id, input_state, groups_payload, pipedrive_deal_id")
        .eq("id", id)
        .maybeSingle();
      record(
        "18: A cannot SELECT B's submission to revise it",
        !error && data === null,
        `row=${JSON.stringify(data)} err=${error?.message ?? "none"}`,
      );
    }

    // Test 8c: suspending the admin strips admin RLS reads.
    // is_admin() requires status='active'; the helper is the only thing that
    // distinguishes the admin client from a partner client. Flip via service
    // role, verify the admin client now sees only their own partner row.
    {
      await admin
        .from("partners")
        .update({ status: "suspended" })
        .eq("id", adminPersona.id);
      const { data, error } = await adminPersona.client
        .from("partners")
        .select("id");
      if (error) {
        record("8c: suspended admin SELECT partners", false, error.message);
      } else {
        const ids = data.map((r) => r.id);
        record(
          "8c: suspended admin sees only self (admin privileges revoked)",
          ids.length === 1 && ids[0] === adminPersona.id,
          `got ${JSON.stringify(ids)}`,
        );
      }
    }
    // --- Phase 8 Step C: internal-user SELECT-only escalation ----------------
    // submissions_select_internal lets is_internal partners read every
    // submission. UPDATE/DELETE policies are unchanged: still own-only.

    // Seed one B-owned submission (won, undeleteable by the status guard) so
    // the internal persona has cross-partner rows to read and (attempt to)
    // mutate. The 7c block already seeded a B-owned row, but tests 11-14
    // mutate it; seed a fresh one here to keep this block self-contained.
    const internalTargetId = await seedSubmission(b.id, "won");

    // Test 8d: internal user SELECTs another partner's submissions.
    {
      const { data, error } = await internalPersona.client
        .from("submissions")
        .select("id, partner_id")
        .eq("partner_id", b.id);
      if (error) {
        record("8d: internal SELECT B submissions", false, error.message);
      } else {
        record(
          "8d: internal user SELECTs another partner's submissions",
          (data?.length ?? 0) >= 1 && data!.every((r) => r.partner_id === b.id),
          `count=${data?.length}`,
        );
      }
    }

    // Test 8e: internal user UPDATE of B's submission is blocked.
    // submissions_update_own is unchanged → zero affected rows.
    {
      const { data, error } = await internalPersona.client
        .from("submissions")
        .update({ project_name: "internal-cross-update-attempt" })
        .eq("id", internalTargetId)
        .select("id");
      record(
        "8e: internal cannot UPDATE another partner's submission",
        !error && (data?.length ?? 0) === 0,
        error ? `error: ${error.message}` : `affected=${data?.length}`,
      );
    }

    // Test 8f: internal user DELETE of B's submission is blocked.
    {
      const { data, error } = await internalPersona.client
        .from("submissions")
        .delete()
        .eq("id", internalTargetId)
        .select("id");
      record(
        "8f: internal cannot DELETE another partner's submission",
        !error && (data?.length ?? 0) === 0,
        error ? `error: ${error.message}` : `affected=${data?.length}`,
      );
    }

    // Test 8g: regular (non-internal) partner A still cannot SELECT B's
    // submissions — confirms the new policy doesn't leak.
    {
      const { data, error } = await a.client
        .from("submissions")
        .select("id, partner_id")
        .eq("partner_id", b.id);
      record(
        "8g: regular partner still cannot SELECT another partner's submissions",
        !error && (data?.length ?? 0) === 0,
        error ? `error: ${error.message}` : `count=${data?.length}`,
      );
    }

    // Test 8l: suspending the internal user strips internal RLS reads (ADR
    // 0164: is_internal() requires status='active'). Flip via service role,
    // check, then restore so the internal tests below still run as active.
    {
      await admin
        .from("partners")
        .update({ status: "suspended" })
        .eq("id", internalPersona.id);
      const subs = await internalPersona.client
        .from("submissions")
        .select("id")
        .eq("partner_id", b.id);
      const partners = await internalPersona.client.from("partners").select("id");
      await admin
        .from("partners")
        .update({ status: "active" })
        .eq("id", internalPersona.id);
      const partnerIds = (partners.data ?? []).map((r) => r.id);
      record(
        "8l: suspended internal user cannot SELECT another partner's submissions",
        !subs.error && (subs.data?.length ?? 0) === 0,
        subs.error ? `error: ${subs.error.message}` : `count=${subs.data?.length}`,
      );
      record(
        "8l: suspended internal user sees only their own partner row",
        !partners.error && partnerIds.length === 1 && partnerIds[0] === internalPersona.id,
        partners.error ? `error: ${partners.error.message}` : `got ${JSON.stringify(partnerIds)}`,
      );
      const back = await internalPersona.client
        .from("submissions")
        .select("id")
        .eq("partner_id", b.id);
      record(
        "8l: reactivated internal user reads another partner's submissions again",
        !back.error && (back.data?.length ?? 0) >= 1,
        back.error ? `error: ${back.error.message}` : `count=${back.data?.length}`,
      );
    }

    // --- Phase 8: per-user on-behalf target visibility ----------------------
    // The internal user files a submission ON BEHALF OF partner A: partner_id
    // stays the creator (internal), on_behalf_of_partner_id = A. The new
    // submissions_select_on_behalf_target policy grants A read access to that
    // row so A can view and revise it; B (an unrelated partner) gets nothing.
    let onBehalfRowId = "";
    {
      const { data, error } = await admin
        .from("submissions")
        .insert({
          partner_id: internalPersona.id,
          on_behalf_of_partner_id: a.id,
          project_name: "RLS-on-behalf-test",
          cameras_count: 8,
          resolution_code: "4K",
          codec: "H.265",
          complexity: "MED",
          retention_days: 30,
          bandwidth_mbps: 200,
          storage_tb: 4,
          status: "open",
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`on-behalf seed failed: ${error?.message}`);
      }
      onBehalfRowId = data.id as string;
    }

    // Test 8h: target partner A can SELECT the on-behalf row prepared for them.
    {
      const { data, error } = await a.client
        .from("submissions")
        .select("id, partner_id, on_behalf_of_partner_id")
        .eq("id", onBehalfRowId);
      record(
        "8h: on-behalf target A can SELECT the row prepared for them",
        !error && data?.length === 1 && data[0].on_behalf_of_partner_id === a.id,
        error ? `error: ${error.message}` : `count=${data?.length}`,
      );
    }

    // Test 8i: unrelated partner B cannot SELECT the on-behalf row (no leak).
    {
      const { data, error } = await b.client
        .from("submissions")
        .select("id")
        .eq("id", onBehalfRowId);
      record(
        "8i: unrelated partner B cannot SELECT the on-behalf row",
        !error && (data?.length ?? 0) === 0,
        error ? `error: ${error.message}` : `count=${data?.length}`,
      );
    }

    // Test 8j: A can read the source row's revise payload (input_state). Read
    // access is sufficient for the revise flow — A rehydrates and saves a fresh
    // row they own; no in-place edit of the source is needed.
    {
      const { data, error } = await a.client
        .from("submissions")
        .select("id, input_state, groups_payload")
        .eq("id", onBehalfRowId)
        .maybeSingle();
      record(
        "8j: on-behalf target A can read the source row for the revise path",
        !error && data?.id === onBehalfRowId,
        error ? `error: ${error.message}` : `read=${Boolean(data)}`,
      );
    }

    // Test 8k: A cannot UPDATE the source row in place — the grant is SELECT
    // only. No UPDATE policy matches A on a row they don't own, so the update
    // affects zero rows (RLS makes it invisible to the writer).
    {
      const { data, error } = await a.client
        .from("submissions")
        .update({ project_name: "on-behalf-edit-attempt" })
        .eq("id", onBehalfRowId)
        .select("id");
      const { data: after } = await admin
        .from("submissions")
        .select("project_name")
        .eq("id", onBehalfRowId)
        .single();
      record(
        "8k: on-behalf target A cannot UPDATE the source row in place",
        (data?.length ?? 0) === 0 && after?.project_name === "RLS-on-behalf-test",
        error ? `error: ${error.message}` : `affected=${data?.length} name=${after?.project_name}`,
      );
    }
    // --- Phase 10 Step 1: camera_specs read-open / admin-write -------------
    // SELECT is open to every authenticated user (mirrors product_specs);
    // INSERT/UPDATE/DELETE are admin-only. Writes are admin-only, NOT internal:
    // internal users read the camera library but cannot load it (ADR 0057).
    {
      const seedModel = `RLS-CAM-${Date.now()}`;
      const { error: seedErr } = await admin.from("camera_specs").insert({
        vendor: "Axis",
        model: seedModel,
        sensor_count: 1,
        max_width: 1920,
        max_height: 1080,
      });
      if (seedErr) {
        record("12: seed camera_specs row (service-role)", false, seedErr.message);
      }

      // Test 12a: partner A can SELECT camera_specs (read-open).
      {
        const { data, error } = await a.client
          .from("camera_specs")
          .select("id, vendor, model")
          .eq("model", seedModel);
        record(
          "12a: partner can SELECT camera_specs (read-open)",
          !error && data?.length === 1 && data[0].vendor === "Axis",
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 12b: internal user can SELECT camera_specs (authenticated read).
      {
        const { data, error } = await internalPersona.client
          .from("camera_specs")
          .select("id")
          .eq("model", seedModel);
        record(
          "12b: internal user can SELECT camera_specs",
          !error && data?.length === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 12c: partner A cannot INSERT camera_specs. An RLS with-check
      // violation returns an error, not a silent no-op.
      {
        const { error } = await a.client.from("camera_specs").insert({
          vendor: "Axis",
          model: `RLS-CAM-PARTNER-${Date.now()}`,
          sensor_count: 1,
          max_width: 1920,
          max_height: 1080,
        });
        record(
          "12c: partner cannot INSERT camera_specs (admin-only)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 12d: internal user cannot INSERT camera_specs — writes are
      // admin-only, NOT internal. This is the boundary the library load relies on.
      {
        const { error } = await internalPersona.client
          .from("camera_specs")
          .insert({
            vendor: "Axis",
            model: `RLS-CAM-INTERNAL-${Date.now()}`,
            sensor_count: 1,
            max_width: 1920,
            max_height: 1080,
          });
        record(
          "12d: internal user cannot INSERT camera_specs (admin-only, not internal)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 12e: partner A cannot UPDATE camera_specs — no matching policy,
      // zero rows affected and the value is unchanged.
      {
        const { data, error } = await a.client
          .from("camera_specs")
          .update({ max_width: 9999 })
          .eq("model", seedModel)
          .select("id");
        const { data: after } = await admin
          .from("camera_specs")
          .select("max_width")
          .eq("model", seedModel)
          .single();
        record(
          "12e: partner cannot UPDATE camera_specs",
          (data?.length ?? 0) === 0 && after?.max_width === 1920,
          error
            ? `error: ${error.message}`
            : `affected=${data?.length} max_width=${after?.max_width}`,
        );
      }

      // Test 12f: partner A cannot DELETE camera_specs — zero rows affected and
      // the seeded row survives.
      {
        const { data, error } = await a.client
          .from("camera_specs")
          .delete()
          .eq("model", seedModel)
          .select("id");
        const { count } = await admin
          .from("camera_specs")
          .select("id", { count: "exact", head: true })
          .eq("model", seedModel);
        record(
          "12f: partner cannot DELETE camera_specs",
          (data?.length ?? 0) === 0 && count === 1,
          error ? `error: ${error.message}` : `affected=${data?.length} remaining=${count}`,
        );
      }

      // Test 12g: admin CAN INSERT camera_specs (the write path works for admin).
      // Test 8c suspended adminPersona and never restored it, so is_admin would
      // return false here; reactivate before exercising the admin write path.
      {
        await admin
          .from("partners")
          .update({ status: "active" })
          .eq("id", adminPersona.id);
        const adminModel = `RLS-CAM-ADMIN-${Date.now()}`;
        const { data, error } = await adminPersona.client
          .from("camera_specs")
          .insert({
            vendor: "Hanwha",
            model: adminModel,
            sensor_count: 2,
            max_width: 2592,
            max_height: 1944,
          })
          .select("id");
        record(
          "12g: admin can INSERT camera_specs",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `inserted=${data?.length}`,
        );
      }

      // Cleanup every RLS-CAM* row (seed, admin insert, and any that leaked
      // past a write policy) via service-role.
      await admin.from("camera_specs").delete().like("model", "RLS-CAM%");
    }

    // --- Phase 10 Step 6: project_quotes INTERNAL-ONLY + immutable ----------
    // SELECT/INSERT gated on is_internal OR is_admin (NOT read-open like the
    // reference tables — a row holds pricing + customer PII). INSERT also
    // requires generated_by = auth.uid(). UPDATE/DELETE are ungranted, so a
    // quote is immutable: a revision is a new version row, never an edit
    // (ADR 0059 / 0060 / 0061). adminPersona was reactivated at 12g.
    {
      const quoteSubmissionId = await seedSubmission(b.id, "open");
      // Step 6 (ADR 0174): a quote must carry its submission's deal, so the
      // seeded submission gets one (service_role may stamp it, ADR 0167).
      await admin.from("submissions").update({ pipedrive_deal_id: 4822 }).eq("id", quoteSubmissionId);
      const baseQuoteRow = {
        submission_id: quoteSubmissionId,
        pipedrive_deal_id: 4822,
        snapshot: { snapshotVersion: 1, marker: "rls-test" },
        terms_version: "v-rls-test",
        validity_days: 7,
      };
      // Seed version 1 via service-role (bypasses RLS) so there is a row to read.
      const { error: seedErr } = await admin
        .from("project_quotes")
        .insert({ ...baseQuoteRow, version: 1, generated_by: internalPersona.id });
      if (seedErr) {
        record("19: seed project_quotes row (service-role)", false, seedErr.message);
      }

      // Test 19a: partner A cannot SELECT project_quotes (internal-only).
      {
        const { data, error } = await a.client
          .from("project_quotes")
          .select("id")
          .eq("submission_id", quoteSubmissionId);
        record(
          "19a: partner cannot SELECT project_quotes (internal-only)",
          !error && (data?.length ?? 0) === 0,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 19b: internal user CAN SELECT project_quotes.
      {
        const { data, error } = await internalPersona.client
          .from("project_quotes")
          .select("id, version")
          .eq("submission_id", quoteSubmissionId);
        record(
          "19b: internal user can SELECT project_quotes",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 19c: admin CAN SELECT project_quotes (admin covered explicitly).
      {
        const { data, error } = await adminPersona.client
          .from("project_quotes")
          .select("id")
          .eq("submission_id", quoteSubmissionId);
        record(
          "19c: admin can SELECT project_quotes",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 19d: partner A cannot INSERT project_quotes (with-check violation).
      {
        const { error } = await a.client
          .from("project_quotes")
          .insert({ ...baseQuoteRow, version: 90, generated_by: a.id });
        record(
          "19d: partner cannot INSERT project_quotes (internal-only)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 19e: internal user CAN INSERT a new version for themselves.
      {
        const { data, error } = await internalPersona.client
          .from("project_quotes")
          .insert({ ...baseQuoteRow, version: 2, generated_by: internalPersona.id })
          .select("id");
        record(
          "19e: internal user can INSERT project_quotes for self",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `inserted=${data?.length}`,
        );
      }

      // Test 19f: internal user cannot INSERT with generated_by != self.
      // The with-check generated_by = auth.uid() blocks spoofing the author.
      {
        const { error } = await internalPersona.client
          .from("project_quotes")
          .insert({ ...baseQuoteRow, version: 3, generated_by: a.id });
        record(
          "19f: internal user cannot INSERT with someone else's generated_by",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 19g: nobody can UPDATE a project_quote (ungranted → immutable).
      // Asserts the security property (the row is unchanged) regardless of
      // whether the block manifests as a permission error or zero rows.
      {
        const { data, error } = await internalPersona.client
          .from("project_quotes")
          .update({ terms_version: "tampered" })
          .eq("submission_id", quoteSubmissionId)
          .select("id");
        const { data: after } = await admin
          .from("project_quotes")
          .select("terms_version")
          .eq("submission_id", quoteSubmissionId)
          .eq("version", 1)
          .single();
        record(
          "19g: project_quotes UPDATE is blocked for everyone (immutable)",
          (data?.length ?? 0) === 0 && after?.terms_version === "v-rls-test",
          error ? `blocked: ${error.message}` : `affected=${data?.length} terms=${after?.terms_version}`,
        );
      }

      // Test 19h: nobody can DELETE a project_quote (ungranted → immutable).
      {
        const { data, error } = await internalPersona.client
          .from("project_quotes")
          .delete()
          .eq("submission_id", quoteSubmissionId)
          .eq("version", 1)
          .select("id");
        const { count } = await admin
          .from("project_quotes")
          .select("id", { count: "exact", head: true })
          .eq("submission_id", quoteSubmissionId)
          .eq("version", 1);
        record(
          "19h: project_quotes DELETE is blocked for everyone (immutable)",
          (data?.length ?? 0) === 0 && count === 1,
          error ? `blocked: ${error.message}` : `affected=${data?.length} remaining=${count}`,
        );
      }

      // Test 19i: the pin trigger (Step 6, ADR 0174, B1-S-4). Versions 1 and 2
      // exist, so the next is 3. Internal and admin are refused a wrong deal id
      // or a skipped version (23514); a taken version answers 23505, which
      // generate.ts retries on. Admin then inserts version 3 legitimately.
      {
        const probes: [string, Persona, Record<string, unknown>, string][] = [
          ["internal wrong deal", internalPersona, { pipedrive_deal_id: 4823, version: 3 }, "23514"],
          ["internal skipped version", internalPersona, { version: 5 }, "23514"],
          ["internal taken version", internalPersona, { version: 2 }, "23505"],
          ["admin wrong deal", adminPersona, { pipedrive_deal_id: 4823, version: 3 }, "23514"],
          ["admin skipped version", adminPersona, { version: 5 }, "23514"],
        ];
        const wrong: string[] = [];
        for (const [label, p, override, code] of probes) {
          const { error } = await p.client
            .from("project_quotes")
            .insert({ ...baseQuoteRow, generated_by: p.id, ...override });
          if (error?.code !== code) wrong.push(`${label}: ${error ? error.code : "INSERTED"}`);
        }
        const legit = await adminPersona.client
          .from("project_quotes")
          .insert({ ...baseQuoteRow, version: 3, generated_by: adminPersona.id })
          .select("version");
        if (legit.error || legit.data?.[0]?.version !== 3) wrong.push(`admin max+1: ${legit.error?.message ?? "no row"}`);
        const { count } = await admin
          .from("project_quotes")
          .select("id", { count: "exact", head: true })
          .eq("submission_id", quoteSubmissionId);
        record(
          "19i: pin trigger refuses a wrong deal id or skipped version for internal and admin; max+1 passes",
          wrong.length === 0 && count === 3,
          wrong.length ? wrong.join("; ") : `rows=${count}`,
        );
      }

      // Cleanup: delete the quote rows BEFORE teardownPersona deletes the
      // submission (project_quotes.submission_id is on delete restrict).
      await admin.from("project_quotes").delete().eq("submission_id", quoteSubmissionId);
    }

    // --- ADR 0083: project_quotes owner-SELECT (partner visibility) ---------
    // Gated behind RUN_0083_TESTS=1 because these tests assert the WIDENED
    // policy (20260720000001_project_quotes_partner_select.sql) and fail on
    // the pre-0083 internal-only policy. Run after Andy applies the migration:
    //   RUN_0083_TESTS=1 npx tsx scripts/test-rls.ts
    // The cross-partner negative (20b) is the ADR's required ship gate.
    if (process.env.RUN_0083_TESTS === "1") {
      // Owner path: submission created BY partner A; quote generated internally.
      const ownSubmissionId = await seedSubmission(a.id, "open");
      // On-behalf path: submission created by the internal rep FOR partner A.
      const oboSubmissionId = await seedSubmission(internalPersona.id, "open");
      await admin
        .from("submissions")
        .update({ on_behalf_of_partner_id: a.id })
        .eq("id", oboSubmissionId);

      const mkQuote = (submissionId: string) => ({
        submission_id: submissionId,
        pipedrive_deal_id: 4823,
        snapshot: { snapshotVersion: 1, marker: "rls-0083-test" },
        terms_version: "v-rls-test",
        validity_days: 7,
        version: 1,
        generated_by: internalPersona.id,
      });
      const { error: seed83Err } = await admin
        .from("project_quotes")
        .insert([mkQuote(ownSubmissionId), mkQuote(oboSubmissionId)]);
      if (seed83Err) {
        record("20: seed 0083 project_quotes rows (service-role)", false, seed83Err.message);
      }

      // Test 20a: the owning partner CAN SELECT their own quote.
      {
        const { data, error } = await a.client
          .from("project_quotes")
          .select("id, version")
          .eq("submission_id", ownSubmissionId);
        record(
          "20a: owning partner can SELECT own project_quote (ADR 0083)",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 20b: CROSS-PARTNER NEGATIVE — partner B cannot read A's quote.
      // Re-read via admin to prove the row exists and the zero-count is RLS,
      // not a missing row.
      {
        const { data, error } = await b.client
          .from("project_quotes")
          .select("id")
          .eq("submission_id", ownSubmissionId);
        const { count } = await admin
          .from("project_quotes")
          .select("id", { count: "exact", head: true })
          .eq("submission_id", ownSubmissionId);
        record(
          "20b: partner B cannot SELECT partner A's project_quote (cross-partner negative)",
          !error && (data?.length ?? 0) === 0 && count === 1,
          error ? `error: ${error.message}` : `count=${data?.length} rowExists=${count === 1}`,
        );
      }

      // Test 20c: the on-behalf TARGET can SELECT the quote on a submission an
      // internal rep filed for them (ownership via on_behalf_of_partner_id).
      {
        const { data, error } = await a.client
          .from("project_quotes")
          .select("id")
          .eq("submission_id", oboSubmissionId);
        record(
          "20c: on-behalf target can SELECT their project_quote (ADR 0083)",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 20d: ownership grants READ only — the owning partner still cannot
      // INSERT a quote (generation stays internal-only, ADR 0083 unchanged).
      {
        const { error } = await a.client
          .from("project_quotes")
          .insert({ ...mkQuote(ownSubmissionId), version: 91, generated_by: a.id });
        record(
          "20d: owning partner still cannot INSERT project_quotes (read-only widening)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // --- ADR 0089: Customer Proposal rides on the SAME policy ---------------
      // The Customer Proposal (?variant=customer-proposal) reads the SAME
      // project_quotes row through the SAME widened SELECT policy as the Project
      // Quote — it introduces NO new RLS surface (the variant only changes how
      // the row is rendered, not which row is read). These tests reaffirm that
      // the row a partner can (and cannot) reach is identical for both documents,
      // using the exact `.select("snapshot")` shape both PDF routes issue.

      // Test 20e: owning partner reaches the row the Customer Proposal renders
      // from (same-row access as the Project Quote's 20a).
      {
        const { data, error } = await a.client
          .from("project_quotes")
          .select("snapshot")
          .eq("submission_id", ownSubmissionId);
        record(
          "20e: owning partner can read the row the Customer Proposal renders (ADR 0089, same policy)",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 20f: CROSS-PARTNER NEGATIVE for the Customer Proposal — partner B
      // still cannot read A's row, so B cannot render either document (mirrors
      // 20b; the required ship gate applies to both documents).
      {
        const { data, error } = await b.client
          .from("project_quotes")
          .select("snapshot")
          .eq("submission_id", ownSubmissionId);
        record(
          "20f: partner B cannot read partner A's row via the Customer Proposal path (cross-partner negative)",
          !error && (data?.length ?? 0) === 0,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 20g: on-behalf TARGET reaches the row for the Customer Proposal too
      // (mirrors 20c — ownership via on_behalf_of_partner_id covers both docs).
      {
        const { data, error } = await a.client
          .from("project_quotes")
          .select("snapshot")
          .eq("submission_id", oboSubmissionId);
        record(
          "20g: on-behalf target can read their row via the Customer Proposal path (ADR 0089)",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Cleanup: quotes before submissions (on delete restrict). The
      // internal-persona submission isn't covered by a.id teardown, so delete
      // it explicitly.
      await admin.from("project_quotes").delete().in("submission_id", [ownSubmissionId, oboSubmissionId]);
      await admin.from("submissions").delete().eq("id", oboSubmissionId);
    } else {
      console.log(
        "  (skipping ADR 0083 owner-SELECT tests — set RUN_0083_TESTS=1 after applying 20260720000001)",
      );
    }

    // --- ADR 0077: access_requests anonymous-intake policies ----------------
    // anon holds NO grant (write is service_role-only via the requestAccess
    // action). authenticated SELECT/UPDATE is granted but RLS narrows both to
    // admin/internal. Plain partners see nothing. adminPersona was reactivated
    // at 12g so is_admin() is true here.
    {
      // A brand-new anon client — signed in to nothing → the `anon` role.
      const anonClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Seed a pending row via service-role (bypasses RLS) to read/update.
      const { data: seeded, error: seedErr } = await admin
        .from("access_requests")
        .insert({
          name: "RLS Req Tester",
          email: `rls-req-${Date.now()}@arxys-rls-test.invalid`,
          company_name: "RLS Req Co",
          status: "pending",
        })
        .select("id")
        .single();
      if (seedErr || !seeded) {
        record("20: seed access_requests row (service-role)", false, seedErr?.message);
      }
      const reqId = (seeded?.id ?? "") as string;

      // Test 20a: anon cannot INSERT (no grant → error, not a silent write).
      {
        const { error } = await anonClient.from("access_requests").insert({
          name: "Anon Attacker",
          email: `rls-anon-${Date.now()}@arxys-rls-test.invalid`,
          company_name: "Anon Co",
        });
        record(
          "20a: anon cannot INSERT access_requests (service_role-only write path)",
          Boolean(error),
          error ? `blocked: ${error.code ?? error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 20b: anon cannot SELECT — no rows leak (blocked or empty).
      {
        const { data, error } = await anonClient
          .from("access_requests")
          .select("id");
        record(
          "20b: anon cannot SELECT access_requests",
          Boolean(error) || (data?.length ?? 0) === 0,
          error ? `blocked: ${error.code ?? error.message}` : `count=${data?.length}`,
        );
      }

      // Test 20c: a plain partner (not admin/internal) sees no rows.
      {
        const { data, error } = await a.client
          .from("access_requests")
          .select("id");
        record(
          "20c: plain partner cannot SELECT access_requests",
          !error && (data?.length ?? 0) === 0,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 20d: internal user SELECTs the seeded row.
      {
        const { data, error } = await internalPersona.client
          .from("access_requests")
          .select("id")
          .eq("id", reqId);
        record(
          "20d: internal user can SELECT access_requests",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 20e: admin SELECTs the seeded row.
      {
        const { data, error } = await adminPersona.client
          .from("access_requests")
          .select("id")
          .eq("id", reqId);
        record(
          "20e: admin can SELECT access_requests",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 20f: a plain partner cannot UPDATE (no matching policy → 0 rows,
      // status unchanged).
      {
        const { data, error } = await a.client
          .from("access_requests")
          .update({ status: "rejected" })
          .eq("id", reqId)
          .select("id");
        const { data: after } = await admin
          .from("access_requests")
          .select("status")
          .eq("id", reqId)
          .single();
        record(
          "20f: plain partner cannot UPDATE access_requests",
          !error && (data?.length ?? 0) === 0 && after?.status === "pending",
          error ? `error: ${error.message}` : `affected=${data?.length} status=${after?.status}`,
        );
      }

      // Test 20g: internal user CAN UPDATE status (Reject path).
      {
        const { data, error } = await internalPersona.client
          .from("access_requests")
          .update({ status: "rejected" })
          .eq("id", reqId)
          .select("id");
        record(
          "20g: internal user can UPDATE access_requests status",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `affected=${data?.length}`,
        );
      }

      // Test 20h: admin CAN UPDATE status (Approve → converted stamp path).
      {
        const { data, error } = await adminPersona.client
          .from("access_requests")
          .update({ status: "approved" })
          .eq("id", reqId)
          .select("id");
        record(
          "20h: admin can UPDATE access_requests status",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `affected=${data?.length}`,
        );
      }

      // Cleanup every RLS access_requests row via service-role.
      await admin
        .from("access_requests")
        .delete()
        .like("email", "%arxys-rls-test.invalid");
    }

    // --- ADR 0096: product_specs admin-editable write path ------------------
    // Migration 20260727000001 gave product_specs its first write policy:
    // SELECT stays read-open to authenticated, INSERT/UPDATE are admin-only,
    // and DELETE is UNGRANTED FOR EVERYONE. Mirrors the camera_specs block
    // (12a-12g) with two additions camera_specs has no equivalent for:
    //
    //   - 21i, the important one: an ADMIN's DELETE must be refused. Per ADR
    //     0094 a SKU with no product_specs row is silently *skipped* by
    //     loadCandidateSpecs rather than falling back to its raw nameplate, so
    //     a deleted spec row drops a SKU out of the recommender pool with no
    //     error anywhere. Availability is products.active's job. camera_specs
    //     grants delete to admins; this table deliberately does not.
    //   - 21k-21m: the provenance triggers. The post-apply smoke test could
    //     only prove they fire for a SQL-editor write, where auth.uid() is
    //     null. A real signed-in admin session is the only way to prove
    //     updated_by / changed_by actually get stamped.
    //
    // Every assertion runs against a throwaway RLS-SPEC-* row, never a real
    // SKU — a rejection test that unexpectedly *succeeds* would otherwise
    // mutate or delete live customer-facing capacity data. That row is
    // invisible to every consumer while it exists: /comparison looks specs up
    // by competitor.arxys_match_id, videox-compare filters `VX5-V%`, the
    // recommender joins to products, and the price book and both PDFs filter
    // by an explicit SKU list.
    {
      const specSeedId = `RLS-SPEC-${Date.now()}`;
      const specAdminId = `RLS-SPEC-ADMIN-${Date.now()}`;
      // Every NOT NULL column on product_specs; the QuickCompare and
      // hdd_count/raid_level columns added later are all nullable.
      const specRow = (id: string) => ({
        id,
        model_name: `RLS test ${id}`,
        form_factor: "2U Rackmount",
        storage_raw_tb: 100,
        cpu_model: "RLS Test CPU",
        cpu_cores_threads: "8C/16T",
        cpu_base_ghz: 3.0,
        cpu_passmark: 1000,
        ram_gb: 32,
        max_cameras: 100,
        max_cameras_h265: 100,
        network: "RLS test",
        raid_support: "RLS test",
        os: "RLS test",
        warranty: "RLS test",
        vms_certified: "RLS test",
      });

      const { error: specSeedErr } = await admin
        .from("product_specs")
        .insert(specRow(specSeedId));
      if (specSeedErr) {
        record("21: seed product_specs row (service-role)", false, specSeedErr.message);
      }

      // Test 8c suspended adminPersona; 12g reactivated it. Re-assert here so
      // this block does not depend on the order of the ones above it.
      await admin
        .from("partners")
        .update({ status: "active" })
        .eq("id", adminPersona.id);

      // Test 21a: partner A can SELECT product_specs (read-open predates 0096).
      {
        const { data, error } = await a.client
          .from("product_specs")
          .select("id, model_name")
          .eq("id", specSeedId);
        record(
          "21a: partner can SELECT product_specs (read-open)",
          !error && data?.length === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 21b: internal user can SELECT product_specs.
      {
        const { data, error } = await internalPersona.client
          .from("product_specs")
          .select("id")
          .eq("id", specSeedId);
        record(
          "21b: internal user can SELECT product_specs",
          !error && data?.length === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 21c: partner A cannot INSERT — with-check violation is an error.
      {
        const { error } = await a.client
          .from("product_specs")
          .insert(specRow(`RLS-SPEC-PARTNER-${Date.now()}`));
        record(
          "21c: partner cannot INSERT product_specs (admin-only)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 21d: internal user cannot INSERT. Writes are admin-only, NOT
      // internal — the /admin layout admits both, so the form checks isAdmin
      // specifically and RLS is what actually enforces it.
      {
        const { error } = await internalPersona.client
          .from("product_specs")
          .insert(specRow(`RLS-SPEC-INTERNAL-${Date.now()}`));
        record(
          "21d: internal user cannot INSERT product_specs (admin-only, not internal)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 21e: partner A cannot UPDATE — no matching USING clause, so zero
      // rows affected and the value is unchanged.
      {
        const { data, error } = await a.client
          .from("product_specs")
          .update({ storage_raw_tb: 9999 })
          .eq("id", specSeedId)
          .select("id");
        const { data: after } = await admin
          .from("product_specs")
          .select("storage_raw_tb")
          .eq("id", specSeedId)
          .single();
        record(
          "21e: partner cannot UPDATE product_specs",
          (data?.length ?? 0) === 0 && Number(after?.storage_raw_tb) === 100,
          error
            ? `error: ${error.message}`
            : `affected=${data?.length} storage_raw_tb=${after?.storage_raw_tb}`,
        );
      }

      // Test 21f: internal user cannot UPDATE either. This is the capacity
      // guardrail — storage_raw_tb / hdd_count / raid_level_display feed
      // usableCapacityTb() and therefore every customer-facing storage figure.
      {
        const { data, error } = await internalPersona.client
          .from("product_specs")
          .update({ storage_raw_tb: 8888 })
          .eq("id", specSeedId)
          .select("id");
        const { data: after } = await admin
          .from("product_specs")
          .select("storage_raw_tb")
          .eq("id", specSeedId)
          .single();
        record(
          "21f: internal user cannot UPDATE product_specs (admin-only, not internal)",
          (data?.length ?? 0) === 0 && Number(after?.storage_raw_tb) === 100,
          error
            ? `error: ${error.message}`
            : `affected=${data?.length} storage_raw_tb=${after?.storage_raw_tb}`,
        );
      }

      // Test 21g: partner A cannot DELETE — no grant at all, so this is a
      // permission error rather than a silent zero-row no-op.
      {
        const { error } = await a.client
          .from("product_specs")
          .delete()
          .eq("id", specSeedId)
          .select("id");
        const { count } = await admin
          .from("product_specs")
          .select("id", { count: "exact", head: true })
          .eq("id", specSeedId);
        record(
          "21g: partner cannot DELETE product_specs",
          Boolean(error) && count === 1,
          error ? `blocked: ${error.message} remaining=${count}` : `DELETE unexpectedly succeeded, remaining=${count}`,
        );
      }

      // Test 21h: admin CAN INSERT — the write path the form depends on.
      {
        const { data, error } = await adminPersona.client
          .from("product_specs")
          .insert(specRow(specAdminId))
          .select("id");
        record(
          "21h: admin can INSERT product_specs",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `inserted=${data?.length}`,
        );
      }

      // Test 21i: admin CANNOT DELETE. The case camera_specs has no equivalent
      // for, and the reason the grant was withheld (ADR 0094) — a missing spec
      // row removes a SKU from the recommender pool silently.
      {
        const { error } = await adminPersona.client
          .from("product_specs")
          .delete()
          .eq("id", specAdminId)
          .select("id");
        const { count } = await admin
          .from("product_specs")
          .select("id", { count: "exact", head: true })
          .eq("id", specAdminId);
        record(
          "21i: admin cannot DELETE product_specs (grant withheld, ADR 0094)",
          Boolean(error) && count === 1,
          error ? `blocked: ${error.message} remaining=${count}` : `DELETE unexpectedly succeeded, remaining=${count}`,
        );
      }

      // Test 21j: admin CAN UPDATE, and the BEFORE trigger stamps updated_by
      // with the real auth.uid(). The post-apply SQL-editor test could not
      // prove this half — it has no signed-in user, so updated_by stayed null.
      {
        const { error } = await adminPersona.client
          .from("product_specs")
          .update({ hdd_count: 8, raid_level_display: "6" })
          .eq("id", specAdminId);
        const { data: after } = await admin
          .from("product_specs")
          .select("hdd_count, raid_level_display, updated_by, updated_at")
          .eq("id", specAdminId)
          .single();
        record(
          "21j: admin can UPDATE product_specs and updated_by is stamped",
          !error && after?.hdd_count === 8 && after?.updated_by === adminPersona.id,
          error
            ? `error: ${error.message}`
            : `hdd_count=${after?.hdd_count} updated_by=${after?.updated_by === adminPersona.id ? "admin" : after?.updated_by}`,
        );
      }

      // Test 21k: the AFTER trigger recorded both admin writes, with
      // changed_by resolved and `before` null on the insert / populated on the
      // update.
      {
        const { data, error } = await admin
          .from("product_specs_audit")
          .select("operation, changed_by, before, after")
          .eq("spec_id", specAdminId)
          .order("id");
        const ins = data?.find((r) => r.operation === "insert");
        const upd = data?.find((r) => r.operation === "update");
        record(
          "21k: audit trigger recorded the admin insert + update with changed_by",
          !error &&
            data?.length === 2 &&
            ins?.before === null &&
            ins?.changed_by === adminPersona.id &&
            upd?.before !== null &&
            upd?.changed_by === adminPersona.id &&
            (upd?.after as { hdd_count?: number } | null)?.hdd_count === 8,
          error ? `error: ${error.message}` : `rows=${data?.length}`,
        );
      }

      // Test 21l: partner A cannot SELECT the audit table — admin-only, and a
      // policy miss returns zero rows rather than an error.
      {
        const { data, error } = await a.client
          .from("product_specs_audit")
          .select("id")
          .eq("spec_id", specAdminId);
        record(
          "21l: partner cannot SELECT product_specs_audit (admin-only)",
          !error && (data?.length ?? 0) === 0,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 21m: partner A cannot INSERT into the audit table either — no
      // grant, so history cannot be forged from a client.
      {
        const { error } = await a.client.from("product_specs_audit").insert({
          spec_id: specAdminId,
          operation: "update",
          after: { forged: true },
        });
        record(
          "21m: partner cannot INSERT product_specs_audit (no grant, trigger-only)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 21n: admin CAN read the audit table (the history view's source).
      {
        const { data, error } = await adminPersona.client
          .from("product_specs_audit")
          .select("id, operation")
          .eq("spec_id", specAdminId);
        record(
          "21n: admin can SELECT product_specs_audit",
          !error && (data?.length ?? 0) === 2,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Cleanup via service-role: the spec rows AND the audit rows they
      // generated. Without the second delete every run would leave permanent
      // junk in the audit table — nothing in the app can remove it, by design.
      await admin.from("product_specs").delete().like("id", "RLS-SPEC%");
      await admin.from("product_specs_audit").delete().like("spec_id", "RLS-SPEC%");
    }

    // --- ADR 0097: appliance_specs admin-editable write path -----------------
    // Migration 20260729000001 created appliance_specs already carrying the ADR
    // 0096 pattern: SELECT read-open to authenticated, INSERT/UPDATE admin-only,
    // DELETE UNGRANTED FOR EVERYONE, provenance stamped by a BEFORE trigger and
    // an insert-only audit table written by a security-definer AFTER trigger.
    // This block mirrors 21a-21n against that table.
    //
    // It is also the only place two of the apply-note's checks can be made at
    // all. A dashboard SQL-editor session runs privileged and bypasses RLS, so
    // the post-apply verification could inspect grants and policies but could
    // not prove that a real signed-in non-admin is refused, or that an admin's
    // DELETE is refused, or that the triggers stamp a real auth.uid() rather
    // than null. Those are 22c-22d, 22i and 22j-22k below.
    //
    // Every assertion runs against a throwaway RLS-APPL-* row. The table is
    // empty in production until the seven real rows are entered by hand (ADR
    // 0097 §8), and nothing reads it yet — but the same rule applies as for
    // block 21: a rejection test that unexpectedly succeeds must not be able to
    // touch a row a datasheet renders from.
    {
      const applSeedId = `RLS-APPL-${Date.now()}`;
      const applAdminId = `RLS-APPL-ADMIN-${Date.now()}`;
      // Every NOT NULL column on appliance_specs. security_features is NOT NULL
      // too, but DEFAULT '{}', so it is left out to prove the default holds.
      const applRow = (id: string) => ({
        id,
        model_name: `RLS test ${id}`,
        product_group: "V250",
        family_type: "management",
        sheet_group: `RLS-${id}`,
        cpu_model: "RLS Test CPU",
        ram_spec: "32GB DDR5 ECC",
        os_edition: "RLS test",
        form_factor: "1U Rackmount",
      });

      const { error: applSeedErr } = await admin
        .from("appliance_specs")
        .insert(applRow(applSeedId));
      if (applSeedErr) {
        record("22: seed appliance_specs row (service-role)", false, applSeedErr.message);
      }

      // Test 22a: partner A can SELECT appliance_specs (read-open, mirroring
      // product_specs and camera_specs).
      {
        const { data, error } = await a.client
          .from("appliance_specs")
          .select("id, model_name")
          .eq("id", applSeedId);
        record(
          "22a: partner can SELECT appliance_specs (read-open)",
          !error && data?.length === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 22b: internal user can SELECT appliance_specs.
      {
        const { data, error } = await internalPersona.client
          .from("appliance_specs")
          .select("id")
          .eq("id", applSeedId);
        record(
          "22b: internal user can SELECT appliance_specs",
          !error && data?.length === 1,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 22c: partner A cannot INSERT — with-check violation is an error.
      {
        const { error } = await a.client
          .from("appliance_specs")
          .insert(applRow(`RLS-APPL-PARTNER-${Date.now()}`));
        record(
          "22c: partner cannot INSERT appliance_specs (admin-only)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 22d: internal user cannot INSERT. Writes are admin-only, NOT
      // internal — the /admin layout admits both, so the pages and actions check
      // isAdmin specifically and RLS is what actually enforces it.
      {
        const { error } = await internalPersona.client
          .from("appliance_specs")
          .insert(applRow(`RLS-APPL-INTERNAL-${Date.now()}`));
        record(
          "22d: internal user cannot INSERT appliance_specs (admin-only, not internal)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 22e: partner A cannot UPDATE — no matching USING clause, so zero
      // rows affected and the value is unchanged.
      {
        const { data, error } = await a.client
          .from("appliance_specs")
          .update({ model_name: "PARTNER EDIT" })
          .eq("id", applSeedId)
          .select("id");
        const { data: after } = await admin
          .from("appliance_specs")
          .select("model_name")
          .eq("id", applSeedId)
          .single();
        record(
          "22e: partner cannot UPDATE appliance_specs",
          (data?.length ?? 0) === 0 && after?.model_name === `RLS test ${applSeedId}`,
          error
            ? `error: ${error.message}`
            : `affected=${data?.length} model_name=${after?.model_name}`,
        );
      }

      // Test 22f: internal user cannot UPDATE either. These rows publish the
      // management / ACM / workstation datasheets and, once the skuExtraData
      // overrides retire, the Price Book strings for those SKUs.
      {
        const { data, error } = await internalPersona.client
          .from("appliance_specs")
          .update({ model_name: "INTERNAL EDIT" })
          .eq("id", applSeedId)
          .select("id");
        const { data: after } = await admin
          .from("appliance_specs")
          .select("model_name")
          .eq("id", applSeedId)
          .single();
        record(
          "22f: internal user cannot UPDATE appliance_specs (admin-only, not internal)",
          (data?.length ?? 0) === 0 && after?.model_name === `RLS test ${applSeedId}`,
          error
            ? `error: ${error.message}`
            : `affected=${data?.length} model_name=${after?.model_name}`,
        );
      }

      // Test 22g: partner A cannot DELETE — no grant at all, so this is a
      // permission error rather than a silent zero-row no-op.
      {
        const { error } = await a.client
          .from("appliance_specs")
          .delete()
          .eq("id", applSeedId)
          .select("id");
        const { count } = await admin
          .from("appliance_specs")
          .select("id", { count: "exact", head: true })
          .eq("id", applSeedId);
        record(
          "22g: partner cannot DELETE appliance_specs",
          Boolean(error) && count === 1,
          error
            ? `blocked: ${error.message} remaining=${count}`
            : `DELETE unexpectedly succeeded, remaining=${count}`,
        );
      }

      // Test 22h: admin CAN INSERT — the write path /admin/appliance-specs/new
      // depends on, and the one all seven real rows arrive through. The insert
      // omits security_features, so a pass also proves the NOT NULL DEFAULT '{}'
      // holds for a payload that does not mention it.
      {
        const { data, error } = await adminPersona.client
          .from("appliance_specs")
          .insert(applRow(applAdminId))
          .select("id");
        record(
          "22h: admin can INSERT appliance_specs",
          !error && (data?.length ?? 0) === 1,
          error ? `error: ${error.message}` : `inserted=${data?.length}`,
        );
      }

      // Test 22i: admin CANNOT DELETE. The withheld grant (ADR 0097 decision 1):
      // once the overrides retire these rows are the only source for those SKUs'
      // Price Book strings and datasheets, so a deletion blanks them with no
      // error anywhere — the ADR 0094 failure shape. service_role is the
      // documented recovery path, which is what the cleanup below uses.
      {
        const { error } = await adminPersona.client
          .from("appliance_specs")
          .delete()
          .eq("id", applAdminId)
          .select("id");
        const { count } = await admin
          .from("appliance_specs")
          .select("id", { count: "exact", head: true })
          .eq("id", applAdminId);
        record(
          "22i: admin cannot DELETE appliance_specs (grant withheld, ADR 0097)",
          Boolean(error) && count === 1,
          error
            ? `blocked: ${error.message} remaining=${count}`
            : `DELETE unexpectedly succeeded, remaining=${count}`,
        );
      }

      // Test 22j: admin CAN UPDATE, and the BEFORE trigger stamps updated_by
      // with the real auth.uid(). Also exercises the jsonb and text[] columns
      // the form's two non-scalar kinds write — the camera matrix and the
      // security-features list.
      {
        const { error } = await adminPersona.client
          .from("appliance_specs")
          .update({
            family_type: "workstation",
            security_features: ["Secure Boot", "Signed firmware"],
            camera_matrix: [
              { resolution: "1080p", codec: "H.265", fps: 15, cameras: 64, bandwidth_mbps: 125 },
            ],
          })
          .eq("id", applAdminId);
        const { data: after } = await admin
          .from("appliance_specs")
          .select("family_type, security_features, camera_matrix, updated_by, updated_at")
          .eq("id", applAdminId)
          .single();
        const matrix = after?.camera_matrix as { cameras?: number }[] | null;
        record(
          "22j: admin can UPDATE appliance_specs and updated_by is stamped",
          !error &&
            after?.family_type === "workstation" &&
            (after?.security_features as string[] | null)?.length === 2 &&
            matrix?.[0]?.cameras === 64 &&
            after?.updated_by === adminPersona.id,
          error
            ? `error: ${error.message}`
            : `family_type=${after?.family_type} updated_by=${after?.updated_by === adminPersona.id ? "admin" : after?.updated_by}`,
        );
      }

      // Test 22k: the AFTER trigger recorded both admin writes, with changed_by
      // resolved and `before` null on the insert / populated on the update. The
      // two-trigger split (BEFORE stamps, AFTER records) is what puts the
      // provenance columns inside the `after` snapshot.
      {
        const { data, error } = await admin
          .from("appliance_specs_audit")
          .select("operation, changed_by, before, after")
          .eq("spec_id", applAdminId)
          .order("id");
        const ins = data?.find((r) => r.operation === "insert");
        const upd = data?.find((r) => r.operation === "update");
        const updAfter = upd?.after as { family_type?: string; updated_by?: string } | null;
        record(
          "22k: audit trigger recorded the admin insert + update with changed_by",
          !error &&
            data?.length === 2 &&
            ins?.before === null &&
            ins?.changed_by === adminPersona.id &&
            upd?.before !== null &&
            upd?.changed_by === adminPersona.id &&
            updAfter?.family_type === "workstation" &&
            updAfter?.updated_by === adminPersona.id,
          error ? `error: ${error.message}` : `rows=${data?.length}`,
        );
      }

      // Test 22l: partner A cannot SELECT the audit table — admin-only, and a
      // policy miss returns zero rows rather than an error.
      {
        const { data, error } = await a.client
          .from("appliance_specs_audit")
          .select("id")
          .eq("spec_id", applAdminId);
        record(
          "22l: partner cannot SELECT appliance_specs_audit (admin-only)",
          !error && (data?.length ?? 0) === 0,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Test 22m: partner A cannot INSERT into the audit table either — no
      // grant, so history cannot be forged from a client.
      {
        const { error } = await a.client.from("appliance_specs_audit").insert({
          spec_id: applAdminId,
          operation: "update",
          after: { forged: true },
        });
        record(
          "22m: partner cannot INSERT appliance_specs_audit (no grant, trigger-only)",
          Boolean(error),
          error ? `blocked: ${error.message}` : "INSERT unexpectedly succeeded",
        );
      }

      // Test 22n: admin CAN read the audit table.
      {
        const { data, error } = await adminPersona.client
          .from("appliance_specs_audit")
          .select("id, operation")
          .eq("spec_id", applAdminId);
        record(
          "22n: admin can SELECT appliance_specs_audit",
          !error && (data?.length ?? 0) === 2,
          error ? `error: ${error.message}` : `count=${data?.length}`,
        );
      }

      // Cleanup via service-role — the only path that can remove either table's
      // rows, which is the point of 22i.
      await admin.from("appliance_specs").delete().like("id", "RLS-APPL%");
      await admin.from("appliance_specs_audit").delete().like("spec_id", "RLS-APPL%");
    }

    // --- ADR 0151: partners self-update guard -------------------------------
    // authenticated holds UPDATE on every partners column and the UPDATE policy
    // is self-or-admin, so before 0151 a partner could PATCH their own row to
    // role='admin' / is_internal=true. The guard trigger
    // (20261016000001_partners_guard_self_update.sql) lets a non-admin change
    // only `phone` on their own row; a blocked change raises 42501.
    // Applied 2026-10-16, so this block always runs: 23a–23g failing means the
    // self-escalation hole is open again.
    {
      // 8c suspended adminPersona; re-assert active so is_admin() is true here
      // regardless of block order.
      await admin
        .from("partners")
        .update({ status: "active" })
        .eq("id", adminPersona.id);

      const guarded =
        "role, status, is_internal, pipedrive_user_id, company_name, logo_path, phone";
      type GuardedRow = {
        role: string;
        status: string;
        is_internal: boolean;
        pipedrive_user_id: number | null;
        company_name: string;
        logo_path: string | null;
        phone: string | null;
      };
      const readRow = async (id: string) =>
        (
          await admin
            .from("partners")
            .select(guarded)
            .eq("id", id)
            .single<GuardedRow>()
        ).data;
      // A partner's own PATCH against their own row, then the row as
      // service-role sees it.
      const selfPatch = async (p: Persona, patch: Partial<GuardedRow>) => {
        const { error } = await p.client
          .from("partners")
          .update(patch)
          .eq("id", p.id);
        return { error, after: await readRow(p.id) };
      };

      // Tests 23a–23e: partner A cannot change any privilege-bearing column on
      // their own row. Each must fail with 42501 and leave the row unchanged.
      const selfCases: [string, Partial<GuardedRow>, (r: GuardedRow | null) => boolean][] = [
        ["23a: partner cannot set own role=admin", { role: "admin" }, (r) => r?.role === "partner"],
        ["23b: partner cannot set own is_internal=true", { is_internal: true }, (r) => r?.is_internal === false],
        ["23c: partner cannot set own pipedrive_user_id", { pipedrive_user_id: 6039322 }, (r) => r?.pipedrive_user_id === null],
        ["23d: partner cannot rename own company_name", { company_name: "RLS Hijack Co" }, (r) => r?.company_name === "RLS Test Co A"],
        ["23e: partner cannot point own logo_path elsewhere", { logo_path: "other-partner/logo.png" }, (r) => r?.logo_path === null],
      ];
      for (const [name, patch, unchanged] of selfCases) {
        const { error, after } = await selfPatch(a, patch);
        record(
          name,
          error?.code === "42501" && unchanged(after),
          error ? `blocked: ${error.code} ${error.message}` : `UPDATE went through: ${JSON.stringify(after)}`,
        );
        // Reset A via service-role so one escalation that slips through (e.g.
        // before the migration is applied, 23a makes A an admin) cannot change
        // the outcome of the cases after it.
        await admin
          .from("partners")
          .update({
            role: "partner",
            is_internal: false,
            pipedrive_user_id: null,
            company_name: "RLS Test Co A",
            logo_path: null,
          })
          .eq("id", a.id);
      }

      // Test 23f: a suspended partner cannot un-suspend themselves. Suspension
      // is app-level, so B's JWT still works; the guard is what stops this.
      {
        await admin.from("partners").update({ status: "suspended" }).eq("id", b.id);
        const { error, after } = await selfPatch(b, { status: "active" });
        record(
          "23f: suspended partner cannot set own status=active",
          error?.code === "42501" && after?.status === "suspended",
          error ? `blocked: ${error.code}` : `UPDATE went through: status=${after?.status}`,
        );
        await admin.from("partners").update({ status: "active" }).eq("id", b.id);
      }

      // Test 23g: an internal user is not an admin and cannot make themselves one.
      {
        const { error, after } = await selfPatch(internalPersona, { role: "admin" });
        record(
          "23g: internal user cannot set own role=admin",
          error?.code === "42501" && after?.role === "partner",
          error ? `blocked: ${error.code}` : `UPDATE went through: role=${after?.role}`,
        );
      }

      // Test 23h: the guard is column-scoped, not a blanket block — a partner
      // can still change their own phone (the one self-editable column).
      {
        const { error, after } = await selfPatch(a, { phone: "555-0151" });
        record(
          "23h: partner CAN change own phone (self-editable column)",
          !error && after?.phone === "555-0151",
          error ? `error: ${error.code} ${error.message}` : `phone=${after?.phone}`,
        );
      }

      // Test 23i: partner A still cannot touch B's row at all (RLS filters it
      // to zero rows before the trigger ever sees it).
      {
        const { data, error } = await a.client
          .from("partners")
          .update({ phone: "555-9999" })
          .eq("id", b.id)
          .select("id");
        const bAfter = await readRow(b.id);
        record(
          "23i: partner cannot UPDATE another partner's row",
          (data?.length ?? 0) === 0 && bAfter?.phone !== "555-9999",
          error ? `blocked: ${error.message}` : `affected=${data?.length ?? 0}`,
        );
      }

      // Test 23j: an active admin signed in with their own JWT CAN change every
      // guarded column on another partner's row.
      {
        const { error } = await adminPersona.client
          .from("partners")
          .update({ role: "admin", is_internal: true, status: "suspended", pipedrive_user_id: 999999 })
          .eq("id", a.id);
        const after = await readRow(a.id);
        record(
          "23j: admin CAN change role / is_internal / status / pipedrive_user_id",
          !error &&
            after?.role === "admin" &&
            after?.is_internal === true &&
            after?.status === "suspended" &&
            after?.pipedrive_user_id === 999999,
          error ? `error: ${error.code} ${error.message}` : JSON.stringify(after),
        );
        await admin
          .from("partners")
          .update({ role: "partner", is_internal: false, status: "active", pipedrive_user_id: null })
          .eq("id", a.id);
      }

      // Test 23k: service_role (the app's admin client and every script) CAN
      // change them too — the path every /admin/partners action uses.
      {
        const { error } = await admin
          .from("partners")
          .update({ role: "admin", is_internal: true, pipedrive_user_id: 424242 })
          .eq("id", b.id);
        const after = await readRow(b.id);
        record(
          "23k: service_role CAN change role / is_internal / pipedrive_user_id",
          !error && after?.role === "admin" && after?.is_internal === true && after?.pipedrive_user_id === 424242,
          error ? `error: ${error.code} ${error.message}` : JSON.stringify(after),
        );
        await admin
          .from("partners")
          .update({ role: "partner", is_internal: false, pipedrive_user_id: null })
          .eq("id", b.id);
      }
    }
    // =========================================================================
    // Section 24: Project Portal tables (ADRs 0153 to 0156, migrations
    // 20261016000002 to 000006). Partners and anon read and write none of
    // them, partner_contact_links included; internal reads all but the audit;
    // rules are admin-write, no delete; the line ledger and confirmations have
    // no delete. Everything seeded here is removed in the finally below.
    // =========================================================================
    {
      const PROJECT_TABLES = [
        "companies",
        "company_name_aliases",
        "contacts",
        "partner_contact_links",
        "projects",
        "project_contacts",
        "project_submissions",
        "system_design_rules",
        "bom_rules",
        "design_rules_audit",
        "deal_line_syncs",
        "quote_pricing_confirmations",
        "company_sync_includes",
        "project_deal_claims",
      ];
      const tag = Date.now();
      const orgId = 900_000_000 + (tag % 1_000_000);
      const dealId = 990_000_000 + (tag % 1_000_000);
      const ruleKey = `rls_test_${tag}`;
      const ruleItem = `rls_test_${tag}`;
      let companyId: string | null = null;
      let contactId: string | null = null;
      let projectId: string | null = null;
      try {
        // 24: seed through service-role, standing in for the Step 2 sync.
        const company = await admin
          .from("companies")
          .insert({ pipedrive_org_id: orgId, name: `RLS Test Company ${tag}` })
          .select("id")
          .single();
        companyId = company.data?.id ?? null;
        const contact = await admin
          .from("contacts")
          .insert({ pipedrive_person_id: orgId, company_id: companyId, name: "RLS Test Contact" })
          .select("id")
          .single();
        contactId = contact.data?.id ?? null;
        const aliasRes = await admin
          .from("company_name_aliases")
          .insert({ company_id: companyId, alias: `RLS Test Alias ${tag}`, source: "partner_company_name" });
        const project = await admin
          .from("projects")
          .insert({ company_id: companyId, primary_contact_id: contactId, name: "RLS test project", created_by: internalPersona.id })
          .select("id")
          .single();
        projectId = project.data?.id ?? null;
        const linkedSub = await seedSubmission(a.id, "open");
        const looseSub = await seedSubmission(a.id, "open");
        const seedErrors = [
          company.error,
          contact.error,
          aliasRes.error,
          project.error,
          (await admin.from("project_submissions").insert({ submission_id: linkedSub, project_id: projectId })).error,
          (await admin.from("project_contacts").insert({ project_id: projectId, contact_id: contactId })).error,
          // B is a contact's login: the case most likely to leak, if anything does.
          (await admin.from("partner_contact_links").insert({ partner_id: b.id, contact_id: contactId, company_id: companyId })).error,
          (await admin.from("deal_line_syncs").insert({
            pipedrive_deal_id: dealId, submission_id: linkedSub, sku: "VX5-GPU-A1000", role: "recorder",
            qty: 1, pipedrive_product_id: 1416, item_price_sent: 1706, created_by: internalPersona.id,
          })).error,
          (await admin.from("quote_pricing_confirmations").insert({
            pipedrive_deal_id: dealId, submission_id: linkedSub, confirmed_by: internalPersona.id, deal_lines_fingerprint: [],
          })).error,
          (await admin.from("company_sync_includes").insert({ pipedrive_org_id: orgId, reason: "RLS test include" })).error,
          // Step 5 (ADR 0170): a claim with no deal id, so the finally can delete it.
          (await admin.from("project_deal_claims").insert({
            project_id: projectId, lineage_root_submission_id: linkedSub, submission_id: linkedSub,
            confirmed_fingerprint: [], claimed_by: internalPersona.id,
          })).error,
        ].filter(Boolean);
        record("24: seed project tables (service-role)", seedErrors.length === 0, seedErrors.map((e) => e?.message).join("; "));

        // 24a / 24b: partner A, and B whose login is linked to the contact, read nothing.
        for (const [label, p] of [["24a: partner", a], ["24b: linked partner", b]] as const) {
          const leaks: string[] = [];
          for (const t of PROJECT_TABLES) {
            const { data, error } = await p.client.from(t).select("*").limit(5);
            if (!error && (data?.length ?? 0) > 0) leaks.push(`${t}=${data!.length}`);
          }
          record(`${label} reads no row of any project table`, leaks.length === 0, leaks.join(", ") || "all empty or denied");
        }

        // 24c: anon reads nothing.
        {
          const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
          const leaks: string[] = [];
          for (const t of PROJECT_TABLES) {
            const { data, error } = await anonClient.from(t).select("*").limit(5);
            if (!error && (data?.length ?? 0) > 0) leaks.push(`${t}=${data!.length}`);
          }
          record("24c: anon reads no row of any project table", leaks.length === 0, leaks.join(", ") || "all empty or denied");
        }

        // 24d: partner A cannot write any of them. Inserts must error; updates
        // and deletes must touch nothing.
        {
          const inserts: [string, Record<string, unknown>][] = [
            ["project_submissions", { submission_id: looseSub, project_id: projectId }],
            ["partner_contact_links", { partner_id: a.id, contact_id: contactId, company_id: companyId }],
            ["projects", { company_id: companyId, name: "partner project", created_by: a.id }],
            ["project_contacts", { project_id: projectId, contact_id: contactId }],
            ["companies", { pipedrive_org_id: orgId + 1, name: "partner co" }],
            ["contacts", { pipedrive_person_id: orgId + 1, company_id: companyId, name: "partner contact" }],
            ["company_name_aliases", { company_id: companyId, alias: `partner alias ${tag}`, source: "partner_company_name" }],
            ["system_design_rules", { key: `${ruleKey}_p`, value: 1, description: "x" }],
            ["bom_rules", { design_item: `${ruleItem}_p`, applies_to_role: "recorder", sku: "VX5-GPU-A1000", qty_per_server: 1, description: "x" }],
            ["deal_line_syncs", { pipedrive_deal_id: dealId, submission_id: looseSub, sku: "VX5-GPU-A1000", role: "failover", qty: 1, pipedrive_product_id: 1416, item_price_sent: 1706, created_by: a.id }],
            ["quote_pricing_confirmations", { pipedrive_deal_id: dealId, confirmed_by: a.id, deal_lines_fingerprint: [] }],
            ["company_sync_includes", { pipedrive_org_id: orgId + 3, reason: "partner include" }],
            ["project_deal_claims", { project_id: projectId, lineage_root_submission_id: looseSub, submission_id: looseSub, confirmed_fingerprint: [], claimed_by: a.id }],
          ];
          const wentThrough: string[] = [];
          for (const [t, row] of inserts) {
            const { error } = await a.client.from(t).insert(row);
            // The claim probe reuses the seed's project, so a unique-key error
            // (23505) would hide a lost grant: require the permission error.
            if (!error || (t === "project_deal_claims" && error.code !== "42501")) wentThrough.push(`insert ${t}`);
          }
          const upd = await a.client.from("project_submissions").update({ calc_role: "option" }).eq("submission_id", linkedSub).select("submission_id");
          if ((upd.data?.length ?? 0) > 0) wentThrough.push("update project_submissions");
          const del = await a.client.from("partner_contact_links").delete().eq("partner_id", b.id).select("partner_id");
          if ((del.data?.length ?? 0) > 0) wentThrough.push("delete partner_contact_links");
          const { count } = await admin.from("project_submissions").select("submission_id", { count: "exact", head: true }).eq("project_id", projectId!);
          record(
            "24d: partner cannot write any project table (incl. attaching a submission to a project)",
            wentThrough.length === 0 && count === 1,
            wentThrough.length ? `went through: ${wentThrough.join(", ")}` : `blocked; project still has ${count} calc`,
          );
        }

        // 24e: internal reads every table except the admin-only audit.
        {
          const missing: string[] = [];
          for (const t of PROJECT_TABLES.filter((t) => t !== "design_rules_audit")) {
            const { data, error } = await internalPersona.client.from(t).select("*").limit(1);
            if (error || (data?.length ?? 0) === 0) missing.push(`${t}${error ? `: ${error.message}` : " empty"}`);
          }
          const audit = await internalPersona.client.from("design_rules_audit").select("id").limit(1);
          record(
            "24e: internal reads all project tables, not design_rules_audit",
            missing.length === 0 && (audit.data?.length ?? 0) === 0,
            missing.join("; ") || `audit rows visible: ${audit.data?.length ?? 0}`,
          );
        }

        // 24f: internal can attach a submission and link a login, each
        // attributed to themselves. (Ledger lines are server-only since Step 5,
        // ADR 0171, see 24g; pricing confirmations since Step 6, ADR 0175, see 27b.)
        {
          const steps = [
            ["attach", (await internalPersona.client.from("project_submissions").insert({ submission_id: looseSub, project_id: projectId, linked_by: internalPersona.id })).error],
            ["link", (await internalPersona.client.from("partner_contact_links").insert({ partner_id: a.id, contact_id: contactId, company_id: companyId, linked_by: internalPersona.id })).error],
          ] as const;
          const failed = steps.filter(([, e]) => e).map(([n, e]) => `${n}: ${e!.message}`);
          record("24f: internal can attach a calc and link a login", failed.length === 0, failed.join("; "));
        }

        // 24g: internal limits: no forged attribution, no sync-owned writes,
        // no rule edits, no deletes on the ledger or confirmations, no line twice.
        {
          const blocked: [string, boolean][] = [];
          const forged = await internalPersona.client.from("projects").insert({ company_id: companyId, name: "forged", created_by: adminPersona.id });
          blocked.push(["forged created_by", Boolean(forged.error)]);
          const co = await internalPersona.client.from("companies").insert({ pipedrive_org_id: orgId + 2, name: "internal co" });
          blocked.push(["companies insert", Boolean(co.error)]);
          const rule = await internalPersona.client.from("system_design_rules").update({ description: "internal edit" }).eq("key", "failover_days_fraction").select("key");
          blocked.push(["rule edit", Boolean(rule.error) || (rule.data?.length ?? 0) === 0]);
          const dl = await internalPersona.client.from("deal_line_syncs").delete().eq("pipedrive_deal_id", dealId).select("id");
          blocked.push(["deal_line_syncs delete", Boolean(dl.error) || (dl.data?.length ?? 0) === 0]);
          const qc = await internalPersona.client.from("quote_pricing_confirmations").delete().eq("pipedrive_deal_id", dealId).select("id");
          blocked.push(["confirmation delete", Boolean(qc.error) || (qc.data?.length ?? 0) === 0]);
          // Step 5 (ADR 0171, review gate S-1): the ledger is server-written only.
          const li = await internalPersona.client.from("deal_line_syncs").insert({ pipedrive_deal_id: dealId, submission_id: looseSub, sku: "VX5-GPU-A1000", role: "failover", qty: 1, pipedrive_product_id: 1416, item_price_sent: 1706, created_by: internalPersona.id });
          blocked.push(["deal_line_syncs insert", Boolean(li.error)]);
          const lu = await internalPersona.client.from("deal_line_syncs").update({ qty: 999 }).eq("pipedrive_deal_id", dealId).select("id");
          blocked.push(["deal_line_syncs update", Boolean(lu.error) || (lu.data?.length ?? 0) === 0]);
          // The key still holds for the server: the same (deal, sku, role) twice.
          const dup = await admin.from("deal_line_syncs").insert({ pipedrive_deal_id: dealId, submission_id: looseSub, sku: "VX5-GPU-A1000", role: "recorder", qty: 1, pipedrive_product_id: 1416, item_price_sent: 1706, created_by: internalPersona.id });
          blocked.push(["same (deal, sku, role) twice", dup.error?.code === "23505"]);
          const notBlocked = blocked.filter(([, ok]) => !ok).map(([n]) => n);
          record("24g: internal is blocked from forging, sync-owned writes, rule edits, ledger writes, duplicate lines", notBlocked.length === 0, notBlocked.length ? `not blocked: ${notBlocked.join(", ")}` : "all blocked");
        }

        // 24h: admin edits a throwaway rule; updated_by is stamped, the audit
        // records it, and delete is refused.
        {
          const ins = await adminPersona.client.from("bom_rules").insert({ design_item: ruleItem, applies_to_role: "workstation", sku: "VX5-GPU-A1000", qty_per_server: 1, description: "RLS test rule" }).select("id").single();
          const upd = await adminPersona.client.from("bom_rules").update({ qty_per_server: 2 }).eq("design_item", ruleItem).select("updated_by").single();
          const sdr = await adminPersona.client.from("system_design_rules").insert({ key: ruleKey, value: 1, description: "RLS test rule" });
          const audit = await adminPersona.client.from("design_rules_audit").select("operation, changed_by").eq("rule_table", "bom_rules").eq("rule_key", String(ins.data?.id ?? ""));
          const del = await adminPersona.client.from("bom_rules").delete().eq("design_item", ruleItem).select("id");
          const typo = await adminPersona.client.from("bom_rules").insert({ design_item: ruleItem, applies_to_role: "recorder", sku: "VX5-NOT-A-SKU", qty_per_server: 1, description: "typo" });
          const ops = (audit.data ?? []).filter((r) => r.changed_by === adminPersona.id).map((r) => r.operation).sort();
          record(
            "24h: admin writes rules (stamped + audited), cannot delete, unknown SKU refused",
            !ins.error && !upd.error && !sdr.error && upd.data?.updated_by === adminPersona.id &&
              ops.join(",") === "insert,update" && (Boolean(del.error) || (del.data?.length ?? 0) === 0) && Boolean(typo.error),
            [ins.error?.message, upd.error?.message, sdr.error?.message, `audit=${ops.join(",")}`, `delete=${del.error?.code ?? del.data?.length}`, `typo=${typo.error?.message ?? "INSERTED"}`].filter(Boolean).join("; "),
          );
        }

        // 24i: the company include list (ADR 0156) is admin-write: internal can
        // read it but not add or remove; admin can do both, as themselves.
        {
          const intAdd = await internalPersona.client.from("company_sync_includes").insert({ pipedrive_org_id: orgId + 4, reason: "internal include" });
          const intDel = await internalPersona.client.from("company_sync_includes").delete().eq("pipedrive_org_id", orgId).select("pipedrive_org_id");
          const forged = await adminPersona.client.from("company_sync_includes").insert({ pipedrive_org_id: orgId + 5, reason: "forged", added_by: internalPersona.id });
          const add = await adminPersona.client.from("company_sync_includes").insert({ pipedrive_org_id: orgId + 6, reason: "RLS admin include", added_by: adminPersona.id });
          const del = await adminPersona.client.from("company_sync_includes").delete().eq("pipedrive_org_id", orgId + 6).select("pipedrive_org_id");
          record(
            "24i: include list is admin-write (internal cannot add/remove; admin can, no forged added_by)",
            Boolean(intAdd.error) && (Boolean(intDel.error) || (intDel.data?.length ?? 0) === 0) &&
              Boolean(forged.error) && !add.error && (del.data?.length ?? 0) === 1,
            [`internal add=${intAdd.error ? "blocked" : "WENT THROUGH"}`, `internal delete=${intDel.data?.length ?? intDel.error?.code}`,
              `forged=${forged.error ? "blocked" : "WENT THROUGH"}`, `admin add=${add.error?.message ?? "ok"}`, `admin delete=${del.data?.length ?? del.error?.message}`].join("; "),
          );
        }
        // 24j: project_deal_claims (Step 5, ADR 0170). Internal and admin read
        // it (24e); no session writes it; the ledger takes 'sending' from the
        // server. The trigger that keeps a recorded deal id is proven in PGlite
        // only: a claim holding a deal id cannot be deleted, so this run never
        // records one on the live table.
        {
          const blocked: [string, boolean][] = [];
          const ins = await internalPersona.client.from("project_deal_claims").insert({ project_id: projectId, lineage_root_submission_id: looseSub, submission_id: looseSub, confirmed_fingerprint: [], claimed_by: internalPersona.id });
          // Same project as the seed claim: only a permission error proves the grant is gone.
          blocked.push(["internal insert", ins.error?.code === "42501"]);
          // A no-op write: tests the missing grant alone, and if it ever went
          // through, the row stays deletable (a recorded deal id never is).
          const upd = await internalPersona.client.from("project_deal_claims").update({ submission_id: linkedSub }).eq("project_id", projectId!).select("id");
          blocked.push(["internal update", Boolean(upd.error) || (upd.data?.length ?? 0) === 0]);
          const del = await internalPersona.client.from("project_deal_claims").delete().eq("project_id", projectId!).select("id");
          blocked.push(["internal delete", Boolean(del.error) || (del.data?.length ?? 0) === 0]);
          const adminRead = await adminPersona.client.from("project_deal_claims").select("id").eq("project_id", projectId!);
          blocked.push(["admin reads the claim", !adminRead.error && (adminRead.data?.length ?? 0) === 1]);
          const second = await admin.from("project_deal_claims").insert({ project_id: projectId, lineage_root_submission_id: looseSub, submission_id: looseSub, confirmed_fingerprint: [], claimed_by: internalPersona.id });
          blocked.push(["second claim for the project", second.error?.code === "23505"]);
          const sending = await admin.from("deal_line_syncs").update({ status: "sending" }).eq("pipedrive_deal_id", dealId).eq("sku", "VX5-GPU-A1000").eq("role", "recorder").select("status");
          blocked.push(["server sets sending", !sending.error && sending.data?.[0]?.status === "sending"]);
          const notOk = blocked.filter(([, ok]) => !ok).map(([n]) => n);
          record("24j: project_deal_claims is server-written, one per project; the ledger takes sending", notOk.length === 0, notOk.length ? `failed: ${notOk.join(", ")}` : "all as expected");
        }
      } finally {
        // Children first: the claim, the ledger and confirmations restrict
        // submission and partner deletes, and projects restrict company deletes.
        if (projectId) await admin.from("project_deal_claims").delete().eq("project_id", projectId).is("pipedrive_deal_id", null);
        await admin.from("deal_line_syncs").delete().eq("pipedrive_deal_id", dealId);
        await admin.from("quote_pricing_confirmations").delete().eq("pipedrive_deal_id", dealId);
        await admin.from("partner_contact_links").delete().in("partner_id", [a.id, b.id]);
        if (projectId) {
          await admin.from("project_submissions").delete().eq("project_id", projectId);
          await admin.from("project_contacts").delete().eq("project_id", projectId);
        }
        if (companyId) {
          await admin.from("projects").delete().eq("company_id", companyId);
          await admin.from("company_name_aliases").delete().eq("company_id", companyId);
          await admin.from("contacts").delete().eq("company_id", companyId);
          await admin.from("companies").delete().eq("id", companyId);
        }
        const { data: testRules } = await admin.from("bom_rules").select("id").eq("design_item", ruleItem);
        const ids = (testRules ?? []).map((r) => String(r.id));
        if (ids.length) await admin.from("design_rules_audit").delete().eq("rule_table", "bom_rules").in("rule_key", ids);
        await admin.from("bom_rules").delete().eq("design_item", ruleItem);
        await admin.from("design_rules_audit").delete().eq("rule_table", "system_design_rules").eq("rule_key", ruleKey);
        await admin.from("system_design_rules").delete().eq("key", ruleKey);
        await admin.from("company_sync_includes").delete().in("pipedrive_org_id", [orgId, orgId + 3, orgId + 4, orgId + 5, orgId + 6]);
      }
    }
    // =========================================================================
    // Section 25: submission_system_designs (ADR 0165, migration
    // 20261022000001). Internal and admin read; partners and anon read nothing.
    // No API role can UPDATE or DELETE; only service_role can INSERT, and only
    // for a submission owned by an active internal user or admin. Denials are
    // checked for 42501 (insufficient_privilege) explicitly, so an unrelated
    // error never passes as one. Seeded submissions are removed by
    // teardownPersona, and the banked rows go with them (on delete cascade).
    // =========================================================================
    {
      const banked = (submissionId: string, createdBy: string) => ({
        submission_id: submissionId,
        resolved_design: { sfp: false, gpu: true },
        rules_snapshot: { snapshotVersion: 1, systemDesignRules: [], bomRules: [] },
        bom: [{ sku: "VX5-GPU-A1000", qty: 1, role: "recorder", ruleId: null }],
        engine_version: "rls-test",
        created_by: createdBy,
      });
      const is42501 = (e: { code?: string } | null) => e?.code === "42501";
      const internalSub = await seedSubmission(internalPersona.id, "open");
      const otherInternalSub = await seedSubmission(internalPersona.id, "open");
      const partnerSub = await seedSubmission(a.id, "open");

      // 25: service_role banks a design for the internal owner's submission.
      const seed = await admin.from("submission_system_designs").insert(banked(internalSub, internalPersona.id));
      record("25: service_role banks a design for an internal owner's submission", !seed.error, seed.error?.message);

      // 25a: partner A, linked partner B and anon read nothing.
      {
        const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const leaks: string[] = [];
        for (const [label, c] of [["partner", a.client], ["linked partner", b.client], ["anon", anonClient]] as const) {
          const { data, error } = await c.from("submission_system_designs").select("submission_id").limit(5);
          if (!error && (data?.length ?? 0) > 0) leaks.push(`${label}=${data!.length}`);
        }
        record("25a: partners and anon read no banked design", leaks.length === 0, leaks.join(", ") || "all empty or denied");
      }

      // 25b: internal and admin read it.
      {
        const missing: string[] = [];
        for (const [label, p] of [["internal", internalPersona], ["admin", adminPersona]] as const) {
          const { data, error } = await p.client.from("submission_system_designs").select("submission_id").eq("submission_id", internalSub);
          if (error || (data?.length ?? 0) !== 1) missing.push(`${label}${error ? `: ${error.message}` : " saw none"}`);
        }
        record("25b: internal and admin read the banked design", missing.length === 0, missing.join("; "));
      }

      // 25c: partner, internal non-admin and admin sessions cannot INSERT,
      // UPDATE or DELETE. With no grant, each must fail with 42501.
      {
        const notDenied: string[] = [];
        for (const [label, p, owner] of [
          ["partner", a, a.id],
          ["internal", internalPersona, internalPersona.id],
          ["admin", adminPersona, adminPersona.id],
        ] as const) {
          const ins = await p.client.from("submission_system_designs").insert(banked(otherInternalSub, owner));
          if (!is42501(ins.error)) notDenied.push(`${label} insert: ${ins.error?.code ?? "WENT THROUGH"}`);
          const upd = await p.client.from("submission_system_designs").update({ engine_version: "tampered" }).eq("submission_id", internalSub).select("submission_id");
          if (!is42501(upd.error)) notDenied.push(`${label} update: ${upd.error?.code ?? `rows=${upd.data?.length}`}`);
          const del = await p.client.from("submission_system_designs").delete().eq("submission_id", internalSub).select("submission_id");
          if (!is42501(del.error)) notDenied.push(`${label} delete: ${del.error?.code ?? `rows=${del.data?.length}`}`);
        }
        const { data: still } = await admin.from("submission_system_designs").select("engine_version").eq("submission_id", internalSub).maybeSingle();
        record(
          "25c: partner, internal and admin sessions cannot insert, update or delete a banked design (42501)",
          notDenied.length === 0 && still?.engine_version === "rls-test",
          notDenied.join("; ") || `row intact (engine_version=${still?.engine_version})`,
        );
      }

      // 25d: service_role limits: no update, no delete, no second row for a
      // submission, no row a non-owner or a partner owner would create.
      {
        const notBlocked: string[] = [];
        const upd = await admin.from("submission_system_designs").update({ engine_version: "tampered" }).eq("submission_id", internalSub).select("submission_id");
        if (!is42501(upd.error)) notBlocked.push(`update: ${upd.error?.code ?? `rows=${upd.data?.length}`}`);
        const del = await admin.from("submission_system_designs").delete().eq("submission_id", internalSub).select("submission_id");
        if (!is42501(del.error)) notBlocked.push(`delete: ${del.error?.code ?? `rows=${del.data?.length}`}`);
        const twice = await admin.from("submission_system_designs").insert(banked(internalSub, internalPersona.id));
        if (twice.error?.code !== "23505") notBlocked.push(`second row: ${twice.error?.code ?? "WENT THROUGH"}`);
        const notOwner = await admin.from("submission_system_designs").insert(banked(otherInternalSub, adminPersona.id));
        if (!is42501(notOwner.error)) notBlocked.push(`non-owner created_by: ${notOwner.error?.code ?? "WENT THROUGH"}`);
        const partnerOwner = await admin.from("submission_system_designs").insert(banked(partnerSub, a.id));
        if (!is42501(partnerOwner.error)) notBlocked.push(`partner-owned submission: ${partnerOwner.error?.code ?? "WENT THROUGH"}`);
        record(
          "25d: service_role cannot update, delete, bank twice, or bank for a non-owner or a partner",
          notBlocked.length === 0,
          notBlocked.join("; ") || "all blocked",
        );
      }
    }
    // =========================================================================
    // Section 26: submissions write guard (ADR 0167, migration
    // 20261022000002; baseline B1-S-2 / B1-A-1 / B1-S-13). A non-admin session
    // may UPDATE only status and is_preferred, cannot move a won or lost row
    // unless internal, and cannot INSERT a deal id, email stamp, custom
    // created_at, an on-behalf target (unless internal) or a parent row it
    // cannot see. Tests 11 and 12 still cover the allowed partner updates.
    // Every denial is checked for 42501 explicitly (B1-S-7). Rows seeded here
    // for internalPersona are deleted in the block's own finally, so a throw
    // part-way cannot leave an on-behalf row that blocks teardown of A.
    // =========================================================================
    {
      const is42501 = (e: { code?: string } | null) => e?.code === "42501";
      const sizing = {
        project_name: "RLS-guard-test",
        cameras_count: 10,
        resolution_code: "4K",
        codec: "H.265",
        complexity: "MED",
        retention_days: 30,
        bandwidth_mbps: 250,
        storage_tb: 5,
      };
      const guardedCols = "pipedrive_deal_id, on_behalf_of_partner_id, parent_submission_id, created_at, storage_tb, status, email_sent_at";
      const snapshot = async (id: string) =>
        JSON.stringify((await admin.from("submissions").select(guardedCols).eq("id", id).single()).data);
      const intRows: string[] = [];
      try {
        const aOpen = await seedSubmission(a.id, "open");
        const aWon = await seedSubmission(a.id, "won");
        const aLost = await seedSubmission(a.id, "lost");
        const bOpen = await seedSubmission(b.id, "open");
        const intWon = await seedSubmission(internalPersona.id, "won");
        intRows.push(intWon);

        // 26a: partner A cannot PATCH (or upsert) a protected column on their
        // own row.
        {
          const notDenied: string[] = [];
          for (const [label, patch] of [
            ["pipedrive_deal_id", { pipedrive_deal_id: 999999999 }],
            ["on_behalf_of_partner_id", { on_behalf_of_partner_id: b.id }],
            ["parent_submission_id", { parent_submission_id: bOpen }],
            ["created_at", { created_at: "2099-01-01T00:00:00Z" }],
            ["storage_tb", { storage_tb: 500 }],
            ["email_sent_at", { email_sent_at: new Date().toISOString() }],
          ] as const) {
            const before = await snapshot(aOpen);
            const { error } = await a.client.from("submissions").update(patch).eq("id", aOpen).select("id");
            const after = await snapshot(aOpen);
            if (!is42501(error) || before !== after) notDenied.push(`${label}: ${error?.code ?? "WENT THROUGH"}`);
          }
          const before = await snapshot(aOpen);
          const upsert = await a.client
            .from("submissions")
            .upsert({ id: aOpen, partner_id: a.id, ...sizing, pipedrive_deal_id: 999999999 })
            .select("id");
          if (!is42501(upsert.error) || before !== (await snapshot(aOpen))) {
            notDenied.push(`upsert pipedrive_deal_id: ${upsert.error?.code ?? "WENT THROUGH"}`);
          }
          record(
            "26a: partner cannot PATCH or upsert own pipedrive_deal_id / on-behalf / parent / created_at / figures / email stamp (42501)",
            notDenied.length === 0,
            notDenied.join("; ") || "all blocked, row unchanged",
          );
        }

        // 26b: partner A cannot move their own won or lost row, so the delete
        // guard (status = 'open') still holds.
        {
          const reopen = await a.client.from("submissions").update({ status: "open" }).eq("id", aWon).select("id");
          const del = await a.client.from("submissions").delete().eq("id", aWon).select("id");
          const { data: still } = await admin.from("submissions").select("status").eq("id", aWon).maybeSingle();
          const flip = await a.client.from("submissions").update({ status: "won" }).eq("id", aLost).select("id");
          const { data: lost } = await admin.from("submissions").select("status").eq("id", aLost).maybeSingle();
          record(
            "26b: partner cannot reopen own won or flip own lost to won (42501), so cannot delete them",
            is42501(reopen.error) &&
              !del.error &&
              (del.data?.length ?? 0) === 0 &&
              still?.status === "won" &&
              is42501(flip.error) &&
              lost?.status === "lost",
            `reopen=${reopen.error?.code ?? "WENT THROUGH"} deleted=${del.data?.length} status=${still?.status} ` +
              `lost->won=${flip.error?.code ?? "WENT THROUGH"} status=${lost?.status}`,
          );
        }

        // 26c: partner A cannot INSERT a row carrying a server-written or
        // visibility column.
        {
          const notDenied: string[] = [];
          for (const [label, extra] of [
            ["pipedrive_deal_id", { pipedrive_deal_id: 999999999 }],
            ["email_sent_at", { email_sent_at: new Date().toISOString() }],
            ["created_at", { created_at: "2020-01-01T00:00:00Z" }],
            ["on_behalf_of_partner_id", { on_behalf_of_partner_id: b.id }],
            ["on_behalf_of_company_name", { on_behalf_of_company_name: "RLS Victim Co" }],
            ["parent_submission_id (B's row)", { parent_submission_id: bOpen }],
          ] as const) {
            const { data, error } = await a.client
              .from("submissions")
              .insert({ partner_id: a.id, ...sizing, ...extra })
              .select("id");
            if (!is42501(error)) notDenied.push(`${label}: ${error?.code ?? `INSERTED ${data?.[0]?.id}`}`);
          }
          record(
            "26c: partner cannot INSERT a deal id, email stamp, created_at, on-behalf target or foreign parent (42501)",
            notDenied.length === 0,
            notDenied.join("; ") || "all blocked",
          );
        }

        // 26d: a partner revision of their own row still saves, and deleting
        // the open parent clears the child's link (the FK's ON DELETE SET NULL
        // runs as the table owner and passes the guard).
        {
          const failed: string[] = [];
          const parent = await seedSubmission(a.id, "open");
          const child = await a.client
            .from("submissions")
            .insert({ partner_id: a.id, ...sizing, parent_submission_id: parent })
            .select("id");
          if (child.error || child.data?.length !== 1) failed.push(`revision insert: ${child.error?.message ?? "no row"}`);
          const del = await a.client.from("submissions").delete().eq("id", parent).select("id");
          if (del.error || del.data?.length !== 1) failed.push(`parent delete: ${del.error?.message ?? "no row"}`);
          if (child.data?.[0]) {
            const { data: after } = await admin.from("submissions").select("parent_submission_id").eq("id", child.data[0].id).maybeSingle();
            if (after?.parent_submission_id !== null) failed.push(`child parent still ${after?.parent_submission_id}`);
          }
          record(
            "26d: partner CAN insert a revision of their own row and delete its open parent (link cleared)",
            failed.length === 0,
            failed.join("; ") || "as expected",
          );
        }

        // 26e: an active internal user files on behalf of partner A and
        // reopens their own won row, but still cannot write a deal id. A can
        // revise the row prepared for them; unrelated partner B cannot parent
        // onto it.
        {
          const failed: string[] = [];
          const onBehalf = await internalPersona.client
            .from("submissions")
            .insert({ partner_id: internalPersona.id, ...sizing, on_behalf_of_partner_id: a.id })
            .select("id");
          if (onBehalf.error || onBehalf.data?.length !== 1) {
            failed.push(`on-behalf insert: ${onBehalf.error?.message ?? "no row"}`);
          } else {
            const onBehalfId = onBehalf.data[0].id as string;
            intRows.push(onBehalfId);
            const aRevise = await a.client
              .from("submissions")
              .insert({ partner_id: a.id, ...sizing, parent_submission_id: onBehalfId })
              .select("id");
            if (aRevise.error || aRevise.data?.length !== 1) failed.push(`target revise: ${aRevise.error?.message ?? "no row"}`);
            const bRevise = await b.client
              .from("submissions")
              .insert({ partner_id: b.id, ...sizing, parent_submission_id: onBehalfId })
              .select("id");
            if (!is42501(bRevise.error)) failed.push(`unrelated parent: ${bRevise.error?.code ?? "WENT THROUGH"}`);
          }
          const reopen = await internalPersona.client.from("submissions").update({ status: "open" }).eq("id", intWon).select("id");
          if (reopen.error || reopen.data?.length !== 1) failed.push(`reopen: ${reopen.error?.message ?? "no row"}`);
          const deal = await internalPersona.client.from("submissions").update({ pipedrive_deal_id: 999999999 }).eq("id", intWon).select("id");
          if (!is42501(deal.error)) failed.push(`deal id: ${deal.error?.code ?? "WENT THROUGH"}`);
          record(
            "26e: internal CAN insert on behalf and reopen own won, CANNOT write a deal id (42501); only the target may revise it",
            failed.length === 0,
            failed.join("; ") || "as expected",
          );
        }

        // 26f: an active admin with their own JWT can write every column.
        // Seeds its own won row so the result does not depend on 26b.
        {
          const adminTarget = await seedSubmission(a.id, "won");
          const { data, error } = await adminPersona.client
            .from("submissions")
            .update({ pipedrive_deal_id: 999999998, status: "open", on_behalf_of_partner_id: b.id })
            .eq("id", adminTarget)
            .select("id");
          record("26f: admin JWT CAN set a deal id, an on-behalf target and reopen a partner's won row", !error && data?.length === 1, error?.message);
        }

        // 26g: service_role (the app's server stamps) writes the two columns
        // submitCalculation now writes as service role.
        {
          const { data, error } = await admin
            .from("submissions")
            .update({ pipedrive_deal_id: 999999997, email_sent_at: new Date().toISOString() })
            .eq("id", aOpen)
            .select("id");
          record("26g: service_role CAN stamp pipedrive_deal_id and email_sent_at", !error && data?.length === 1, error?.message);
        }
      } finally {
        if (intRows.length > 0) await admin.from("submissions").delete().in("id", intRows);
      }
    }
    // =========================================================================
    // Section 27: Step 6 (ADR 0175, migration 20261023000003). The "Quote
    // ready" send log and pricing confirmations are written by server code as
    // service_role only. Internal and admin read both; partners and anon read
    // neither. The pin trigger (ADR 0174, 20261023000002) is 19i.
    // =========================================================================
    {
      const tag = Date.now();
      const dealId = 980_000_000 + (tag % 1_000_000);
      const sub = await seedSubmission(internalPersona.id, "open");
      let quoteId: string | null = null;
      try {
        const stamp = await admin.from("submissions").update({ pipedrive_deal_id: dealId }).eq("id", sub);
        const quote = await admin
          .from("project_quotes")
          .insert({
            submission_id: sub, pipedrive_deal_id: dealId, version: 1, snapshot: { marker: "rls-test-27" },
            terms_version: "v-rls-test", validity_days: 7, generated_by: internalPersona.id,
          })
          .select("id")
          .single();
        quoteId = quote.data?.id ?? null;
        const seedSend = await admin
          .from("quote_email_sends")
          .insert({ project_quote_id: quoteId, to_email: `rls-27-${tag}@arxys-rls-test.invalid`, sent_by: internalPersona.id, status: "sent" });
        record("27: seed a quote and a send (service-role)", !stamp.error && !quote.error && !seedSend.error,
          [stamp.error?.message, quote.error?.message, seedSend.error?.message].filter(Boolean).join("; "));

        // 27a: no session writes the send log; partners and anon read nothing,
        // internal and admin read it.
        {
          const wrong: string[] = [];
          for (const [label, p] of [["partner", a], ["internal", internalPersona], ["admin", adminPersona]] as const) {
            const ins = await p.client
              .from("quote_email_sends")
              .insert({ project_quote_id: quoteId, to_email: `rls-27-${label}-${tag}@arxys-rls-test.invalid`, sent_by: p.id });
            // A unique-key or CHECK error would hide a lost grant: require 42501.
            if (ins.error?.code !== "42501") wrong.push(`${label} insert: ${ins.error?.code ?? "INSERTED"}`);
            const upd = await p.client.from("quote_email_sends").update({ status: "failed" }).eq("project_quote_id", quoteId!).select("id");
            if (!upd.error && (upd.data?.length ?? 0) > 0) wrong.push(`${label} update went through`);
            const del = await p.client.from("quote_email_sends").delete().eq("project_quote_id", quoteId!).select("id");
            if (!del.error && (del.data?.length ?? 0) > 0) wrong.push(`${label} delete went through`);
          }
          const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
          for (const [label, client] of [["partner", a.client], ["anon", anonClient]] as const) {
            const { data } = await client.from("quote_email_sends").select("id").eq("project_quote_id", quoteId!);
            if ((data?.length ?? 0) > 0) wrong.push(`${label} reads ${data!.length}`);
          }
          for (const [label, p] of [["internal", internalPersona], ["admin", adminPersona]] as const) {
            const { data, error } = await p.client.from("quote_email_sends").select("id, status").eq("project_quote_id", quoteId!);
            if (error || data?.length !== 1 || data[0].status !== "sent") wrong.push(`${label} read: ${error?.message ?? `${data?.length} rows, ${data?.[0]?.status}`}`);
          }
          record("27a: the send log is server-written; internal and admin read it, partners and anon do not",
            wrong.length === 0, wrong.length ? wrong.join("; ") : "as expected");
        }

        // 27b: no session inserts a pricing confirmation (the gate's bypass,
        // ADR 0175); the server can, with its lines; internal still reads.
        {
          const wrong: string[] = [];
          for (const [label, p] of [["internal", internalPersona], ["admin", adminPersona], ["partner", a]] as const) {
            const { error } = await p.client
              .from("quote_pricing_confirmations")
              .insert({ pipedrive_deal_id: dealId, confirmed_by: p.id, deal_lines_fingerprint: [{ product_id: 1 }] });
            if (error?.code !== "42501") wrong.push(`${label} insert: ${error?.code ?? "INSERTED"}`);
          }
          const server = await admin
            .from("quote_pricing_confirmations")
            .insert({ pipedrive_deal_id: dealId, submission_id: sub, confirmed_by: internalPersona.id, deal_lines_fingerprint: [], deal_lines: [] });
          if (server.error) wrong.push(`service_role insert: ${server.error.message}`);
          const read = await internalPersona.client.from("quote_pricing_confirmations").select("id, deal_lines").eq("pipedrive_deal_id", dealId);
          if (read.error || read.data?.length !== 1) wrong.push(`internal read: ${read.error?.message ?? read.data?.length}`);
          record("27b: no session inserts a pricing confirmation; service_role does; internal reads it",
            wrong.length === 0, wrong.length ? wrong.join("; ") : "as expected");
        }
      } finally {
        // Children first: sends restrict quote deletes; quotes and
        // confirmations restrict the submission delete in teardownPersona.
        if (quoteId) await admin.from("quote_email_sends").delete().eq("project_quote_id", quoteId);
        await admin.from("quote_pricing_confirmations").delete().eq("pipedrive_deal_id", dealId);
        await admin.from("project_quotes").delete().eq("submission_id", sub);
        await admin.from("submissions").delete().eq("id", sub);
      }
    }
  } finally {
    await teardownPersona(a);
    await teardownPersona(b);
    await teardownPersona(adminPersona);
    await teardownPersona(internalPersona);
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
  console.log(
    "Note: Server Action guards (self-suspend, last-active-admin, resend-invite TOCTOU)\n" +
      "are not exercised here — they live in src/app/(app)/admin/partners/actions.ts, not RLS.",
  );
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(2);
});
