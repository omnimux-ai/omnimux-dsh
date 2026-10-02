import { forwardRef } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import css from "./MediaCard.module.css";

export type MediaAspectRatio = "16:9" | "4:3" | "1:1" | "9:16";

export interface MediaCardProps {
  /** Card title text or node. */
  title: ReactNode;
  /** Image URL for media cover. */
  coverUrl?: string;
  /** Custom node for media cover (e.g. video player or SVG). */
  coverNode?: ReactNode;
  /** Display aspect ratio, defaults to '16:9'. */
  aspectRatio?: MediaAspectRatio;
  /** Secondary subtitle or description. */
  subtitle?: ReactNode;
  /** Top-right badge slot (typically a Badge component). */
  badge?: ReactNode;
  /** Bottom footer metadata node. */
  footer?: ReactNode;
  /** Quick action buttons revealed on hover. */
  actions?: ReactNode;
  /** Whether the card is selected. */
  selected?: boolean;
  /** Whether the card is disabled. */
  disabled?: boolean;
  /** Whether the card is in a loading state. */
  loading?: boolean;
  /** Click handler for the card. */
  onClick?: () => void;
  /** Custom class name. */
  className?: string;
}

const ASPECT_CLASS: Record<MediaAspectRatio, string> = {
  "16:9": cssClass(css.aspect16x9, "aspect16x9"),
  "4:3": cssClass(css.aspect4x3, "aspect4x3"),
  "1:1": cssClass(css.aspect1x1, "aspect1x1"),
  "9:16": cssClass(css.aspect9x16, "aspect9x16"),
};

/**
 * Media display card with aspect ratio constraints, top-right badge,
 * hover actions overlay, and footer metadata slot.
 */
export const MediaCard = forwardRef<HTMLDivElement, MediaCardProps>(
  function MediaCard(
    {
      title,
      coverUrl,
      coverNode,
      aspectRatio = "16:9",
      subtitle,
      badge,
      footer,
      actions,
      selected = false,
      disabled = false,
      loading = false,
      onClick,
      className,
      ...rest
    },
    ref,
  ) {
    const isInteractive = !disabled && !loading && Boolean(onClick);

    const handleClick = (e: MouseEvent<HTMLDivElement>) => {
      // Don't trigger card onClick if clicking inside actions overlay
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(`.${cssClass(css.actionsOverlay, "actionsOverlay")}`)) {
        return;
      }
      if (!disabled && !loading) {
        onClick?.();
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(`.${cssClass(css.actionsOverlay, "actionsOverlay")}`)) {
        return;
      }
      if (isInteractive && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        onClick?.();
      }
    };

    return (
      <div
        {...rest}
        ref={ref}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-disabled={disabled || loading || undefined}
        aria-selected={selected || undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cx(
          cssClass(css.card, "card"),
          selected && cssClass(css.selected, "selected"),
          disabled && cssClass(css.disabled, "disabled"),
          loading && cssClass(css.loading, "loading"),
          className,
        )}
      >
        <div
          className={cx(
            cssClass(css.coverWrapper, "coverWrapper"),
            ASPECT_CLASS[aspectRatio],
          )}
        >
          {coverNode != null ? (
            coverNode
          ) : coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className={cssClass(css.coverImage, "coverImage")}
              loading="lazy"
            />
          ) : (
            <div className={cssClass(css.coverPlaceholder, "coverPlaceholder")}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
          )}

          {badge != null ? (
            <div className={cssClass(css.badgeSlot, "badgeSlot")}>
              {badge}
            </div>
          ) : null}

          {actions != null ? (
            <div
              className={cssClass(css.actionsOverlay, "actionsOverlay")}
              onClick={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          ) : null}
        </div>

        <div className={cssClass(css.body, "body")}>
          <div className={cssClass(css.title, "title")}>{title}</div>
          {subtitle != null && subtitle !== "" ? (
            <div className={cssClass(css.subtitle, "subtitle")}>{subtitle}</div>
          ) : null}
          {footer != null ? (
            <div className={cssClass(css.footer, "footer")}>{footer}</div>
          ) : null}
        </div>
      </div>
    );
  },
);
