"use client";

import { useEffect } from "react";
import { buttonClasses } from "@/app/(app)/_components/ui/styles";

// The error page for everything under the root layout. It sits at the root,
// not in (app), because the (app) layout itself can throw (getViewer() on a
// failed partners read, the invite auto-activate) and an error.tsx does not
// catch its own segment's layout. A full reload, not a segment retry, so the
// layout's checks run again from scratch.
export default function AppError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-soft">Reload the page to try again.</p>
      {error.digest ? (
        <p className="mt-1 text-xs text-ink-soft">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={buttonClasses("primary", "lg", "mt-6")}
      >
        Reload the page
      </button>
    </main>
  );
}
