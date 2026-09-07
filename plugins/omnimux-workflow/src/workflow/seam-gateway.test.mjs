/**
 * M4 seam client tests: OmniMuxSeamClient over FAKE hub seams (提交 → 轮询 →
 * 完成 → 回填), error mapping, cancel, fallback assembly and the seam
 * concurrency cap. No real model calls anywhere (红线：不烧额度).
 *
 * Runs against the built dist/index.js (npm run build first) over a temp
 * $DSH_HOME; the "hub" is a fake seam registry injected through ctx.get.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { CANVAS_GENERATION_POLICY } from '../shared/generationPolicy.ts';

const host = await import('../../dist/index.js');

class FakeRes extends Writable {
  constructor() {
    super();
    this.state = { status: 0, headers: {}, body: '' };
  }

  writeHead(status, headers) {
    this.state.status = status;
    this.state.headers = headers ?? {};
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.state.body += chunk.toString();
    callback();
  }

  end(text) {
    if (typeof text === 'string') this.state.body += text;
    super.end();
    return this;
  }
}

function fakeReq({ method = 'GET', url = '/', body = undefined }) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    url,
    headers: { origin: 'http://localhost:3000' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

// ============================================================================
// Fake execution hub (seam registry)
// ============================================================================

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal?.aborted) {
        reject(Object.assign(new Error('aborted'), { code: 'omnimux-request-failed' }));
        return;
      }
      resolve();
    }, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { code: 'omnimux-request-failed' }));
      },
      { once: true },
    );
  });
}

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * Fake hub seams mirroring the real contract (docs/m4-hub-seam-research.md):
 * media execute({wait:false}) submits → {mode:'submitted', taskId};
 * execute({dest, taskId}) polls + writes dest → {mode:'live', taskId, url}.
 */
