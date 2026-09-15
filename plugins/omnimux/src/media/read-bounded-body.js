/** Read decoded response bytes without retaining an oversized response. */
export async function readBoundedBody(response, maxBytes, { signal, message = `media exceeds ${maxBytes} bytes` } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('invalid media byte limit')
  const body = response.body
  const declared = Number(response.headers?.get?.('content-length'))
  if (declared > maxBytes) {
    await body?.cancel().catch(() => {})
    throw new Error(message)
  }
  if (!body?.getReader) throw new Error('media response has no readable body')
  const reader = body.getReader()
  const chunks = []
  let total = 0
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    while (true) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new Error(message)
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  } catch (error) {
    await reader.cancel(error).catch(() => {})
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
}
