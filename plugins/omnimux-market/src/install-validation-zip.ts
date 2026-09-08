import { fromBuffer, type Entry, type LocalFileHeader, type ZipFile } from 'yauzl';
import { createHash } from 'node:crypto';
import { createInflateRaw } from 'node:zlib';
import { Transform, Writable, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import crc32 = require('buffer-crc32');
import { checkLimit, reject, type ManifestEntry, type SkillMetadata, type ValidationLimits } from './install-validation-contract.js';
import { validateMarkdown } from './install-validation-markdown.js';
import { checkPathSet, normalizePath, pathKey } from './install-validation-path.js';
import { inspectCentral, inspectEntry, inspectLocal } from './install-validation-structure.js';

interface ZipItem { entry: Entry; path: string; directory: boolean; omitted?: boolean; }
function open(bytes: Buffer): Promise<ZipFile> {
  return new Promise((resolve, rejectPromise) => fromBuffer(bytes, {
    lazyEntries: true, decodeStrings: false, validateEntrySizes: true, autoClose: false,
  }, (error, zip) => error ? rejectPromise(error) : resolve(zip)));
}
function localHeader(zip: ZipFile, entry: Entry): Promise<LocalFileHeader> {
  return new Promise((resolve, rejectPromise) => zip.readLocalFileHeader(entry, { minimal: false },
    (error, header) => error ? rejectPromise(error) : resolve(header)));
}
function rawStream(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, rejectPromise) => zip.openReadStream(entry, { decodeFileData: false },
    (error, stream) => error ? rejectPromise(error) : resolve(stream)));
}
function collectEntries(zip: ZipFile, limits: ValidationLimits): Promise<ZipItem[]> {
  return new Promise((resolve, rejectPromise) => {
    const items: ZipItem[] = [];
    const onError = (error: Error): void => { cleanup(); rejectPromise(error); };
    const cleanup = (): void => { zip.off('entry', onEntry); zip.off('error', onError); zip.off('end', onEnd); };
    const onEnd = (): void => { cleanup(); resolve(items); };
    const onEntry = (entry: Entry): void => {
      try {
        checkLimit(items.length + 1, limits.entries, 'ENTRY_COUNT');
        const name = inspectEntry(entry);
        items.push({ entry, ...normalizePath(name, limits) });
        zip.readEntry();
      } catch (error) { cleanup(); rejectPromise(error); }
    };
    zip.on('entry', onEntry); zip.on('error', onError); zip.on('end', onEnd);
    zip.readEntry();
  });
}

