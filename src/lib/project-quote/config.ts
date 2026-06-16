// Project Quote — generation configuration.
//
// The single place for the values that govern a quote's validity window. The
// value IN FORCE at generation is frozen onto each project_quotes row (the
// validity_days column and snapshot.generation.validityDays), so changing this
// constant only affects FUTURE quotes; already-issued quotes keep the window
// they were generated with. Expiry is therefore reproducible without a data
// migration when the window shortens (ADR 0061).

// Days a Project Quote remains valid, measured from its generated_at date. May
// shorten. Never stored as a mutable "expired" flag: expiry is computed at
// render as generated_at plus this many days.
export const PROJECT_QUOTE_VALIDITY_DAYS = 7;
