import { getFileNameLowLevel, type Entry, type LocalFileHeader } from 'yauzl';
import crc32 = require('buffer-crc32');
import { checkLimit, reject, type ValidationLimits } from './install-validation-contract.js';
import { strictUtf8 } from './install-validation-markdown.js';
import { normalizePath } from './install-validation-path.js';
import { VALIDATION_LIMITS } from './install-validation-contract.js';

export interface CentralDirectory { offset: number; records: number[]; }
function requireBytes(bytes: Buffer, start: number, length: number, end = bytes.length): void {
  if (!Number.isSafeInteger(start) || start < 0 || start + length > end) reject('PACKAGE_FORMAT', 'STRUCTURE_BOUNDS');
}

/** Supplement only raw fields yauzl does not validate; yauzl remains the entry reader. */
export function inspectCentral(bytes: Buffer, limits: ValidationLimits): CentralDirectory {
  const candidates: number[] = [];
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) candidates.push(i);
  }
  if (candidates.length !== 1) reject('PACKAGE_FORMAT', 'EOCD');
  const end = candidates[0];
  if (end >= 20 && bytes.readUInt32LE(end - 20) === 0x07064b50) reject('PACKAGE_FORMAT', 'ZIP64');
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) reject('PACKAGE_FORMAT', 'MULTI_DISK');
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  const offset = bytes.readUInt32LE(end + 16);
  if (count === 65535 || size === 0xffffffff || offset === 0xffffffff) reject('PACKAGE_FORMAT', 'ZIP64');
  if (bytes.readUInt16LE(end + 8) !== count || offset + size !== end) reject('PACKAGE_FORMAT', 'CENTRAL_DIRECTORY');
  checkLimit(count, limits.entries, 'ENTRY_COUNT');
  const records: number[] = [];
  let cursor = offset;
  for (let i = 0; i < count; i++) {
    requireBytes(bytes, cursor, 46, end);
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) reject('PACKAGE_FORMAT', 'CENTRAL_SIGNATURE');
    if (bytes.readUInt16LE(cursor + 34) !== 0) reject('PACKAGE_FORMAT', 'MULTI_DISK');
    for (const field of [20, 24, 42]) if (bytes.readUInt32LE(cursor + field) === 0xffffffff) reject('PACKAGE_FORMAT', 'ZIP64');
    const length = 46 + bytes.readUInt16LE(cursor + 28) + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
    requireBytes(bytes, cursor, length, end);
    records.push(cursor);
    cursor += length;
  }
  if (cursor !== end) reject('PACKAGE_FORMAT', 'CENTRAL_LENGTH');
  return { offset, records };
}

/** Strict extra framing and known filesystem/link encodings. Unknown fields are inert. */
function inspectExtras(raw: Buffer): Map<number, Buffer> {
  const fields = new Map<number, Buffer>();
  let cursor = 0;
  while (cursor < raw.length) {
    requireBytes(raw, cursor, 4);
    const id = raw.readUInt16LE(cursor);
    const length = raw.readUInt16LE(cursor + 2);
    requireBytes(raw, cursor + 4, length);
    if (fields.has(id)) reject('PACKAGE_FORMAT', 'DUPLICATE_EXTRA');
    const data = raw.subarray(cursor + 4, cursor + 4 + length);
    if (id === 1) reject('PACKAGE_FORMAT', 'ZIP64');
    if (id === 0x0017 || id === 0x9901) reject('PACKAGE_FORMAT', 'ENCRYPTED');
    if (id === 0x000d) {
      if (length < 12) reject('PACKAGE_FORMAT', 'UNIX_EXTRA');
      if (length > 12) reject('UNSAFE_PATH', 'UNIX_LINK_OR_DEVICE');
    }
    if (id === 0x756e) {
      if (length < 14 || crc32.unsigned(data.subarray(4)) !== data.readUInt32LE(0)) reject('PACKAGE_FORMAT', 'ASI_EXTRA');
      const kind = data.readUInt16LE(4) & 0xf000;
      if ((kind !== 0x8000 && kind !== 0x4000) || data.readUInt32LE(6) !== 0 || length !== 14) reject('UNSAFE_PATH', 'ASI_LINK_OR_DEVICE');
    }
    if (id === 0x000a) {
      if (length < 4) reject('PACKAGE_FORMAT', 'NTFS_EXTRA');
      let pos = 4;
      while (pos < length) {
        requireBytes(data, pos, 4);
        const tag = data.readUInt16LE(pos);
        const len = data.readUInt16LE(pos + 2);
        requireBytes(data, pos + 4, len);
        if (tag === 1 && len !== 24) reject('PACKAGE_FORMAT', 'NTFS_EXTRA');
        pos += 4 + len;
      }
    }
    fields.set(id, data);
    cursor += 4 + length;
  }
  return fields;
}

