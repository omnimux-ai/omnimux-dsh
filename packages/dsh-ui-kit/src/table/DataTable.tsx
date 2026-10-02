import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import { EmptyState } from "../empty/EmptyState.tsx";
import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table.tsx";
import type { SortDirection } from "./Table.tsx";
import css from "./DataTable.module.css";

export type { SortDirection };

export interface HeaderContext<T> {
  column: ColumnDef<T>;
  sortDirection: SortDirection;
  toggleSort: () => void;
}

export interface CellContext<T> {
  row: T;
  rowIndex: number;
  column: ColumnDef<T>;
  value: unknown;
}

export interface ColumnDef<T> {
  /** Unique column key. */
  id: string;
  /** Header display node or render function. */
  header: ReactNode | ((ctx: HeaderContext<T>) => ReactNode);
  /** Key on row data object. */
  accessorKey?: keyof T;
  /** Custom data accessor function. */
  accessorFn?: (row: T) => unknown;
  /** Custom cell render function. */
  cell?: (ctx: CellContext<T>) => ReactNode;
  /** Whether the column supports sorting. */
  sortable?: boolean;
  /** Fixed width or percentage. */
  width?: number | string;
  /** Minimum width. */
  minWidth?: number;
  /** Content text alignment. */
  align?: "left" | "center" | "right";
}

export interface DataTableProps<T> {
  /** Array of row data records. */
  data: T[];
  /** Column definitions. */
  columns: ColumnDef<T>[];
  /** Accessor or function to extract unique row key. */
  rowKey: keyof T | ((row: T) => string);
  /** Controlled array of selected row keys. */
  selectedRowKeys?: string[];
  /** Selection change callback. */
  onSelectionChange?: (selectedKeys: string[], selectedRows: T[]) => void;
  /** Row selection mode: 'none' | 'single' | 'multiple', defaults to 'none'. */
  selectionMode?: "none" | "single" | "multiple";
  /** Currently active sort key. */
  sortKey?: string | null;
  /** Currently active sort direction. */
  sortDirection?: SortDirection;
  /** Callback fired on sort state change. */
  onSortChange?: (sortKey: string | null, direction: SortDirection) => void;
  /** Whether data is loading. */
  loading?: boolean;
  /** Custom empty state content. Defaults to EmptyState. */
  emptyContent?: ReactNode;
  /** Sticky header styling. */
  stickyHeader?: boolean;
  /** Whether horizontal scroll indicators are enabled, defaults to true. */
  scrollX?: boolean;
  /** Custom root wrapper className. */
  className?: string;
  /** Row className string or generator function. */
  rowClassName?: string | ((row: T, index: number) => string);
  /** Row click callback. */
  onRowClick?: (row: T, index: number) => void;
}

const CHECKMARK_PATH = "M2 5.5 L4.5 8 L8.5 2.5";

/**
 * Generic declarative high-level data table with sorting, multi-selection,
 * horizontal scroll indicators, and EmptyState integration.
 */
