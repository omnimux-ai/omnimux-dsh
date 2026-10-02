import { forwardRef } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import css from "./CardGrid.module.css";

export interface CardGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Grid items. */
  children: ReactNode;
  /** Minimum width for each column item, defaults to '220px'. */
  minItemWidth?: number | string;
  /** Grid gap between cards, defaults to '16px'. */
  gap?: number | string;
  /** Maximum number of columns, optional. */
  maxColumns?: number;
  /** Custom class name. */
  className?: string;
}

/**
 * Responsive fluid card grid container for MediaCard and other card items.
 */
export const CardGrid = forwardRef<HTMLDivElement, CardGridProps>(
  function CardGrid(
    {
      children,
      minItemWidth = "220px",
      gap = "16px",
      maxColumns,
      className,
      style,
      ...rest
    },
    ref,
  ) {
    const minWidthValue =
      typeof minItemWidth === "number" ? `${minItemWidth}px` : minItemWidth;
    const gapValue = typeof gap === "number" ? `${gap}px` : gap;

    const customStyle: CSSProperties = {
      ...style,
      ["--card-grid-min-width" as string]: minWidthValue,
      ["--card-grid-gap" as string]: gapValue,
      ...(maxColumns
        ? {
            gridTemplateColumns: `repeat(auto-fill, minmax(max(${minWidthValue}, calc((100% - (${gapValue} * ${maxColumns - 1})) / ${maxColumns})), 1fr))`,
          }
        : {}),
    };

    return (
      <div
        {...rest}
        ref={ref}
        style={customStyle}
        className={cx(cssClass(css.grid, "grid"), className)}
      >
        {children}
      </div>
    );
  },
);
