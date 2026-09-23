export type LinkKind = 'video' | 'product';
export const LINK_SOURCES = { video: 'omnimux-video-link', product: 'omnimux-product-link' } as const;
export interface InputOccurrence {
  source: string;
  ref: string;
  offset: number;
  length: number;
}
export interface LinkInputState {
  draft: string;
  draftRev: number;
  phase: string;
  occurrences: readonly InputOccurrence[];
}

/** Accept one complete URL without changing the user-provided address. */
export function validLinkUrl(value: string): string | null {
  const url = value.trim();
  if (!/^https?:\/\//i.test(url) || /\s|[<>]/u.test(url) || (url.match(/https?:\/\//gi)?.length ?? 0) !== 1) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname && !parsed.username && !parsed.password ? url : null;
  } catch {
    return null;
  }
}

export function linkClipboardText(kind: LinkKind, url: string): string {
  return `${kind === 'video' ? '参考视频' : '商品页面'}：${url}`;
}

/** Public draft offsets expand references; scoped mutations use one character per reference. */
export function detectOffset(input: LinkInputState, offset: number): number | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > input.draft.length || !Number.isInteger(input.draftRev)) return null;
  let end = 0;
  let adjustment = 0;
  for (const occurrence of input.occurrences) {
    const { offset: start, length } = occurrence;
    if (!Number.isInteger(start) || !Number.isInteger(length) || start < end || length < 0 || start + length > input.draft.length) return null;
    end = start + length;
    if (start < offset && offset < end) return null;
    if (end <= offset) adjustment += length - 1;
  }
  return offset - adjustment;
}

export function hasLinkReference(input: LinkInputState, kind: LinkKind, url: string): boolean {
  const normalized = new URL(url).href;
  return input.occurrences.some(item => {
    if (item.source !== LINK_SOURCES[kind] || !validLinkUrl(item.ref)) return false;
    return new URL(item.ref).href === normalized;
  });
}

export function createLinkReference(kind: LinkKind, url: string) {
  return {
    source: LINK_SOURCES[kind], ref: url,
    label: `${kind === 'video' ? '参考视频' : '商品页面'} · ${new URL(url).hostname}`,
    clipboardText: linkClipboardText(kind, url),
  };
}
