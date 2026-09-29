// Transport controls promoted from the fixture observed in ego space 700 (#1759).
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from 'dsh-ui-kit';
import { MediaViewerTab } from '../../src/client/media-viewer/MediaViewerTab.jsx';
import { getGlobalMediaViewerStore } from '../../src/client/media-viewer/media-viewer-store.js';
import { createGenerationFeedback } from '../../src/client/media-viewer/generation-feedback.js';
import { bindWorkbenchDeps } from '../../src/client/workbench/host-adapter.js';

function observable(value) {
  const listeners = new Set();
  return { getSnapshot: () => value,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of listeners) fn(); } };
}
const bindings = new Map(['qa-a', 'qa-b'].map((id) => [id, {
  session: observable({ pendingSubmissions: [], queue: [] }), eventSource: observable({ entries: [] }),
}]));
const sessions = { list: observable({ current: 'qa-a' }), binding: (id) => bindings.get(id) };
const handlers = new Set();
const eventsClient = { subscribe(_type, fn) { handlers.add(fn); return () => handlers.delete(fn); } };
const store = getGlobalMediaViewerStore();
bindWorkbenchDeps({ sessions });
const bridge = createGenerationFeedback({ sessions, store, eventsClient,
  getUiContext: () => ({ sessionId: sessions.list.getSnapshot().current,
    surface: { panelOpen: true, tabId: 'omnimux:media-viewer' }, view: {} }),
});
const log = [];
let request = 0;
let seq = 0;
let active;
function send(text = '生成一张蓝色山峰图片') {
  const sessionId = sessions.list.getSnapshot().current;
  active = { sessionId, requestId: `request-${++request}`, turn: request, callId: `call-${request}` };
  const binding = bindings.get(sessionId);
  const row = { requestId: active.requestId, text };
  log.push({ type: 'pendingSubmissions', sessionId, row });
  binding.session.set({ ...binding.session.getSnapshot(),
    pendingSubmissions: [...binding.session.getSnapshot().pendingSubmissions, row] });
}
function phase(value, requestIds = [active.requestId]) {
  const payload = { sessionId: active.sessionId, requestIds, turn: active.turn, phase: value };
  log.push({ type: 'omnimux:canvas:generation', payload });
  for (const fn of handlers) fn({ payload });
}
function event(type, data) {
  const binding = bindings.get(active.sessionId);
  const entry = { type, seq: ++seq, time: Date.now(), data: { turn: active.turn, ...data } };
  log.push({ sessionId: active.sessionId, event: entry });
  binding.eventSource.set({ entries: [...binding.eventSource.getSnapshot().entries, { type: 'event', event: entry }] });
}
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#8ab8df"/><path d="M0 400L200 80L360 400M220 400L440 130L600 400" fill="#345c81"/></svg>');
function result(isError = false, includeCall = true) {
  if (includeCall) event('tool/call', { name: 'omnimux_image_submit', callId: active.callId,
    arguments: { prompt: '生成一张蓝色山峰图片' } });
  event('tool/result', { message: { source: { callId: active.callId }, content: [{
    type: 'tool-result', toolCallId: active.callId, isError,
    content: [{ type: 'text', text: JSON.stringify(isError ? { error: 'fixture failure' } : { mode: 'live', url: image }) }],
  }] } });
}
async function readFile(sessionId, path, signal) {
  log.push({ type: 'workspaceFiles.readAll', sessionId, path });
  if (path !== '/fixture/output.mp4') return { ok: false, error: { message: 'fixture denied' } };
  return (await fetch('/fixture-video-result.json', { signal })).json();
}
function extraResult(name, content) {
  active.callId = `call-extra-${++seq}`;
  event('tool/call', { name, callId: active.callId });
  event('tool/result', { message: { source: { callId: active.callId }, content: [{
    type: 'tool-result', toolCallId: active.callId, isError: false, content,
  }] } });
}
function videoResult(path = '/fixture/output.mp4') {
  extraResult('video_generate', [{ type: 'text', text: `Saved video to ${path} (1s)\nTemporary provider URL (expires soon): https://example.invalid/unused.mp4` }]);
}
const actions = {
  '返回视频': () => videoResult(),
  '返回不可读视频': () => videoResult('/fixture/denied.mp4'),
  '返回附件图': () => extraResult('image_generate', [{ type: 'image', attachment: { attachmentId: 'fixture-image', mediaType: 'image/png', bytes: 100, width: 600, height: 400 } }]),
  '晚到结果': () => { active.callId = `call-extra-${++seq}`; result(false, false); },
  '补齐调用': () => event('tool/call', { name: 'omnimux_image_submit', callId: active.callId }),
  '重建绑定': () => {
    const old = bindings.get(active.sessionId);
    bindings.set(active.sessionId, { session: observable(old.session.getSnapshot()), eventSource: observable(old.eventSource.getSnapshot()) });
    sessions.list.set({ ...sessions.list.getSnapshot() });
  },
  '停止文字': () => send('停止'),
  '多请求映射': () => phase('settled', [active.requestId, 'another-human-request']),
  '提交生成': () => send(), '接纳请求': () => phase('claimed'), '最终映射': () => phase('settled'),
  '开始执行': () => phase('running'), '返回图片': () => result(),
  '结束回合': () => event('turn/end', { reason: { kind: 'completed' } }),
  '返回失败': () => result(true), '取消回合': () => event('turn/end', { reason: { kind: 'aborted' } }),
  '普通提问': () => send('这张图片有什么内容？'),
  '切换会话': () => { sessions.list.set({ current: sessions.list.getSnapshot().current === 'qa-a' ? 'qa-b' : 'qa-a' }); render(); },
  '重复执行事件': () => phase('running'),
};
function MountProbe() { React.useEffect(() => { window.qaBoot.mounted = true; }, []); return null; }
const root = createRoot(document.getElementById('root'));
function render() {
  root.render(<><MountProbe /><aside><h2>离线传输模拟</h2><p>真实画布和生产桥接；非原生发送框，未调用生成服务。</p>
    {Object.entries(actions).map(([name, action]) => <Button key={name} onClick={action}>{name}</Button>)}
    <p>当前会话：{sessions.list.getSnapshot().current}</p></aside>
    <main><MediaViewerTab readFile={readFile} sessions={sessions} imageUrl={async () => image} scope={{ sessionId: sessions.list.getSnapshot().current }} /></main></>);
}
window.qa = { getState: () => store.getSnapshot(), log, dispose: () => { bridge.dispose(); root.unmount(); } };
render();
