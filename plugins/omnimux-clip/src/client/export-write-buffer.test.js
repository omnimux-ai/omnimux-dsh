/**
 * 导出字节捕获缓冲：位置语义回归用例。
 *
 * 回归背景：捕获层曾把每次写入无条件追加，mp4 封装收尾「回到文件头回填 mdat 长度」的
 * 定点写入被追加到文件尾，头部长度字段停在占位值 → ffprobe 报 moov atom not found。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSequentialWriteBuffer,
  writeChunkToBuffer,
} from './openreel/web/services/export-write-buffer.ts'

const bytes = (...values) => new Uint8Array(values)

test('顺序写入：字节按序拼接，长度等于累计写入量', () => {
  const buffer = createSequentialWriteBuffer(4)
  buffer.write(null, bytes(1, 2, 3))
  buffer.write(undefined, bytes(4, 5))
  assert.equal(buffer.length, 5)
  assert.deepEqual([...buffer.toUint8Array()], [1, 2, 3, 4, 5])
  assert.equal(buffer.position, 5)
})

test('定点回填：覆盖原位置且总长度不增长（mp4 mdat 长度回填）', () => {
  const buffer = createSequentialWriteBuffer(4)
  // ftyp 占位 0..3，mdat 长度字段占位 4..7，媒体数据 8..11
  buffer.write(null, bytes(0x66, 0x74, 0x79, 0x70))
  buffer.write(null, bytes(0, 0, 0, 0))
  buffer.write(null, bytes(0xaa, 0xbb, 0xcc, 0xdd))
  assert.equal(buffer.length, 12)

  // 回到 offset 4 回填真实长度 0x0000000c
  buffer.write(4, bytes(0, 0, 0, 12))

  assert.equal(buffer.length, 12, '定点回填不得让产物变长')
  assert.deepEqual(
    [...buffer.toUint8Array()],
    [0x66, 0x74, 0x79, 0x70, 0, 0, 0, 12, 0xaa, 0xbb, 0xcc, 0xdd],
  )
})

test('定点回填后继续顺序写入：追加到文件尾而不是回填位置之后', () => {
  const buffer = createSequentialWriteBuffer(4)
  buffer.write(null, bytes(1, 2, 3, 4, 5, 6, 7, 8))
  buffer.write(0, bytes(9))
  assert.equal(buffer.position, 8, '定点写入不得把顺序游标往回拉')
  buffer.write(null, bytes(10, 11))
  assert.equal(buffer.length, 10)
  assert.deepEqual([...buffer.toUint8Array()], [9, 2, 3, 4, 5, 6, 7, 8, 10, 11])
})

test('seek 之后顺序写入从该位置开始，并可覆盖已有内容', () => {
  const buffer = createSequentialWriteBuffer(4)
  buffer.write(null, bytes(1, 2, 3, 4))
  buffer.seek(2)
  buffer.write(null, bytes(7, 7))
  assert.equal(buffer.length, 4)
  assert.deepEqual([...buffer.toUint8Array()], [1, 2, 7, 7])
})

test('seek 超过末尾时补齐长度，truncate 截断', () => {
  const buffer = createSequentialWriteBuffer(4)
  buffer.write(null, bytes(1, 2, 3, 4))
  buffer.seek(8)
  buffer.write(null, bytes(5))
  assert.equal(buffer.length, 9)
  assert.deepEqual([...buffer.toUint8Array()], [1, 2, 3, 4, 0, 0, 0, 0, 5])

  buffer.truncate(3)
  assert.equal(buffer.length, 3)
  assert.deepEqual([...buffer.toUint8Array()], [1, 2, 3])
  assert.equal(buffer.position, 3)
})

test('writeChunkToBuffer：WriteParams 三形态都被正确解释', async () => {
  const buffer = createSequentialWriteBuffer(4)
  await writeChunkToBuffer(buffer, { type: 'write', data: bytes(1, 2, 3, 4) })
  await writeChunkToBuffer(buffer, { type: 'seek', position: 1 })
  await writeChunkToBuffer(buffer, { type: 'write', data: bytes(9, 9) })
  await writeChunkToBuffer(buffer, { type: 'write', position: 0, data: bytes(5) })
  await writeChunkToBuffer(buffer, { type: 'truncate', size: 3 })

  assert.equal(buffer.length, 3)
  assert.deepEqual([...buffer.toUint8Array()], [5, 9, 9])
})

test('writeChunkToBuffer：接受 ArrayBuffer / 视图 / Blob 三种负载', async () => {
  const buffer = createSequentialWriteBuffer(4)
  await writeChunkToBuffer(buffer, new Uint8Array([1, 2]).buffer)
  await writeChunkToBuffer(buffer, new Uint8Array([3, 4]))
  await writeChunkToBuffer(buffer, new Blob([new Uint8Array([5])]))

  assert.equal(buffer.length, 5)
  assert.deepEqual([...buffer.toUint8Array()], [1, 2, 3, 4, 5])
})

test('writeChunkToBuffer：视图带 byteOffset 时只取视图窗口内的字节', async () => {
  const buffer = createSequentialWriteBuffer(4)
  const backing = new Uint8Array([1, 2, 3, 4, 5, 6])
  await writeChunkToBuffer(buffer, new Uint8Array(backing.buffer, 2, 3))
  assert.deepEqual([...buffer.toUint8Array()], [3, 4, 5])
})

test('未知/空负载不改变缓冲，也不抛错', async () => {
  const buffer = createSequentialWriteBuffer(4)
  await writeChunkToBuffer(buffer, null)
  await writeChunkToBuffer(buffer, undefined)
  await writeChunkToBuffer(buffer, { type: 'unknown' })
  assert.equal(buffer.length, 0)
})
