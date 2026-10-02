import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { IconChevronDownOutline14, Menu } from "@deepseek-ai/dsh-client-ui-primitives";
import type { MenuItem } from "@deepseek-ai/dsh-client-ui-primitives";

import { cx } from "../internal/cx.ts";
import css from "./DropdownSelect.module.css";

export interface DropdownOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  danger?: boolean;
}

export interface DropdownSelectProps {
  value?: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
  align?: "start" | "end";
}

/**
 * 32px select built on the official Menu. Never renders a native `<select>`.
 */
export function DropdownSelect({
  value,
  options,
  onChange,
  placeholder = "Select",
  disabled = false,
  className,
  "aria-label": ariaLabel,
  id,
  align = "start",
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const selected = options.find((option) => option.value === value);
  const items = useMemo<MenuItem[]>(
    () => options.map((option) => {
      const item: MenuItem = { id: option.value, label: option.label };
      if (option.disabled === true) item.disabled = true;
      if (option.icon !== undefined) item.icon = option.icon;
      if (option.danger === true) item.danger = true;
      return item;
    }),
    [options],
  );

  return (
    <Menu
      open={open && !disabled}
      portal
      compact
      align={align}
      selectedId={value}
      items={items}
      onSelect={(next) => {
        onChange(next);
        setOpen(false);
      }}
      onClose={() => { setOpen(false); }}
      className={cx(css.anchor, className)}
      anchor={(
        <button
          type="button"
          id={triggerId}
          className={cx(css.trigger, open && css.open)}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => { if (!disabled) setOpen((prev) => !prev); }}
        >
          <span className={cx(css.label, !selected && css.placeholder)}>
            {selected ? selected.label : placeholder}
          </span>
          <span className={cx(css.chevron, open && css.chevronOpen)} aria-hidden="true">
            <IconChevronDownOutline14 size={14} />
          </span>
        </button>
      )}
    />
  );
}
