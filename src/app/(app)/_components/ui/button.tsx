"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  buttonClasses,
  iconButtonClasses,
  type ButtonVariant,
  type ButtonSize,
  type IconButtonTone,
} from "./styles";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Filled, always-reads-as-a-control button. One primary per context. */
export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest} />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: IconButtonTone;
  /** Required — icon buttons have no visible text. Used for aria-label + title. */
  label: string;
  children: ReactNode;
}

/**
 * One consistent icon action (delete, star). Keep it in a fixed column and
 * pass `disabled` rather than omitting it when not applicable, so rows don't
 * visually jump (ADR 0067, Decision 2).
 */
export function IconButton({
  tone = "default",
  label,
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={iconButtonClasses(tone, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