function createFakeSeamHub(opts = {}) {
  const state = {
    submits: 0,
    polls: 0,
    concurrent: 0,
    maxConcurrent: 0,
    submitRequests: [],
    pollRequests: [],
    textRequests: [],
  };
  const pollDelayMs = opts.pollDelayMs ?? 25;
  const submitDelayMs = opts.submitDelayMs ?? 5;

  const makeMediaSeam = (capability) => ({
    async execute(req) {
      state.concurrent += 1;
      state.maxConcurrent = Math.max(state.maxConcurrent, state.concurrent);
      try {
        if (req.taskId) {
          state.pollRequests.push({ capability, ...req });
          state.polls += 1;
          await sleep(pollDelayMs, req.signal);
          if (opts.failPollWith) throw opts.failPollWith;
          mkdirSync(dirname(req.dest), { recursive: true });
          writeFileSync(req.dest, `fake-${capability}-${req.taskId}`);
          return {
            mode: 'live',
            taskId: req.taskId,
            url: `https://cdn.test/${capability}/${req.taskId}`,
          };
        }
        state.submitRequests.push({ capability, ...req });
        state.submits += 1;
        if (opts.failSubmitWith) throw opts.failSubmitWith;
        assert.equal(req.wait, false, 'fake hub expects wait:false submits');
        await sleep(submitDelayMs, req.signal);
        if (opts.liveSubmitWithoutTaskId) {
          mkdirSync(dirname(req.dest), { recursive: true });
          writeFileSync(req.dest, `fake-${capability}-sync`);
          return { mode: 'live', taskId: null, url: `https://cdn.test/${capability}/sync` };
        }
        const taskId = `hub_${capability}_${state.submits}`;
        return { mode: 'submitted', taskId, url: null };
      } finally {
        state.concurrent -= 1;
      }
    },
  });

  const textComplete = {
    async execute(req) {
      state.textRequests.push({ ...req });
      await sleep(pollDelayMs, req.signal);
      if (opts.failTextWith) throw opts.failTextWith;
      return {
        mode: 'live',
        model: req.model ?? 'gemini-3.7-flash',
        text: `echo:${req.prompt}${req.image ? ' (+img)' : ''}`,
      };
    },
  };

  const modelCatalog = {
    list() {
      if (typeof opts.catalogList === 'function') return opts.catalogList();
      return {
        source: 'omnimux',
        fingerprint: 'fake-catalog',
        models: [['claude-opus-4-6', 'text', 'chat'], ['deepseek-v4-flash-vision-exp', 'text', 'chat'],
          ['gpt-5.5', 'text', 'chat'], ['gpt-image-2', 'image', 'text_to_image'],
          ['seedance-2-0-fast', 'video', 'text_to_video'], ['suno', 'audio', 'text_to_music'],
          ['gpt-4o-mini-tts', 'audio', 'text_to_speech']].map(([id, type, operation]) => ({ id, label: id,
          operations: [{ id: operation, listed: true, output: { type }, inputs: [
            { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 },
          ] }] })),
        defaults: {
          text: 'gemini-3.7-flash',
          image: 'gpt-image-2',
          video: 'seedance-2-0-fast',
          audio: 'suno',
        },
        text: [
          { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
          { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash' },
          { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
          { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
          { id: 'gpt-5.5', label: 'GPT 5.5' },
        ],
        image: [
          { id: 'gpt-image-2', label: 'GPT Image 2' },
          { id: 'nanobanana-2', label: 'NanoBanana 2' },
        ],
        video: [
          { id: 'kling-o1', label: 'Kling O1' },
          { id: 'seedance-2-0-fast', label: 'Seedance 2.0 Fast' },
        ],
        audio: [
          { id: 'gpt-4o-mini-tts', label: 'GPT 4o Mini TTS' },
          { id: 'suno', label: 'Suno' },
        ],
      };
    },
  };

  const seams = {
    videoGenerate: makeMediaSeam('video'),
    imageGenerate: makeMediaSeam('image'),
    audioGenerate: makeMediaSeam('audio'),
    textComplete,
    modelCatalog,
  };
  return { seams, state };
}

// ============================================================================
// Mount harness
// ============================================================================

function makeHarness({ seamHub = null, gatewayMode, seamConcurrency, env } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-seam-gw-'));
  const libraryRoot = join(root, 'library');
  mkdirSync(libraryRoot, { recursive: true });
  const captured = { handler: null };
  const webServer = {
    register(route) {
      captured.handler = route.handler;
      return () => {};
    },
  };
  const ctx = { webServer };
  if (seamHub) {
    ctx.get = (name) => seamHub.seams[name];
  }
  const opts = {
    paths: {
      root,
      workspacesDir: join(root, 'workspaces'),
      executionsDir: join(root, 'executions'),
      mediaDir: join(root, 'media'),
    },
    libraryRoot,
    env: env ?? {},
  };
  if (gatewayMode !== undefined) opts.gatewayMode = gatewayMode;
  if (seamConcurrency !== undefined) opts.seamConcurrency = seamConcurrency;
  const dispose = host.mountWorkflowHost(ctx, opts);

  const call = async ({ method = 'GET', url, body }) => {
    const res = new FakeRes();
    await captured.handler(fakeReq({ method, url, body }), res);
    if (!res.writableEnded) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        res.once('finish', () => { clearTimeout(timer); resolve(); });
        res.once('close', () => { clearTimeout(timer); resolve(); });
      });
    }
    let json = null;
    try {
      json = JSON.parse(res.state.body);
    } catch {
      json = null;
    }
    return { status: res.state.status, body: json };
  };

  /** GET an SSE stream; resolves once `until(rawBody)` is satisfied. */
  const openSse = async ({ url, until, timeoutMs = 15000 }) => {
    const res = new FakeRes();
    const handlerPromise = captured.handler(fakeReq({ method: 'GET', url }), res);
    const satisfied = await new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const poll = () => {
        if (until(res.state.body) || Date.now() > deadline) {
          resolve(until(res.state.body));
          return;
        }
        setTimeout(poll, 15);
      };
      poll();
    });
    await handlerPromise;
    res.destroy();
    return { satisfied, raw: res.state.body };
  };

  const parseSse = (raw) => {
    const events = [];
    let event = '';
    let data = '';
    for (const line of raw.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data = line.slice(6);
      else if (line === '' && event && data) {
        try {
          events.push({ event, data: JSON.parse(data) });
        } catch {
          /* ignore malformed */
        }
        event = '';
        data = '';
      }
    }
    return events;
  };

  const waitUntil = async (fn, timeoutMs = 15000, intervalMs = 20) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await fn()) return true;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
  };

  /** Create a workspace and save a graph (nodes/edges/settings). */
  const bindProject = (wsId) => {
    const projectRoot = join(libraryRoot, wsId);
    mkdirSync(projectRoot, { recursive: true });
    host.createProjectStore({ libraryRoot }).create('seam-test', {
      projectRoot,
      canvasWorkspaceIds: [wsId],
    });
    return projectRoot;
  };

  const createGraph = async ({ nodes, edges = [], maxParallel, bind = false }) => {
    const created = await call({
      method: 'POST',
      url: '/omnimux-workflow/api/workspaces',
      body: { name: 'seam-test' },
    });
    const wsId = created.body.workspace.id;
    const saved = await call({
      method: 'PUT',
      url: `/omnimux-workflow/api/workspaces/${wsId}`,
      body: {
        expectedVersion: 0,
        nodes,
        edges,
        ...(maxParallel !== undefined ? { settings: { maxParallel } } : {}),
      },
    });
    assert.equal(saved.status, 200, 'graph save failed');
    const projectRoot = bind ? bindProject(wsId) : null;
    return { wsId, projectRoot };
  };

  const materialNode = (id, materialType, data = {}) => ({
    id,
    type: 'material',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      materialType,
      selectedTool: materialType === 'text' ? 'text-to-text'
        : materialType === 'image' ? 'text-to-image'
          : 'video-generation',
      prompt: `prompt for ${id}`,
      status: 'ready',
      ...data,
    },
  });

  return {
    root,
    dispose,
    call,
    openSse,
    parseSse,
    waitUntil,
    createGraph,
    materialNode,
  };
}

