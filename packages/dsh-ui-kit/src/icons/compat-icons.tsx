/**
 * Cross-generation icon resolution for `@deepseek-ai/dsh-client-ui-primitives`.
 *
 * DSH 0.1.5 names icons `Icon<Name>Outline<14|16>` — the size lives in the name.
 * 0.2.x names them `Icon<Name>Outline<Regular|Medium>` and moves the size to
 * `IconProps.size`. The Host module arrives through `require()` interop, so an
 * export the running generation does not provide is `undefined` rather than a
 * link error: resolving `legacy ?? modern` picks the right glyph on both.
 *
 * Call sites keep the legacy name. Icons whose legacy name encoded 14px must pass
 * `size={14}` themselves, because a modern glyph defaults to its own drawn size.
 * Delete this layer once every supported Host ships the 0.2.x names.
 *
 * The lookup is dynamic on purpose: the 0.1.5 and 0.2.x type sets do not overlap,
 * so naming either generation's exports statically cannot typecheck against both.
 * `compat-icons.test.js` checks every name below against the 0.2.x type surface.
 */
import type { ComponentType } from "react";
import * as primitives from "@deepseek-ai/dsh-client-ui-primitives";

export interface CompatIconProps {
  size?: number | undefined;
  className?: string | undefined;
}

type IconComponent = ComponentType<CompatIconProps>;

/** Renders nothing when neither generation provides the glyph. */
const MissingIcon: IconComponent = () => null;

const registry = primitives as unknown as Record<string, IconComponent | undefined>;

function resolve(legacy: string, modern: string): IconComponent {
  return registry[legacy] ?? registry[modern] ?? MissingIcon;
}

export const IconCheckOutline16 = resolve("IconCheckOutline16", "IconCheckOutlineRegular");
export const IconChevronDownOutline14 = resolve("IconChevronDownOutline14", "IconChevronDownOutlineRegular");
export const IconChevronUpOutline14 = resolve("IconChevronUpOutline14", "IconChevronUpOutlineRegular");
export const IconChevronLeftOutline14 = resolve("IconChevronLeftOutline14", "IconChevronLeftOutlineRegular");
export const IconCloseFill14 = resolve("IconCloseFill14", "IconCloseFillRegular");
export const IconCloseOutline16 = resolve("IconCloseOutline16", "IconCloseOutlineRegular");
export const IconCopyOutline16 = resolve("IconCopyOutline16", "IconCopyOutlineRegular");
export const IconDownloadOutline16 = resolve("IconDownloadOutline16", "IconDownloadOutlineRegular");
export const IconEditOutline16 = resolve("IconEditOutline16", "IconEditOutlineRegular");
export const IconEllipsisOutline16 = resolve("IconEllipsisOutline16", "IconEllipsisOutlineRegular");
export const IconLoadingOutline16 = resolve("IconLoadingOutline16", "IconLoadingOutlineRegular");
export const IconPaperclipOutline16 = resolve("IconPaperclipOutline16", "IconPaperclipOutlineRegular");
export const IconPlayOutline16 = resolve("IconPlayOutline16", "IconPlayOutlineRegular");
export const IconPlusOutline16 = resolve("IconPlusOutline16", "IconPlusOutlineRegular");
export const IconRefreshOutline14 = resolve("IconRefreshOutline14", "IconRefreshOutlineRegular");
export const IconRefreshOutline16 = resolve("IconRefreshOutline16", "IconRefreshOutlineRegular");
export const IconRightUpOutline14 = resolve("IconRightUpOutline14", "IconRightUpOutlineRegular");
export const IconSearchOutline16 = resolve("IconSearchOutline16", "IconSearchOutlineRegular");
export const IconTrashOutline16 = resolve("IconTrashOutline16", "IconTrashOutlineRegular");
