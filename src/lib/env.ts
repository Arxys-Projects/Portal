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
type Env = { readonly [K in RequiredVar]: string };

function loadEnv(): Env {
  const partial: Partial<Record<RequiredVar, string>> = {};
  for (const name of REQUIRED_VARS) {
    const value = process.env[name];
    if (!value || value.length === 0) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    partial[name] = value;
  }
  return partial as Env;
}

export const env: Env = loadEnv();
