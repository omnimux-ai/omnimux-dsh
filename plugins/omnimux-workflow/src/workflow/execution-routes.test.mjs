/**
 * M3 execution route tests: HTTP create/status/control + SSE event stream +
 * subset execution + restart recovery (dispose mount -> remount -> resume).
 *
 * Runs against the built dist/index.js (npm run build first) over a temp
 * $DSH_HOME with a fast mock gateway (10-30ms latency).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

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

function fakeReq({ method = 'GET', url = '/', headers = {}, body = undefined }) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function makeHarness({ dir, gatewayLatency = { minLatencyMs: 10, maxLatencyMs: 30 }, gateway } = {}) {
  const root = dir ?? mkdtempSync(join(tmpdir(), 'omnimux-exec-routes-'));
  const registered = [];
  const captured = { handler: null, path: '' };
  const webServer = {
    register(route) {
      registered.push({ path: route.path, handler: route.handler });
      captured.handler = route.handler;
      captured.path = route.path;
      return () => {};
    },
  };
  const libraryRoot = join(root, 'library');
  mkdirSync(libraryRoot, { recursive: true });
  const dispose = host.mountWorkflowHost(
    { webServer },
    {
      paths: {
        root,
        workspacesDir: join(root, 'workspaces'),
        executionsDir: join(root, 'executions'),
        mediaDir: join(root, 'media'),
      },
      libraryRoot,
      gateway: gateway ?? host.createMockGateway(gatewayLatency),
    },
  );
  const localHeaders = { origin: 'http://localhost:3000' };

  const call = async ({ method, url, body, headers }) => {
    const res = new FakeRes();
    await captured.handler(fakeReq({ method, url, headers, body }), res);
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
    return { status: res.state.status, body: json, raw: res.state.body, res };
  };

  /** GET an SSE stream; resolves once `until(rawBody)` is satisfied. */
  const openSse = async ({ url, until, timeoutMs = 5000 }) => {
    const res = new FakeRes();
    const handlerPromise = captured.handler(fakeReq({ method: 'GET', url, headers: localHeaders }), res);
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
    return { satisfied, raw: res.state.body, headers: res.state.headers };
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
          events.push({ event, data });
        }
        event = '';
        data = '';
      }
    }
    return events;
  };

  const createLinearWorkspace = async (nodeCount = 3) => {
    const created = await call({
      method: 'POST',
      url: '/omnimux-workflow/api/workspaces',
      body: { name: '执行测试' },
      headers: localHeaders,
    });
    const ws = created.body.workspace;
    const nodes = Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i + 1}`,
      type: 'material',
      position: { x: i * 200, y: 0 },
      data: {
        label: `节点${i + 1}`,
        materialType: 'text',
        selectedTool: 'text-to-text',
        prompt: `prompt-${i + 1}`,
        status: 'ready',
      },
    }));
    const edges = Array.from({ length: nodeCount - 1 }, (_, i) => ({
      id: `e${i + 1}`,
      source: `n${i + 1}`,
      target: `n${i + 2}`,
    }));
    await call({
      method: 'PUT',
      url: `/omnimux-workflow/api/workspaces/${ws.id}`,
      body: { expectedVersion: 0, nodes, edges },
      headers: localHeaders,
    });
    return ws.id;
  };

  const startExecution = async (workspaceId, body = {}) => {
    const result = await call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${workspaceId}/executions`,
      body,
      headers: localHeaders,
    });
    return result;
  };

  const executionStatus = async (workspaceId, executionId) =>
    call({
      url: `/omnimux-workflow/api/workspaces/${workspaceId}/executions/${executionId}`,
      headers: localHeaders,
    });

  const executionAction = async (workspaceId, executionId, action) =>
    call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${workspaceId}/executions/${executionId}/${action}`,
      headers: localHeaders,
    });

  return {
    dir: root,
    libraryRoot,
    registered,
    call,
    openSse,
    parseSse,
    localHeaders,
    createLinearWorkspace,
    startExecution,
    executionStatus,
    executionAction,
    dispose,
  };
}

const waitUntil = async (predicate, { timeoutMs = 5000, intervalMs = 15 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
};

function urlRequiredCatalog() {
  return {
    source: 'omnimux', text: [], image: [], audio: [],
    video: [{ id: 'url-video', label: 'URL Video' }],
    models: [{
      id: 'url-video', label: 'URL Video', listed: true,
      parameters: {
        aspectRatio: { options: [{ value: '16:9' }, { value: '9:16' }], defaultValue: '16:9' },
        resolution: { options: [{ value: '720p' }, { value: '1080p' }], defaultValue: '720p' },
      },
      operations: [
        {
          id: 'document_to_video', label: '文档参考', listed: true, output: { type: 'video' }, inputs: [
            { slot: 'file_url', type: 'document', role: 'document', source: 'node_field', min: 1, max: 1 },
          ],
        },
        {
          id: 'webpage_to_video', label: '网页参考', listed: true, output: { type: 'video' }, inputs: [
            { slot: 'link_url', type: 'document', role: 'webpage', source: 'node_field', min: 1, max: 1 },
          ],
        },
      ],
    }],
  };
}

async function createUrlWorkspace(h, id, operation, params = {}) {
  const created = await h.call({
    method: 'POST',
    url: '/omnimux-workflow/api/workspaces',
    body: { name: `${operation} 校验` },
    headers: h.localHeaders,
  });
  const workspaceId = created.body.workspace.id;
  await h.call({
    method: 'PUT',
    url: `/omnimux-workflow/api/workspaces/${workspaceId}`,
    body: {
      expectedVersion: 0,
      nodes: [{
        id,
        type: 'material',
        position: { x: 0, y: 0 },
        data: {
          label: operation,
          materialType: 'video',
          selectedTool: 'video-generation',
          prompt: '生成一段视频',
          status: 'ready',
          params: { model: 'url-video', operation, ...params },
        },
      }],
      edges: [],
    },
    headers: h.localHeaders,
  });
  return workspaceId;
}

// ============================================================================

function listSeededProjects(libraryRoot) {
  if (!existsSync(libraryRoot)) return [];
  const rows = [];
  for (const entry of readdirSync(libraryRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectFile = join(libraryRoot, entry.name, '.omnimux', 'project.json');
    if (!existsSync(projectFile)) continue;
    const project = JSON.parse(readFileSync(projectFile, 'utf8'));
    rows.push({ dir: join(libraryRoot, entry.name), project });
  }
  return rows;
}

test('execution API blocks missing contract URL fields before every create mode and permits a valid retry', async () => {
  const baseGateway = host.createMockGateway({ minLatencyMs: 10, maxLatencyMs: 10, catalog: urlRequiredCatalog });
  const submitted = [];
  const gateway = {
    ...baseGateway,
    async submit(request) {
      submitted.push(request);
      return baseGateway.submit(request);
    },
    async capabilities() {
      return urlRequiredCatalog();
    },
  };
  const h = makeHarness({ gateway });
  try {
    const documentWorkspace = await createUrlWorkspace(h, 'document', 'document_to_video');
    const documentFull = await h.startExecution(documentWorkspace, { mode: 'full' });
    assert.equal(documentFull.status, 400);
    assert.equal(documentFull.body.error, 'configuration_error');
    assert.equal(documentFull.body.reasonCode, 'metadata_required');
    assert.equal(documentFull.body.nodeId, 'document');

    const webpageWorkspace = await createUrlWorkspace(h, 'webpage', 'webpage_to_video');
    const webpageSubset = await h.startExecution(webpageWorkspace, { mode: 'subset', nodeIds: ['webpage'] });
    assert.equal(webpageSubset.status, 400);
    assert.equal(webpageSubset.body.error, 'configuration_error');
    assert.equal(webpageSubset.body.nodeId, 'webpage');

    // ConfigPanel's retry path uses single-node execution; it must hit the same guard.
    const documentSingle = await h.startExecution(documentWorkspace, { mode: 'single', nodeIds: ['document'] });
    assert.equal(documentSingle.status, 400);
    assert.equal(documentSingle.body.error, 'configuration_error');
    assert.equal(submitted.length, 0, 'a blocked execution must not submit a gateway request');

    const validWorkspace = await createUrlWorkspace(
      h,
      'valid-document',
      'document_to_video',
      { fileUrl: 'https://cdn.example.com/deck.pdf' },
    );
    const valid = await h.startExecution(validWorkspace, { mode: 'single', nodeIds: ['valid-document'] });
    assert.equal(valid.status, 200);
    const completed = await waitUntil(async () => {
      const status = await h.executionStatus(validWorkspace, valid.body.execution.id);
      return status.body?.execution?.status === 'completed';
    });
    assert.ok(completed, 'valid URL should start and complete the retry path');
    assert.equal(submitted.length, 1);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('unbound media generate → 惰性种子项目 200；text generate 仍可通过', async () => {
  const h = makeHarness();
  try {
    const textId = await h.createLinearWorkspace(1);
    const textExec = await h.startExecution(textId, { mode: 'full' });
    assert.equal(textExec.status, 200);
    assert.equal(listSeededProjects(h.libraryRoot).length, 0, 'text generate 不得种子项目');

    const created = await h.call({
      method: 'POST',
      url: '/omnimux-workflow/api/workspaces',
      body: { name: '未绑定生图' },
      headers: h.localHeaders,
    });
    const wsId = created.body.workspace.id;
    await h.call({
      method: 'PUT',
      url: `/omnimux-workflow/api/workspaces/${wsId}`,
      body: {
        expectedVersion: 0,
        nodes: [{
          id: 'img',
          type: 'material',
          position: { x: 0, y: 0 },
          data: {
            label: '图',
            materialType: 'image',
            selectedTool: 'text-to-image',
            prompt: 'x',
            status: 'ready',
          },
        }],
        edges: [],
      },
      headers: h.localHeaders,
    });
    const exec = await h.startExecution(wsId, { mode: 'full' });
    assert.equal(exec.status, 200);
    assert.ok(exec.body.execution?.id);
    const completed = await waitUntil(async () => {
      const status = await h.executionStatus(wsId, exec.body.execution.id);
      return status.body?.execution?.status === 'completed';
    });
    assert.ok(completed, '惰性绑定后 media generate 必须能 persist 到项目根');

    const seeded = listSeededProjects(h.libraryRoot);
    assert.equal(seeded.length, 1);
    assert.ok(existsSync(join(seeded[0].dir, '.omnimux', 'project.json')));
    assert.ok(
      (seeded[0].project.canvasWorkspaceIds ?? []).includes(wsId),
      '种子项目必须绑定该 workspace',
    );
    assert.equal(seeded[0].project.title, '未绑定生图');

    const again = await h.startExecution(wsId, { mode: 'full' });
    assert.equal(again.status, 200);
    assert.equal(listSeededProjects(h.libraryRoot).length, 1, '同 workspace 再执行必须幂等');
    const againDone = await waitUntil(async () => {
      const status = await h.executionStatus(wsId, again.body.execution.id);
      return status.body?.execution?.status === 'completed';
    });
    assert.ok(againDone, '幂等再执行仍应完成');
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('execution API: create -> SSE full event sequence -> completed snapshot', async () => {
  const h = makeHarness();
  try {
    const wsId = await h.createLinearWorkspace(3);
    const created = await h.startExecution(wsId, { mode: 'full' });
    assert.equal(created.status, 200);
    const executionId = created.body.execution.id;
    assert.equal(created.body.execution.totalNodes, 3);

    const sse = await h.openSse({
      url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${executionId}/events`,
      until: (raw) => raw.includes('event: execution_complete'),
    });
    assert.ok(sse.satisfied, 'SSE stream should reach execution_complete');
    assert.match(sse.headers['Content-Type'], /text\/event-stream/);

    const events = h.parseSse(sse.raw);
    const names = events.map((e) => e.event);
    assert.equal(names[0], 'execution_start', 'replay guarantees the full sequence');
    assert.ok(names.includes('execution_complete'));

    // Linear DAG + maxParallel: strict node order.
    const starts = events.filter((e) => e.event === 'node_start').map((e) => e.data.nodeId);
    const completes = events.filter((e) => e.event === 'node_complete').map((e) => e.data.nodeId);
    assert.deepEqual(starts, ['n1', 'n2', 'n3']);
    assert.deepEqual(completes, ['n1', 'n2', 'n3']);

    // node_complete carries the mock gateway output.
    const first = events.find((e) => e.event === 'node_complete');
    assert.match(String(first.data.output?.text ?? ''), /mock 生成结果/);
    assert.equal(first.data.output?.simulated, true);

    // Final snapshot via GET.
    const final = await waitUntil(async () => {
      const status = await h.executionStatus(wsId, executionId);
      return status.body?.execution?.status === 'completed';
    });
    assert.ok(final, 'status snapshot should reach completed');
    const snapshot = (await h.executionStatus(wsId, executionId)).body.execution;
    assert.equal(snapshot.completedNodes, 3);
    assert.equal(snapshot.progress.percentage, 100);
    assert.equal(snapshot.nodeOutputs.n1?.simulated, true);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('execution API: pause -> resume -> completes; cancel -> cancelled', async () => {
  const h = makeHarness({ gatewayLatency: { minLatencyMs: 200, maxLatencyMs: 300 } });
  try {
    const wsId = await h.createLinearWorkspace(3);

    // --- pause/resume ---
    const created = await h.startExecution(wsId);
    const execId = created.body.execution.id;
    await waitUntil(async () => {
      const status = await h.executionStatus(wsId, execId);
      return status.body?.execution?.status === 'running';
    });
    const paused = await h.executionAction(wsId, execId, 'pause');
    assert.equal(paused.status, 200);
    await waitUntil(async () => {
      const status = await h.executionStatus(wsId, execId);
      return status.body?.execution?.status === 'paused';
    });

    const resumed = await h.executionAction(wsId, execId, 'resume');
    assert.equal(resumed.status, 200);
    const completed = await waitUntil(async () => {
      const status = await h.executionStatus(wsId, execId);
      return status.body?.execution?.status === 'completed';
    });
    assert.ok(completed, 'resumed execution should complete');

    // --- cancel ---
    const created2 = await h.startExecution(wsId);
    const execId2 = created2.body.execution.id;
    await waitUntil(async () => {
      const status = await h.executionStatus(wsId, execId2);
      return status.body?.execution?.status === 'running';
    });
    const cancelled = await h.executionAction(wsId, execId2, 'cancel');
    assert.equal(cancelled.status, 200);
    const cancelSettled = await waitUntil(async () => {
      const status = await h.executionStatus(wsId, execId2);
      return status.body?.execution?.status === 'cancelled';
    });
    assert.ok(cancelSettled, 'cancelled execution should reach cancelled status');

    // Cancel a terminal execution -> 409 invalid state.
    const reCancel = await h.executionAction(wsId, execId2, 'cancel');
    assert.equal(reCancel.status, 409);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('execution API: subset mode runs only the induced subgraph', async () => {
  const h = makeHarness();
  try {
    const wsId = await h.createLinearWorkspace(3);
    // Subset on n2: closure { n1, n2 } — n3 stays out.
    const created = await h.startExecution(wsId, { mode: 'subset', nodeIds: ['n2'] });
    assert.equal(created.status, 200);
    assert.equal(created.body.execution.totalNodes, 2);
    const execId = created.body.execution.id;

    const completed = await waitUntil(async () => {
      const status = await h.executionStatus(wsId, execId);
      return status.body?.execution?.status === 'completed';
    });
    assert.ok(completed);
    const snapshot = (await h.executionStatus(wsId, execId)).body.execution;
    assert.deepEqual(Object.keys(snapshot.nodeStates).sort(), ['n1', 'n2']);
    assert.equal(snapshot.nodeStates.n3, undefined, 'n3 excluded from the subset run');

    // Invalid node id -> 400.
    const bad = await h.startExecution(wsId, { mode: 'subset', nodeIds: ['nope'] });
    assert.equal(bad.status, 400);

    // Empty nodeIds in subset mode -> 400.
    const empty = await h.startExecution(wsId, { mode: 'subset', nodeIds: [] });
    assert.equal(empty.status, 400);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('execution API rejects stale or invalid input versions without creating an execution', async () => {
  let submissions = 0;
  const gateway = host.createMockGateway({ minLatencyMs: 1, maxLatencyMs: 1 });
  const submit = gateway.submit.bind(gateway);
  gateway.submit = (...args) => { submissions += 1; return submit(...args); };
  const h = makeHarness({ gateway });
  try {
    const wsId = await h.createLinearWorkspace(1);
    for (const expectedVersion of [0, -1, 1.5, '1']) {
      const result = await h.startExecution(wsId, { expectedVersion });
      assert.equal(result.status, expectedVersion === 0 ? 409 : 400);
    }
    assert.equal(submissions, 0);
    const accepted = await h.startExecution(wsId, { expectedVersion: 1 });
    assert.equal(accepted.status, 200);
    assert.ok(await waitUntil(async () => (await h.executionStatus(wsId, accepted.body.execution.id)).body.execution.status === 'completed'));
    assert.equal(submissions, 1);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('execution API: single mode runs only the target node and seeds upstream outputs from snapshot', async () => {
  const h = makeHarness();
  try {
    const wsId = await h.createLinearWorkspace(3);
    const rejected = await h.startExecution(wsId, { mode: 'single', nodeIds: ['n2'] });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.reasonCode, 'input_waiting');
    const current = (await h.call({ method: 'GET', url: `/omnimux-workflow/api/workspaces/${wsId}` })).body.workspace;
    current.nodes.find((node) => node.id === 'n1').data.generatedContent = 'current upstream result';
    await h.call({ method: 'PUT', url: `/omnimux-workflow/api/workspaces/${wsId}`, headers: h.localHeaders, body: { expectedVersion: current.version, nodes: current.nodes, edges: current.edges } });
    // Single mode on n2: only n2 executes, n1 and n3 stay untouched
    const created = await h.startExecution(wsId, { mode: 'single', nodeIds: ['n2'] });
    assert.equal(created.status, 200);
    assert.equal(created.body.execution.totalNodes, 1);
    const execId = created.body.execution.id;

    const completed = await waitUntil(async () => {
      const status = await h.executionStatus(wsId, execId);
      return status.body?.execution?.status === 'completed';
    });
    assert.ok(completed);
    const snapshot = (await h.executionStatus(wsId, execId)).body.execution;
    assert.deepEqual(Object.keys(snapshot.nodeStates), ['n2']);
    assert.equal(snapshot.nodeStates.n1, undefined, 'n1 not executed in single mode');
    assert.equal(snapshot.nodeStates.n3, undefined, 'n3 not executed in single mode');
    assert.equal(snapshot.nodeStates.n2.status, 'completed');

    // Empty nodeIds in single mode -> 400.
    const empty = await h.startExecution(wsId, { mode: 'single', nodeIds: [] });
    assert.equal(empty.status, 400);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('execution recovery: paused run survives dispose + remount and resumes', async () => {
  const slowGateway = { gatewayLatency: { minLatencyMs: 150, maxLatencyMs: 250 } };
  let h = makeHarness(slowGateway);
  try {
    const wsId = await h.createLinearWorkspace(3);
    const created = await h.startExecution(wsId);
    const execId = created.body.execution.id;

    // Pause mid-run, then simulate a host crash: unmount everything.
    await waitUntil(async () => {
      const status = await h.executionStatus(wsId, execId);
      return status.body?.execution?.status === 'running';
    });
    await h.executionAction(wsId, execId, 'pause');
    await waitUntil(async () => {
      const status = await h.executionStatus(wsId, execId);
      return status.body?.execution?.status === 'paused';
    });
    h.dispose();

    // Remount the SAME $DSH_HOME: recoverAll picks up the paused execution.
    h = makeHarness({ ...slowGateway, dir: h.dir });

    // The paused execution is readable after remount (persisted record).
    const status = await h.executionStatus(wsId, execId);
    assert.equal(status.status, 200);
    assert.equal(status.body.execution.status, 'paused');

    // SSE attach (recovered run, replay log covers pre-crash events), then
    // resume finishes it end-to-end.
    const sseRes = new FakeRes();
    const sseHandler = (async () => {
      // Reach into the harness: same handler both prefixes register.
      const handler = h.registered[0].handler;
      await handler(
        fakeReq({
          method: 'GET',
          url: `/omnimux-workflow/api/workspaces/${wsId}/executions/${execId}/events`,
          headers: h.localHeaders,
        }),
        sseRes,
      );
    })();
    const replayed = await waitUntil(() =>
      sseRes.state.body.includes('event: execution_paused'));
    assert.ok(replayed, 'SSE replay should include pre-crash events');

    const resumed = await h.executionAction(wsId, execId, 'resume');
    assert.equal(resumed.status, 200);

    const finished = await waitUntil(() =>
      sseRes.state.body.includes('event: execution_complete'));
    assert.ok(finished, 'recovered execution should stream execution_complete');
    sseRes.destroy();
    await sseHandler;

    const events = h.parseSse(sseRes.state.body);
    const names = events.map((e) => e.event);
    assert.ok(names.includes('execution_start'), 'replay includes execution_start');
    assert.ok(names.includes('execution_paused'), 'replay includes the pause');
    assert.ok(names.includes('execution_resumed'));
    assert.ok(names.includes('execution_complete'));
    // Completed nodes were not re-run (exactly one execution_start overall).
    assert.equal(names.filter((n) => n === 'execution_start').length, 1);

    const finalStatus = await h.executionStatus(wsId, execId);
    assert.equal(finalStatus.body.execution.status, 'completed');
    assert.equal(finalStatus.body.execution.completedNodes, 3);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('execution API: legacy /dsh-workflow prefix serves executions too', async () => {
  const h = makeHarness();
  try {
    const created = await h.call({
      method: 'POST',
      url: '/dsh-workflow/api/workspaces',
      body: { name: 'legacy' },
      headers: h.localHeaders,
    });
    const wsId = created.body.workspace.id;
    await h.call({
      method: 'PUT',
      url: `/dsh-workflow/api/workspaces/${wsId}`,
      body: {
        expectedVersion: 0,
        nodes: [
          {
            id: 'n1',
            type: 'material',
            position: { x: 0, y: 0 },
            data: { label: 'n1', materialType: 'text', selectedTool: 'text-to-text', prompt: 'p' },
          },
        ],
        edges: [],
      },
      headers: h.localHeaders,
    });
    const exec = await h.call({
      method: 'POST',
      url: `/dsh-workflow/api/workspaces/${wsId}/executions`,
      body: { mode: 'full' },
      headers: h.localHeaders,
    });
    assert.equal(exec.status, 200);
    const execId = exec.body.execution.id;

    const list = await h.call({
      url: `/dsh-workflow/api/workspaces/${wsId}/executions`,
      headers: h.localHeaders,
    });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.executions));

    const completed = await waitUntil(async () => {
      const status = await h.call({
        url: `/dsh-workflow/api/workspaces/${wsId}/executions/${execId}`,
        headers: h.localHeaders,
      });
      return status.body?.execution?.status === 'completed';
    });
    assert.ok(completed, 'legacy prefix execution should complete');
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('execution API blocks a persisted pending video parameter adjustment before submission', async () => {
  const baseGateway = host.createMockGateway({ minLatencyMs: 10, maxLatencyMs: 10 });
  const submitted = [];
  const gateway = {
    ...baseGateway,
    async submit(request) {
      submitted.push(request);
      return baseGateway.submit(request);
    },
    async capabilities() {
      return urlRequiredCatalog();
    },
  };
  const h = makeHarness({ gateway });
  try {
    const workspaceId = await createUrlWorkspace(h, 'pending-adjustment', 'document_to_video', {
      fileUrl: 'https://cdn.example.com/deck.pdf',
      pendingVideoParamAdjustment: {
        suggestedParams: { duration: -1 },
        notices: ['时长将从 5 调整为 -1'],
      },
    });
    const blocked = await h.startExecution(workspaceId, { mode: 'single', nodeIds: ['pending-adjustment'] });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.error, 'configuration_error');
    assert.equal(blocked.body.reasonCode, 'parameter_adjustment_required');
    assert.equal(blocked.body.nodeId, 'pending-adjustment');
    assert.equal(submitted.length, 0);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});


test('execution API keeps an invalid user parameter but rejects it before mock submission', async () => {
  const baseGateway = host.createMockGateway({ minLatencyMs: 10, maxLatencyMs: 10 });
  const submitted = [];
  const gateway = {
    ...baseGateway,
    async submit(request) {
      submitted.push(request);
      return baseGateway.submit(request);
    },
    async capabilities() {
      return urlRequiredCatalog();
    },
  };
  const h = makeHarness({ gateway });
  try {
    const workspaceId = await createUrlWorkspace(h, 'kept-invalid', 'document_to_video', {
      fileUrl: 'https://cdn.example.com/deck.pdf', aspectRatio: 'auto', resolution: '480p',
    });
    const blocked = await h.startExecution(workspaceId, { mode: 'single', nodeIds: ['kept-invalid'] });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.error, 'configuration_error');
    assert.equal(blocked.body.reasonCode, 'parameter_unsupported');
    assert.equal(blocked.body.nodeId, 'kept-invalid');
    assert.match(blocked.body.message, /aspectRatio/);
    assert.equal(submitted.length, 0);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});


function operationOverrideCatalog() {
  return {
    source: 'omnimux', text: [], image: [], audio: [], video: [{ id: 'url-video', label: 'URL Video' }],
    models: [{
      id: 'url-video', label: 'URL Video', listed: true,
      operations: [{
        id: 'video_edit', label: 'Edit', listed: true, output: { type: 'video' }, inputs: [],
        parameters: { duration: { options: [{ value: -1 }], defaultValue: -1 } },
      }],
    }],
  };
}

test('execution API blocks stale explicit and invalid implicit operations before mock submission', async () => {
  const baseGateway = host.createMockGateway({ minLatencyMs: 10, maxLatencyMs: 10 });
  const submitted = [];
  const gateway = {
    ...baseGateway,
    async submit(request) {
      submitted.push(request);
      return baseGateway.submit(request);
    },
    async capabilities() {
      return operationOverrideCatalog();
    },
  };
  const h = makeHarness({ gateway });
  try {
    const staleWorkspace = await createUrlWorkspace(h, 'stale-operation', 'old_op');
    const stale = await h.startExecution(staleWorkspace, { mode: 'single', nodeIds: ['stale-operation'] });
    assert.equal(stale.status, 400);
    assert.equal(stale.body.error, 'configuration_error');
    assert.equal(stale.body.reasonCode, 'operation_incompatible');

    const created = await h.call({
      method: 'POST', url: '/omnimux-workflow/api/workspaces', body: { name: 'implicit override' }, headers: h.localHeaders,
    });
    const implicitWorkspace = created.body.workspace.id;
    await h.call({
      method: 'PUT', url: `/omnimux-workflow/api/workspaces/${implicitWorkspace}`,
      body: {
        expectedVersion: 0,
        nodes: [{
          id: 'implicit-operation', type: 'material', position: { x: 0, y: 0 },
          data: {
            label: 'implicit operation', materialType: 'video', selectedTool: 'video-generation', status: 'ready',
            params: { model: 'url-video', duration: 5 },
          },
        }], edges: [],
      }, headers: h.localHeaders,
    });
    const implicit = await h.startExecution(implicitWorkspace, { mode: 'single', nodeIds: ['implicit-operation'] });
    assert.equal(implicit.status, 400);
    assert.equal(implicit.body.error, 'configuration_error');
    assert.equal(implicit.body.reasonCode, 'parameter_unsupported');
    assert.equal(submitted.length, 0, 'invalid operation contracts must never hit mock submit');
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

function multiOperationCatalog() {
  return {
    source: 'omnimux', text: [], image: [], audio: [], video: [{ id: 'multi-video', label: 'Multi video' }],
    models: [{
      id: 'multi-video', label: 'Multi video', listed: true,
      operations: [
        { id: 'text_to_video', label: 'Text', listed: true, output: { type: 'video' }, inputs: [] },
        { id: 'video_edit', label: 'Edit', listed: true, output: { type: 'video' }, inputs: [] },
      ],
    }],
  };
}

test('execution API requires an explicit video mode when multiple modes are effective', async () => {
  const baseGateway = host.createMockGateway({ minLatencyMs: 10, maxLatencyMs: 10 });
  const submitted = [];
  const gateway = {
    ...baseGateway,
    async submit(request) {
      submitted.push(request);
      return baseGateway.submit(request);
    },
    async capabilities() {
      return multiOperationCatalog();
    },
  };
  const h = makeHarness({ gateway });
  try {
    const created = await h.call({ method: 'POST', url: '/omnimux-workflow/api/workspaces', body: { name: 'multi operation' }, headers: h.localHeaders });
    const workspaceId = created.body.workspace.id;
    await h.call({
      method: 'PUT', url: `/omnimux-workflow/api/workspaces/${workspaceId}`,
      body: {
        expectedVersion: 0,
        nodes: [{
          id: 'multi-operation', type: 'material', position: { x: 0, y: 0 },
          data: {
            label: 'multi operation', materialType: 'video', selectedTool: 'video-generation', status: 'ready',
            params: { model: 'multi-video' },
          },
        }], edges: [],
      }, headers: h.localHeaders,
    });
    const blocked = await h.startExecution(workspaceId, { mode: 'single', nodeIds: ['multi-operation'] });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.error, 'configuration_error');
    assert.equal(blocked.body.reasonCode, 'operation_incompatible');
    assert.equal(blocked.body.message, '请选择生成方式');
    assert.equal(submitted.length, 0);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});
