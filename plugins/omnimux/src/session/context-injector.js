import { randomUUID } from 'node:crypto'

/**
 * Native DSH context UserMessage carrying the session's model pin.
 * Mirrors `workbench/context-injector.js` so the Chat UI renders it as a
 * collapsible context block instead of pretending it is user input.
 *
 * @param {string} text
 */
export function createSessionModelMessage(text) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'plugin',
      plugin: 'omnimux',
      form: 'snapshot',
      sections: [{
        name: 'session-model',
        text,
      }],
    },
  }
}

/**
 * Tell the agent which model the user pinned for this session.
 *
 * The composer's model picker wrote its choice to browser-local state, so the
 * agent never learned about it and picked a model on its own. Injecting the pin
 * at the first step of every turn makes the user's choice an explicit
 * constraint, and the media tools back it up when `model` is omitted.
 *
 * @param {object} ctx Cordis context
 * @param {{ preference: { get: (sessionId?: unknown) => ({ modelId: string, label: string } | null) } }} deps
 */
export function mountSessionModelInjector(ctx, deps) {
  if (!ctx || typeof ctx.on !== 'function') return () => {}
  const preference = deps?.preference
  if (!preference || typeof preference.get !== 'function') return () => {}

  return ctx.on('agent/pre-step', async ({ agent, step, signal }, next) => {
    const decision = await next()
    if (!decision || decision.kind === 'reject' || signal?.aborted) return decision

    // Only the first step of a turn: re-stating it every step would be noise,
    // and the choice cannot change inside a turn the user cannot touch.
    if (step !== 1) return decision

    const choice = preference.get(agent?.session?.id)
    if (!choice) return decision

    const label = choice.label && choice.label !== choice.modelId
      ? `${choice.label}（${choice.modelId}）`
      : choice.modelId

    const messages = [...(decision.messages || [])]
    messages.push(createSessionModelMessage(
      `【本会话模型指定】用户已在输入框的模型面板为本会话选定模型：${label}。\n`
      + '调用生成工具（omnimux_video_submit / omnimux_image_submit / omnimux_audio_submit）时，'
      + '`model` 参数必须使用该模型，不要自行改用其它模型。\n'
      + '该指定来自用户界面选择，优先级高于你自己的判断；'
      + '若用户在本轮消息中另行指定了模型，以用户本轮消息为准。',
    ))

    return {
      ...decision,
      messages,
    }
  }, { prepend: true })
}