export function DataTable<T>({
  data,
  columns,
  rowKey,
  selectedRowKeys = [],
  onSelectionChange,
  selectionMode = "none",
  sortKey = null,
  sortDirection = null,
  onSortChange,
  loading = false,
  emptyContent,
  stickyHeader = false,
  scrollX = true,
  className,
  rowClassName,
  onRowClick,
}: DataTableProps<T>): JSX.Element {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrollLeft, setHasScrollLeft] = useState(false);
  const [hasScrollRight, setHasScrollRight] = useState(false);

  const getRowKey = useCallback(
    (row: T): string => {
      if (typeof rowKey === "function") {
        return rowKey(row);
      }
      return String(row[rowKey]);
    },
    [rowKey],
  );

  // Measure and update horizontal scroll shadows
  const updateScrollShadows = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !scrollX) return;
    const canScroll = el.scrollWidth > el.clientWidth + 2;
    if (!canScroll) {
      setHasScrollLeft(false);
      setHasScrollRight(false);
      return;
    }
    setHasScrollLeft(el.scrollLeft > 2);
    setHasScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, [scrollX]);

  useEffect(() => {
    updateScrollShadows();
    const el = scrollContainerRef.current;
    if (!el) return;

    el.addEventListener("scroll", updateScrollShadows, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateScrollShadows());
      observer.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", updateScrollShadows);
      observer?.disconnect();
    };
  }, [updateScrollShadows, data, columns]);

  const selectedKeySet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);

  const isAllSelected = useMemo(() => {
    if (data.length === 0) return false;
    return data.every((row) => selectedKeySet.has(getRowKey(row)));
  }, [data, getRowKey, selectedKeySet]);

  const isPartiallySelected = useMemo(() => {
    if (isAllSelected || data.length === 0) return false;
    return data.some((row) => selectedKeySet.has(getRowKey(row)));
  }, [data, getRowKey, isAllSelected, selectedKeySet]);

  const toggleSort = (colId: string) => {
    if (!onSortChange) return;
    if (sortKey !== colId) {
      onSortChange(colId, "desc");
      return;
    }
    if (sortDirection === "desc") {
      onSortChange(colId, "asc");
    } else if (sortDirection === "asc") {
      onSortChange(null, null);
    } else {
      onSortChange(colId, "desc");
    }
  };

  const handleSelectAll = (e?: MouseEvent | KeyboardEvent) => {
    e?.stopPropagation();
    if (!onSelectionChange) return;
    if (isAllSelected) {
      onSelectionChange([], []);
    } else {
      const allKeys = data.map(getRowKey);
      onSelectionChange(allKeys, [...data]);
    }
  };

  const handleRowSelect = (
    row: T,
    key: string,
    e?: MouseEvent | KeyboardEvent,
  ) => {
    e?.stopPropagation();
    if (!onSelectionChange) return;

    if (selectionMode === "single") {
      const isSelected = selectedKeySet.has(key);
      if (isSelected) {
        onSelectionChange([], []);
      } else {
        onSelectionChange([key], [row]);
      }
      return;
    }

    if (selectionMode === "multiple") {
      const nextKeys = new Set(selectedKeySet);
      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }
      const newKeysArray = Array.from(nextKeys);
      const newRows = data.filter((r) => nextKeys.has(getRowKey(r)));
      onSelectionChange(newKeysArray, newRows);
    }
  };

  const getCellValue = (row: T, column: ColumnDef<T>): unknown => {
    if (column.accessorFn) return column.accessorFn(row);
    if (column.accessorKey) return row[column.accessorKey];
    return undefined;
  };

  const showSelection = selectionMode === "single" || selectionMode === "multiple";

  return (
    <div
      className={cx(
        cssClass(css.tableWrap, "tableWrap"),
        scrollX && hasScrollLeft && cssClass(css.hasScrollLeft, "hasScrollLeft"),
        scrollX && hasScrollRight && cssClass(css.hasScrollRight, "hasScrollRight"),
        className,
      )}
    >
      <div
        ref={scrollContainerRef}
        className={cssClass(css.scrollContainer, "scrollContainer")}
      >
        <Table stickyHeader={stickyHeader}>
          <TableHeader>
            <TableRow>
              {showSelection ? (
                <TableHead className={cssClass(css.selectCell, "selectCell")}>
                  {selectionMode === "multiple" ? (
                    <span
                      role="checkbox"
                      aria-checked={
                        isAllSelected ? "true" : isPartiallySelected ? "mixed" : "false"
                      }
                      aria-label="全选所有行"
                      tabIndex={0}
                      className={cx(
                        cssClass(css.checkboxIndicator, "checkboxIndicator"),
                        isAllSelected && cssClass(css.checkboxSelected, "checkboxSelected"),
                        isPartiallySelected &&
                          cssClass(css.checkboxIndeterminate, "checkboxIndeterminate"),
                      )}
                      onClick={(e) => handleSelectAll(e)}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          handleSelectAll(e);
                        }
                      }}
                    >
                      {isAllSelected ? (
                        <svg
                          viewBox="0 0 11 11"
                          className={cssClass(css.checkmark, "checkmark")}
                        >
                          <path d={CHECKMARK_PATH} />
                        </svg>
                      ) : isPartiallySelected ? (
                        <span className={cssClass(css.minusMark, "minusMark")} />
                      ) : null}
                    </span>
                  ) : null}
                </TableHead>
              ) : null}

              {columns.map((column) => {
                const isSorted = sortKey === column.id;
                const colSortDir = isSorted ? sortDirection : null;

                const headerContent =
                  typeof column.header === "function"
                    ? column.header({
                        column,
                        sortDirection: colSortDir,
                        toggleSort: () => toggleSort(column.id),
                      })
                    : column.header;

                return (
                  <TableHead
                    key={column.id}
                    align={column.align}
                    sortable={column.sortable}
                    sortDirection={colSortDir}
                    style={{
                      width: column.width,
                      minWidth: column.minWidth,
                    }}
                    onClick={column.sortable ? () => toggleSort(column.id) : undefined}
                  >
                    {headerContent}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              [0, 1, 2].map((idx) => (
                <TableRow
                  key={`skeleton-${idx}`}
                  className={cssClass(css.skeletonRow, "skeletonRow")}
                >
                  {showSelection ? <TableCell /> : null}
                  {columns.map((col) => (
                    <TableCell key={col.id}>
                      <div className={cssClass(css.skeletonBar, "skeletonBar")} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (showSelection ? 1 : 0)}
                  className={cssClass(css.emptyContainer, "emptyContainer")}
                >
                  {emptyContent ?? <EmptyState title="暂无数据" />}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIndex) => {
                const key = getRowKey(row);
                const isSelected = selectedKeySet.has(key);
                const customRowClass =
                  typeof rowClassName === "function"
                    ? rowClassName(row, rowIndex)
                    : rowClassName;

                return (
                  <TableRow
                    key={key}
                    selected={isSelected}
                    className={cx(
                      onRowClick && cssClass(css.clickableRow, "clickableRow"),
                      customRowClass,
                    )}
                    onClick={() => onRowClick?.(row, rowIndex)}
                  >
                    {showSelection ? (
                      <TableCell className={cssClass(css.selectCell, "selectCell")}>
                        <span
                          role={selectionMode === "single" ? "radio" : "checkbox"}
                          aria-checked={isSelected}
                          aria-label={`选择第 ${rowIndex + 1} 行`}
                          tabIndex={0}
                          className={cx(
                            selectionMode === "single"
                              ? cssClass(css.radioIndicator, "radioIndicator")
                              : cssClass(css.checkboxIndicator, "checkboxIndicator"),
                            isSelected &&
                              (selectionMode === "single"
                                ? cssClass(css.radioSelected, "radioSelected")
                                : cssClass(css.checkboxSelected, "checkboxSelected")),
                          )}
                          onClick={(e) => handleRowSelect(row, key, e)}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              handleRowSelect(row, key, e);
                            }
                          }}
                        >
                          {isSelected ? (
                            selectionMode === "single" ? (
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
                      </TableCell>
                    ) : null}

                    {columns.map((column) => {
                      const value = getCellValue(row, column);
                      const renderedCell = column.cell
                        ? column.cell({ row, rowIndex, column, value })
                        : (value as ReactNode);

                      return (
                        <TableCell
                          key={column.id}
                          align={column.align}
                          style={{
                            width: column.width,
                            minWidth: column.minWidth,
                          }}
                        >
                          {renderedCell}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
