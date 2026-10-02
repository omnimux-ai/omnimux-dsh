import { forwardRef } from "react";
import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import css from "./Table.module.css";

export type SortDirection = "asc" | "desc" | null;

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** Whether the table header sticks to the top of its scroll container. */
  stickyHeader?: boolean;
  /** Whether cell borders are visible around every cell. */
  bordered?: boolean;
  /** Dense mode with reduced cell padding. */
  dense?: boolean;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { stickyHeader = false, bordered = false, dense = false, className, children, ...rest },
  ref,
) {
  return (
    <table
      {...rest}
      ref={ref}
      className={cx(
        cssClass(css.table, "table"),
        stickyHeader && cssClass(css.stickyHeader, "stickyHeader"),
        bordered && cssClass(css.bordered, "bordered"),
        dense && cssClass(css.dense, "dense"),
        className,
      )}
    >
      {children}
    </table>
  );
});

export interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {}

export const TableHeader = forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  function TableHeader({ className, children, ...rest }, ref) {
    return (
      <thead
        {...rest}
        ref={ref}
        className={cx(cssClass(css.tableHeader, "tableHeader"), className)}
      >
        {children}
      </thead>
    );
  },
);

export interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {}

export const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(
  function TableBody({ className, children, ...rest }, ref) {
    return (
      <tbody
        {...rest}
        ref={ref}
        className={cx(cssClass(css.tableBody, "tableBody"), className)}
      >
        {children}
      </tbody>
    );
  },
);

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Whether this row is currently selected/highlighted. */
  selected?: boolean;
}

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  function TableRow({ selected = false, className, children, ...rest }, ref) {
    return (
      <tr
        {...rest}
        ref={ref}
        aria-selected={selected || undefined}
        className={cx(
          cssClass(css.row, "row"),
          selected && cssClass(css.rowSelected, "rowSelected"),
          className,
        )}
      >
        {children}
      </tr>
    );
  },
);

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Text alignment inside cell. */
  align?: "left" | "center" | "right" | undefined;
}

const ALIGN_CLASS = {
  left: cssClass(css.alignLeft, "alignLeft"),
  center: cssClass(css.alignCenter, "alignCenter"),
  right: cssClass(css.alignRight, "alignRight"),
} as const;

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  function TableCell({ align = "left", className, children, ...rest }, ref) {
    return (
      <td
        {...rest}
        ref={ref}
        className={cx(cssClass(css.cell, "cell"), ALIGN_CLASS[align], className)}
      >
        {children}
      </td>
    );
  },
);

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Text alignment inside header cell. */
  align?: "left" | "center" | "right" | undefined;
  /** Whether this column header is clickable for sorting. */
  sortable?: boolean | undefined;
  /** Current sort direction. */
  sortDirection?: SortDirection | undefined;
}

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  function TableHead(
    {
      align = "left",
      sortable = false,
      sortDirection = null,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const ariaSort =
      sortDirection === "asc"
        ? "ascending"
        : sortDirection === "desc"
          ? "descending"
          : sortable
            ? "none"
            : undefined;

    return (
      <th
        {...rest}
        ref={ref}
        aria-sort={ariaSort}
        className={cx(
          cssClass(css.headCell, "headCell"),
          sortable && cssClass(css.headCellSortable, "headCellSortable"),
          ALIGN_CLASS[align],
          className,
        )}
      >
        <div className={cssClass(css.headCellContent, "headCellContent")}>
          <span>{children}</span>
          {sortable ? (
            <span
              className={cx(
                cssClass(css.sortIcon, "sortIcon"),
                sortDirection !== null &&
                  cssClass(css.sortIconActive, "sortIconActive"),
              )}
              aria-hidden="true"
            >
              {sortDirection === "asc" ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M5 2L8.5 7H1.5L5 2Z" />
                </svg>
              ) : sortDirection === "desc" ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M5 8L1.5 3H8.5L5 8Z" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" opacity="0.4">
                  <path d="M5 2L7.5 5H2.5L5 2ZM5 8L2.5 5H7.5L5 8Z" />
                </svg>
              )}
            </span>
          ) : null}
        </div>
      </th>
    );
  },
);
