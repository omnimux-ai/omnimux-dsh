import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import css from "./Badge.module.css";

export type BadgeVariant =
  | "default"
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "error"
  | "info";

export type BadgeShape = "capsule" | "dot" | "square";

export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visual semantic variant, defaults to 'default'. */
  variant?: BadgeVariant;
  /** Shape style, defaults to 'capsule'. */
  shape?: BadgeShape;
  /** Size tier, defaults to 'md'. */
  size?: BadgeSize;
  /** Whether to render as an isolated status dot without label/count. */
  dot?: boolean;
  /** Optional numerical badge count. Displays `${maxCount}+` if count exceeds maxCount. */
  count?: number;
  /** Maximum display count threshold, defaults to 99. */
  maxCount?: number;
  /** Optional leading icon node. */
  icon?: ReactNode;
  /** Custom class name. */
  className?: string;
  /** Child label content. */
  children?: ReactNode;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: cssClass(css.default, "default"),
  neutral: cssClass(css.neutral, "neutral"),
  brand: cssClass(css.brand, "brand"),
  success: cssClass(css.success, "success"),
  warning: cssClass(css.warning, "warning"),
  error: cssClass(css.error, "error"),
  info: cssClass(css.info, "info"),
};

const SHAPE_CLASS: Record<BadgeShape, string> = {
  capsule: cssClass(css.capsule, "capsule"),
  dot: cssClass(css.dotShape, "dotShape"),
  square: cssClass(css.square, "square"),
};

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: cssClass(css.sm, "sm"),
  md: cssClass(css.md, "md"),
  lg: cssClass(css.lg, "lg"),
};

/**
 * Universal badge / status indicator conforming to official `--dsw-alias-*` tokens.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    variant = "default",
    shape = "capsule",
    size = "md",
    dot = false,
    count,
    maxCount = 99,
    icon,
    className,
    children,
    ...rest
  },
  ref,
) {
  const isPureDot = dot || shape === "dot";
  const resolvedShape: BadgeShape = isPureDot ? "dot" : shape;

  let displayContent: ReactNode = children;
  if (!isPureDot && count !== undefined && (children == null || children === "")) {
    displayContent = count > maxCount ? `${maxCount}+` : String(count);
  }

  return (
    <span
      {...rest}
      ref={ref}
      className={cx(
        css.badge,
        VARIANT_CLASS[variant],
        SHAPE_CLASS[resolvedShape],
        SIZE_CLASS[size],
        className,
      )}
      role={isPureDot ? "status" : undefined}
    >
      {isPureDot ? null : (
        <>
          {icon != null ? <span className={css.iconSlot} aria-hidden="true">{icon}</span> : null}
          {displayContent != null && displayContent !== "" ? displayContent : null}
        </>
      )}
    </span>
  );
});