/** All metadata is checked before any resource stream is inflated. Nothing is written to disk. */
export async function validateZip(bytes: Buffer, limits: ValidationLimits): Promise<{
  manifest: ManifestEntry[]; metadata: SkillMetadata; totalBytes: number;
}> {
  const central = inspectCentral(bytes, limits);
  const zip = await open(bytes);
  let zipError: Error | null = null;
  let active: Readable | null = null;
  const onError = (error: Error): void => { zipError = error; active?.destroy(error); };
  zip.on('error', onError);
  try {
    const items = await collectEntries(zip, limits);
    if (items.length !== central.records.length) reject('PACKAGE_FORMAT', 'ENTRY_COUNT_MISMATCH');
    checkPathSet(items);
    const ranges: [number, number][] = [];
    for (const item of items) {
      const header = await localHeader(zip, item.entry);
      ranges.push(inspectLocal(bytes, item.entry, header, central.offset));
      if (item.directory && (item.entry.uncompressedSize !== 0 || item.entry.crc32 !== 0)) {
        reject('PACKAGE_FORMAT', 'DIRECTORY_DATA');
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let boundary = 0;
    for (const [start, end] of ranges) {
      if (start !== boundary) reject('PACKAGE_FORMAT', start < boundary ? 'OVERLAPPING_ENTRIES' : 'UNACCOUNTED_BYTES');
      boundary = end;
    }
    if (boundary !== central.offset) reject('PACKAGE_FORMAT', 'UNACCOUNTED_BYTES');
    const skills = items.filter(item => !item.directory && pathKey(item.path.split('/').at(-1)!) === 'skill.md');
    if (skills.length !== 1 || skills[0].path.split('/').at(-1) !== 'SKILL.md') reject('INVALID_SKILL', 'SINGLE_SKILL_ROOT');
    const skillParts = skills[0].path.split('/');
    if (skillParts.length > 2) reject('INVALID_SKILL', 'SINGLE_SKILL_ROOT');
    const wrapper = skillParts.length === 2 ? skillParts[0] : null;
    const stripped: ZipItem[] = [];
    for (const item of items) {
      if (wrapper && item.directory && item.path === wrapper) {
        stripped.push({ ...item, omitted: true });
        continue;
      }
      if (wrapper && !item.path.startsWith(wrapper + '/')) reject('INVALID_SKILL', 'MULTIPLE_ROOTS');
      const path = wrapper ? item.path.slice(wrapper.length + 1) : item.path;
      stripped.push({ entry: item.entry, ...normalizePath(path + (item.directory ? '/' : ''), limits) });
    }
    checkPathSet(stripped.filter(item => !item.omitted));
    let totalBytes = 0;
    let totalCompressed = 0;
    let metadata: SkillMetadata | null = null;
    const manifest: ManifestEntry[] = [];
    for (const item of stripped) {
      if (zipError) throw zipError;
      const entry = item.entry;
      const maxBytes = item.directory ? 0 : item.path === 'SKILL.md' ? limits.skillBytes : limits.resourceBytes;
      checkLimit(entry.uncompressedSize, maxBytes, item.path === 'SKILL.md' ? 'SKILL_BYTES' : 'RESOURCE_BYTES');
      checkLimit(totalBytes + entry.uncompressedSize, limits.totalBytes, 'TOTAL_BYTES');
      checkLimit(entry.uncompressedSize, limits.ratio * entry.compressedSize, 'COMPRESSION_RATIO');
      const raw = await rawStream(zip, entry);
      active = raw;
      const inflater = entry.compressionMethod === 8 ? createInflateRaw() : null;
      let delivered = 0;
      let written = 0;
      let checksum = 0;
      const hash = createHash('sha256');
      const markdown: Buffer[] = [];
      const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        delivered += chunk.length;
        callback(null, chunk);
      } });
      const sink = new Writable({ write(chunk: Buffer, _encoding, callback) {
        try {
          written += chunk.length;
          totalBytes += chunk.length;
          checkLimit(written, maxBytes, item.path === 'SKILL.md' ? 'SKILL_BYTES' : 'RESOURCE_BYTES');
          checkLimit(totalBytes, limits.totalBytes, 'TOTAL_BYTES');
          checkLimit(written, entry.compressedSize * limits.ratio, 'COMPRESSION_RATIO');
          checksum = crc32.unsigned(chunk, checksum);
          hash.update(chunk);
          if (item.path === 'SKILL.md') markdown.push(Buffer.from(chunk));
          callback();
        } catch (error) { callback(error as Error); }
      } });
      if (inflater) await pipeline(raw, meter, inflater, sink);
      else await pipeline(raw, meter, sink);
      active = null;
      const consumed = inflater ? inflater.bytesWritten : delivered;
      if (delivered !== entry.compressedSize || consumed !== delivered) reject('PACKAGE_FORMAT', 'COMPRESSED_CONSUMPTION');
      if (written !== entry.uncompressedSize || checksum !== entry.crc32) reject('PACKAGE_FORMAT', 'SIZE_OR_CRC');
      checkLimit(written, consumed * limits.ratio, 'COMPRESSION_RATIO');
      if (item.directory) {
        if (!item.omitted) manifest.push({ path: item.path, kind: 'directory', bytes: 0, sha256: null });
        continue;
      }
      totalCompressed += consumed;
      checkLimit(totalBytes, totalCompressed * limits.ratio, 'TOTAL_COMPRESSION_RATIO');
      if (item.path === 'SKILL.md') metadata = validateMarkdown(Buffer.concat(markdown, written), limits);
      manifest.push({ path: item.path, kind: 'file', bytes: written, sha256: hash.digest('hex') });
    }
    if (zipError) throw zipError;
    if (!metadata) reject('INVALID_SKILL', 'SKILL_REQUIRED');
    return { manifest, metadata, totalBytes };
  } finally {
    active?.destroy();
    zip.close();
  }
}
