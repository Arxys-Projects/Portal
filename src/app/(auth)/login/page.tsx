import Link from "next/link";
import { LoginForm } from "./login-form";

type Search = Promise<{ next?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const { next } = await searchParams;
  return (
    <>
      <h2 className="mb-4 text-center text-base font-medium text-neutral-700">
        Sign in
      </h2>
      <LoginForm next={next ?? "/dashboard"} />
      <p className="mt-4 text-center text-sm text-neutral-600">
        <Link href="/forgot-password" className="text-blue-600 hover:underline">
          Forgot password?
        </Link>
      </p>
    </>
  );
}
