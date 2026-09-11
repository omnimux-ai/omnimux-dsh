export interface PromptSlot {
  readonly id: string;
  readonly raw: string;
  readonly placeholder: string;
  readonly start: number;
  readonly end: number;
}

/**
 * 正则匹配所有 [xxx] 或 [] 占位符。
 * 只要输入 [] 或 [xxx] 均能匹配，强化视觉提示。
 */
export const PROMPT_SLOT_REGEX = /\[([^\]\n]*)\]/g;

/**
 * 提取文本中所有的 Prompt 变量槽位。
 */
export function extractPromptSlots(text?: string | null): readonly PromptSlot[] {
  if (!text || typeof text !== 'string') return [];
  const slots: PromptSlot[] = [];
  PROMPT_SLOT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = PROMPT_SLOT_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const placeholder = match[1].trim();
    slots.push({
      id: `slot-${count++}-${match.index}`,
      raw,
      placeholder,
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return slots;
}

/**
 * 检查文本是否包含 Prompt 变量槽位或 []。
 */
export function hasPromptSlots(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  PROMPT_SLOT_REGEX.lastIndex = 0;
  return PROMPT_SLOT_REGEX.test(text);
}

/**
 * 替换指定索引的槽位为新文本，保持 [] 符号的存在。
 * 例如 原内容：[商品名称]，替换确认后：[苹果 iPhone16]。
 */
export function replacePromptSlot(text: string, targetIndex: number, newValue: string): string {
  const slots = extractPromptSlots(text);
  const target = slots[targetIndex];
  if (!target) return text;
  const hasBrackets = newValue.startsWith('[') && newValue.endsWith(']');
  const formattedValue = hasBrackets ? newValue : `[${newValue}]`;
  return text.slice(0, target.start) + formattedValue + text.slice(target.end);
}
