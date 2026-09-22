/**
 * 素材卡槽的槽位计算。
 *
 * 只读当前模型在执行中枢登记的 operations[].inputs，
 * 不在界面里另写张数、格式或时长。读不到契约时返回空，调用方不显示卡槽。
 */

/** 视频生成模式与契约操作的对应。文案沿用输入框里已有的四个，再补契约里的「视频编辑」。 */
export const VIDEO_MODE_OPTIONS = Object.freeze([
  { id: 'text_to_video', label: '文生视频' },
  { id: 'first_frame', label: '首帧' },
  { id: 'first_last_frame', label: '首尾帧' },
  { id: 'video_multi_ref', label: '全能参考' },
  { id: 'video_edit', label: '视频编辑' },
]);

const IMAGE_MODE_ORDER = ['multi_reference', 'image_edit', 'text_to_image'];

/** 一个操作里，同类型同角色的输入槽（首帧、尾帧各自独立，不合并）。 */
function slotGroups(operation) {
  const groups = [];
  for (const input of operation?.inputs ?? []) {
    if (!input || input.type === 'text' || input.role === 'prompt') continue;
    if (!['image', 'video', 'audio'].includes(input.type)) continue;
    const key = `${input.type}:${input.role ?? 'reference'}:${input.slot ?? ''}`;
    const found = groups.find((group) => group.key === key);
    if (found) {
      found.max = mergeMax(found.max, input.max);
      found.durationMax = firstNumber(found.durationMax, input.maxDurationSec, input.totalMaxDurationSec);
      continue;
    }
    groups.push({
      key,
      slot: input.slot ?? key,
      type: input.type,
      role: input.role ?? 'reference',
      max: finiteMax(input.max),
      durationMax: firstNumber(input.maxDurationSec, input.totalMaxDurationSec),
      allowedMimes: Array.isArray(input.allowedMimes) ? [...input.allowedMimes] : [],
    });
  }
  return groups.filter((group) => group.max === null || group.max > 0);
}

function finiteMax(value) {
  if (value === null) return null;
  return Number.isFinite(value) ? value : 0;
}

function mergeMax(left, right) {
  const next = finiteMax(right);
  if (left === null || next === null) return null;
  return Math.max(left, next);
}

function firstNumber(...values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

/** 模型原始记录上、输出类型匹配的操作。 */
export function operationsOf(model, kind) {
  const raw = model?.raw ?? model;
  return (raw?.operations ?? []).filter((operation) => operation?.output?.type === kind);
}

/**
 * 当前该用哪个操作。
 * 图像优先用带参考图的操作；视频用调用方选中的模式，选中的不存在就用第一个。
 */
export function activeOperation(model, kind, selectedId) {
  const operations = operationsOf(model, kind);
  if (operations.length === 0) return null;
  if (kind === 'video') {
    return operations.find((operation) => operation.id === selectedId) ?? operations[0];
  }
  for (const id of IMAGE_MODE_ORDER) {
    const found = operations.find((operation) => operation.id === id);
    if (found && (id === 'text_to_image' || slotGroups(found).length > 0)) return found;
  }
  return operations.find((operation) => slotGroups(operation).length > 0) ?? operations[0];
}

/**
 * 当前输入框要渲染的卡槽。
 * @returns {Array<{ key: string, slot: string, type: 'image'|'video'|'audio', role: string, max: number|null, durationMax: number|null, label: string }>}
 */
export function slotPlan(model, kind, selectedVideoMode) {
  const operation = activeOperation(model, kind, selectedVideoMode);
  if (!operation) return [];
  return slotGroups(operation).map((group) => ({
    ...group,
    label: slotLabel(group),
  }));
}

function slotLabel(group) {
  if (group.role === 'first_frame') return '首帧';
  if (group.role === 'last_frame') return '尾帧';
  if (group.role === 'source') return '视频';
  if (group.type === 'video') return '';
  if (group.type === 'audio') return '';
  return '';
}

/** 这个文件能不能进这个槽。时长只在读得到时判断。 */
export function rejectionOf(file, slot, durationSec) {
  if (!file || !slot) return '请选择文件';
  const kind = file.type?.startsWith('image/')
    ? 'image'
    : file.type?.startsWith('video/')
      ? 'video'
      : file.type?.startsWith('audio/')
        ? 'audio'
        : 'other';
  if (kind !== slot.type) {
    const name = { image: '图片', video: '视频', audio: '音频' }[slot.type];
    return `请上传${name}，当前文件格式不符合要求`;
  }
  if (slot.allowedMimes.length > 0 && file.type && !slot.allowedMimes.includes(file.type)) {
    return '当前文件格式不符合要求';
  }
  if (slot.durationMax != null && Number.isFinite(durationSec) && durationSec > slot.durationMax) {
    return `${slot.type === 'audio' ? '音频' : '视频'}时长不能超过 ${formatSeconds(slot.durationMax)} 秒`;
  }
  return '';
}

function formatSeconds(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

/** 删掉下标处的一项后，新的顺序：被删项的右侧依次左移，左侧不动。 */
export function orderAfterRemoval(items, index) {
  if (!Array.isArray(items) || index < 0 || index >= items.length) return Array.isArray(items) ? [...items] : [];
  return [...items.slice(0, index), ...items.slice(index + 1)];
}
