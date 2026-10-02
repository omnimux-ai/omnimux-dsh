import type { ReactNode, ReactPortal } from "react";

import { createPortalSafe, resolvePortalContainer } from "../internal/portal.ts";
import type { PortalContainer } from "../internal/portal.ts";

export interface DrawerPortalProps {
  children: ReactNode;
  container?: PortalContainer;
}

/**
 * Portal wrapper for Drawer with SSR safety and container resolution.
 */
export function DrawerPortal({
  children,
  container,
}: DrawerPortalProps): ReactPortal | null {
  return createPortalSafe(children, container);
}

export { resolvePortalContainer };
