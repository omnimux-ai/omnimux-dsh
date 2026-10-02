import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from "react";
import { IconCloseFill14, IconSearchOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";

import { cx } from "../internal/cx.ts";
import css from "./SearchField.module.css";

export interface SearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "type" | "value" | "defaultValue" | "onChange"
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onClear?: () => void;
  debounceMs?: number;
  shortcut?: string;
  stretch?: boolean;
  clearLabel?: string;
}

export interface SearchFieldHandle {
  focus: () => void;
  clear: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function matchesShortcut(event: globalThis.KeyboardEvent, shortcut: string): boolean {
  const raw = shortcut.trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  const wantsMeta = /⌘|cmd|meta/.test(lower);
  const wantsCtrl = /\bctrl\b|⌃/.test(lower);
  const wantsAlt = /\balt\b|⌥/.test(lower);
  const wantsShift = /\bshift\b|⇧/.test(lower);
  const key = raw.replace(/⌘|⌃|⌥|⇧|cmd|meta|ctrl|alt|shift|\+/gi, "").trim().toLowerCase();
  if (!key) return false;
  if (Boolean(event.metaKey) !== wantsMeta) return false;
  if (Boolean(event.ctrlKey) !== wantsCtrl) return false;
  if (Boolean(event.altKey) !== wantsAlt) return false;
  if (Boolean(event.shiftKey) !== wantsShift) return false;
  return event.key.toLowerCase() === key;
}

/**
 * Search field: leading search icon, optional shortcut kbd, and a clear control.
 * Uncontrolled `debounceMs` (default 200) batches `onValueChange`. Pass `0`
 * (or a controlled `value`) to emit immediately.
 */
export const SearchField = forwardRef<SearchFieldHandle, SearchFieldProps>(function SearchField(
  {
    value,
    defaultValue = "",
    onValueChange,
    onClear,
    debounceMs = 200,
    shortcut,
    stretch = false,
    clearLabel = "Clear",
    className,
    disabled,
    id,
    placeholder = "Search",
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue);
  const current = controlled ? value : inner;
  const immediate = controlled || debounceMs <= 0;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!shortcut || disabled) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      if (!matchesShortcut(event, shortcut)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [shortcut, disabled]);

  function emit(next: string): void {
    if (immediate) {
      onValueChange?.(next);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onValueChange?.(next);
    }, debounceMs);
  }

  function apply(next: string): void {
    if (!controlled) setInner(next);
    emit(next);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    apply(event.target.value);
  }

  function handleClear(): void {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!controlled) setInner("");
    onValueChange?.("");
    onClear?.();
    inputRef.current?.focus();
  }

  useImperativeHandle(ref, () => ({
    focus: () => { inputRef.current?.focus(); },
    clear: handleClear,
  }));

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    rest.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && current) {
      event.preventDefault();
      handleClear();
    }
  }

  return (
    <span className={cx(css.root, stretch && css.stretch, disabled && css.disabled, className)}>
      <span className={css.icon} aria-hidden="true">
        <IconSearchOutline16 size={16} />
      </span>
      <input
        {...rest}
        ref={inputRef}
        id={inputId}
        type="search"
        className={css.input}
        value={current}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      {current
        ? (
          <button
            type="button"
            className={css.clear}
            aria-label={clearLabel}
            title={clearLabel}
            disabled={disabled}
            onClick={handleClear}
          >
            <IconCloseFill14 size={14} />
          </button>
        )
        : shortcut
          ? <kbd className={css.shortcut}>{shortcut}</kbd>
          : null}
    </span>
  );
});
