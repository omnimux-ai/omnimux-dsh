/**
 * plugins/omnimux-apps/src/client/stage.ts
 *
 * Stage lifecycle and cross-plugin coordination for OmniMux AI Applications.
 * Manages product stage claiming, document dataset markers, and DOM events.
 */

export const PRODUCT_STAGE_ID = 'omnimux-apps';
export const APP_OPEN_EVENT = 'omnimux-app-open';
export const TABS_CHANGED_EVENT = 'omnimux-app-tabs-changed';
export const PRODUCT_STAGE_EVENT = 'dsh-product-stage';
export const ACTIVE_STAGE_STORAGE_KEY = 'omnimux_active_product_stage';

/**
 * Claim the product stage for the AI Applications consumer workspace.
 * Sets document.documentElement.dataset.dshProductStage to 'omnimux-apps',
 * stores in localStorage, and dispatches the dsh-product-stage event.
 */
export function claimProductStage(stageId: string = PRODUCT_STAGE_ID): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(ACTIVE_STAGE_STORAGE_KEY, stageId);
  } catch {
    // Ignore localStorage access restrictions
  }

  if (typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRODUCT_STAGE_EVENT, { detail: { id: stageId } }));
  }

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.dshProductStage = stageId;
  }
}

/**
 * Release the product stage when navigating away from AI applications.
 */
export function releaseProductStage(stageId: string = PRODUCT_STAGE_ID): void {
  if (typeof document !== 'undefined' && document.documentElement.dataset.dshProductStage === stageId) {
    delete document.documentElement.dataset.dshProductStage;
  }

  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem(ACTIVE_STAGE_STORAGE_KEY) === stageId) {
        window.localStorage.removeItem(ACTIVE_STAGE_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
    if (typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PRODUCT_STAGE_EVENT, { detail: { id: '' } }));
    }
  }
}
