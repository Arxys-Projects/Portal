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
      {error === "expired_or_invalid" || error === "missing_token" ? (
        <p
          role="alert"
          className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          That link has expired or was already used. Use{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Get a sign-in link
          </Link>{" "}
          below to send yourself a fresh one.
        </p>
      ) : null}
      <LoginForm next={next ?? "/dashboard"} />
      <div className="mt-6 rounded border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-600">
        <p className="font-medium text-neutral-700">First time here?</p>
        <p className="mt-1">
          You don&apos;t have a password yet. Open the invitation email from
          Arxys and click <span className="font-medium">Accept invitation</span>{" "}
          to create one. Can&apos;t find it or the link expired?{" "}
          <Link href="/forgot-password" className="text-blue-600 hover:underline">
            Send yourself a link
          </Link>
          .
        </p>
      </div>
      <p className="mt-4 text-center text-sm text-neutral-600">
        <Link href="/forgot-password" className="text-blue-600 hover:underline">
          Forgot password?
        </Link>
      </p>
    </>
  );
}
