/**
 * 「最近导入的 ComfyUI 工作流」本地便利缓存（Issue 3669）。
 *
 * 这是**客户端便利缓存**，不是产品真源：画布真源仍是工作区快照，模板真源是模板库。
 * 缓存只在用户真的「应用」过一次 ComfyUI 导入之后写入，用来让入口再次打开时能一键
 * 复现上次导入的那份工作流。存储不可用（隐私模式、SSR、配额满）时降级为空列表，
 * 导入本身不受影响。
 *
 * 纯函数（decode / encode / upsert）可在 node --test 里直接验证；读写包装只碰
 * `globalThis.localStorage`。
 */

export const COMFY_RECENTS_KEY = 'omnimux.workflow.comfyRecents.v1';
/** 列表上限：最近导入优先，超出按时间淘汰。 */
export const COMFY_RECENTS_MAX = 8;
/** 单条原始 JSON 上限（256 KiB）：超过就不入缓存，避免把 localStorage 撑爆。 */
export const COMFY_RECENT_TEXT_MAX = 262144;

export interface ComfyRecentEntry {
  /** 导入时的文件名（去扩展名前）或用户可见名称。 */
  name: string;
  /** ComfyUI 文档格式，例如 `0.4` / `1`。 */
  format: string;
  /** 投影到画布的节点数。 */
  nodeCount: number;
  /** 成功应用的 ISO 时间戳。 */
  savedAt: string;
  /** 原始文件文本，用于再次解析（不存解析结果，避免结构漂移）。 */
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isComfyRecentEntry(value: unknown): value is ComfyRecentEntry {
  if (!isRecord(value)) return false;
  return typeof value.name === 'string'
    && value.name.length > 0
    && typeof value.format === 'string'
    && typeof value.nodeCount === 'number'
    && Number.isFinite(value.nodeCount)
    && typeof value.savedAt === 'string'
    && typeof value.text === 'string';
}

/** 解析缓存文本；任何畸形内容都退回空列表，绝不抛出。 */
export function decodeComfyRecents(raw: string | null | undefined): ComfyRecentEntry[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isComfyRecentEntry).slice(0, COMFY_RECENTS_MAX);
}

export function encodeComfyRecents(entries: ComfyRecentEntry[]): string {
  return JSON.stringify(entries.slice(0, COMFY_RECENTS_MAX));
}

/**
 * 插入/更新一条：同名条目替换并提到最前，超出上限截断。
 *
 * 单条文本超过 `COMFY_RECENT_TEXT_MAX`、或名称为空时原样返回旧列表（不入缓存），
 * 让「导入能用、缓存记不住」成为可解释的降级，而不是静默写坏存储。
 */
export function upsertComfyRecent(
  entries: ComfyRecentEntry[],
  entry: ComfyRecentEntry,
  max: number = COMFY_RECENTS_MAX,
): ComfyRecentEntry[] {
  if (entry.name.length === 0 || entry.text.length > COMFY_RECENT_TEXT_MAX) return entries;
  const rest = entries.filter((item) => item.name !== entry.name);
  return [entry, ...rest].slice(0, max);
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readComfyRecents(storage: StorageLike | null = defaultStorage()): ComfyRecentEntry[] {
  if (!storage) return [];
  try {
    return decodeComfyRecents(storage.getItem(COMFY_RECENTS_KEY));
  } catch {
    return [];
  }
}

/** 写入缓存；返回是否真的写成功（不可用时 false，调用方据此降级，不阻断导入）。 */
export function writeComfyRecents(
  entries: ComfyRecentEntry[],
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(COMFY_RECENTS_KEY, encodeComfyRecents(entries));
    return true;
  } catch {
    return false;
  }
}

/** 展示用的紧凑时间：`MM-DD HH:mm`；非法时间返回空串，由调用方决定是否省略。 */
export function formatComfyRecentTime(savedAt: string): string {
  const time = new Date(savedAt);
  if (Number.isNaN(time.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}
