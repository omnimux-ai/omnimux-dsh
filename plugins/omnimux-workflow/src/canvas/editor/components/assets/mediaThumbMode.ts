/**
 * 缩略图媒体类型分派（纯函数，无 React / DOM 依赖，供 node:test 直接断言）。
 *
 * 背景：导入的本地素材把同一个 `/api/local-file?path=<绝对路径>` 地址写进
 * `mediaUrl` / `previewUrl`，图片与视频共用一个字段。渲染侧若一律用 `<img>`
 * 呈现，视频与音频字节无法解码，浏览器只剩「破图」占位符。
 *
 * 判定顺序：**地址扩展名优先，声明类型兜底**。原因是素材节点的声明类型可能是
 * 宽泛的容器类型（例如 `material`），而地址本身携带了真实媒体扩展名；反过来，
 * 远端产物地址常以 `/content` 结尾、没有扩展名，此时才回落到声明类型。
 */

export type ThumbMode = 'image' | 'video' | 'none';

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv']);
const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'avif',
  'heic',
  'ico',
]);

/** 查询串中可能承载真实文件路径的参数名。 */
const PATH_QUERY_KEYS = new Set(['path', 'rel', 'file', 'src']);

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 取路径末段的扩展名（小写，不含点）；无扩展名返回空串。 */
export function extensionOfPath(candidate: string): string {
  const trimmed = candidate.trim().replace(/[/\\]+$/, '');
  if (!trimmed) return '';
  const base = trimmed.split(/[/\\]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/**
 * 从地址收集全部候选扩展名：路径部分 + 查询串里承载文件路径的参数值。
 * 例：`/api/local-file?path=%2FUsers%2Fx%2Fa.mp4` → `['mp4']`。
 */
export function extensionCandidates(url: string): string[] {
  const text = typeof url === 'string' ? url.trim() : '';
  if (!text) return [];

  const hashAt = text.indexOf('#');
  const withoutHash = hashAt >= 0 ? text.slice(0, hashAt) : text;
  const queryAt = withoutHash.indexOf('?');
  const pathPart = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
  const query = queryAt >= 0 ? withoutHash.slice(queryAt + 1) : '';

  const parts: string[] = [pathPart];
  if (query) {
    for (const pair of query.split('&')) {
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const key = pair.slice(0, eq).trim().toLowerCase();
      if (!PATH_QUERY_KEYS.has(key)) continue;
      const value = safeDecode(pair.slice(eq + 1));
      if (value) parts.push(value);
    }
  }

  const extensions: string[] = [];
  for (const part of parts) {
    const ext = extensionOfPath(part);
    if (ext && !extensions.includes(ext)) extensions.push(ext);
  }
  return extensions;
}

/**
 * 决定缩略图应以哪种元素呈现。
 *
 * @param kind 素材声明类型（`image` / `video` / `audio` / 容器类型 …）
 * @param url  预览地址
 */
export function resolveThumbMode(kind: unknown, url: unknown): ThumbMode {
  const href = typeof url === 'string' ? url.trim() : '';
  if (!href) return 'none';

  const extensions = extensionCandidates(href);
  if (extensions.some((ext) => VIDEO_EXTENSIONS.has(ext))) return 'video';
  if (extensions.some((ext) => IMAGE_EXTENSIONS.has(ext))) return 'image';

  const declared = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  if (declared === 'video') return 'video';
  if (declared === 'image') return 'image';
  return 'none';
}
