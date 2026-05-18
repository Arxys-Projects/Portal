// Centralized environment-variable accessor.
//
// Validation is *lazy* — each variable is checked the first time something
// reads it, not at module load. This keeps unrelated build-time analysis
// (e.g. Next.js collecting page data for /dashboard) from failing when a
// variable owned by a different subsystem (e.g. Pipedrive, SMTP) hasn't
// been provisioned yet. Code that actually needs a variable still fails
// loudly and immediately when it tries to use it.

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PIPEDRIVE_API_TOKEN",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "INTERNAL_NOTIFICATION_EMAIL",
] as const;

type RequiredVar = (typeof REQUIRED_VARS)[number];
export type Env = { readonly [K in RequiredVar]: string };

function read(name: RequiredVar): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildEnv(): Env {
  const obj = {} as Record<RequiredVar, string>;
  for (const name of REQUIRED_VARS) {
    Object.defineProperty(obj, name, {
      enumerable: true,
      configurable: false,
      get: () => read(name),
    });
  }
  return obj as Env;
}

export const env: Env = buildEnv();
