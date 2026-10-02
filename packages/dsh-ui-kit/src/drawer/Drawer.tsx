import { useEffect, useId, useRef } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { IconCloseOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";

import { IconButton } from "../button/Button.tsx";
import { focusFirstDescendant, trapFocus } from "../internal/a11y.ts";
import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import type { PortalContainer } from "../internal/portal.ts";
import { resolvePortalContainer } from "../internal/portal.ts";
import { DrawerPortal } from "./DrawerPortal.tsx";
import css from "./Drawer.module.css";

export type DrawerPlacement = "right" | "left" | "top" | "bottom";

export interface DrawerProps {
  /** Whether the drawer is visible. */
  open: boolean;
  /** Close event callback. */
  onClose: () => void;
  /** Drawer header title. */
  title?: ReactNode;
  /** Subtitle or secondary description under title. */
  description?: ReactNode;
  /** Main drawer body content. */
  children: ReactNode;
  /** Bottom action footer slot. */
  footer?: ReactNode;
  /** Drawer slide-in placement, defaults to 'right'. */
  placement?: DrawerPlacement;
  /** Drawer width for 'left' | 'right' placements, defaults to 400. */
  width?: number | string;
  /** Drawer height for 'top' | 'bottom' placements, defaults to 320. */
  height?: number | string;
  /** Whether to show top-right close icon button, defaults to true. */
  closable?: boolean;
  /** Whether clicking the backdrop overlay triggers onClose, defaults to true. */
  closeOnOverlayClick?: boolean;
  /** Whether pressing the Escape key triggers onClose, defaults to true. */
  closeOnEsc?: boolean;
  /** Target portal mount container, defaults to document.body. */
  container?: PortalContainer;
  /** Custom class name for the drawer panel. */
  className?: string;
}

const PLACEMENT_CLASS: Record<DrawerPlacement, string> = {
  right: cssClass(css.placementRight, "placementRight"),
  left: cssClass(css.placementLeft, "placementLeft"),
  top: cssClass(css.placementTop, "placementTop"),
  bottom: cssClass(css.placementBottom, "placementBottom"),
};

/**
 * Accessible slide-in drawer panel with multi-directional animation,
 * FocusTrap, Escape key handling, and scroll lock prevention.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  placement = "right",
  width = 400,
  height = 320,
  closable = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  container,
  className,
}: DrawerProps): JSX.Element | null {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const descriptionId = useId();

  // Scroll lock on container
  useEffect(() => {
    if (!open) return;
    const target = resolvePortalContainer(container);
    if (!target) return;

    const previousOverflow = target.style.overflow;
    target.style.overflow = "hidden";

    return () => {
      target.style.overflow = previousOverflow;
    };
  }, [open, container]);

  // Focus trap & previous focus restoration
  useEffect(() => {
    if (!open) return;
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Small delay to ensure DOM is attached
    const timer = setTimeout(() => {
      if (drawerRef.current) {
        focusFirstDescendant(drawerRef.current);
      }
    }, 16);

    return () => {
      clearTimeout(timer);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === "function") {
        previousActiveElementRef.current.focus();
      }
    };
  }, [open]);

  // Keyboard navigation (Escape & Tab trap)
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && closeOnEsc) {
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === "Tab" && drawerRef.current) {
      trapFocus(drawerRef.current, e.nativeEvent);
    }
  };

  const handleMaskClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose();
    }
  };

  if (!open) return null;

  const isVertical = placement === "top" || placement === "bottom";
  const sizeStyle: CSSProperties = isVertical
    ? { height: typeof height === "number" ? `${height}px` : height }
    : { width: typeof width === "number" ? `${width}px` : width };

  return (
    <DrawerPortal container={container}>
      <div
        className={cssClass(css.root, "root")}
        onKeyDown={handleKeyDown}
      >
        <div
          className={cssClass(css.mask, "mask")}
          onClick={handleMaskClick}
          aria-hidden="true"
        />

        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          style={sizeStyle}
          className={cx(
            cssClass(css.drawer, "drawer"),
            PLACEMENT_CLASS[placement],
            className,
          )}
        >
          {title || description || closable ? (
            <div className={cssClass(css.header, "header")}>
              <div className={cssClass(css.headerText, "headerText")}>
                {title ? (
                  <h3 id={titleId} className={cssClass(css.title, "title")}>
                    {title}
                  </h3>
                ) : null}
                {description ? (
                  <p
                    id={descriptionId}
                    className={cssClass(css.description, "description")}
                  >
                    {description}
                  </p>
                ) : null}
              </div>

              {closable ? (
                <IconButton
                  aria-label="关闭抽屉"
                  size="sm"
                  variant="ghost"
                  onClick={onClose}
                >
                  <IconCloseOutline16 size={16} />
                </IconButton>
              ) : null}
            </div>
          ) : null}

          <div className={cssClass(css.body, "body")}>{children}</div>

          {footer ? (
            <div className={cssClass(css.footer, "footer")}>{footer}</div>
          ) : null}
        </div>
      </div>
    </DrawerPortal>
  );
}
