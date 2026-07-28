// The result shape every spec form's save action returns, and the shape
// <SpecFormShell> renders.
//
// It lives in the kit rather than in a per-table `actions.ts` because the shell
// is the thing that reads it: the shell renders `fieldErrors` under the matching
// inputs, `error` and `_form` as alerts, and `message` + `warnings` as the
// confirmation. A per-table copy of this type would be a contract the shell
// could not see drift in.
//
// Type-only, so a "use server" module can import it without adding an export.

export type SpecActionState =
  | { status: "idle" }
  | { status: "error"; error: string; fieldErrors?: Record<string, string[]> }
  | { status: "ok"; message: string; warnings?: string[] };