// ============================================================================
// Tests
// ============================================================================

test('image node: submit → poll → download → mediaUrl 回填 (fake seam full chain)', async () => {
  const hub = createFakeSeamHub();
  const h = makeHarness({ seamHub: hub });
  try {
    const { wsId, projectRoot } = await h.createGraph({ nodes: [h.materialNode('n1', 'image')], bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_complete'),
    });
    const events = h.parseSse(sse.raw);
    assert.ok(sse.satisfied, 'execution should complete');

    const complete = events.find((e) => e.event === 'node_complete');
    const asset = complete.data.output.mediaAssets[0];
    assert.match(asset.url, /\/omnimux-workflow\/api\/workspaces\/.+\/file\?rel=/);
    assert.equal(asset.type, 'image');
    assert.match(String(asset.relativePath), /^artifacts\//);

    const dest = hub.state.submitRequests[0].dest;
    assert.match(dest, /\/media\/executions\//);
    const ledger = JSON.parse(readFileSync(join(projectRoot, '.omnimux', 'assets.json'), 'utf8'));
    assert.equal(ledger.items[0].relative_path.startsWith('artifacts/'), true);
    assert.equal(JSON.stringify(ledger).includes('/Users'), false);
    const copied = join(projectRoot, ledger.items[0].relative_path);
    assert.ok(existsSync(copied), 'project artifacts copy is the SSOT');
    assert.match(readFileSync(copied, 'utf8'), /^fake-image-hub_image_1$/);
    assert.equal(existsSync(dest), false, 'tmp execution file is recycled after move');

    // Seam traffic: one wait:false submit + one {dest, taskId} poll.
    assert.equal(hub.state.submits, 1);
    assert.equal(hub.state.polls, 1);
    assert.equal(hub.state.submitRequests[0].prompt, 'prompt for n1');
    assert.equal(hub.state.submitRequests[0].dest, dest);
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('text node: textComplete seam → generatedContent 回填 + 落盘', async () => {
  const hub = createFakeSeamHub();
  const h = makeHarness({ seamHub: hub });
  try {
    const { wsId } = await h.createGraph({ nodes: [h.materialNode('n1', 'text')] });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_complete'),
    });
    assert.ok(sse.satisfied);
    const complete = h.parseSse(sse.raw).find((e) => e.event === 'node_complete');
    assert.equal(complete.data.output.text, 'echo:prompt for n1');

    assert.equal(hub.state.textRequests.length, 1);
    assert.equal(hub.state.textRequests[0].prompt, 'prompt for n1');

    // Text artifact persisted beside media outputs (same dest contract).
    const absolute = join(h.root, 'media', 'executions', execId, 'n1.txt');
    assert.ok(existsSync(absolute));
    assert.equal(readFileSync(absolute, 'utf8'), 'echo:prompt for n1');
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('sync live 提交没有 taskId 时仍回填产物（gpt-image-2 b64）', async () => {
  const hub = createFakeSeamHub({
    liveSubmitWithoutTaskId: true,
  });
  const h = makeHarness({ seamHub: hub });
  try {
    const { wsId } = await h.createGraph({ nodes: [h.materialNode('n1', 'image')], bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_complete'),
    });
    assert.ok(sse.satisfied, 'sync live submit should complete without a hub taskId');
    const complete = h.parseSse(sse.raw).find((e) => e.event === 'node_complete');
    assert.equal(complete.data.output.mediaAssets[0].type, 'image');
    assert.match(complete.data.output.mediaAssets[0].url, /\/file\?rel=/);
    assert.equal(hub.state.polls, 0, 'must not poll a missing task id');
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('ADAPTER_FAILED 把 cause 拼进节点错误', async () => {
  const wrapped = codedError('ADAPTER_FAILED', 'Adapter openai-compatible failed');
  wrapped.cause = Object.assign(new Error('Invalid token (request id: xyz)'), { code: 'REQUEST_FAILED' });
  const hub = createFakeSeamHub({ failSubmitWith: wrapped });
  const h = makeHarness({ seamHub: hub });
  try {
    const { wsId } = await h.createGraph({ nodes: [h.materialNode('n1', 'image')], bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_error'),
    });
    assert.ok(sse.satisfied, 'execution should fail');
    const nodeError = h.parseSse(sse.raw).find((e) => e.event === 'node_error');
    assert.match(nodeError.data.error, /\[omnimux:ADAPTER_FAILED\]/);
    assert.match(nodeError.data.error, /Invalid token/);
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('CHANNEL_UNAVAILABLE：渠道不可用错误保持干净用户文案，不拼接 cause 堆栈', async () => {
  const wrapped = codedError('CHANNEL_UNAVAILABLE', '该模型当前不可用，请换一个试试');
  wrapped.cause = Object.assign(
    new Error('无可用渠道 (distributor) 分组 auto 下模型 seedance-2-0-fast'),
    { code: 'CHANNEL_FAILED' },
  );
  const hub = createFakeSeamHub({ failSubmitWith: wrapped });
  const h = makeHarness({ seamHub: hub });
  try {
    const { wsId } = await h.createGraph({ nodes: [h.materialNode('n1', 'image')], bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_error'),
    });
    assert.ok(sse.satisfied, 'execution should fail');
    const nodeError = h.parseSse(sse.raw).find((e) => e.event === 'node_error');
    // code 前缀保留（画布 UI 用它做脱敏转译），但文案必须是 hub 给的干净
    // 用户文案，cause 里的 distributor / 分组 auto 行话绝不外泄。
    assert.match(nodeError.data.error, /\[omnimux:CHANNEL_UNAVAILABLE\]/);
    assert.match(nodeError.data.error, /该模型当前不可用，请换一个试试/);
    assert.doesNotMatch(nodeError.data.error, /distributor/);
    assert.doesNotMatch(nodeError.data.error, /分组\s+auto/);
    assert.doesNotMatch(nodeError.data.error, /CHANNEL_FAILED/);
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('CHANNEL_UNAVAILABLE：文本 seam（awaitTask 路径）同样脱敏', async () => {
  const hub = createFakeSeamHub({
    failTextWith: codedError('CHANNEL_UNAVAILABLE', '该模型当前不可用，请换一个试试'),
  });
  const h = makeHarness({ seamHub: hub });
  try {
    const { wsId } = await h.createGraph({ nodes: [h.materialNode('n1', 'text')] });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_error'),
    });
    assert.ok(sse.satisfied, 'execution should fail');
    const nodeError = h.parseSse(sse.raw).find((e) => e.event === 'node_error');
    assert.match(nodeError.data.error, /\[omnimux:CHANNEL_UNAVAILABLE\]/);
    assert.match(nodeError.data.error, /该模型当前不可用，请换一个试试/);
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('hub 错误映射：code 透传到节点错误（omnimux-unconfigured）', async () => {
  const hub = createFakeSeamHub({
    failSubmitWith: codedError('omnimux-unconfigured', 'set OMNIMUX_API_KEY or OMNIMUX_TOKEN'),
  });
  const h = makeHarness({ seamHub: hub });
  try {
    const { wsId } = await h.createGraph({ nodes: [h.materialNode('n1', 'image')], bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_error'),
    });
    assert.ok(sse.satisfied, 'execution should fail');
    const nodeError = h.parseSse(sse.raw).find((e) => e.event === 'node_error');
    assert.match(nodeError.data.error, /\[omnimux:omnimux-unconfigured\]/);
    assert.match(nodeError.data.error, /OMNIMUX_API_KEY/);
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('failStrategy=skip：hub 错误只失败单节点，执行整体完成', async () => {
  const hub = createFakeSeamHub({
    failSubmitWith: codedError('unknown-model', "no model configured for omnimux/image"),
  });
  const h = makeHarness({ seamHub: hub });
  try {
    const nodes = [
      h.materialNode('bad', 'image', { failStrategy: 'skip' }),
      h.materialNode('good', 'text'),
    ];
    const { wsId } = await h.createGraph({ nodes, bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_complete'),
    });
    assert.ok(sse.satisfied, 'skip strategy should keep the run alive');
    const events = h.parseSse(sse.raw);
    const badError = events.find(
      (e) => e.event === 'node_error' && e.data.nodeId === 'bad',
    );
    assert.match(badError.data.error, /\[omnimux:unknown-model\]/);
    assert.ok(events.some((e) => e.event === 'node_complete' && e.data.nodeId === 'good'));
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('取消：AbortSignal 贯通到 seam 轮询，执行转为 cancelled', async () => {
  const hub = createFakeSeamHub({ pollDelayMs: 400 });
  const h = makeHarness({ seamHub: hub });
  try {
    const { wsId } = await h.createGraph({ nodes: [h.materialNode('n1', 'image')], bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    await h.waitUntil(async () =>
      (await h.call({ url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}` }))
        .body?.execution?.status === 'running');
    const cancelled = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/cancel`,
      body: {},
    });
    assert.equal(cancelled.status, 200);
    const done = await h.waitUntil(async () =>
      (await h.call({ url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}` }))
        .body?.execution?.status === 'cancelled');
    assert.ok(done, 'execution should reach cancelled');
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('capabilities：hub 目录按画布白名单投影，不继承画布外默认项', async () => {
  const hub = createFakeSeamHub({
    catalogList() {
      return {
        source: 'omnimux',
        fingerprint: 'fake-catalog-env',
        defaults: {
          text: 'gpt-5.5',
          image: 'gpt-image-2',
          video: 'kling-o1',
          audio: 'suno',
        },
        text: [
          { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
          { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash' },
          { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
          { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
          { id: 'gpt-5.5', label: 'GPT 5.5' },
        ],
        image: [
          { id: 'gpt-image-2', label: 'GPT Image 2' },
          { id: 'nanobanana-2', label: 'NanoBanana 2' },
        ],
        video: [
          { id: 'kling-o1', label: 'Kling O1' },
          { id: 'seedance-2-0-fast', label: 'Seedance 2.0 Fast' },
        ],
        audio: [
          { id: 'gpt-4o-mini-tts', label: 'GPT 4o Mini TTS' },
          { id: 'suno', label: 'Suno' },
        ],
      };
    },
  });
  const h = makeHarness({
    seamHub: hub,
    env: { OMNIMUX_VIDEO_MODEL: 'kling-o1' },
  });
  try {
    const caps = await h.call({ url: '/omnimux-workflow/api/capabilities' });
    assert.equal(caps.body.source, 'omnimux');
    assert.match(caps.body.fingerprint, /^fake-catalog-env:canvas:/);
    assert.equal(caps.body.defaults.video, 'seedance-2-0-fast');
    assert.ok(caps.body.video.some((row) => row.id === 'seedance-2-0-fast'));
    assert.equal(caps.body.video.some((row) => row.id === 'kling-o1'), false);
    assert.ok(caps.body.image.some((row) => row.id === 'gpt-image-2'));
    assert.equal(caps.body.image.some((row) => row.id === 'nanobanana-2'), false);
    assert.equal(caps.body.text.length, 3);
    assert.deepEqual(caps.body.text.map((r) => r.id), [
      'claude-opus-4-6',
      'deepseek-v4-flash-vision-exp',
      'gpt-5.5',
    ]);
    assert.ok(caps.body.audio.some((row) => row.id === 'suno'));
    assert.ok(caps.body.audio.some((row) => row.id === 'gpt-4o-mini-tts'));
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }

  // Canvas policy applies with or without a hub environment overlay.
  const hDefault = makeHarness({ seamHub: hub });
  try {
    const caps = await hDefault.call({ url: '/omnimux-workflow/api/capabilities' });
    assert.equal(caps.body.source, 'omnimux');
    assert.equal(caps.body.video.some((row) => row.id === 'kling-o1'), false);
    assert.ok(caps.body.video.some((row) => row.id === 'seedance-2-0-fast'));
    assert.equal(caps.body.defaults.video, 'seedance-2-0-fast');
  } finally {
    hDefault.dispose();
    rmSync(hDefault.root, { recursive: true, force: true });
  }
});

test('回退：无 seam 时 auto 装配 mock 网关（static-stub 目录）', async () => {
  const h = makeHarness({});
  try {
    const caps = await h.call({ url: '/omnimux-workflow/api/capabilities' });
    assert.equal(caps.body.source, 'static-stub');
    assert.ok(caps.body.image.some((row) => row.id === 'mock-image-1'));
    // mock fixture 也是 Catalog v1.1：models[] 带完整 operation 契约。
    assert.equal(caps.body.schemaVersion, '1.1');
    const mockImage = caps.body.models.find((row) => row.id === 'mock-image-1');
    assert.ok(mockImage);
    const i2i = mockImage.operations.find((op) => op.id === 'image_to_image');
    assert.equal(i2i.listed, true);
    assert.equal(i2i.output.type, 'image');
    assert.ok(i2i.inputs.some((slot) => slot.role === 'reference'));
    assert.ok(caps.body.defaultsByOperation.image_to_image);
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('capabilities v1.1：models/operations/research/execution/aliases/parameters 全字段透传', async () => {
  const hub = createFakeSeamHub({
    catalogList() {
      return {
        source: 'omnimux',
        schemaVersion: '1.1',
        fingerprint: 'v11-pass',
        defaults: { video: 'seedance-2-0-fast' },
        defaultsByOperation: { text_to_video: 'seedance-2-0-fast' },
        models: [
          {
            id: 'seedance-2-0-fast',
            label: 'Seedance 2.0 Fast',
            family: 'bytedance',
            aliases: ['seedance-2.0-fast'],
            listed: true,
            listedOperations: ['seedance-2-0-fast#text_to_video'],
            disposition: 'canonical',
            parameters: { aspectRatio: { options: [{ value: '16:9', label: '16:9' }], defaultValue: '16:9' } },
            operations: [
              {
                id: 'text_to_video',
                label: '文生视频',
                output: { type: 'video' },
                inputs: [
                  { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 },
                ],
                research: { status: 'verified', docUrl: 'docs/evidence/x.md', verifiedAt: '2026-08-14' },
                execution: { status: 'live', profileId: 'videoGenerate', seam: 'videoGenerate' },
                listed: true,
              },
            ],
          },
        ],
        text: [],
        image: [],
        video: [
          {
            id: 'seedance-2-0-fast',
            label: 'Seedance 2.0 Fast',
            aliases: ['seedance-2.0-fast'],
            inputCapability: { modalities: ['text', 'image'] },
          },
        ],
        audio: [],
      };
    },
  });
  const h = makeHarness({ seamHub: hub });
  try {
    const caps = await h.call({ url: '/omnimux-workflow/api/capabilities' });
    assert.equal(caps.body.source, 'omnimux');
    assert.equal(caps.body.schemaVersion, '1.1');
    assert.match(caps.body.fingerprint, /^v11-pass:canvas:/);
    assert.deepEqual(caps.body.defaultsByOperation, { text_to_video: 'seedance-2-0-fast' });

    // 权威 models[]：operations/inputs/output/research/execution/aliases/parameters 不丢。
    assert.equal(caps.body.models.length, 1);
    const model = caps.body.models[0];
    assert.equal(model.id, 'seedance-2-0-fast');
    assert.deepEqual(model.aliases, ['seedance-2.0-fast']);
    assert.deepEqual(model.listedOperations, ['seedance-2-0-fast#text_to_video']);
    assert.equal(model.disposition, 'canonical');
    assert.equal(model.parameters.aspectRatio.defaultValue, '16:9');
    const op = model.operations[0];
    assert.equal(op.id, 'text_to_video');
    assert.equal(op.output.type, 'video');
    assert.equal(op.inputs[0].slot, 'prompt');
    assert.equal(op.inputs[0].source, 'node_field');
    assert.equal(op.research.status, 'verified');
    assert.equal(op.research.docUrl, 'docs/evidence/x.md');
    assert.equal(op.execution.status, 'live');
    assert.equal(op.execution.seam, 'videoGenerate');
    assert.equal(op.listed, true);

    // 桶行保留 inputCapability / aliases（旧 UI 消费路径）。
    const row = caps.body.video[0];
    assert.deepEqual(row.aliases, ['seedance-2.0-fast']);
    assert.deepEqual(row.inputCapability, { modalities: ['text', 'image'] });
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('强制 mock：读取本地 modelCatalog，但不会调用任何真实 generation seam', async () => {
  const operations = Array.from({ length: 31 }, (_, index) => ({
    id: `video_op_${index + 1}`,
    label: `Video operation ${index + 1}`,
    output: { type: 'video' },
    inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 }],
    listed: true,
  }));
  const models = Array.from({ length: 7 }, (_, index) => ({
    id: CANVAS_GENERATION_POLICY.video.allowedModelIds[index],
    label: `Video Model ${index + 1}`,
    listed: true,
    operations: operations.filter((_, operationIndex) => operationIndex % 7 === index),
  }));
  const hub = createFakeSeamHub({
    catalogList: () => ({
      source: 'omnimux',
      schemaVersion: '1.1',
      fingerprint: 'seven-video-models',
      defaults: { video: 'seedance-2-0' },
      models,
      video: models.map(({ id, label }) => ({ id, label })),
      text: [],
      image: [],
      audio: [],
    }),
  });
  const h = makeHarness({
    seamHub: hub,
    env: { OMNIMUX_WORKFLOW_GATEWAY: 'mock' },
  });
  try {
    const caps = await h.call({ url: '/omnimux-workflow/api/capabilities' });
    assert.equal(caps.body.source, 'omnimux');
    assert.match(caps.body.fingerprint, /^seven-video-models:canvas:/);
    assert.equal(caps.body.video.length, 7);
    assert.equal(caps.body.models.length, 7);
    assert.equal(caps.body.models.flatMap((model) => model.operations).length, 31);

    const { wsId } = await h.createGraph({
      nodes: [h.materialNode('n1', 'video', {
        params: { model: 'seedance-2-0', operation: 'video_op_1' },
      })],
      bind: true,
    });
    const execution = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execution.body.execution.id}/events`,
      until: (raw) => raw.includes('event: execution_complete'),
    });
    assert.ok(sse.satisfied, 'mock execution should complete');
    const complete = h.parseSse(sse.raw).find((event) => event.event === 'node_complete');
    assert.equal(complete.data.output.simulated, true);
    assert.equal(hub.state.submits, 0);
    assert.equal(hub.state.polls, 0);
    assert.equal(hub.state.textRequests.length, 0);
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('强制 omnimux 且 seam 缺失：目录缺失时拒绝创建执行（不静默 mock）', async () => {
  const h = makeHarness({
    gatewayMode: 'omnimux',
    env: { OMNIMUX_WORKFLOW_GATEWAY: 'omnimux' },
  });
  try {
    const { wsId } = await h.createGraph({ nodes: [h.materialNode('n1', 'image')], bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    assert.equal(exec.status, 400);
    assert.equal(exec.body.reasonCode, 'catalog_unavailable');
    assert.equal(exec.body.execution, undefined);
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('并发上限：宽 DAG（maxParallel=8）下 seam 并发被压到 ≤2（默认值）', async () => {
  const hub = createFakeSeamHub({ pollDelayMs: 40 });
  const h = makeHarness({ seamHub: hub });
  try {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => h.materialNode(id, 'image'));
    const { wsId } = await h.createGraph({ nodes, maxParallel: 8, bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_complete'),
      timeoutMs: 30000,
    });
    assert.ok(sse.satisfied);
    assert.equal(hub.state.submits, 4);
    assert.ok(
      hub.state.maxConcurrent <= 2,
      `seam concurrency must stay <= 2, saw ${hub.state.maxConcurrent}`,
    );
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('并发上限可配：seamConcurrency=4 时并发可达 4', async () => {
  const hub = createFakeSeamHub({ pollDelayMs: 60 });
  const h = makeHarness({ seamHub: hub, seamConcurrency: 4 });
  try {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => h.materialNode(id, 'image'));
    const { wsId } = await h.createGraph({ nodes, maxParallel: 8, bind: true });
    const exec = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
    });
    const execId = exec.body.execution.id;
    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
      until: (raw) => raw.includes('event: execution_complete'),
      timeoutMs: 30000,
    });
    assert.ok(sse.satisfied);
    assert.ok(
      hub.state.maxConcurrent >= 3,
      `raised cap should allow parallel seam calls, saw ${hub.state.maxConcurrent}`,
    );
  } finally {
    h.dispose();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('auto 晚绑定：mount 时无 seam，hub 出现后目录升级为 omnimux', async () => {
  const hub = createFakeSeamHub();
  const holder = { seams: null };
  const root = mkdtempSync(join(tmpdir(), 'omnimux-seam-late-'));
  const captured = { handler: null };
  const webServer = {
    register(route) {
      captured.handler = route.handler;
      return () => {};
    },
  };
  const libraryRoot = join(root, 'library');
  mkdirSync(libraryRoot, { recursive: true });
  const dispose = host.mountWorkflowHost(
    { webServer, get: (name) => holder.seams?.[name] },
    {
      paths: {
        root,
        workspacesDir: join(root, 'workspaces'),
        executionsDir: join(root, 'executions'),
        mediaDir: join(root, 'media'),
      },
      libraryRoot,
      env: {},
    },
  );
  try {
    const before = await h0call(captured, { url: '/omnimux-workflow/api/capabilities' });
    assert.equal(before.body.source, 'static-stub');

    holder.seams = hub.seams; // hub mounted later in the session
    const after = await h0call(captured, { url: '/omnimux-workflow/api/capabilities' });
    assert.equal(after.body.source, 'omnimux');
    assert.ok(after.body.fingerprint);
    assert.equal(after.body.video.some((row) => row.id === 'kling-o1'), false);
    assert.ok(after.body.video.some((row) => row.id === 'seedance-2-0-fast'));
    assert.ok(after.body.video.some((row) => row.id === 'seedance-2-0-fast'));
    assert.ok(after.body.defaults?.video);
  } finally {
    dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

async function h0call(captured, { method = 'GET', url, body }) {
  const res = new FakeRes();
  await captured.handler(fakeReq({ method, url, body }), res);
  if (!res.writableEnded) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      res.once('finish', () => { clearTimeout(timer); resolve(); });
      res.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
  return { status: res.state.status, body: JSON.parse(res.state.body || 'null') };
}
