/**
 * Local imported media helpers: preview URL builders + type probes.
 * Project ingest copies into `<ProjectRoot>/assets/imported/`; `local-file`
 * remains a probe/source stream. blob: URLs must not persist.
 */
import { WORKFLOW_ROUTE_PREFIX } from './api.ts';
import type { MaterialType } from './canvasTypes.ts';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus']);
const TEXT_EXT = new Set(['txt', 'md']);

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  m4v: 'video/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

const SNIFF_HEAD_BYTES = 512;

interface NodeFsSync {
  openSync(path: string, flags: string): number;
  readSync(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): number;
  closeSync(fd: number): void;
}

function bytesEq(buf: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (buf.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (buf[offset + i] !== signature[i]) return false;
  }
  return true;
}

function asciiEq(buf: Uint8Array, offset: number, text: string): boolean {
  if (buf.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (buf[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function latin1Head(buf: Uint8Array, maxBytes = SNIFF_HEAD_BYTES): string {
  const n = Math.min(buf.length, maxBytes);
  if (typeof TextDecoder === 'function') {
    return new TextDecoder('latin1').decode(buf.subarray(0, n));
  }
  let out = '';
  for (let i = 0; i < n; i += 1) {
    out += String.fromCharCode(buf[i] ?? 0);
  }
  return out;
}

/**
 * Magic-byte MIME probe. Node `Buffer` is a `Uint8Array` subclass, so either
 * is accepted. Returns undefined when the buffer is empty or unknown.
 */
export function sniffMimeType(buf: Uint8Array): string | undefined {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length === 0) return undefined;

  // PNG: 89 50 4E 47
  if (bytesEq(bytes, 0, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  // JPEG: FF D8 FF
  if (bytesEq(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // GIF: 47 49 46 38 ("GIF8")
  if (asciiEq(bytes, 0, 'GIF8')) return 'image/gif';
  // WebP: RIFF....WEBP
  if (asciiEq(bytes, 0, 'RIFF') && asciiEq(bytes, 8, 'WEBP')) return 'image/webp';
  // WAV: RIFF....WAVE
  if (asciiEq(bytes, 0, 'RIFF') && asciiEq(bytes, 8, 'WAVE')) return 'audio/wav';
  // MP4: offset 4 is "ftyp"
  if (asciiEq(bytes, 4, 'ftyp')) return 'video/mp4';
  // WebM: 1A 45 DF A3 (EBML)
  if (bytesEq(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  // MP3: "ID3" or MPEG frame sync FF E0–FF
  if (asciiEq(bytes, 0, 'ID3')) return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  // SVG: first 512 bytes contain "<svg" or "<?xml"
  const head = latin1Head(bytes, SNIFF_HEAD_BYTES).toLowerCase();
  if (head.includes('<svg') || head.includes('<?xml')) return 'image/svg+xml';

  return undefined;
}

/** Map a sniffed buffer onto a file extension (`png`, `jpg`, `svg`, …). */
export function sniffMediaExtension(buf: Uint8Array): string | undefined {
  const mime = sniffMimeType(buf);
  if (!mime) return undefined;
  return EXT_BY_MIME[mime];
}

function nodeFsSync(): NodeFsSync | undefined {
  try {
    const proc = (globalThis as {
      process?: { getBuiltinModule?: (name: string) => unknown };
    }).process;
    const fs = proc?.getBuiltinModule?.('node:fs') as NodeFsSync | undefined;
    if (!fs?.openSync || !fs.readSync || !fs.closeSync) return undefined;
    return fs;
  } catch {
    return undefined;
  }
}

function readFileHead(filePath: string, maxBytes = SNIFF_HEAD_BYTES): Uint8Array | undefined {
  const fs = nodeFsSync();
  if (!fs) return undefined;
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = new Uint8Array(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    if (n <= 0) return new Uint8Array();
    return n === maxBytes ? buf : buf.subarray(0, n);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close races
      }
    }
  }
}

/**
 * Prefer magic-byte MIME over the filename extension so a historical
 * `artifacts/*.svg` that is actually PNG still serves as `image/png`.
 */
export function detectMimeFromFile(
  filePath: string,
  fallbackMime = 'application/octet-stream',
): string {
  const head = readFileHead(filePath, SNIFF_HEAD_BYTES);
  if (head && head.length > 0) {
    const sniffed = sniffMimeType(head);
    if (sniffed) return sniffed;
  }
  return mimeFromFilename(filePath) ?? MIME_BY_EXT[extensionOf(filePath)] ?? fallbackMime;
}

export function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function mimeFromFilename(filename: string): string | undefined {
  return MIME_BY_EXT[extensionOf(filename)];
}

export function materialTypeFromFilename(filename: string, mime = ''): MaterialType | null {
  const normalized = (mime || '').toLowerCase().trim();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  const ext = extensionOf(filename);
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (TEXT_EXT.has(ext)) return 'text';
  return null;
}

export function isAllowedImportedMedia(filename: string, mime = ''): boolean {
  return materialTypeFromFilename(filename, mime) !== null;
}

export function isBlobUrl(url: unknown): boolean {
  return typeof url === 'string' && url.startsWith('blob:');
}

export function isLocalFileUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  return url.includes('/api/local-file');
}

export function localFileMediaUrl(realPath: string): string {
  return `${WORKFLOW_ROUTE_PREFIX}/api/local-file?path=${encodeURIComponent(realPath)}`;
}

export function projectFileMediaUrl(workspaceId: string, relativePath: string): string {
  return `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${encodeURIComponent(workspaceId)}/file?rel=${encodeURIComponent(relativePath)}`;
}

export function localFilePathFromUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    if (!parsed.pathname.endsWith('/api/local-file')) return null;
    const path = parsed.searchParams.get('path');
    return path && path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

export function looksAbsolutePath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  if (path.startsWith('/')) return true;
  return /^[a-zA-Z]:[\\/]/.test(path);
}

export function displayNameOf(realPath: string, originalName?: string): string {
  const named = typeof originalName === 'string' ? originalName.trim() : '';
  if (named) return named;
  const trimmed = realPath.replace(/[/\\]+$/, '');
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || realPath;
}

export interface ImportedMediaFields {
  [key: string]: unknown;
  mediaUrl: string;
  status: 'ready';
  content: string;
  originalName: string;
  realPath: string;
  /** Canonical MIME; null when unknown (never invent octet-stream). */
  mimeType: string | null;
  /** Canonical byte size; null when unknown (never invent 0). */
  sizeBytes: number | null;
  /** Canonical duration seconds; null when unknown / non-AV. */
  durationSec: number | null;
  /** Legacy alias of sizeBytes (same null semantics). */
  fileSize: number | null;
  /** Legacy alias of durationSec (same null semantics). */
  duration: number | null;
  isMissing: false;
  mediaAssets: Array<{ type: MaterialType; url: string; path: string }>;
}

export function buildImportedMediaData(input: {
  realPath: string;
  name: string;
  materialType: MaterialType;
  mime?: string | null;
  size?: number | null;
  durationSec?: number | null;
  duration?: number | null;
}): ImportedMediaFields {
  const url = localFileMediaUrl(input.realPath);
  // Lazy import avoided — keep localMedia free of circular deps by inlining
  // the null-safe normalize rules (mirrors shared/mediaMetadata.ts).
  const rawMime =
    (typeof input.mime === 'string' && input.mime.trim() ? input.mime.trim() : '')
    || mimeFromFilename(input.name)
    || mimeFromFilename(input.realPath)
    || '';
  const mimeLower = rawMime.toLowerCase();
  const mimeType =
    rawMime
    && mimeLower !== 'unknown'
    && mimeLower !== 'application/octet-stream'
      ? rawMime
      : null;
  const sizeBytes =
    typeof input.size === 'number' && Number.isFinite(input.size) && input.size >= 0
      ? input.size
      : null;
  const durationSec =
    (typeof input.durationSec === 'number' && Number.isFinite(input.durationSec) && input.durationSec >= 0
      ? input.durationSec
      : null)
    ?? (typeof input.duration === 'number' && Number.isFinite(input.duration) && input.duration >= 0
      ? input.duration
      : null);
  return {
    mediaUrl: url,
    status: 'ready',
    content: input.name,
    originalName: input.name,
    realPath: input.realPath,
    mimeType,
    sizeBytes,
    durationSec,
    fileSize: sizeBytes,
    duration: durationSec,
    isMissing: false,
    mediaAssets: [{ type: input.materialType, url, path: input.realPath }],
  };
}

export interface LocalMediaProbeItem {
  path: string;
  exists: boolean;
  size?: number;
  mime?: string;
  name?: string;
}

export function applyLocalMediaProbe<T extends { data?: Record<string, unknown> }>(
  nodes: T[],
  items: LocalMediaProbeItem[],
): T[] {
  const byPath = new Map(items.map((item) => [item.path, item]));
  return nodes.map((node) => {
    const data = node.data && typeof node.data === 'object' ? { ...node.data } : {};
    const realPath = typeof data.realPath === 'string' ? data.realPath : '';
    if (!realPath) return node;
    const hit = byPath.get(realPath);
    if (!hit) return node;
    if (hit.exists) {
      if (data.status === 'offline' || data.isMissing === true) {
        data.status = 'ready';
        data.isMissing = false;
        data.mediaUrl = localFileMediaUrl(realPath);
        return { ...node, data };
      }
      return node;
    }
    data.status = 'offline';
    data.isMissing = true;
    return { ...node, data };
  });
}

export function collectRealPaths(nodes: Array<{ data?: Record<string, unknown> }>): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const realPath = typeof node.data?.realPath === 'string' ? node.data.realPath : '';
    if (!realPath || seen.has(realPath)) continue;
    seen.add(realPath);
    paths.push(realPath);
  }
  return paths;
}
