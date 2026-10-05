/**
 * 导出捕获层端到端契约：按真实 mp4 封装的收尾序列驱动生产捕获代码。
 *
 * 真实 muxer 的收尾顺序是「顺序写出 mdat（长度留占位）→ 回到文件头定点回填真实长度 → 追加 moov」。
 * 捕获层若不保留写入位置，回填会落到文件尾、头部长度字段停在占位值，解析器读不到 moov
 * （真机表现为 ffprobe `moov atom not found`、画布 `<video>` 报 DEMUXER_ERROR_COULD_NOT_OPEN）。
 *
 * 实机预演证据见 docs/evidence/clip-export-mp4-finalize/broken-export.md。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSequentialWriteBuffer,
  createWritableCapture,
} from '../../src/client/openreel/web/services/export-write-buffer.ts'

const FOURCC = (text) => [...text].map((ch) => ch.charCodeAt(0))
const be32 = (value) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]

function toBytes(payload) {
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload.slice(0))
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength))
  }
  return new Uint8Array(0)
}

/** 只记录字节的「文件流」：等价于最终落盘内容。 */
function createRecordingTarget() {
  const buffer = createSequentialWriteBuffer()
  return {
    buffer,
    async write(data) {
      if (typeof data === 'object' && data !== null && 'type' in data) {
        if (data.type === 'seek') buffer.seek(data.position)
        else if (data.type === 'truncate') buffer.truncate(data.size)
        else if (data.type === 'write') buffer.write(data.position ?? null, toBytes(data.data))
        return
      }
      buffer.write(null, toBytes(data))
    },
    async seek(position) {
      buffer.seek(position)
    },
    async truncate(size) {
      buffer.truncate(size)
    },
    async close() {},
  }
}

/** 生成一段最小 mp4：ftyp + mdat(占位) + moov，并按真实收尾方式回填 mdat 长度。 */
async function writeMinimalMp4(stream, mediaBytes) {
  await stream.write(
    new Uint8Array([
      ...be32(28),
      ...FOURCC('ftyp'),
      ...FOURCC('isom'),
      ...be32(0x200),
      ...FOURCC('isom'),
      ...FOURCC('avc1'),
      ...FOURCC('mp41'),
    ]),
  )

  const mdatHeaderOffset = 28
  await stream.write(new Uint8Array([...be32(0), ...FOURCC('mdat')])) // 长度先留占位
  await stream.write(mediaBytes)
  // 回到文件头定点回填 mdat 真实长度
  await stream.write({
    type: 'write',
    position: mdatHeaderOffset,
    data: new Uint8Array(be32(8 + mediaBytes.length)),
  })

  const moovPayload = new Uint8Array(64).fill(0x5a)
  await stream.write(new Uint8Array([...be32(8 + moovPayload.length), ...FOURCC('moov')]))
  await stream.write(moovPayload)
}

test('e2e：按真实收尾序列捕获，产物与目标文件逐字节一致', async () => {
  const target = createRecordingTarget()
  const capture = createWritableCapture(target)
  const media = new Uint8Array(256).fill(0x11)

  await writeMinimalMp4(capture, media)

  const produced = capture.captured.toUint8Array()
  const onDisk = target.buffer.toUint8Array()
  assert.equal(produced.length, onDisk.length, '捕获产物长度必须与落盘文件一致')
  assert.deepEqual([...produced], [...onDisk])
})

test('e2e：mdat 长度字段被回填为真实值，产物不含多余回填字节', async () => {
  const target = createRecordingTarget()
  const capture = createWritableCapture(target)
  const media = new Uint8Array(256).fill(0x11)

  await writeMinimalMp4(capture, media)

  const produced = capture.captured.toUint8Array()
  const view = new DataView(produced.buffer, produced.byteOffset, produced.byteLength)

  // 结构：ftyp(28) + mdat(8 + 256) + moov(8 + 64)
  assert.equal(produced.length, 28 + 8 + 256 + 8 + 64)
  assert.equal(view.getUint32(28), 8 + 256, 'mdat 长度必须回填为真实长度')
  assert.equal(String.fromCharCode(...produced.subarray(32, 36)), 'mdat')
  const moovOffset = 28 + 8 + 256
  assert.equal(view.getUint32(moovOffset), 8 + 64)
  assert.equal(String.fromCharCode(...produced.subarray(moovOffset + 4, moovOffset + 8)), 'moov')
})

test('e2e：seek 形态的定点回填同样不产生多余字节', async () => {
  const target = createRecordingTarget()
  const capture = createWritableCapture(target)
  const media = new Uint8Array(128).fill(0x22)

  await capture.write(new Uint8Array([...be32(28), ...FOURCC('ftyp'), ...FOURCC('isom'), ...be32(0x200), ...FOURCC('isom'), ...FOURCC('avc1'), ...FOURCC('mp41')]))
  await capture.write(new Uint8Array([...be32(0), ...FOURCC('mdat')]))
  await capture.write(media)
  const endBeforePatch = capture.captured.length
  await capture.seek(28)
  await capture.write(new Uint8Array(be32(8 + media.length)))
  assert.equal(capture.captured.length, endBeforePatch, 'seek 回填不得改变长度')

  const produced = capture.captured.toUint8Array()
  assert.equal(new DataView(produced.buffer).getUint32(28), 8 + media.length)
})

test('e2e：不保留位置的追加式捕获会让该契约失败（锁定回归）', () => {
  const naive = []
  const push = (data) => naive.push(toBytes(data))
  push(new Uint8Array([...be32(28), ...FOURCC('ftyp'), ...FOURCC('isom'), ...be32(0x200), ...FOURCC('isom'), ...FOURCC('avc1'), ...FOURCC('mp41')]))
  push(new Uint8Array([...be32(0), ...FOURCC('mdat')]))
  push(new Uint8Array(256).fill(0x11))
  push(new Uint8Array(be32(264))) // 回填字节被追加到尾部
  push(new Uint8Array([...be32(72), ...FOURCC('moov')]))
  push(new Uint8Array(64).fill(0x5a))

  const total = naive.reduce((sum, chunk) => sum + chunk.length, 0)
  const flat = new Uint8Array(total)
  let at = 0
  for (const chunk of naive) {
    flat.set(chunk, at)
    at += chunk.length
  }
  assert.equal(new DataView(flat.buffer).getUint32(28), 0, '修复前 mdat 长度停在占位值 0')
  assert.equal(flat.length, 28 + 8 + 256 + 4 + 8 + 64, '修复前多出 4 字节回填残留')
})
