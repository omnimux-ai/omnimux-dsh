export type PromptSlotProtocol = 'text' | 'file' | 'assets' | 'product' | 'url';

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

export function inferProtocolByName(
  fieldName: string,
  value?: string,
): PromptSlotProtocol {
  const lowerName = fieldName.toLowerCase();
  const lowerVal = (value || '').toLowerCase();

  // 1. 优先判定文件类：包含图、照、视频、文件或文件名具有媒体后缀
  if (
    lowerName.includes('图') ||
    lowerName.includes('照') ||
    lowerName.includes('视频') ||
    lowerName.includes('文件') ||
    lowerName.includes('file') ||
    /\.(png|jpe?g|gif|webp|svg|mp4|mov|mkv)$/i.test(lowerVal)
  ) {
    return 'file';
  }

  // 2. 资产类判定
  if (lowerName.includes('资产') || lowerName.includes('asset')) {
    return 'assets';
  }

  // 3. 商品/产品判定
  if (
    lowerName.includes('商品') ||
    lowerName.includes('产品') ||
    lowerName.includes('product')
  ) {
    return 'product';
  }

  return 'text';
}

export function parseSlotContent(
  raw: string,
  inner: string,
  delimiter: '[' | '{',
): { protocol: PromptSlotProtocol; placeholder: string; selectedValue?: string } {
  const trimmed = inner.trim();

  // 1. 提取显式协议前缀（若存在）
  let explicitProtocol: PromptSlotProtocol | null = null;
  let withoutProtocol = trimmed;

  if (/^file:(?:\/\/)?/i.test(trimmed)) {
    explicitProtocol = 'file';
    withoutProtocol = trimmed.replace(/^file:(?:\/\/)?/i, '').trim();
  } else if (/^assets?:(?:\/\/)?/i.test(trimmed)) {
    explicitProtocol = 'assets';
    withoutProtocol = trimmed.replace(/^assets?:(?:\/\/)?/i, '').trim();
  } else if (/^products?:(?:\/\/)?/i.test(trimmed)) {
    explicitProtocol = 'product';
    withoutProtocol = trimmed.replace(/^products?:(?:\/\/)?/i, '').trim();
  } else if (/^url:(?:\/\/)?/i.test(trimmed)) {
    explicitProtocol = 'url';
    withoutProtocol = trimmed.replace(/^url:(?:\/\/)?/i, '').trim();
  }

  // 2. 检查是否为已填充态：形如 "商品图: 主图.png" 或 "product://商品名称: 耳机X1"
  const colonSplit = withoutProtocol.split(/:\s*(.+)/);
  if (colonSplit.length >= 2) {
    const fieldName = colonSplit[0].trim();
    const value = colonSplit[1].trim();
    const resolvedProtocol = explicitProtocol || inferProtocolByName(fieldName, value);
    return {
      protocol: resolvedProtocol,
      placeholder: fieldName,
      selectedValue: value,
    };
  }

  // 3. 显式协议未填充态
  if (explicitProtocol) {
    const defaultPlaceholderMap: Record<PromptSlotProtocol, string> = {
      file: '选择文件',
      assets: '从资产库导入',
      product: '从产品库选择',
      url: '链接',
      text: '输入内容',
    };
    return {
      protocol: explicitProtocol,
      placeholder: withoutProtocol || defaultPlaceholderMap[explicitProtocol],
    };
  }

  // 4. 大括号语法 {} 无显式前缀时，默认适配为文件上传槽位
  if (delimiter === '{') {
    return {
      protocol: 'file',
      placeholder: trimmed || '选择文件',
    };
  }

  // 5. 常规方括号纯文本槽位
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
