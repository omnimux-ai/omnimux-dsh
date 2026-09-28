import assert from 'node:assert/strict';

// Serialized into the real browser. Observes production DOM; never inserts UI or dispatches media events.
export function installSlotProbe({ selector, durationMs = 1600 }) {
  window.qaSlotProbe?.stop();
  const frames = [], events = [];
  const nodes = new WeakMap();
  let nextId = 0, raf, stopped = false;
  const start = performance.now();
  const identity = (node) => { if (!nodes.has(node)) nodes.set(node, ++nextId); return nodes.get(node); };
  const mediaEvent = (event) => {
    if (event.target.matches?.(`${selector} img, ${selector} video`))
      events.push({ t: performance.now() - start, type: event.type, trusted: event.isTrusted });
  };
  for (const name of ['load', 'loadeddata', 'error', 'transitionrun', 'transitionend']) document.addEventListener(name, mediaEvent, true);
  const sample = () => {
    const slots = [...document.querySelectorAll(selector)].map((node) => {
      const rect = node.getBoundingClientRect();
      const shimmer = node.querySelector('.omx-media-slot__shimmer-wrap');
      const result = node.querySelector('.omx-media-result');
      const media = node.querySelector('img,video');
      const ready = media?.tagName === 'VIDEO' ? media.readyState >= 2 && media.videoWidth > 0
        : Boolean(media?.complete && media.naturalWidth > 0);
      const opacity = (el) => el ? Number(getComputedStyle(el).opacity) : null;
      const copy = node.cloneNode(true); copy.querySelectorAll('.result-badge').forEach((el) => el.remove());
      return { nodeId: identity(node), state: node.dataset.state, ratio: node.dataset.ratio,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        text: copy.textContent.trim(), titles: [node, ...node.querySelectorAll('[title]')].map((el) => el.title).filter(Boolean),
        controls: node.querySelectorAll('button,a,[role="button"],input,select,textarea,[tabindex]:not([tabindex="-1"])').length + Number(node.matches('[role="button"],[tabindex]:not([tabindex="-1"])')),
        ready, mediaType: media?.tagName, shimmer: Boolean(shimmer), shimmerOpacity: opacity(shimmer), resultOpacity: opacity(result),
        badge: node.querySelector('.result-badge')?.textContent.trim() || '',
        transitions: result ? getComputedStyle(result).transitionDuration : null };
    });
    frames.push({ t: performance.now() - start, slots });
    if (!stopped && performance.now() - start < durationMs) raf = requestAnimationFrame(sample);
    else stop();
  };
  function stop() {
    stopped = true; cancelAnimationFrame(raf);
    for (const name of ['load', 'loadeddata', 'error', 'transitionrun', 'transitionend']) document.removeEventListener(name, mediaEvent, true);
  }
  window.qaSlotProbe = { frames, events, stop, get done() { return stopped; } };
  sample();
}

export function assertSilentSlot(slot) {
  assert.equal(slot.text, '', 'slot must have no task copy');
  assert.deepEqual(slot.titles, [], 'slot must have no tooltip');
  if (['pending', 'running'].includes(slot.state)) {
    assert.equal(slot.controls, 0, 'executing slot must have no focusable controls');
    assert.equal(slot.badge, '', 'executing slot must have no badge');
    assert.equal(slot.shimmer, true);
  }
  if (slot.badge) {
    assert.equal(slot.mediaType, 'VIDEO'); assert.equal(slot.ready, true);
    assert.match(slot.badge, /^(?:\d+(?:\.\d+)?(?:P|K)(?: · \d+(?:\.\d+)?s)?|\d+(?:\.\d+)?s)$/);
  }
}

export function assertTransition(trace, ratio = '1:1') {
  const frames = trace.frames;
  assert.ok(frames.length > 10, 'insufficient animation samples');
  assert.ok(frames.every((frame) => frame.slots.length === 1), 'slot missing or duplicated');
  const baseline = frames[0].slots[0];
  const [w, h] = ratio.split(':').map(Number);
  for (const frame of frames) {
    const slot = frame.slots[0]; assertSilentSlot(slot);
    assert.equal(slot.nodeId, baseline.nodeId, 'task container remounted');
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(slot.rect[key] - baseline.rect[key]) < 1, `unstable ${key}`);
    assert.ok(Math.abs(slot.rect.width - slot.rect.height * w / h) < 1, 'ratio differs by >=1 CSS px');
  }
  const ready = frames.find((frame) => frame.slots[0].ready);
  assert.ok(ready, 'natural media readiness missing');
  assert.ok(trace.events.some((event) => event.trusted && ['load', 'loadeddata'].includes(event.type)), 'trusted natural readiness event missing');
  const overlap = frames.filter(({ slots: [s] }) => s.ready && s.shimmerOpacity > 0 && s.shimmerOpacity < 1 && s.resultOpacity > 0 && s.resultOpacity < 1);
  assert.ok(overlap.length >= 2, 'no sampled two-layer crossfade');
  const gone = frames.find((frame) => frame.t >= ready.t && !frame.slots[0].shimmer);
  assert.ok(gone, 'shimmer never unmounted');
  assert.ok(gone.t - ready.t >= 260 && gone.t - ready.t <= 380, 'crossfade must last 300ms (frame tolerance)');
  const transitionFrames = frames.filter((frame) => frame.t >= ready.t && frame.t <= gone.t);
  assert.ok(transitionFrames.slice(1).every((frame, i) => frame.t - transitionFrames[i].t < 80), 'sampling gap: recapture in foreground');
  assert.equal(frames.at(-1).slots[0].resultOpacity, 1);
  return { nodeId: baseline.nodeId, readyAt: ready.t, shimmerRemovedAt: gone.t, overlapFrames: overlap.length };
}
