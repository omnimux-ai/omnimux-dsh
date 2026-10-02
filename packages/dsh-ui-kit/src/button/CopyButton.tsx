import { forwardRef, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  IconCheckOutline16,
  IconCopyOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";

import { copyToClipboard } from "../internal/clipboard.ts";
import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import { Button } from "./Button.tsx";
import type { ButtonProps, ButtonSize, ButtonVariant } from "./Button.tsx";
import css from "./CopyButton.module.css";

export type CopyState = "idle" | "copied" | "error";

export interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "size" | "variant" | "onCopy" | "onError"> {
  /** Text content to copy, or an accessor function returning text / Promise<string>. */
  text: string | (() => string | Promise<string>);
  /** Reset timeout in ms, defaults to 2000. */
  timeout?: number;
  /** Idle button label, defaults to '复制'. Pass empty string or null to hide label. */
  label?: string;
  /** Success label, defaults to '已复制'. */
  copiedLabel?: string;
  /** Error label, defaults to '复制失败'. */
  errorLabel?: string;
  /** Button size tier, defaults to 'sm'. */
  size?: ButtonSize;
  /** Button visual variant, defaults to 'ghost'. */
  variant?: ButtonVariant;
  /** Callback fired after successfully copying to clipboard. */
  onCopy?: (text: string) => void;
  /** Callback fired if copying to clipboard fails. */
  onError?: (err: Error) => void;
  /** Whether to render state icons, defaults to true. */
  showIcon?: boolean;
  /** Optional click handler callback. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * One-click copy button with 2s automatic reset state machine and clipboard fallback.
 */
export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(
  function CopyButton(
    {
      text,
      timeout = 2000,
      label = "复制",
      copiedLabel = "已复制",
      errorLabel = "复制失败",
      size = "sm",
      variant = "ghost",
      onCopy,
      onError,
      showIcon = true,
      onClick,
      className,
      disabled,
      ...rest
    },
    ref,
  ) {
    const [state, setState] = useState<CopyState>("idle");
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      };
    }, []);

    const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      if (disabled) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      try {
        const resolvedText = typeof text === "function" ? await text() : text;
        const success = await copyToClipboard(resolvedText);
        if (success) {
          setState("copied");
          onCopy?.(resolvedText);
        } else {
          throw new Error("Clipboard copy failed");
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState("error");
        onError?.(error);
      }

      timerRef.current = setTimeout(() => {
        setState("idle");
      }, timeout);
    };

    let currentLabel: string | undefined = label;
    if (state === "copied") currentLabel = copiedLabel;
    else if (state === "error") currentLabel = errorLabel;

    let iconNode = null;
    if (showIcon) {
      if (state === "copied") {
        iconNode = (
          <span className={cssClass(css.copySuccessIcon, "copySuccessIcon")}>
            <IconCheckOutline16 size={size === "xs" ? 14 : 16} />
          </span>
        );
      } else {
        iconNode = (
          <span
            className={
              state === "error"
                ? cssClass(css.copyErrorIcon, "copyErrorIcon")
                : undefined
            }
          >
            <IconCopyOutline16 size={size === "xs" ? 14 : 16} />
          </span>
        );
      }
    }

    const stateClass =
      state === "copied"
        ? cssClass(css.copyButtonSuccess, "copyButtonSuccess")
        : state === "error"
          ? cssClass(css.copyButtonError, "copyButtonError")
          : undefined;

    return (
      <Button
        {...rest}
        ref={ref}
        size={size}
        variant={variant}
        disabled={disabled}
        leadingIcon={iconNode}
        className={cx(stateClass, className)}
        onClick={handleClick}
        aria-live="polite"
      >
        {currentLabel}
      </Button>
    );
  },
);
