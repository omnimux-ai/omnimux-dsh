/**
 * Operation display names — the canvas-side resolver for Catalog operation ids (Issue #4103).
 *
 * 语义：一条 operation 的对外文案只允许来自「已审校目录」
 * （`plugins/omnimux/src/catalog/contract/operation-registry.json`）。
 * 网关快照里只有 id、本地 YAML 没写 label 的型号（`wan-3.0` 等 gateway-only 行）
 * 因此没有任何合法文案 —— 这里按 registry 的中英名解析，registry 也没有才回落 id。
 *
 * 为什么本仓有一份镜像而不是直接 import 那份 JSON：
 * - 画布是浏览器岛（`lib/canvas.js`），构建产物里没有 Node 文件系统，运行期读不到
 *   `plugins/omnimux` 下的契约文件；两个插件也是各自独立的 npm 包，不得跨包取源码。
 * - 所以本文件是 registry 的**运行期镜像**，并由
 *   `tests/operation-labels-parity.test.mjs` 逐条比对 id/中文/英文 —— 只改一边会立刻变红，
 *   镜像因此不可能悄悄漂移。
 *
 * 展示层只经过 `resolveOperationLabel`：`SegmentControls`（生成方式分段/胶囊）与
 * `summaryFormatter`（底栏摘要）共用它，禁止各自再写一份字典。
 */

export type OperationLabelLocale = 'zh' | 'en';

/** operation id → 中英已审校名；与 operation-registry.json 一一对应。 */
export const OPERATION_LABELS: Readonly<Record<string, { zh: string; en: string }>> = Object.freeze({
  chat: { zh: '纯文本对话', en: 'Text chat' },
  vision_chat: { zh: '图文多模态对话', en: 'Multimodal chat' },
  document_analyze: { zh: '文档解析', en: 'Document analysis' },
  text_to_image: { zh: '文生图', en: 'Text to image' },
  image_to_image: { zh: '图生图', en: 'Image to image' },
  multi_reference: { zh: '多图主体参考', en: 'Multi-image reference' },
  inpaint_outpaint: { zh: '局部重绘', en: 'Inpainting' },
  text_to_video: { zh: '文生视频', en: 'Text to video' },
  first_frame: { zh: '首帧驱动', en: 'First-frame driven' },
  first_last_frame: { zh: '首尾帧过渡', en: 'First-last frame transition' },
  end_frame: { zh: '尾帧参考', en: 'Last-frame reference' },
  video_multi_ref: { zh: '全能参考', en: 'All-reference video' },
  digital_human: { zh: '数字人/对口型', en: 'Digital human / lip sync' },
  video_edit: { zh: '视频编辑/重绘', en: 'Video edit / repaint' },
  video_extend: { zh: '视频延长', en: 'Video extension' },
  document_to_video: { zh: '文档参考', en: 'Document to video' },
  webpage_to_video: { zh: '网页参考', en: 'Webpage to video' },
  text_to_speech: { zh: '语音合成', en: 'Text to speech' },
  voice_clone: { zh: '声音克隆', en: 'Voice clone' },
  text_to_music: { zh: '音乐创作', en: 'Music generation' },
  speech_to_text: { zh: '语音转文字', en: 'Speech to text' },
  webpage_read: { zh: '网页读取', en: 'Webpage read' },
});

/** 解析入参：只需要 id；目录给的 label 作为「更具体」的候选优先。 */
export interface OperationLabelSource {
  id?: string | null;
  /** Catalog DTO label（已审校目录给的名字；gateway-only 行为空）。 */
  label?: string | null;
}

/**
 * 解析 operation 的展示名（Issue #4103）。
 *
 * 规则（顺序固定，不可调整）：
 * 1. `label` 非空且 **≠ id** → 用它（型号 YAML 里写的具体文案优先）；
 * 2. 否则查已审校目录（`{zh,en}`，按 locale）；
 * 3. 都没有 → 回落 id（绝不空白、绝不抛错）；
 * 4. id 也空 → 空串（调用方据此隐藏该段）。
 */
export function resolveOperationLabel(
  input: OperationLabelSource | string | null | undefined,
  locale: OperationLabelLocale = 'zh',
): string {
  const source: OperationLabelSource = typeof input === 'string' ? { id: input } : (input ?? {});
  const id = typeof source.id === 'string' ? source.id.trim() : '';
  const label = typeof source.label === 'string' ? source.label.trim() : '';
  const entry = id ? OPERATION_LABELS[id] : undefined;
  if (label && label !== id) {
    // 目录镜像可能已经把 catalog label 解析成中文（`matchToOption` 的默认 locale），
    // 切到 en 时同一句文案必须跟着走英文，否则英文界面会混进中文名字。
    if (entry && locale === 'en' && label === entry.zh && entry.en) return entry.en.trim();
    return label;
  }
  if (entry) {
    const localized = locale === 'en' ? entry.en : entry.zh;
    if (localized && localized.trim()) return localized.trim();
    if (entry.zh && entry.zh.trim()) return entry.zh.trim();
  }
  return id;
}
