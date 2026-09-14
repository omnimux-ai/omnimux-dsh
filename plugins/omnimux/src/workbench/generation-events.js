const GENERATION_TOOLS = new Set(['omnimux_image_submit', 'omnimux_video_submit', 'image_generate', 'video_generate'])

/**
 * Project claimed RPC identities and execution dispatch onto the existing hub stream.
 * A turn's requestIds are candidates, not per-tool intent attribution.
 *
 * @param {object} ctx Cordis context
 * @param {{ hubEvents: { emit: (event: object) => unknown } }} deps
 * @returns {() => void} listener disposer
 */
export function mountCanvasGenerationEvents(ctx, { hubEvents }) {
  if (typeof ctx?.on !== 'function' || typeof hubEvents?.emit !== 'function') return () => {}

  /** @typedef {{sessionId: string, turn: number, signal?: AbortSignal, requestIds: Set<string>}} TurnState */
  /** @type {WeakMap<object, TurnState>} */
  const turns = new WeakMap()
  /** @type {WeakMap<object, TurnState>} */
  const sessions = new WeakMap()
  const claimTurn = (agent, turn) => {
    const session = agent?.session
    if (!session || typeof session.id !== 'string' || !Number.isSafeInteger(turn) || turn < 1) return
    let state = turns.get(agent)
    if (!state || state.turn !== turn) {
      state = { sessionId: session.id, turn, requestIds: new Set() }
      turns.set(agent, state)
    }
    sessions.set(session, state)
    return state
  }
  const addRequest = (state, message) => {
    const source = message?.source
    if (source?.kind === 'user' && typeof source.rpcId === 'string' && source.rpcId.length) {
      state.requestIds.add(source.rpcId)
    }
  }
  const emit = (state, phase) => {
    if (!state.requestIds.size) return
    hubEvents.emit({
      type: 'omnimux:canvas:generation',
      payload: {
        sessionId: state.sessionId,
        requestIds: [...state.requestIds],
        turn: state.turn,
        phase,
      },
    })
  }

  const offInbox = ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    const state = claimTurn(agent, turn)
    if (state) addRequest(state, message)
  })

  const offClaimed = ctx.on('agent/pre-step', ({ agent, messages, turn, signal }, next) => {
    const state = claimTurn(agent, turn)
    if (!state || !signal) return next()
    state.signal = signal
    // Publish the complete batch, not transient single-message candidates.
    for (const message of messages ?? []) addRequest(state, message)
    emit(state, 'claimed')
    return next()
  })

  const offSettled = ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    const state = sessions.get(session)
    if (!state || state.turn !== event.data.turn) return
    emit(state, 'settled')
    sessions.delete(session)
    state.signal = undefined
  })

  const offExecute = ctx.on('tools/execute', (exec, next) => {
    if (!GENERATION_TOOLS.has(exec.name) || exec.parent || exec.signal?.aborted) return next()
    let initiator
    try {
      const agents = ctx.get?.('agents') ?? ctx.agents
      initiator = agents?.requireInitiator()
    } catch {
      // Direct/agentless execution has no proven owning turn.
    }
    const state = exec.agent && turns.get(exec.agent)
    if (state?.signal && initiator === exec.agent && state.signal === exec.signal) emit(state, 'running')
    return next()
  })

  return () => {
    offInbox?.()
    offClaimed?.()
    offExecute?.()
    offSettled?.()
  }
}
