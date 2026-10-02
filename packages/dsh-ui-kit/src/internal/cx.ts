type CxPart =
  | string
  | number
  | false
  | null
  | undefined
  | Record<string, boolean | null | undefined>;

/** Tiny className joiner. Avoids a `clsx` dependency in the kit. */
export function cx(...parts: CxPart[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === "string" || typeof part === "number") {
      out.push(String(part));
      continue;
    }
    for (const [key, on] of Object.entries(part)) {
      if (on) out.push(key);
    }
  }
  return out.join(" ");
}
