import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="mb-4 text-center text-base font-medium text-neutral-700">
        Get a sign-in link
      </h2>
      <p className="mb-4 text-sm text-neutral-600">
        Enter your email and we&apos;ll send you a secure link to set or reset
        your password. This works whether you&apos;re signing in for the first
        time or your invitation link expired.
      </p>
      <ForgotForm />
      <p className="mt-4 text-center text-sm text-neutral-600">
        <Link href="/login" className="text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
