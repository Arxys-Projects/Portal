// One-shot script to create the first admin user for the portal.
// Run with: node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts \
//             --email you@arxys.com --name "Andy Newbom" --company Arxys
//
// Idempotent on re-runs for the same email: if the auth user already exists,
// the partner row is upserted with role=admin.

import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { env } from "../src/lib/env";

type Args = { email: string; name: string; company: string; password?: string };

function parseCli(): Args {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      company: { type: "string" },
      password: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.email || !values.name || !values.company) {
    console.error(
      "Usage: bootstrap-admin.ts --email <email> --name <full name> --company <company> [--password <pw>]",
    );
    process.exit(2);
  }
  return {
    email: values.email,
    name: values.name,
    company: values.company,
    password: values.password,
  };
}

function generatePassword(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}

async function main() {
  const args = parseCli();
  const password = args.password ?? generatePassword();
  const generated = !args.password;

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId: string;

  const existing = await admin.auth.admin.listUsers({ perPage: 200 });
  if (existing.error) throw new Error(`listUsers failed: ${existing.error.message}`);
  const match = existing.data.users.find((u) => u.email === args.email);

  if (match) {
    console.log(`User exists for ${args.email} (id=${match.id}). Reusing.`);
    userId = match.id;
  } else {
    const created = await admin.auth.admin.createUser({
      email: args.email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw new Error(`createUser failed: ${created.error?.message}`);
    }
    userId = created.data.user.id;
    console.log(`Created auth user ${args.email} (id=${userId}).`);
    if (generated) {
      console.log(`Initial password (save this once): ${password}`);
    }
  }

  const upsert = await admin
    .from("partners")
    .upsert({
      id: userId,
      company_name: args.company,
      contact_name: args.name,
      role: "admin",
      status: "active",
    })
    .select("id, role")
    .single();
  if (upsert.error) {
    throw new Error(`partners upsert failed: ${upsert.error.message}`);
  }

  console.log(`Partner record set to role=${upsert.data.role} for ${args.email}.`);
  console.log("Done. Sign in at /login.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
