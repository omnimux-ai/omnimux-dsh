import { isExplicitGenerationRequest } from './generation-intent.js';

const generationTools = new Set(['image_generate', 'video_generate', 'omnimux_image_submit', 'omnimux_video_submit']);

/** Only consume actual output URLs, never input references or a background receipt. */
export function generationResultMedia(content, name) {
  const media = [];
  const add = (url, type) => {
    if (typeof url === 'string' && /^(https?:\/\/|blob:|data:(image|video)\/|\/api\/)/.test(url)
      && !media.some((item) => item.url === url)) media.push({ url, type });
  };
  for (const block of content || []) {
    if (name === 'image_generate' && block.type === 'image' && typeof block.attachment?.attachmentId === 'string') {
      media.push({ type: 'image', attachment: block.attachment, url: null });
    }
    if (name === 'video_generate' && block.type === 'text') {
      const match = typeof block.text === 'string' && block.text.match(/^Saved video to ((?:\/|[A-Za-z]:[\\/])[^\r\n\0]+\.mp4)(?: \(\d+(?:\.\d+)?s\))?\nTemporary provider URL \(expires soon\): https?:\/\/\S+$/);
      if (match && !media.some((item) => item.path === match[1])) media.push({ type: 'video', path: match[1] });
    }
    if (block.type !== 'text') continue;
    try {
      const result = JSON.parse(block.text);
      if (result.mode === 'live') add(result.url, name.includes('video') ? 'video' : 'image');
    } catch { /* Non-JSON text is not a verified media result. */ }
  }
  return media;
}

