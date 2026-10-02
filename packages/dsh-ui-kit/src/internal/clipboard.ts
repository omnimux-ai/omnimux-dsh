/**
 * Robust asynchronous clipboard write with legacy document.execCommand fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  // Modern asynchronous clipboard API in secure context
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to legacy execCommand
    }
  }

  // Fallback using temporary off-screen textarea
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}
