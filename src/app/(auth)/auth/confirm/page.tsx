import Link from "next/link";
import { confirmToken } from "./actions";

type Search = Promise<{
  token_hash?: string;
  type?: string;
  next?: string;
}>;

const HEADING: Record<string, string> = {
  invite: "Welcome to the Arxys Partner Portal",
  recovery: "Reset your password",
  magiclink: "Sign in to the Arxys Partner Portal",
  signup: "Confirm your account",
};

const BLURB: Record<string, string> = {
  invite:
    "You don't have a password yet. Click below to securely confirm your invitation and create one.",
  recovery:
    "Click below to securely confirm this request and choose a new password.",
  magiclink: "Click below to finish signing in.",
  signup: "Click below to confirm your account.",
};

const CTA: Record<string, string> = {
  invite: "Continue to create my password",
  recovery: "Continue to reset my password",
  magiclink: "Continue to sign in",
  signup: "Confirm my account",
};

export default async function ConfirmPage({ searchParams }: { searchParams: Search }) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    return (
      <>
        <h2 className="mb-4 text-center text-base font-medium text-neutral-700">
          Link incomplete
        </h2>
        <p className="mb-4 text-sm text-neutral-600">
          This confirmation link is missing information. Request a fresh link and
          try again.
        </p>
        <Link
          href="/forgot-password"
          className="block w-full rounded bg-arxys-gold px-3 py-2 text-center text-sm font-medium text-arxys-text-on-gold shadow-sm hover:bg-arxys-gold-hover"
        >
          Send me a new link
        </Link>
      </>
    );
  }

  const heading = HEADING[type] ?? "Confirm";
  const blurb = BLURB[type] ?? "Click below to continue.";
  const cta = CTA[type] ?? "Continue";

  return (
    <>
      <h2 className="mb-2 text-center text-base font-semibold text-neutral-800">
        {heading}
      </h2>
      <p className="mb-5 text-center text-sm text-neutral-600">{blurb}</p>
      <form action={confirmToken}>
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next ?? "/dashboard"} />
        <button
          type="submit"
          className="w-full rounded bg-arxys-gold px-3 py-2 text-sm font-medium text-arxys-text-on-gold shadow-sm hover:bg-arxys-gold-hover"
        >
          {cta}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-neutral-400">
        For your security this link can only be used once.
      </p>
    </>
  );
}
