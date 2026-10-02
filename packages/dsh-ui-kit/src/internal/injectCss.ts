const injected = new Set<string>();

/**
 * Insert a kit stylesheet once per id. Safe to call from every CSS-module
 * import; a no-op in non-DOM environments (typecheck / SSR).
 */
export function injectCss(id: string, css: string): void {
  if (typeof document === "undefined") return;
  if (injected.has(id)) return;
  injected.add(id);
  const style = document.createElement("style");
  style.setAttribute("data-dsh-ui-kit", id);
  style.textContent = css;
  document.head.appendChild(style);
}
