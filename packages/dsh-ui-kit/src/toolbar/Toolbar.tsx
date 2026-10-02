import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx.ts";
import css from "./Toolbar.module.css";

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  left?: ReactNode;
  right?: ReactNode;
  compact?: boolean;
}

/**
 * Single-row 44–48px toolbar. Left holds search + filters, right holds actions.
 * Children never wrap.
 */
export function Toolbar({
  left,
  right,
  compact = false,
  className,
  children,
  ...rest
}: ToolbarProps) {
  return (
    <div
      {...rest}
      role="toolbar"
      className={cx(css.bar, compact && css.compact, className)}
    >
      <div className={css.left}>{left ?? children}</div>
      {right != null ? <div className={css.right}>{right}</div> : null}
    </div>
  );
}

export interface FilterBarProps extends ToolbarProps {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  tools?: ReactNode;
}

/**
 * FilterBar supporting two layout modes:
 * 1. Standard 4-layer layout (New Spec): `filters` on the left, `search` + `tools` (sort/viewMode) on the right.
 * 2. Classic layout (Legacy): `search` + `filters` on the left, `actions` on the right.
 */
export function FilterBar({
  left,
  search,
  filters,
  actions,
  right,
  tools,
  className,
  compact,
  ...rest
}: FilterBarProps) {
  let leftContent: ReactNode;
  let rightContent: ReactNode;

  if (left != null) {
    leftContent = left;
    rightContent = right ?? (
      (search != null || tools != null || actions != null) ? (
        <>
          {search}
          {tools}
          {actions}
        </>
      ) : null
    );
  } else if (filters != null && search != null && tools == null && actions != null && right == null) {
    // Classic mode: search + filters on the left, actions on the right
    leftContent = (
      <>
        {search}
        <div className={css.filters}>{filters}</div>
      </>
    );
    rightContent = actions;
  } else {
    // Standard mode: filters on the left, search + tools + actions / right on the right
    leftContent = filters != null ? <div className={css.filters}>{filters}</div> : null;
    rightContent = right ?? (
      (search != null || tools != null || actions != null) ? (
        <>
          {search}
          {tools}
          {actions}
        </>
      ) : null
    );
  }

  return (
    <Toolbar
      {...rest}
      left={leftContent}
      right={rightContent}
      {...(compact !== undefined ? { compact } : {})}
      {...(className !== undefined ? { className } : {})}
    />
  );
}
