import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx.ts";
import css from "./InputField.module.css";

export interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

/**
 * Labeled single-line field with prefix / suffix slots, hint, and error text.
 * Height stays 32px to line up with Button and SearchField.
 */
export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  {
    label,
    hint,
    error,
    prefix,
    suffix,
    className,
    disabled,
    id,
    required,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const invalid = Boolean(error);
  const describedBy = [
    rest["aria-describedby"],
    hint ? hintId : undefined,
    invalid ? errorId : undefined,
  ].filter(Boolean).join(" ") || undefined;

  return (
    <label className={cx(css.root, className)} htmlFor={inputId}>
      {label != null && label !== ""
        ? (
          <span className={css.label}>
            {label}
            {required ? <span className={css.required} aria-hidden="true">*</span> : null}
          </span>
        )
        : null}
      <span className={cx(css.control, invalid && css.invalid, disabled && css.disabled)}>
        {prefix != null ? <span className={css.affix}>{prefix}</span> : null}
        <input
          {...rest}
          ref={ref}
          id={inputId}
          className={css.input}
          disabled={disabled}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
        {suffix != null ? <span className={css.affix}>{suffix}</span> : null}
      </span>
      {invalid
        ? <span className={cx(css.meta, css.error)} id={errorId} role="alert">{error}</span>
        : hint
          ? <span className={cx(css.meta, css.hint)} id={hintId}>{hint}</span>
          : null}
    </label>
  );
});
