// RLS verification suite for the Arxys Partner Portal.
// Creates two ephemeral users (partner A and B), exercises the policies on
// partners / products / submissions / camera_specs, and tears the users down.
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

    // --- Phase 3 Step 5: submissions UPDATE / DELETE policies ---------------
    // submissions_update_own allows a partner to UPDATE their own rows;
    // submissions_delete_own_draft allows DELETE only when status is draft/NULL.
    // RLS-blocked UPDATE/DELETE return zero affected rows (not an error).

    // Test 11: A UPDATE own submission status → allowed.
    {
      const id = await seedSubmission(a.id, "draft");
      const { data, error } = await a.client
        .from("submissions")
        .update({ status: "sent" })
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
      const id = await seedSubmission(a.id, "draft");
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
      const id = await seedSubmission(b.id, "draft");
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
        !error && (data?.length ?? 0) === 0 && after?.status === "draft",
        `rows=${data?.length} afterStatus=${after?.status}`,
      );
    }

    // Test 14: A DELETE own submission with status=NULL → allowed.
    {
      const id = await seedSubmission(a.id, null);
      const { data, error } = await a.client
        .from("submissions")
        .delete()
        .eq("id", id)
        .select("id");
      record(
        "14: A DELETE own submission status=NULL",
        !error && (data?.length ?? 0) === 1,
        error?.message ?? `rows=${data?.length}`,
      );
    }

    // Test 15: A DELETE own submission with status='draft' → allowed.
    {
      const id = await seedSubmission(a.id, "draft");
      const { data, error } = await a.client
        .from("submissions")
        .delete()
        .eq("id", id)
        .select("id");
      record(
        "15: A DELETE own submission status='draft'",
        !error && (data?.length ?? 0) === 1,
        error?.message ?? `rows=${data?.length}`,
      );
    }

    // Test 16: A DELETE own submission with status='sent' → blocked (guard).
    {
      const id = await seedSubmission(a.id, "sent");
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
        "16: A DELETE own 'sent' submission is blocked by status guard",
        !error && (data?.length ?? 0) === 0 && Boolean(after),
        `rows=${data?.length} stillExists=${Boolean(after)}`,
      );
    }

    // Test 17: A DELETE B's submission → blocked (ownership).
    {
      const id = await seedSubmission(b.id, "draft");
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
          status: "draft",
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

    // Seed one B-owned submission (won, undeleteable by own-draft policy) so
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
          status: "draft",
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
      const quoteSubmissionId = await seedSubmission(b.id, "sent");
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

      // Cleanup: delete the quote rows BEFORE teardownPersona deletes the
      // submission (project_quotes.submission_id is on delete restrict).
      await admin.from("project_quotes").delete().eq("submission_id", quoteSubmissionId);
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
