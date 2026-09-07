/**
 * SRT 字幕解析与字幕切片纯函数（Issue 744 T02/T05）。
 *
 * 无 React / 无 DOM 依赖，供画布节点组件与 node:test 直接复用：
 * - T02：语音识别产物（SRT 文本）解析为 cue 时间轴；
 * - T05：视频合成节点把上游 SRT 文本展开为精确 captions，
 *   普通文本保持原有整段 3 秒切片逻辑。
 */

export interface SrtCue {
  text: string;
  startTimeMs: number;
  durationMs: number;
}

/** 兼容逗号（标准）与点号（容错）毫秒分隔；`-->` 两侧允许任意空白。 */
const SRT_TIMING_LINE =
  /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function toMillis(hours: string, minutes: string, seconds: string, fraction: string): number {
  // 毫秒位按“秒的小数位”解读：'5' → 500ms、'05' → 50ms、'500' → 500ms。
  const ms = Number(fraction.padEnd(3, '0'));
  return (
    Number(hours) * 3_600_000
    + Number(minutes) * 60_000
    + Number(seconds) * 1_000
    + ms
  );
}

/**
 * 解析标准 SRT 文本为 cue 数组。
 *
 * 容错规则：
 * - 序号行可选（首行纯数字则跳过）；
 * - 块间分隔为一个及以上空行，兼容 CRLF / CR；
 * - 无有效时间行、空正文、end <= start 的块一律丢弃；
 * - 输入非字符串或全空白时返回 []。
 */
export function parseSrtCues(raw: string): SrtCue[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const normalized = raw.replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SrtCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;

    let timingIndex = 0;
    if (/^\d+$/.test(lines[0]!.trim())) timingIndex = 1;
    const timingLine = lines[timingIndex];
    if (!timingLine) continue;

    const match = SRT_TIMING_LINE.exec(timingLine);
    if (!match) continue;

    const startTimeMs = toMillis(match[1]!, match[2]!, match[3]!, match[4]!);
    const endTimeMs = toMillis(match[5]!, match[6]!, match[7]!, match[8]!);
    const text = lines.slice(timingIndex + 1).join('\n').trim();
    if (!text || endTimeMs <= startTimeMs) continue;

    cues.push({ text, startTimeMs, durationMs: endTimeMs - startTimeMs });
  }

  return cues;
}

/** 文本是否能解析出至少一条有效 SRT cue。 */
export function isSrtContent(raw: string): boolean {
  return parseSrtCues(raw).length > 0;
}

/**
 * 文本节点 → 视频合成 captions 切片（T05 单一真源）：
 * - `contentFormat === 'srt'` 或正文可解析出有效 cue → 按 SRT 时间轴展开；
 *   （显式声明 srt 但解析为空时返回 []，绝不回退成普通文本切片）
 * - 普通文本 → 保持原有逻辑：整段一条，startTimeMs 由调用方累加，默认 3 秒。
 */
export function captionSlicesFromText(input: {
  content: string;
  contentFormat?: string;
  startTimeMs?: number;
  sliceDurationMs?: number;
}): SrtCue[] {
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!content) return [];
  if (input.contentFormat === 'srt') {
    return parseSrtCues(content);
  }
  const cues = parseSrtCues(content);
  if (cues.length > 0) return cues;
  return [
    {
      text: content,
      startTimeMs: input.startTimeMs ?? 0,
      durationMs: input.sliceDurationMs ?? 3000,
    },
  ];
}