export function decodeName(raw: Buffer, flags: number, extra: Buffer): string {
  if (!Buffer.isBuffer(raw) || !Buffer.isBuffer(extra)) reject('PACKAGE_FORMAT', 'RAW_NAME_REQUIRED');
  const fields = inspectExtras(extra);
  const utf8 = (flags & 0x800) !== 0;
  const base = utf8 ? strictUtf8(raw, 'UNSAFE_PATH') : getFileNameLowLevel(0, raw, [], true);
  const unicode = fields.get(0x7075);
  if (!unicode) return base;
  // A Unicode override cannot hide traversal or platform-unsafe legacy spelling.
  normalizePath(base, VALIDATION_LIMITS);
  if (unicode.length < 5 || unicode[0] !== 1 || unicode.readUInt32LE(1) !== crc32.unsigned(raw)) reject('UNSAFE_PATH', 'UNICODE_EXTRA');
  const name = strictUtf8(unicode.subarray(5), 'UNSAFE_PATH');
  if (utf8 && name !== base) reject('UNSAFE_PATH', 'ENCODING_CONFLICT');
  // ASCII raw bytes have no legacy encoding ambiguity to justify a different spelling.
  if (!utf8 && raw.every(byte => byte < 128) && name !== base) reject('UNSAFE_PATH', 'ENCODING_CONFLICT');
  return name;
}

export function inspectEntry(entry: Entry): string {
  const flags = entry.generalPurposeBitFlag;
  if (flags & (1 | 0x40 | 0x2000)) reject('PACKAGE_FORMAT', 'ENCRYPTED');
  if (flags & ~(0x800 | 8 | 6)) reject('PACKAGE_FORMAT', 'UNSUPPORTED_FLAGS');
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) reject('PACKAGE_FORMAT', 'UNSUPPORTED_METHOD');
  if (entry.compressionMethod === 0 && (flags & 6)) reject('PACKAGE_FORMAT', 'UNSUPPORTED_FLAGS');
  if (entry.versionNeededToExtract > 20) reject('PACKAGE_FORMAT', 'UNSUPPORTED_VERSION');
  const name = decodeName(entry.fileNameRaw, flags, entry.extraFieldRaw);
  const mode = entry.externalFileAttributes >>> 16;
  const kind = mode & 0xf000;
  if (kind !== 0 && kind !== 0x8000 && kind !== 0x4000) reject('UNSAFE_PATH', 'SPECIAL_FILE');
  if (entry.externalFileAttributes & 8) reject('UNSAFE_PATH', 'VOLUME_LABEL');
  if ((kind === 0x4000 || (entry.externalFileAttributes & 0x10)) && !name.endsWith('/')) reject('PACKAGE_FORMAT', 'DIRECTORY_ATTRIBUTES');
  if (kind === 0x8000 && name.endsWith('/')) reject('PACKAGE_FORMAT', 'DIRECTORY_ATTRIBUTES');
  return name;
}

/** Validate local metadata and a descriptor at the verified payload endpoint, never by scanning. */
export function inspectLocal(bytes: Buffer, entry: Entry, local: LocalFileHeader, centralStart: number): [number, number] {
  const start = entry.relativeOffsetOfLocalHeader;
  requireBytes(bytes, start, 30, centralStart);
  const fields: (keyof LocalFileHeader & keyof Entry)[] = ['versionNeededToExtract', 'generalPurposeBitFlag', 'compressionMethod', 'lastModFileTime', 'lastModFileDate'];
  if (fields.some(key => local[key] !== entry[key]) || !local.fileName.equals(entry.fileNameRaw)) reject('PACKAGE_FORMAT', 'LOCAL_MISMATCH');
  const localName = decodeName(local.fileName, local.generalPurposeBitFlag, local.extraField);
  const centralName = decodeName(entry.fileNameRaw, entry.generalPurposeBitFlag, entry.extraFieldRaw);
  if (localName !== centralName) reject('UNSAFE_PATH', 'LOCAL_ENCODING_MISMATCH');
  const centralExtras = inspectExtras(entry.extraFieldRaw);
  const localExtras = inspectExtras(local.extraField);
  const a = centralExtras.get(0x7075);
  const b = localExtras.get(0x7075);
  if (!!a !== !!b || (a && b && !a.equals(b))) reject('UNSAFE_PATH', 'LOCAL_ENCODING_MISMATCH');
  let end = local.fileDataStart + entry.compressedSize;
  requireBytes(bytes, start, end - start, centralStart);
  const values = ['crc32', 'compressedSize', 'uncompressedSize'] as const;
  if (!(entry.generalPurposeBitFlag & 8)) {
    if (values.some(key => local[key] !== entry[key])) reject('PACKAGE_FORMAT', 'LOCAL_SIZE_CRC');
  } else {
    if (values.some(key => local[key] !== 0 && local[key] !== entry[key])) reject('PACKAGE_FORMAT', 'LOCAL_PLACEHOLDER');
    const matches: number[] = [];
    for (const signed of [false, true]) {
      const offset = end + (signed ? 4 : 0);
      if (offset + 12 > centralStart || (signed && bytes.readUInt32LE(end) !== 0x08074b50)) continue;
      if (values.every((key, i) => bytes.readUInt32LE(offset + i * 4) === entry[key])) matches.push(offset + 12);
    }
    if (matches.length !== 1) reject('PACKAGE_FORMAT', 'DATA_DESCRIPTOR');
    end = matches[0];
  }
  return [start, end];
}
