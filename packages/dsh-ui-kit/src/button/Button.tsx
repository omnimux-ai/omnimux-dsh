import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconLoadingOutline16, Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import type { TooltipSide } from "@deepseek-ai/dsh-client-ui-primitives";

import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import css from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "default" | "sm" | "xs";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  type?: "button" | "submit" | "reset";
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: cssClass(css.primary, "primary"),
  secondary: cssClass(css.secondary, "secondary"),
  ghost: cssClass(css.ghost, "ghost"),
  outline: cssClass(css.outline, "outline"),
  danger: cssClass(css.danger, "danger"),
};

const SIZE_CLASS: Record<ButtonSize, string | undefined> = {
  default: undefined,
  sm: cssClass(css.sm, "sm"),
  xs: cssClass(css.xs, "xs"),
};

/**
 * 32 / 28 / 24 workbench button. Consumes `--dsw-alias-*` tokens so light and
 * dark both follow the host theme (including OmniMux full-shell tint).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "default",
    loading = false,
    leadingIcon,
    trailingIcon,
    type = "button",
    className,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = Boolean(disabled) || loading;
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx(css.button, VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
    >
      {loading
        ? (
          <span className={cx(css.slot, css.spinner)} aria-hidden="true">
            <IconLoadingOutline16 size={size === "xs" ? 14 : 16} />
          </span>
        )
        : leadingIcon != null
          ? <span className={css.slot} aria-hidden="true">{leadingIcon}</span>
          : null}
      {children != null && children !== ""
        ? <span className={cx(css.label, loading && css.loadingLabel)}>{children}</span>
        : null}
      {!loading && trailingIcon != null
        ? <span className={css.slot} aria-hidden="true">{trailingIcon}</span>
        : null}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "leadingIcon" | "trailingIcon" | "children"> {
  /** Required accessible name. Also used as tooltip when `title` is omitted. */
  "aria-label": string;
  /** Tooltip copy. Falls back to `aria-label`. */
  title?: string;
  tooltipSide?: TooltipSide;
  children: ReactNode;
}

/** Square icon-only button with an official Tooltip and a required aria-label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = "ghost",
    size = "default",
    loading = false,
    type = "button",
    className,
    disabled,
    children,
    title,
    tooltipSide = "bottom",
    "aria-label": ariaLabel,
    ...rest
  },
  ref,
) {
  const isDisabled = Boolean(disabled) || loading;
  const tooltip = title ?? ariaLabel;
  const button = (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx(
        css.button,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        css.iconOnly,
        className,
      )}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
    >
      <span className={cx(css.slot, loading && css.spinner)} aria-hidden="true">
        {loading ? <IconLoadingOutline16 size={size === "xs" ? 14 : 16} /> : children}
      </span>
    </button>
  );

  if (!tooltip) return button;
  return (
    <Tooltip label={tooltip} side={tooltipSide} delayMs={280} disabled={isDisabled}>
      {button}
    </Tooltip>
  );
});
