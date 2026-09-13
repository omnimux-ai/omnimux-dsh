/**
 * jsdom test setup: jsdom has no layout engine, so getBoundingClientRect
 * returns all zeros (which the visibility filter reads as hidden), and it
 * does not implement CSS.escape. Stub both with browser-equivalent behavior.
 */

const FAKE_RECT: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 200,
  bottom: 40,
  width: 200,
  height: 40,
  toJSON: () => ({}),
}

Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: function getBoundingClientRect(this: Element): DOMRect {
    return FAKE_RECT
  },
})

Object.defineProperty(globalThis, 'CSS', {
  configurable: true,
  value: {
    escape(value: string): string {
      return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)
    },
  },
})

/**
 * Dimensions read from the image header, or `null` for anything else.
 *
 * Only the two container formats the panel accepts are parsed, and only from
 * real bytes: a stub that answered with fixed numbers would let the draft
 * intake "mount" files a browser would reject when decoding them.
 */
function imageHeaderSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // PNG: the IHDR chunk width/height sit at a fixed offset after the 8-byte signature.
  if (bytes.length >= 24
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) }
  }
  // JPEG: walk the marker segments until one of the start-of-frame markers.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2
    while (at + 8 <= bytes.length) {
      if (bytes[at] !== 0xff) { at += 1; continue }
      const marker = bytes[at + 1]!
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue }
      const length = view.getUint16(at + 2, false)
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isStartOfFrame) {
        return { width: view.getUint16(at + 7, false), height: view.getUint16(at + 5, false) }
      }
      at += 2 + length
    }
  }
  return null
}

/**
 * jsdom decodes no image data at all: neither `createImageBitmap` nor
 * `HTMLImageElement` can measure a blob, so every attachment would be reported
 * as an undecodable file. Browsers implement `createImageBitmap` — the API the
 * panel's measurement prefers — so the environment provides it from the real
 * header bytes of the file it is handed.
 */
Object.defineProperty(globalThis, 'createImageBitmap', {
  configurable: true,
  value: async (source: Blob): Promise<{ width: number; height: number; close: () => void }> => {
    const size = imageHeaderSize(await blobBytes(source))
    if (size === null) throw new Error('unsupported image data')
    return { ...size, close: () => {} }
  },
})

/**
 * Reads a blob without `Blob.prototype.arrayBuffer`, which jsdom does not
 * implement. Mirrors the FileReader fallback the panel's own intake uses.
 */
async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result))
      else reject(new Error('blob read failed'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('blob read failed'))
    reader.readAsArrayBuffer(blob)
  })
}
