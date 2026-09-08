/**
 * Prompt Token Compiler — Markdown 与 Token 胶囊双向解析器 (Issue #714 / T04).
 *
 * 正则无歧义契约：
 *   /@ref\[([^:]+):([^:]+):([^\]]+)\]/g
 * 对应格式：
 *   @ref[nodeId:slotIndex:fileName]
 *
 * 纯函数：
 * 1. parseMarkdownToTokenSegments: Markdown 串解析为纯文本切片与 Token 胶囊切片结构化数组；
 * 2. serializeSegmentsToMarkdown: 切片数组转回标准 Markdown 存储格式；
 * 3. calculatePromptVisualLength: 计算视觉字数（Token 计为 1 视觉字符）与底层字符长度；
 * 4. extractPromptTokens: 从 Markdown 提取所有被引用的 Token 对象。
 */

import type { MaterialType } from '../../../../shared/graph/materialNode.ts';
import type {
  NodeSlotEngineState,
  PromptReferenceToken,
} from '../../../../shared/graph/slotContractTypes.ts';

export const PROMPT_REF_REGEX = /@ref\[([^:]+):([^:]+):([^\]]+)\]/g;

export type TokenSegment =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'token';
      token: PromptReferenceToken;
      raw: string;
    };

function inferMaterialType(fileName: string): MaterialType {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif'].includes(ext)) {
    return 'image';
  }
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext)) {
    return 'audio';
  }
  return 'image';
}

/**
 * 将存储的 Markdown 串解析为包含纯文本切片与 Token 胶囊切片的结构化数组。
 */
export function parseMarkdownToTokenSegments(
  markdown: string,
  slotState?: NodeSlotEngineState,
  references: PromptReferenceToken[] = [],
): TokenSegment[] {
  if (!markdown) {
    return [];
  }

  const segments: TokenSegment[] = [];
  let lastIndex = 0;

  // 重置正则状态
  PROMPT_REF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = PROMPT_REF_REGEX.exec(markdown)) !== null) {
    const matchStart = match.index;
    const matchEnd = PROMPT_REF_REGEX.lastIndex;
    const raw = match[0];
    const nodeId = match[1] ?? '';
    const slotIndexStr = match[2] ?? '0';
    const label = match[3] ?? '';
    const slotIndex = parseInt(slotIndexStr, 10);

    // 前置纯文本切片
    if (matchStart > lastIndex) {
      segments.push({
        type: 'text',
        text: markdown.slice(lastIndex, matchStart),
      });
    }

    // 从 slotState 查找丰富信息
    let materialType: MaterialType = slotIndex === -1 ? 'text' : inferMaterialType(label);
    let mediaUrl: string | undefined;

    if (slotState) {
      const activeItem = slotState.activeSlots.find(
        (s) => s.sourceNodeId === nodeId && s.slotIndex === slotIndex,
      );
      if (activeItem) {
        materialType = activeItem.materialType;
        mediaUrl = activeItem.mediaUrl;
      } else {
        const overflowItem = slotState.overflowPool.find(
          (o) => o.sourceNodeId === nodeId,
        );
        if (overflowItem) {
          materialType = overflowItem.materialType;
          mediaUrl = overflowItem.mediaUrl;
        }
      }
    }

    const reference = references.find((item) => item.nodeId === nodeId);
    if (reference) {
      materialType = reference.materialType;
      mediaUrl = reference.mediaUrl;
    }

    segments.push({
      type: 'token',
      token: {
        raw,
        nodeId,
        slotIndex: Number.isNaN(slotIndex) ? 0 : slotIndex,
        label,
        materialType,
        mediaUrl,
      },
      raw,
    });

    lastIndex = matchEnd;
  }

  // 尾部纯文本切片
  if (lastIndex < markdown.length) {
    segments.push({
      type: 'text',
      text: markdown.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * 将切片数组转回标准 Markdown 存储格式。
 */
export function serializeSegmentsToMarkdown(segments: TokenSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.type === 'text') {
        return seg.text;
      }
      return seg.raw || `@ref[${seg.token.nodeId}:${seg.token.slotIndex}:${seg.token.label}]`;
    })
    .join('');
}

/**
 * 计算 Prompt 视觉字数与底层字数。
 * 每个 Token 在视觉计数上计为 1 个字符（或指定为其 Label 长度），而不是底层长 ID 字符。
 */
export function calculatePromptVisualLength(
  markdown: string,
  options?: { countTokenAs?: 'single' | 'label' },
): { visualLength: number; rawLength: number; tokenCount: number } {
  if (!markdown) {
    return { visualLength: 0, rawLength: 0, tokenCount: 0 };
  }

  const rawLength = markdown.length;
  const segments = parseMarkdownToTokenSegments(markdown);
  let visualLength = 0;
  let tokenCount = 0;
  const countMode = options?.countTokenAs ?? 'single';

  for (const seg of segments) {
    if (seg.type === 'text') {
      visualLength += seg.text.length;
    } else {
      tokenCount += 1;
      visualLength += countMode === 'label' ? seg.token.label.length : 1;
    }
  }

  return {
    visualLength,
    rawLength,
    tokenCount,
  };
}

/**
 * 从 Markdown 字符串中提取所有被引用的 Token 对象。
 */
export function extractPromptTokens(
  markdown: string,
  slotState?: NodeSlotEngineState,
): PromptReferenceToken[] {
  const segments = parseMarkdownToTokenSegments(markdown, slotState);
  return segments
    .filter((s): s is TokenSegment & { type: 'token' } => s.type === 'token')
    .map((s) => s.token);
}
