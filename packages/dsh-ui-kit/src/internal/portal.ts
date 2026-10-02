import type { ReactNode, ReactPortal } from "react";
import { createPortal } from "react-dom";

export type PortalContainer = HTMLElement | (() => HTMLElement | null) | null | undefined;

/**
 * Resolves a portal container element safely, defaulting to `document.body` if available.
 */
export function resolvePortalContainer(container?: PortalContainer): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (typeof container === "function") {
    return container() ?? document.body;
  }
  if (container) return container;
  return document.body;
}

/**
 * Safely renders React children into a DOM portal with SSR protection.
 */
export function createPortalSafe(
  children: ReactNode,
  container?: PortalContainer,
  key?: string | null,
): ReactPortal | null {
  const target = resolvePortalContainer(container);
  if (!target) return null;
  return createPortal(children, target, key);
}
