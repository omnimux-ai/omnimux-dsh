/**
 * 导出字节捕获缓冲：保留 `FileSystemWritableFileStream` 的写入位置语义。
 *
 * mp4 封装的标准收尾是「顺序写出 mdat（长度先留占位）→ 回到文件头定点回填真实长度 → 追加 moov」。
 * 只按顺序拼接字节会让回填落到文件尾、头部长度字段停在占位值，解析器随后读不到 moov。
 * 因此捕获层必须区分顺序写入与定点写入。
 */

export interface SequentialWriteBuffer {
  /** 已写入的最大字节边界，即产物长度。 */
  readonly length: number
  /** 顺序写入游标（受 `seek` 影响，不被定点写入回退）。 */
  readonly position: number
  write(position: number | null | undefined, data: Uint8Array): void
  seek(position: number): void
  truncate(size: number): void
  toUint8Array(): Uint8Array
}

function toOffset(position: number | null | undefined): number | null {
  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0) return null
  return Math.floor(position)
}

export function createSequentialWriteBuffer(initialCapacity = 1024): SequentialWriteBuffer {
  let buffer = new Uint8Array(Math.max(1, initialCapacity))
  let cursor = 0
  let end = 0

  const ensure = (required: number): void => {
    if (required <= buffer.length) return
    let next = buffer.length
    while (next < required) next *= 2
    const grown = new Uint8Array(next)
    grown.set(buffer.subarray(0, end))
    buffer = grown
  }

  return {
    get length() {
      return end
    },
    get position() {
      return cursor
    },
    write(position, data) {
      const at = toOffset(position)
      const size = data.byteLength
      if (size === 0) {
        if (at !== null) cursor = Math.max(cursor, at)
        return
      }
      const start = at ?? cursor
      ensure(start + size)
      buffer.set(data, start)
      const next = start + size
      if (next > end) end = next
      // 定点回填不得把顺序游标往回拉：封装器回填长度后仍会在文件尾追加 moov。
      cursor = at === null ? next : Math.max(cursor, next)
    },
    seek(position) {
      const at = toOffset(position)
      if (at === null) return
      cursor = at
      if (at > end) end = at
    },
    truncate(size) {
      const at = toOffset(size)
      if (at === null) return
      end = at
      if (cursor > at) cursor = at
    },
    toUint8Array() {
      return buffer.slice(0, end)
    },
  }
}

/** `FileSystemWritableFileStream.write()` 接受的三种形态。 */
export type WritableChunk =
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | { type: 'write'; position?: number; data: ArrayBuffer | ArrayBufferView | Blob }
  | { type: 'seek'; position: number }
  | { type: 'truncate'; size: number }

function viewToBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
}

/**
 * 把一次 `write()` 调用按位置语义落到捕获缓冲；无法识别的形态按顺序追加处理。
 */
export async function writeChunkToBuffer(
  buffer: SequentialWriteBuffer,
  chunk: unknown,
): Promise<void> {
  if (chunk == null) return
  if (typeof chunk === 'object' && 'type' in chunk) {
    const params = chunk as { type?: string; position?: number; size?: number; data?: unknown }
    if (params.type === 'seek') {
      buffer.seek(params.position ?? 0)
      return
    }
    if (params.type === 'truncate') {
      buffer.truncate(params.size ?? 0)
      return
    }
    if (params.type === 'write') {
      await writePayloadAt(buffer, params.position ?? null, params.data)
      return
    }
  }
  await writePayloadAt(buffer, null, chunk)
}

async function writePayloadAt(
  buffer: SequentialWriteBuffer,
  position: number | null,
  payload: unknown,
): Promise<void> {
  if (payload instanceof ArrayBuffer) {
    buffer.write(position, new Uint8Array(payload.slice(0)))
    return
  }
  if (ArrayBuffer.isView(payload)) {
    buffer.write(position, viewToBytes(payload))
    return
  }
  if (typeof Blob !== 'undefined' && payload instanceof Blob) {
    buffer.write(position, new Uint8Array(await payload.arrayBuffer()))
  }
}

/** 与 `FileSystemWritableFileStream` 兼容的最小写入目标。 */
export interface WritableLike {
  write(data: unknown): Promise<void>
  seek?(position: number): Promise<void>
  truncate?(size: number): Promise<void>
}

export interface WritableCapture {
  captured: SequentialWriteBuffer
  write(data: unknown): Promise<void>
  seek(position: number): Promise<void>
  truncate(size: number): Promise<void>
}

/**
 * 把写入原样转发给目标流，同时按位置语义记录到捕获缓冲。
 * 捕获结果必须与目标流最终内容一致，因此两者共用同一套位置规则。
 */
export function createWritableCapture(
  target: WritableLike,
  captured: SequentialWriteBuffer = createSequentialWriteBuffer(),
): WritableCapture {
  return {
    captured,
    async seek(position: number) {
      captured.seek(position)
      if (typeof target.seek === 'function') await target.seek(position)
    },
    async write(data: unknown) {
      await target.write(data)
      await writeChunkToBuffer(captured, data)
    },
    async truncate(size: number) {
      captured.truncate(size)
      if (typeof target.truncate === 'function') await target.truncate(size)
    },
  }
}
