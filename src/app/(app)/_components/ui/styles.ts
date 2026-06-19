// Portal UI design system — pure class builders (ADR 0067).
// No JSX / framework imports here so the style contract can be unit-tested
// under the repo's `tsx --test "src/**/*.test.ts"` harness, and so both
// <button> and link-styled-as-button consumers share one source of truth.

export type ButtonVariant = "primary" | "secondary" | "destructive";
export type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-lg border " +
  "transition-colors cursor-pointer whitespace-nowrap " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arxys-navy/40 " +
  "focus-visible:ring-offset-1 disabled:opacity-45 disabled:pointer-events-none";

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-[13px]",
  md: "px-[18px] py-2.5 text-sm",
};

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-arxys-navy text-white border-transparent hover:bg-arxys-navy-deep",
  secondary: "bg-secondary text-arxys-navy border-line hover:bg-secondary-hover",
  destructive: "bg-danger text-white border-transparent hover:bg-danger-deep",
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
): string {
  return cx(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], className);
}

export type IconButtonTone = "default" | "danger";

const ICON_BUTTON_BASE =
  "inline-flex items-center justify-center h-9 w-9 rounded-lg border border-line " +
  "text-ink-soft bg-transparent transition-colors cursor-pointer " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arxys-navy/40 " +
  "disabled:opacity-35 disabled:pointer-events-none";

const ICON_BUTTON_TONES: Record<IconButtonTone, string> = {
  default: "hover:bg-arxys-navy-soft hover:text-arxys-navy hover:border-arxys-navy",
  danger: "hover:bg-danger-soft hover:text-danger hover:border-danger",
};

export function iconButtonClasses(
  tone: IconButtonTone = "default",
  className = "",
): string {
  return cx(ICON_BUTTON_BASE, ICON_BUTTON_TONES[tone], className);
}

// One StatusBadge, three semantic variants. The "status" variant reuses
// STATUS_META (submissions/status.ts) so submission-status colours keep a
// single source of truth; source/on-behalf are defined here.
export const BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 " +
  "text-xs font-semibold leading-none";

export const BADGE_SOURCE = "bg-arxys-navy-soft text-arxys-navy border-[#bcd0e6]";
export const BADGE_ON_BEHALF = "bg-[#eef0f3] text-[#3a4452] border-line";
