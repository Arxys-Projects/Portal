// Portal UI design system — pure class builders (ADR 0067).
// No JSX / framework imports here so the style contract can be unit-tested
// under the repo's `tsx --test "src/**/*.test.ts"` harness, and so both
// <button> and link-styled-as-button consumers share one source of truth.

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "amber"
  | "invert";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-lg border " +
  "transition-colors cursor-pointer whitespace-nowrap " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arxys-navy/40 " +
  "focus-visible:ring-offset-1 disabled:opacity-45 disabled:pointer-events-none";

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-[13px]",
  md: "px-[18px] py-2.5 text-sm",
  // /projects (ADR 0067 step +1): 48px+ tall primary action targets, 17/700
  // labels — one step up from `md` per the page's type scale (4e).
  lg: "px-5 py-3 text-[17px] font-bold min-h-[48px]",
};

// ADR 0075: gold reinstated (amber), plus outline/ghost/invert for the reskin.
// primary/secondary/destructive keep their meaning so existing consumers are untouched.
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-arxys-navy text-white border-transparent hover:bg-arxys-navy-deep",
  secondary: "bg-secondary text-arxys-navy border-line hover:bg-secondary-hover",
  destructive: "bg-danger text-white border-transparent hover:bg-danger-deep",
  outline:
    "bg-surface text-arxys-navy border-[#b9c4d5] hover:bg-arxys-navy-soft hover:border-arxys-navy",
  ghost:
    "bg-transparent text-ink-soft border-transparent hover:bg-[#eef1f5] hover:text-ink",
  amber:
    "bg-arxys-gold text-arxys-text-on-gold border-transparent hover:bg-arxys-gold-hover",
  invert: "bg-white text-arxys-navy border-white hover:bg-arxys-navy-soft",
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
export const BADGE_ON_BEHALF = "bg-[#eef1f6] text-[#3a4656] border-[#dfe3ea]";
