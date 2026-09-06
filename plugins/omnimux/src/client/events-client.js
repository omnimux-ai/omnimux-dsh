/** Hub event subscription and bounded workbench heartbeat/RPC delivery. */
export const HUB_EVENTS_GLOBAL_KEY = '__omnimuxHubEvents'
export const WATCHDOG_TIMEOUT_MS = 5000
export const HEARTBEAT_INTERVAL_MS = 2000
export const REQUEST_TIMEOUT_MS = 3000
export const RECONNECT_DELAY_MS = 3000

export function createEventsClient(options = {}) {
  const WebSocketImpl = options.WebSocket ?? globalThis.WebSocket
  const fetchImpl = options.fetch ?? globalThis.fetch
  const getWorkbench = options.getWorkbench || (() => globalThis.window?.__omnimuxWorkbench)
  const streamUrl = options.streamUrl || '/omnimux/events/stream'
  const viewportUrl = options.viewportUrl || '/omnimux/workbench/viewport'
  const rpcAckUrl = options.rpcAckUrl || '/omnimux/workbench/rpc/ack'
  const subscribers = new Map()
  const requests = new Set()
  let socket = null
  let running = false
  let generation = 0
  let watchdogTimer = null
  let heartbeatTimer = null
  let reconnectTimer = null
  let heartbeatRequest = null
  let lastEventAt = 0
  let lastEventId = null
  let healthy = false

  function notifySubscribers(event) {
    for (const list of [subscribers.get(event.type), subscribers.get('*')]) {
      if (!list) continue
      for (const cb of list) {
        try { cb(event) } catch (error) { console.error('[EventsClient] subscriber error:', error) }
      }
    }
  }

  async function postJson(url, body) {
    const controller = new AbortController()
    requests.add(controller)
    const timeout = setTimeout(() => controller.abort(new Error('request timed out')), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } finally {
      clearTimeout(timeout)
      requests.delete(controller)
    }
  }

  async function handleRpc(payload) {
    const requestGeneration = generation
    const { requestId, tabId, path } = payload
    const wb = getWorkbench()
    let applied = false
    let code = 'no-workbench'
    if (wb && typeof wb.open === 'function') {
      try {
        applied = Boolean(await wb.open({ tabId, path: path || tabId }))
        code = applied ? 'opened' : 'open-failed'
      } catch (error) {
        console.error('[EventsClient] RPC open failed:', error)
        code = 'error'
      }
    }
    if (!fetchImpl || !requestId || generation !== requestGeneration) return
    try {
      await postJson(rpcAckUrl, { requestId, ok: true, applied, code, tabId })
    } catch (error) {
      if (generation === requestGeneration) console.error('[EventsClient] RPC ack failed:', error)
    }
  }

  function handleMessage(event) {
    lastEventAt = Date.now()
    healthy = true
    if (typeof event.id === 'string') lastEventId = event.id
    notifySubscribers(event)
    if (event.type === 'omnimux:workbench:rpc' && event.payload) return handleRpc(event.payload)
  }

  async function sendViewportHeartbeat() {
    if (heartbeatRequest || !fetchImpl) return
    const request = { generation }
    heartbeatRequest = request
    try {
      const envelope = getWorkbench()?.getUiContext?.()
      if (!envelope?.sessionId || envelope.sessionId === 'default') return
      await postJson(viewportUrl, envelope)
    } catch (error) {
      if (generation === request.generation) console.warn('[EventsClient] viewport heartbeat failed:', error)
    } finally {
      if (heartbeatRequest === request) heartbeatRequest = null
    }
  }

  function scheduleReconnect() {
    if (!running || reconnectTimer !== null) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      openSocket()
    }, RECONNECT_DELAY_MS)
  }

  function releaseSocket(current) {
    if (socket !== current) return
    socket = null
    healthy = false
    current.onopen = current.onmessage = current.onerror = current.onclose = null
    if (current.readyState < 2) current.close()
    notifySubscribers({ type: 'omnimux:disconnected', at: Date.now() })
    scheduleReconnect()
  }

  function openSocket() {
    if (!running || socket) return
    const url = new URL(streamUrl, options.baseUrl ?? globalThis.location?.href)
    url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:'
    if (lastEventId !== null) url.searchParams.set('after', lastEventId)
    let current
    try {
      current = new WebSocketImpl(url.href)
    } catch (error) {
      console.error('[EventsClient] connection failed:', error)
      scheduleReconnect()
      return
    }
    socket = current
    lastEventAt = Date.now()
    current.onopen = () => {
      if (socket !== current) return
      lastEventAt = Date.now()
      healthy = true
      notifySubscribers({ type: 'omnimux:connected', at: lastEventAt })
      void sendViewportHeartbeat()
    }
    current.onmessage = ({ data }) => {
      if (socket !== current) return
      let event
      try {
        event = JSON.parse(data)
        if (!event || typeof event.type !== 'string' || !event.payload || typeof event.payload !== 'object') {
          throw new Error('invalid hub event')
        }
      } catch (error) {
        console.error('[EventsClient] invalid event:', error)
        releaseSocket(current)
        return
      }
      void handleMessage(event)
    }
    current.onerror = () => { releaseSocket(current) }
    current.onclose = () => { releaseSocket(current) }
  }

  function connect() {
    if (running) return
    if (!WebSocketImpl) throw new Error('WebSocket is required for hub events')
    running = true
    openSocket()
    watchdogTimer = setInterval(() => {
      if (socket && lastEventAt > 0 && Date.now() - lastEventAt > WATCHDOG_TIMEOUT_MS) releaseSocket(socket)
    }, 1000)
    heartbeatTimer = setInterval(() => { void sendViewportHeartbeat() }, HEARTBEAT_INTERVAL_MS)
  }

  function disconnect() {
    running = false
    generation += 1
    clearInterval(watchdogTimer)
    clearInterval(heartbeatTimer)
    clearTimeout(reconnectTimer)
    watchdogTimer = heartbeatTimer = reconnectTimer = null
    if (socket) releaseSocket(socket)
    for (const controller of requests) controller.abort()
    requests.clear()
    heartbeatRequest = null
    healthy = false
  }

  function subscribe(type, callback) {
    if (typeof callback !== 'function') throw new TypeError('event subscriber must be a function')
    if (!subscribers.has(type)) subscribers.set(type, new Set())
    subscribers.get(type).add(callback)
    return () => { subscribers.get(type)?.delete(callback) }
  }

  return {
    connect,
    disconnect,
    subscribe,
    isHealthy: () => healthy,
    getLastEventAt: () => lastEventAt,
    notifyMessageForTests: handleMessage,
  }
}

export function installHubEventsGlobal(client, target = globalThis.window) {
  if (!target) return () => {}
  const facade = {
    subscribe: (type, cb) => client.subscribe(type, cb),
    isHealthy: () => client.isHealthy(),
    getLastEventAt: () => client.getLastEventAt(),
  }
  target[HUB_EVENTS_GLOBAL_KEY] = facade
  return () => {
    if (target[HUB_EVENTS_GLOBAL_KEY] === facade) delete target[HUB_EVENTS_GLOBAL_KEY]
  }
}
