import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import { test } from 'node:test'
import { WebSocket } from 'ws'
import { createHubEventBus } from './hub-event-bus.js'
import { EVENTS_PATH, registerHubEventStream } from './stream.js'
import { createEventsClient } from '../client/events-client.js'

async function host(t) {
  const upgrades = new Map()
  const held = new Set()
  const server = http.createServer((req, res) => {
    if (req.url === '/hmr') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(': open\n\n')
      held.add(res)
      res.once('close', () => held.delete(res))
    } else {
      res.end('ordinary request completed')
    }
  })
  server.on('upgrade', (req, socket, head) => {
    const route = upgrades.get(new URL(req.url, 'http://localhost').pathname)
    if (route) route.handler(req, socket, head)
    else socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const bus = createHubEventBus()
  const connection = { requestRejection: (req) => req.headers.cookie === 'test-session=valid' ? undefined : 401 }
  const dispose = registerHubEventStream({
    registerUpgrade(route) {
      upgrades.set(route.path, route)
      return () => upgrades.delete(route.path)
    },
  }, { hubEvents: bus, connection })
  let disposed = false
  const disposeStream = async () => {
    if (disposed) return
    disposed = true
    await dispose()
  }
  t.after(async () => {
    await disposeStream()
    for (const res of held) res.destroy()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  return { bus, base, url: base.replace('http:', 'ws:') + EVENTS_PATH, disposeStream, upgrades }
}

function subscribe(url, options = {}) {
  const socket = new WebSocket(url, {
    headers: { cookie: 'test-session=valid', origin: 'http://127.0.0.1' },
    ...options,
  })
  const frames = []
  socket.on('message', (data) => { frames.push(JSON.parse(data)) })
  return {
    socket,
    async next(type) {
      while (!frames.some((frame) => frame.type === type)) {
        await once(socket, 'message', { signal: AbortSignal.timeout(2000) })
      }
      return frames.splice(frames.findIndex((frame) => frame.type === type), 1)[0]
    },
  }
}

test('hub feed preserves authenticated upgrade and loopback-origin checks', async (t) => {
  const { url, bus } = await host(t)
  for (const [headers, status] of [
    [{ origin: 'http://127.0.0.1' }, 401],
    [{ cookie: 'test-session=valid', origin: 'https://untrusted.example' }, 403],
  ]) {
    const socket = new WebSocket(url, { headers })
    await assert.rejects(once(socket, 'open'), new RegExp(`Unexpected server response: ${status}`))
  }
  assert.equal(bus.subscriberCount(), 0)
})

test('hub feed replays, broadcasts, and releases subscribers on Host disposal', async (t) => {
  const { url, bus, disposeStream, upgrades } = await host(t)
  bus.emit({ type: 'omnimux:assets:changed', payload: { lrev: 1 } })
  const missed = bus.emit({ type: 'omnimux:assets:changed', payload: { lrev: 2 } })
  const feed = subscribe(`${url}?after=1`)
  await once(feed.socket, 'open')
  assert.deepEqual(await feed.next('omnimux:assets:changed'), missed)
  assert.equal((await feed.next('omnimux:heartbeat')).type, 'omnimux:heartbeat')
  const live = bus.emit({ type: 'omnimux:assets:changed', payload: { lrev: 3 } })
  assert.deepEqual(await feed.next('omnimux:assets:changed'), live)
  assert.equal(bus.subscriberCount(), 1)
  const closed = once(feed.socket, 'close')
  await disposeStream()
  await closed
  assert.equal(bus.subscriberCount(), 0)
  assert.equal(upgrades.has(EVENTS_PATH), false)
})

test('the event socket cannot accept commands or retain a disconnected subscriber', async (t) => {
  const { url, bus } = await host(t)
  const feed = subscribe(url)
  await once(feed.socket, 'open')
  const closed = once(feed.socket, 'close')
  feed.socket.send(JSON.stringify({ type: 'open', tabId: 'anything' }))
  const [code] = await closed
  assert.equal(code, 1008)
  assert.equal(bus.getSnapshot().seq, 0)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(bus.subscriberCount(), 0)
})

test('hub events leave the sixth HTTP/1 slot available for ordinary requests', { timeout: 4000 }, async (t) => {
  const { base, url } = await host(t)
  const agent = new http.Agent({ keepAlive: true, maxSockets: 6 })
  const holds = []
  t.after(() => { for (const request of holds) request.destroy(); agent.destroy() })
  for (let i = 0; i < 5; i++) {
    const request = http.get(`${base}/hmr`, { agent })
    holds.push(request)
    const [response] = await once(request, 'response')
    response.resume()
  }
  class BrowserSocket extends WebSocket {
    constructor(address) {
      super(address, { agent, headers: { cookie: 'test-session=valid', origin: base } })
    }
  }
  const client = createEventsClient({ WebSocket: BrowserSocket, streamUrl: url, getWorkbench: () => null })
  t.after(() => client.disconnect())
  const connected = new Promise((resolve) => client.subscribe('omnimux:connected', resolve))
  client.connect()
  await connected
  assert.equal(client.isHealthy(), true)
  const completed = new Promise((resolve, reject) => {
    http.get(`${base}/ordinary`, { agent, signal: AbortSignal.timeout(1000) }, (res) => {
      let text = ''
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => resolve(text))
    }).on('error', reject)
  })
  assert.equal(await completed, 'ordinary request completed')
})