/** Native session binding observer. No click interception, second router, or generated clocks. */
export function createGenerationFeedback({ sessions, store, getUiContext, eventsClient, getSubmittedCanvasText = () => '', subscribeSubmittedCanvasText = () => () => {} }) {
  const watches = new Map();
  const mapping = new Map();
  const settled = new Set();
  const runningRequests = new Set();
  const key = (sessionId, turn) => JSON.stringify([sessionId, turn]);
  function watch(sessionId) {
    if (!sessionId) return;
    const binding = sessions.binding(sessionId);
    const previous = watches.get(sessionId);
    if (previous?.binding === binding) return;
    if (previous) { previous.stops.forEach((stop) => stop()); watches.delete(sessionId); }
    if (!binding) return;
    const seen = new Set(binding.session.getSnapshot().pendingSubmissions.map((row) => row.requestId));
    const candidates = new Map();
    const calls = new Map();
    const resultEvents = new Map();
    const outputs = new Map();
    const errors = new Set();
    const completed = new Set();
    const publish = (requestId, patch) => store.updateGeneration({ sessionId, requestId, ...patch });
    const task = (requestId) => store.getSnapshot().generationTasks.find((item) => item.sessionId === sessionId && item.requestId === requestId);
    const observe = () => {
      const snap = binding.session.getSnapshot();
      for (const row of snap.pendingSubmissions) {
        if (seen.has(row.requestId)) continue;
        seen.add(row.requestId);
        const ui = getUiContext();
        if (ui.sessionId !== sessionId || !ui.surface?.panelOpen || ui.surface.tabId !== 'omnimux:media-viewer') continue;
        candidates.set(row.requestId, { text: row.text, attachments: (row.attachments || []).map((item) => ({ ...item, value: item.value ? { ...item.value } : item.value })), hasReference: Boolean(ui.view?.activeMediaId || ui.view?.activeMediaUrl) });
      }
      for (const [requestId, candidate] of candidates) {
        // The query returns comment bodies only, never image titles or snapshot metadata.
        const submittedText = getSubmittedCanvasText(sessionId, candidate.attachments);
        const prompt = [candidate.text, submittedText].filter(Boolean).join('\n');
        if (!isExplicitGenerationRequest(prompt, { hasReference: candidate.hasReference })) {
          if (submittedText || !candidate.attachments.length) candidates.delete(requestId);
          continue;
        }
        candidates.delete(requestId);
        publish(requestId, { status: 'pending', prompt });
        if (runningRequests.has(key(sessionId, requestId))) publish(requestId, { status: 'running', message: null });
      }
      const pendingIds = new Set(snap.pendingSubmissions.map((row) => row.requestId));
      const admittedIds = new Set((snap.queue || []).map((row) => row.rpcId));
      for (const row of binding.eventSource.getSnapshot().entries) {
        if (row.type === 'event' && row.event.type === 'user/message' && row.event.data.source?.kind === 'user') admittedIds.add(row.event.data.source.rpcId);
      }
      for (const requestId of seen) {
        const current = task(requestId);
        if (current?.status === 'pending' && !pendingIds.has(requestId) && !admittedIds.has(requestId)) {
          // Retirement alone proves neither rejection nor admission; leave a neutral visible state.
          publish(requestId, { status: 'pending', message: '提交状态待确认，请查看对话中的发送提示' });
        }
      }
      const incompleteTurns = new Set();
      // Index calls before results so prepended history can satisfy missing dependencies.
      for (const row of binding.eventSource.getSnapshot().entries) {
        const event = row.type === 'event' ? row.event : null;
        if (event?.type === 'tool/call') calls.set(event.data.callId, event.data);
      }
      for (const row of binding.eventSource.getSnapshot().entries) {
        const event = row.type === 'event' ? row.event : null;
        if (event && !completed.has(event.seq) && (event.type === 'tool/result' || event.type === 'turn/end')) resultEvents.set(event.seq, row);
      }
      const retained = [...resultEvents.values()].sort((a, b) => a.event.seq - b.event.seq);
      for (const row of retained) {
        const event = row.event;
        if (event.type === 'tool/result' && !calls.has(event.data.message?.source?.callId)) incompleteTurns.add(event.data.turn);
      }
      // Keep unassigned durable results across window replacement until final mapping arrives.
      for (const row of retained) {
        const event = row.type === 'event' ? row.event : null;
        if (!event || completed.has(event.seq)) continue;
        const data = event.data;
        const ids = mapping.get(key(sessionId, data?.turn));
        if (!ids?.length) continue;
        const owned = ids.filter((id) => task(id));
        if (!owned.length) continue;
        if (event.type === 'tool/result') {
          // Durable entries retain results until final ownership is known.
          if (!settled.has(key(sessionId, data.turn))) continue;
          const id = data.message?.source?.callId;
          const call = calls.get(id);
          if (!call) continue;
          if (!generationTools.has(call.name)) { completed.add(event.seq); resultEvents.delete(event.seq); continue; }
          const result = data.message.content?.find((block) => block.type === 'tool-result' && block.toolCallId === id);
          if (!result) continue;
          // Multiple human inputs in the same turn are not attributable to a single request.
          if (ids.length === 1) {
            if (result.isError) {
              errors.add(ids[0]);
              publish(ids[0], { status: task(ids[0]).status, message: '本次调用未完成，等待本轮处理结束' });
            }
            else {
              const media = generationResultMedia(result.content, call.name);
              if (media.length) {
                const all = [...(outputs.get(ids[0]) || []), ...media];
                outputs.set(ids[0], all.filter((item, index) => all.findIndex((other) => (other.attachment?.attachmentId || other.url || other.path) === (item.attachment?.attachmentId || item.url || item.path)) === index));
                publish(ids[0], { status: task(ids[0]).status, media: outputs.get(ids[0]) });
              }
            }
          }
        }
        if (event.type === 'turn/end') {
          if (!settled.has(key(sessionId, data.turn))) continue;
          if (incompleteTurns.has(data.turn)) {
            for (const requestId of owned) publish(requestId, { message: '本轮已结束，结果记录尚未完整加载，请在对话中查看' });
            continue;
          }
          for (const requestId of owned) {
            const current = task(requestId);
            if (current.status === 'success' || current.status === 'failure' || current.status === 'cancelled') continue;
            if (outputs.get(requestId)?.length && ids.length === 1) {
              publish(requestId, {
                status: data.reason?.kind === 'aborted' ? 'cancelled' : errors.has(requestId) ? 'unresolved' : 'success',
                message: data.reason?.kind === 'aborted' ? '本轮已取消，已返回部分结果，请查看对话' : errors.has(requestId) ? '本轮有结果及失败调用，请在对话中确认是否完成' : null,
                media: outputs.get(requestId),
              });
              continue;
            }
            publish(requestId, data.reason?.kind === 'aborted'
              ? { status: 'cancelled', message: null }
              : errors.has(requestId) && ids.length === 1
                ? { status: 'failure', message: '生成未完成，请查看对话中的错误说明' }
                : { status: 'unresolved', media: [], message: ids.length > 1 ? '本轮包含多个请求，请在对话中查看对应结果' : '本轮未返回可预览的生成结果，请查看对话' });
          }
        }
        if (event.type === 'turn/end' && ids.some((id) => candidates.has(id))) continue;
        completed.add(event.seq);
        resultEvents.delete(event.seq);
        if (event.type === 'turn/end') {
          for (const [callId, call] of calls) if (call.turn === data.turn) calls.delete(callId);
          for (const requestId of owned) { outputs.delete(requestId); errors.delete(requestId); runningRequests.delete(key(sessionId, requestId)); }
        }
      }
    };
    const stops = [binding.session.subscribe(observe), binding.eventSource.subscribe(observe), subscribeSubmittedCanvasText(observe)];
    watches.set(sessionId, { binding, observe, stops });
    if (typeof binding.ctx?.effect === 'function') {
      const stopScope = binding.ctx.effect(() => () => {
        if (watches.get(sessionId)?.binding !== binding) return;
        watches.delete(sessionId);
        stops.slice(0, 3).forEach((stop) => stop());
      }, 'omnimux: generation feedback session lifetime');
      stops.push(stopScope);
    }
    observe();
  }
  const stopEvents = eventsClient.subscribe('omnimux:canvas:generation', ({ payload }) => {
    if (!payload?.sessionId || !Array.isArray(payload.requestIds)) return;
    const ids = payload.requestIds.filter((id) => typeof id === 'string');
    const turnKey = key(payload.sessionId, payload.turn);
    if (settled.has(turnKey)) return;
    mapping.set(turnKey, [...new Set([...(mapping.get(turnKey) || []), ...ids])]);
    if (payload.phase === 'settled') settled.add(turnKey);
    if (payload.phase === 'running' && ids.length === 1) {
      runningRequests.add(key(payload.sessionId, ids[0]));
      const current = store.getSnapshot().generationTasks.find((item) => item.sessionId === payload.sessionId && item.requestId === ids[0]);
      if (current) store.updateGeneration({ ...current, status: 'running', message: null });
    }
    watches.get(payload.sessionId)?.observe();
  });
  const follow = () => {
    for (const sessionId of [...watches.keys()]) watch(sessionId);
    watch(sessions.list.getSnapshot().current);
  };
  const stopList = sessions.list.subscribe(follow);
  follow();
  return { dispose() { stopList(); stopEvents(); for (const item of watches.values()) item.stops.forEach((stop) => stop()); watches.clear(); } };
}
