/**
 * Map a DSH session id to the canvas workspace id (`ws_` + 12 hex).
 *
 * Client (`CanvasTab`) and Host (project-root lookup) MUST share this
 * implementation — ingest resolves `<ProjectRoot>` from the hashed id.
 */
export function sessionToWorkspaceId(sessionId: unknown): string | undefined {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
  let h1 = 0x811c9dc5;
  let h2 = 0x40164e6b;
  for (let i = 0; i < sessionId.length; i++) {
    const code = sessionId.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x050c79cd);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `ws_${(hex1 + hex2).slice(0, 12)}`;
}

export const SESSION_CANVAS_OVERRIDE_PREFIX = 'omnimux:session-canvas-override:';

/**
 * Register an inherited or explicit canvas workspace id for a session.
 */
export function setSessionCanvasOverride(sessionId: string, canvasWorkspaceId: string): void {
  if (typeof sessionId !== 'string' || !sessionId) return;
  if (typeof canvasWorkspaceId !== 'string' || !canvasWorkspaceId) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${SESSION_CANVAS_OVERRIDE_PREFIX}${sessionId}`, canvasWorkspaceId);
    }
  } catch {
    // ignore
  }
}

/**
 * Read the explicit or inherited canvas workspace id if registered.
 */
export function getSessionCanvasOverride(sessionId: unknown): string | undefined {
  if (typeof sessionId !== 'string' || !sessionId) return undefined;
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(`${SESSION_CANVAS_OVERRIDE_PREFIX}${sessionId}`);
      if (val && typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Resolve effective canvas workspace id:
 * priority: explicit override > hashed session id.
 */
export function resolveEffectiveWorkspaceId(sessionId: unknown): string | undefined {
  const override = getSessionCanvasOverride(sessionId);
  if (override) return override;
  return sessionToWorkspaceId(sessionId);
}
