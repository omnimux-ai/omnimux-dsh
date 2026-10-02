const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled]):not([aria-disabled='true'])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * Returns all currently focusable elements within a container element.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const elements: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node && node.offsetParent !== null && !node.hasAttribute("disabled")) {
      elements.push(node);
    }
  }
  return elements;
}

/**
 * Traps Tab and Shift+Tab key navigation within the given container element.
 */
export function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;

  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (!first || !last) return;

  if (event.shiftKey) {
    if (document.activeElement === first || !container.contains(document.activeElement)) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last || !container.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }
}

/**
 * Attempts to focus the first focusable descendant in a container.
 */
export function focusFirstDescendant(container: HTMLElement): boolean {
  const focusable = getFocusableElements(container);
  if (focusable.length > 0 && focusable[0]) {
    focusable[0].focus();
    return true;
  }
  container.focus();
  return false;
}
