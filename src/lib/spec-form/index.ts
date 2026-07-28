// The shared spec-form kit (ADR 0097 decision 4).
//
// This barrel is deliberately React-free: the section-walking renderer is
// imported from "@/lib/spec-form/form-shell" instead. Keeping JSX out of the
// barrel is what lets the node test runner and the round-trip scripts import
// the kinds, builders and coercion helpers directly.

export * from "./fields";
export * from "./schema";
export * from "./action-state";
