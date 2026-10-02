import assert from 'node:assert/strict'
import { constants, type Stats } from 'node:fs'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createProducedRegistry, PRODUCED_MEDIA_MAX_BYTES, readProducedMedia } from '../src/produced-registry.ts'

const dirs: string[] = []

async function scratch(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'produced-'))
  dirs.push(dir)
  return dir
}

test.after(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** Register `filePath` under `sessionId` exactly as the event feed would. */
function producedFor(sessionId: string, filePath: string) {
  const registry = createProducedRegistry()
  registry.observeEvent(sessionId, {
    type: 'tool/result',
    data: {
      message: { content: [{ type: 'tool-result', toolCallId: 'c1', content: [] }] },
      meta: { path: filePath, kind: 'image', mediaType: 'image/png', bytes: 1, inContext: false },
    },
  })
  return registry
}

test('reads a registered file back as base64 with its extension media type', async () => {
  const dir = await scratch()
  const file = path.join(dir, 'shot.png')
  await writeFile(file, Buffer.from([0x89, 0x50]))
  const outcome = await readProducedMedia(producedFor('s', file), { sessionId: 's', path: file })
  assert.equal(outcome.code, 'ok')
  if (outcome.code === 'ok') {
    assert.equal(outcome.mediaType, 'image/png')
    assert.equal(outcome.bytes, 2)
    assert.deepEqual(Buffer.from(outcome.data, 'base64'), Buffer.from([0x89, 0x50]))
  }
})

/**
 * A fake FileHandle for seam tests: `stat` reports `size`, `readFile` is a
 * separate seam, and `close` records that the descriptor was released.
 */
function fakeHandle(size: number, closed: { value: boolean }) {
  return {
    stat: async () => ({ isFile: () => true, size }) as Stats,
    close: async () => { closed.value = true },
  }
}

test('not-produced covers unregistered paths, vanished files, directories and symlinks', async () => {
  const dir = await scratch()
  const file = path.join(dir, 'gone.png')
  const registry = producedFor('s', file)
  // Never registered.
  assert.equal((await readProducedMedia(createProducedRegistry(), { sessionId: 's', path: file })).code, 'not-produced')
  // Registered but the file vanished.
  assert.equal((await readProducedMedia(registry, { sessionId: 's', path: file })).code, 'not-produced')
  // Registered but resolves to a directory.
  await mkdir(file, { recursive: true })
  assert.equal((await readProducedMedia(registry, { sessionId: 's', path: file })).code, 'not-produced')

  // A registered path swapped for a symlink must never be dereferenced:
  // O_NOFOLLOW fails the open with ELOOP before a single byte of the target
  // (an arbitrary host file such as /etc/hosts) is read.
  const link = path.join(dir, 'link.png')
  await symlink('/etc/hosts', link)
  const linkOutcome = await readProducedMedia(producedFor('s', link), { sessionId: 's', path: link })
  assert.equal(linkOutcome.code, 'not-produced')
})

test('too-large and unsupported gate before reading', async () => {
  const dir = await scratch()
  const big = path.join(dir, 'big.mp4')
  await writeFile(big, Buffer.alloc(4))
  const unsupported = path.join(dir, 'blob.exe')
  await writeFile(unsupported, Buffer.alloc(1))

  const closed = { value: false }
  const bigRegistry = producedFor('s', big)
  const outcome = await readProducedMedia(bigRegistry, { sessionId: 's', path: big }, {
    open: (async () => fakeHandle(PRODUCED_MEDIA_MAX_BYTES + 1, closed)) as never,
  })
  assert.equal(outcome.code, 'too-large')
  if (outcome.code === 'too-large') assert.equal(outcome.limit, PRODUCED_MEDIA_MAX_BYTES)
  assert.equal(closed.value, true)

  const unsupportedRegistry = producedFor('s', unsupported)
  assert.equal((await readProducedMedia(unsupportedRegistry, { sessionId: 's', path: unsupported })).code, 'unsupported')
})

test('bytes larger than the fstat ceiling still settle as too-large', async () => {
  const dir = await scratch()
  const file = path.join(dir, 'growing.mp4')
  await writeFile(file, Buffer.alloc(4))
  const closed = { value: false }
  // fstat reports a small file, but the bytes read back exceed the ceiling —
  // the file grew after stat, and the post-read check must catch it.
  const outcome = await readProducedMedia(producedFor('s', file), { sessionId: 's', path: file }, {
    open: (async () => fakeHandle(4, closed)) as never,
    readFile: (async () => Buffer.alloc(PRODUCED_MEDIA_MAX_BYTES + 1)) as never,
  })
  assert.equal(outcome.code, 'too-large')
  assert.equal(closed.value, true)
})

test('read failures settle as internal', async () => {
  const dir = await scratch()
  const file = path.join(dir, 'locked.pdf')
  await writeFile(file, Buffer.from([0x25]))
  const registry = producedFor('s', file)
  const closed = { value: false }
  const outcome = await readProducedMedia(registry, { sessionId: 's', path: file }, {
    open: (async () => fakeHandle(1, closed)) as never,
    readFile: (async () => { throw new Error('EACCES') }) as never,
  })
  assert.equal(outcome.code, 'internal')
  assert.equal(closed.value, true)
})

test('the read seam receives the opened handle, not the path', async () => {
  const dir = await scratch()
  const file = path.join(dir, 'seam.png')
  await writeFile(file, Buffer.from([0x89]))
  let sawHandle: unknown
  const outcome = await readProducedMedia(producedFor('s', file), { sessionId: 's', path: file }, {
    readFile: (async (target: unknown) => {
      sawHandle = target
      assert.notEqual(target, file)
      return Buffer.from([0x01])
    }) as never,
  })
  assert.equal(outcome.code, 'ok')
  assert.equal(typeof (sawHandle as { stat?: unknown }).stat, 'function')
})

test('O_NOFOLLOW is requested when opening the produced file', async () => {
  const dir = await scratch()
  const file = path.join(dir, 'flags.png')
  await writeFile(file, Buffer.from([0x89]))
  let seenFlags: unknown
  await readProducedMedia(producedFor('s', file), { sessionId: 's', path: file }, {
    open: (async (p: string, flags: number) => {
      seenFlags = flags
      const { open } = await import('node:fs/promises')
      return open(p, flags)
    }) as never,
  })
  assert.equal(typeof seenFlags, 'number')
  assert.equal((seenFlags as number) & constants.O_NOFOLLOW, constants.O_NOFOLLOW)
})
