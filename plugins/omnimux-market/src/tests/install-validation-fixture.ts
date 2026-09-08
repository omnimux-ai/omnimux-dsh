import { deflateRawSync } from 'node:zlib';
import crc32 = require('buffer-crc32');

export const SKILL = Buffer.from('---\nname: sample-skill\ndescription: A safe test skill\nversion: "1.0"\n---\n# Instructions\nDo nothing.\n');
export interface ZipFixtureEntry {
  name: string | Buffer;
  bytes?: Buffer;
  method?: number;
  flags?: number;
  extra?: Buffer;
  localExtra?: Buffer;
  attrs?: number;
  descriptor?: 'signed' | 'unsigned';
  payload?: Buffer;
  declaredSize?: number;
  crc?: number;
}
/** Test-only tiny ZIP writer; production parsing uses yauzl, not this fixture. */
export function zipFixture(entries: ZipFixtureEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = typeof entry.name === 'string' ? Buffer.from(entry.name) : entry.name;
    const bytes = entry.bytes ?? Buffer.alloc(0);
    const method = entry.method ?? 0;
    const flags = (entry.flags ?? 0x800) | (entry.descriptor ? 8 : 0);
    const extra = entry.extra ?? Buffer.alloc(0);
    const localExtra = entry.localExtra ?? extra;
    const payload = entry.payload ?? (method === 8 ? deflateRawSync(bytes) : bytes);
    const checksum = entry.crc ?? crc32.unsigned(bytes);
    const size = entry.declaredSize ?? bytes.length;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4); header.writeUInt16LE(flags, 6); header.writeUInt16LE(method, 8);
    if (!entry.descriptor) { header.writeUInt32LE(checksum, 14); header.writeUInt32LE(payload.length, 18); header.writeUInt32LE(size, 22); }
    header.writeUInt16LE(name.length, 26); header.writeUInt16LE(localExtra.length, 28);
    const descriptor = Buffer.alloc(entry.descriptor === 'signed' ? 16 : entry.descriptor ? 12 : 0);
    if (entry.descriptor) {
      const d = entry.descriptor === 'signed' ? 4 : 0;
      if (d) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(checksum, d); descriptor.writeUInt32LE(payload.length, d + 4); descriptor.writeUInt32LE(size, d + 8);
    }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(payload.length, 20); central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(entry.attrs ?? (typeof entry.name === 'string' && entry.name.endsWith('/') ? 0x41ed0010 : 0x81a40000), 38);
    central.writeUInt32LE(offset, 42);
    const local = Buffer.concat([header, name, localExtra, payload, descriptor]);
    locals.push(local); centrals.push(Buffer.concat([central, name, extra])); offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
export function extraField(id: number, data: Buffer): Buffer {
  const header = Buffer.alloc(4); header.writeUInt16LE(id); header.writeUInt16LE(data.length, 2);
  return Buffer.concat([header, data]);
}
export function unicodeExtra(raw: Buffer, name: string): Buffer {
  const header = Buffer.alloc(5); header[0] = 1; header.writeUInt32LE(crc32.unsigned(raw), 1);
  return extraField(0x7075, Buffer.concat([header, Buffer.from(name)]));
}
