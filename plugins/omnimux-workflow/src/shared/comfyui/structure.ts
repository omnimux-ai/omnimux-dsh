/**
 * Structural validation primitives for the ComfyUI workflow codec.
 *
 * Kept dependency-free and side-effect-free so the codec can be exercised by
 * plain `node --test` without a DOM or bundler.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

/** Copy every key of `source` that is not claimed by `claimed`. */
export function collectUnknown(
  source: Record<string, unknown>,
  claimed: readonly string[],
): Record<string, unknown> {
  const claimedSet = new Set(claimed);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!claimedSet.has(key)) out[key] = value;
  }
  return out;
}

/** Read an optional numeric field, returning undefined when absent/null. */
export function optionalNumber(
  source: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  return isFiniteNumber(value) ? value : undefined;
}

/** Read an optional string field, returning undefined when absent/null. */
export function optionalString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : undefined;
}

/** Read an optional `[a, b]` pair; returns null when absent, throws via caller otherwise. */
export function readPair(value: unknown): [number, number] | null {
  const arr = asArray(value);
  if (!arr || arr.length < 2) return null;
  const [first, second] = arr;
  if (!isFiniteNumber(first) || !isFiniteNumber(second)) return null;
  return [first, second];
}

/** Read an optional `[a, b, c, d]` quad. */
export function readQuad(value: unknown): [number, number, number, number] | null {
  const arr = asArray(value);
  if (!arr || arr.length < 4) return null;
  const [a, b, c, d] = arr;
  if (!isFiniteNumber(a) || !isFiniteNumber(b) || !isFiniteNumber(c) || !isFiniteNumber(d)) {
    return null;
  }
  return [a, b, c, d];
}

/** Link type token: string or finite number, otherwise null. */
export function readLinkType(value: unknown): string | number | null {
  if (typeof value === 'string') return value;
  if (isFiniteNumber(value)) return value;
  return null;
}

/**
 * Deep-clone a JSON-safe value.
 *
 * The codec only ever handles JSON-parsed input, so a structural clone keeps
 * unknown bags detached from the caller's object graph without pulling in
 * platform APIs (`structuredClone` is available in Node 17+ and browsers, but
 * an explicit clone keeps the pure functions trivially testable).
 */
export function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = cloneJson(item);
  }
  return out as unknown as T;
}
