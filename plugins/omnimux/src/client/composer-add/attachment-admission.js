/** Clear only the submitted attachment IDs after a matching Host admission. */
export function createAttachmentAdmission({ getSessions, store, drafts }) {
  const watching = new Map()
  function arm(sessionId, text, attachments, block) {
    if (!attachments.length) return
    const binding = getSessions()?.binding(sessionId)
    if (!binding) return
    let watch = watching.get(sessionId)
    if (!watch) {
      watch = { attempts: [], stops: [] }
      watching.set(sessionId, watch)
      const observe = () => {
        const snapshot = binding.session.getSnapshot()
        if (snapshot.removed) { disposeSession(sessionId); return }
        const admitted = new Set(snapshot.queue.map(row => row.rpcId).filter(Boolean))
        for (const row of binding.eventSource.getSnapshot().entries) {
          const event = row.type === 'event' ? row.event : null
          if (event?.type === 'user/message' && event.data.source?.kind === 'user') admitted.add(event.data.source.rpcId)
        }
        for (const attempt of watch.attempts) {
          if (!attempt.requestId) {
            const matches = snapshot.pendingSubmissions.filter(row => !attempt.baseline.has(row.requestId) && row.text === attempt.text)
            if (matches.length === 1) attempt.requestId = matches[0].requestId
          }
          if (!attempt.requestId || !admitted.has(attempt.requestId)) continue
          attempt.done = true
          for (const id of attempt.ids) store.removeAttachment(sessionId, id)
          if (drafts.get(sessionId) === attempt.block) drafts.delete(sessionId)
        }
        watch.attempts = watch.attempts.filter(attempt => !attempt.done)
      }
      watch.stops.push(binding.session.subscribe(observe), binding.eventSource.subscribe(observe))
    }
    // A new gesture supersedes an unbound gesture; in-flight requests retain identity.
    watch.attempts = watch.attempts.filter(attempt => attempt.requestId)
    watch.attempts.push({ text: text.trim(), block, ids: attachments.map(item => item.id),
      baseline: new Set(binding.session.getSnapshot().pendingSubmissions.map(row => row.requestId)) })
  }
  function disposeSession(id) {
    const watch = watching.get(id)
    watching.delete(id)
    watch?.stops.forEach(stop => stop())
  }
  return { arm, dispose() { for (const id of watching.keys()) disposeSession(id) } }
}
