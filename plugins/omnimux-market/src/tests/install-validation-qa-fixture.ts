import { deflateRawSync } from 'node:zlib';

export const QA_SKILL = Buffer.from('---\nname: qa-skill\ndescription: Offline QA fixture\n---\nRead the bundled resource.\n');

/** Independent bitwise CRC oracle: no production CRC/parser or engineer writer. */
export function qaCrc(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export interface QaEntry {
  name: string | Buffer;
  data?: Buffer;
  method?: 0 | 8;
  flags?: number;
  payload?: Buffer;
  extra?: Buffer;
  localExtra?: Buffer;
  attrs?: number;
  descriptor?: 'signed' | 'unsigned';
}
export function qaExtra(id: number, data: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt16LE(id); header.writeUInt16LE(data.length, 2);
  return Buffer.concat([header, data]);
}
export function qaUnicode(raw: Buffer, name: string): Buffer {
  const prefix = Buffer.alloc(5); prefix[0] = 1; prefix.writeUInt32LE(qaCrc(raw), 1);
  return qaExtra(0x7075, Buffer.concat([prefix, Buffer.from(name)]));
}
export function qaZip(entries: QaEntry[], comment = Buffer.alloc(0)): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.isBuffer(e.name) ? e.name : Buffer.from(e.name);
    const data = e.data ?? Buffer.alloc(0); const method = e.method ?? 0;
    const flags = (e.flags ?? 0x800) | (e.descriptor ? 8 : 0);
    const extra = e.extra ?? Buffer.alloc(0); const localExtra = e.localExtra ?? extra;
    const payload = e.payload ?? (method === 8 ? deflateRawSync(data) : data);
    const crc = qaCrc(data); const local = Buffer.alloc(30); const central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    if (!e.descriptor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(data.length, 22); }
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(localExtra.length, 28);
    const descriptor = Buffer.alloc(e.descriptor === 'signed' ? 16 : e.descriptor ? 12 : 0);
    if (e.descriptor) {
      const p = e.descriptor === 'signed' ? 4 : 0;
      if (p) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(crc, p); descriptor.writeUInt32LE(payload.length, p + 4); descriptor.writeUInt32LE(data.length, p + 8);
    }
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(payload.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(e.attrs ?? (name.at(-1) === 47 ? 0x41ed0010 : 0x81a40000), 38);
    central.writeUInt32LE(offset, 42);
    const record = Buffer.concat([local, name, localExtra, payload, descriptor]);
    locals.push(record); centrals.push(Buffer.concat([central, name, extra])); offset += record.length;
  }
  const directory = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...locals, directory, end, comment]);
}
export function qaPackage(...entries: QaEntry[]): Buffer {
  return qaZip([{ name: 'SKILL.md', data: QA_SKILL }, ...entries]);
}
export function qaCentralOffsets(bytes: Buffer): number[] {
  const end = bytes.length - 22; let offset = bytes.readUInt32LE(end + 16);
  return Array.from({ length: bytes.readUInt16LE(end + 10) }, () => {
    const current = offset;
    offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    return current;
  });
}
