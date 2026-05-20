import Link from "next/link";
import { LoginForm } from "./login-form";

type Search = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h2 className="mb-4 text-center text-base font-medium text-neutral-700">
        Sign in
      </h2>
      {error === "suspended" ? (
        <p
          role="alert"
          className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          Your account has been suspended. Contact your administrator.
        </p>
      ) : null}
      <LoginForm next={next ?? "/dashboard"} />
      <p className="mt-4 text-center text-sm text-neutral-600">
        <Link href="/forgot-password" className="text-blue-600 hover:underline">
          Forgot password?
        </Link>
      </p>
    </>
  );
}
