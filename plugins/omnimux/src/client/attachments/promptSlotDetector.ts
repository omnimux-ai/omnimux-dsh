export type PromptSlotProtocol = 'text' | 'file' | 'assets' | 'url';

export interface PromptSlot {
  readonly id: string;
  readonly raw: string;
  readonly placeholder: string; // 纯净展示名称，如 "商品图", "角色"
  readonly protocol: PromptSlotProtocol;
  readonly start: number;
  readonly end: number;
  readonly delimiter: '[' | '{';
  readonly selectedValue?: string; // 已选择的文件名或资产名
}

/**
 * 正则匹配所有 [xxx] 与 {xxx} 占位符。
 * 支持协议前缀: file://, assets://, asset://, url:// 等
 * 支持大括号语法: {file:xxx}, {assets:xxx}, {} 等
 */
export const PROMPT_SLOT_REGEX = /(?:\[([^\]\n]*)\]|\{([^\}\n]*)\})/g;

export function parseSlotContent(
  raw: string,
  inner: string,
  delimiter: '[' | '{',
): { protocol: PromptSlotProtocol; placeholder: string; selectedValue?: string } {
  const trimmed = inner.trim();

  // 1. 检查是否为已填充态：形如 "商品图: 主图.png" 或 "角色: 角色-01.png"
  const colonSplit = trimmed.split(/:\s*(.+)/);
  if (
    colonSplit.length >= 2 &&
    !trimmed.startsWith('file:') &&
    !trimmed.startsWith('assets:') &&
    !trimmed.startsWith('asset:') &&
    !trimmed.startsWith('url:')
  ) {
    const fieldName = colonSplit[0].trim();
    const value = colonSplit[1].trim();
    return {
      protocol: 'text',
      placeholder: fieldName,
      selectedValue: value,
    };
  }

  // 2. 检查显式协议前缀
  if (/^file:(?:\/\/)?/i.test(trimmed)) {
    const clean = trimmed.replace(/^file:(?:\/\/)?/i, '').trim();
    return {
      protocol: 'file',
      placeholder: clean || '选择文件',
    };
  }

  if (/^assets?:(?:\/\/)?/i.test(trimmed)) {
    const clean = trimmed.replace(/^assets?:(?:\/\/)?/i, '').trim();
    return {
      protocol: 'assets',
      placeholder: clean || '从资产库导入',
    };
  }

  if (/^url:(?:\/\/)?/i.test(trimmed)) {
    const clean = trimmed.replace(/^url:(?:\/\/)?/i, '').trim();
    return {
      protocol: 'url',
      placeholder: clean || '链接',
    };
  }

  // 3. 大括号语法 {} 无显式前缀时，默认适配为文件上传槽位
  if (delimiter === '{') {
    return {
      protocol: 'file',
      placeholder: trimmed || '选择文件',
    };
  }

  // 4. 常规方括号纯文本槽位
  return {
    protocol: 'text',
    placeholder: trimmed,
  };
}

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
    const isBrackets = match[1] !== undefined;
    const inner = isBrackets ? match[1] : match[2];
    const delimiter: '[' | '{' = isBrackets ? '[' : '{';
    const parsed = parseSlotContent(raw, inner, delimiter);

    slots.push({
      id: `slot-${count++}-${match.index}`,
      raw,
      placeholder: parsed.placeholder,
      protocol: parsed.protocol,
      selectedValue: parsed.selectedValue,
      start: match.index,
      end: match.index + raw.length,
      delimiter,
    });
  }
  return slots;
}

/**
 * 检查文本是否包含 Prompt 变量槽位。
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
  const hasBrackets =
    (newValue.startsWith('[') && newValue.endsWith(']')) ||
    (newValue.startsWith('{') && newValue.endsWith('}'));
  const formattedValue = hasBrackets ? newValue : `[${newValue}]`;
  return text.slice(0, target.start) + formattedValue + text.slice(target.end);
}
