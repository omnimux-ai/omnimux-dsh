import { forwardRef } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import css from "./SelectableTile.module.css";

export type TileSelectionMode = "checkbox" | "radio";

export interface SelectableTileProps {
  /** Unique identifier for the tile. */
  id: string;
  /** Whether the tile is currently selected. */
  selected?: boolean;
  /** Main tile title. */
  title: ReactNode;
  /** Subtitle or explanatory text. */
  description?: ReactNode;
  /** Status badge slot. */
  badge?: ReactNode;
  /** Leading icon or avatar slot. */
  icon?: ReactNode;
  /** Extra slot for trailing actions or metadata. */
  extra?: ReactNode;
  /** Whether the tile is disabled. */
  disabled?: boolean;
  /** Whether the tile is in a loading state. */
  loading?: boolean;
  /** Selection mode: 'checkbox' or 'radio', defaults to 'checkbox'. */
  selectionType?: TileSelectionMode;
  /** Callback fired when selection state changes. */
  onChange?: (selected: boolean, id: string) => void;
  /** Custom class name. */
  className?: string;
}

const CHECKMARK_PATH = "M2 5.5 L4.5 8 L8.5 2.5";

/**
 * Multi-line block-level selectable tile solving the 32px Button constraint.
 * Supports keyboard navigation (Space / Enter) and official `--dsw-alias-*` tokens.
 */
export const SelectableTile = forwardRef<HTMLDivElement, SelectableTileProps>(
  function SelectableTile(
    {
      id,
      selected = false,
      title,
      description,
      badge,
      icon,
      extra,
      disabled = false,
      loading = false,
      selectionType = "checkbox",
      onChange,
      className,
      ...rest
    },
    ref,
  ) {
    const isInteractive = !disabled && !loading;

    const handleClick = (e: MouseEvent<HTMLDivElement>) => {
      if (!isInteractive) return;
      onChange?.(!selected, id);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isInteractive) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onChange?.(!selected, id);
      }
    };

    return (
      <div
        {...rest}
        ref={ref}
        role={selectionType === "radio" ? "radio" : "checkbox"}
        aria-checked={selected}
        aria-disabled={!isInteractive || undefined}
        tabIndex={isInteractive ? 0 : -1}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cx(
          cssClass(css.tile, "tile"),
          selected && cssClass(css.selected, "selected"),
          disabled && cssClass(css.disabled, "disabled"),
          loading && cssClass(css.loading, "loading"),
          className,
        )}
      >
        <span
          className={cx(
            cssClass(css.indicator, "indicator"),
            selectionType === "radio"
              ? cssClass(css.radioIndicator, "radioIndicator")
              : cssClass(css.checkboxIndicator, "checkboxIndicator"),
          )}
          aria-hidden="true"
        >
          {selected ? (
            selectionType === "radio" ? (
              <span className={cssClass(css.radioDot, "radioDot")} />
            ) : (
              <svg
                viewBox="0 0 11 11"
                className={cssClass(css.checkmark, "checkmark")}
              >
                <path d={CHECKMARK_PATH} />
              </svg>
            )
          ) : null}
        </span>

        {icon != null ? (
          <span className={cssClass(css.iconSlot, "iconSlot")} aria-hidden="true">
            {icon}
          </span>
        ) : null}

        <div className={cssClass(css.content, "content")}>
          <div className={cssClass(css.headerRow, "headerRow")}>
            <span className={cssClass(css.title, "title")}>{title}</span>
            {badge != null ? <span>{badge}</span> : null}
          </div>
          {description != null && description !== "" ? (
            <div className={cssClass(css.description, "description")}>
              {description}
            </div>
          ) : null}
        </div>

        {extra != null ? (
          <div className={cssClass(css.extraSlot, "extraSlot")}>
            {extra}
          </div>
        ) : null}
      </div>
    );
  },
);
