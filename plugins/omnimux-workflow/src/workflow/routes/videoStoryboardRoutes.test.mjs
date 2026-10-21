import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { buildSync } from 'esbuild';

const buildDir = mkdtempSync(join(tmpdir(), 'video-storyboard-route-build-'));
const bundle = join(buildDir, 'runtime.mjs');
buildSync({
  stdin: {
    contents: `
      export { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
      export { createWorkflowDispatcher } from './canvasRoutes.ts';
      export { TableStorageService } from '../storage/TableStorageService.ts';
      export { resolveTableAbsPath } from '../storage/tablePath.ts';
    `,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
});
const { createWorkspaceStore, createWorkflowDispatcher, TableStorageService, resolveTableAbsPath } =
  await import(pathToFileURL(bundle).href);
after(() => rmSync(buildDir, { recursive: true, force: true }));

function harness(t, opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'video-storyboard-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createWorkspaceStore({ workspacesDir: join(root, 'workspaces') });
  const workspace = store.create('分镜表测试工作区');
  store.save(workspace.id, {
    expectedVersion: workspace.version,
    nodes: [
      {
        id: 'node_video_1',
        type: 'material',
        position: { x: 50, y: 50 },
        data: { materialType: 'video', label: '测试视频节点', nodeWidth: 360 },
      },
    ],
    edges: [],
  });

  const toolCalls = [];
  const videoAnalyzeTool = {
    async execute(args) {
      toolCalls.push({ tool: 'video_analyze', args });
      if (opts.analyzeExecute) return opts.analyzeExecute(args);
      return {
        report: `# 《测试视频》逐镜头分解与五维分析报告

## 逐镜头分解表
| 镜头序号 | 时间段 | 景别 | 画面描述 | 关键动作 | 台词脚本 |
| --- | --- | --- | --- | --- | --- |
| 1 | 00:00 - 00:03 | 特写 | 开场抓人视觉反差 | 快速镜头推入 | "痛点前置" |
| 2 | 00:03 - 00:08 | 中景 | 实操演示过程细节 | 真实手部操作 | "效果惊艳" |

## 一句话视频描述
以真实拆解结果为核心的高转化短视频。

## I. 核心目标
* 转化目标: 引导点击左下角购买同款

## II. 影响力分析
明线展示直观功效，暗线击中受众痛点。

## III. 叙事结构
0-3s 抛痛点 → 3-10s 实测演示 → 结尾明确 CTA

## IV. 画面分析
近景特写为主，原生自然光影。

## V. 核心复刻策略
[痛点开场] + [第一人称实测] + [CTA 引导]
`,
      };
    },
  };

  const videoProcessTool = {
    async execute(args) {
      toolCalls.push({ tool: 'video_process', args });
      if (opts.processExecute) return opts.processExecute(args);
      if (args.capability === 'video_thumbnail_extract') {
        const dest = args.dest;
        writeFileSync(dest, 'extracted real thumbnail frame bytes exceeding 500 bytes threshold to be considered valid ' + 'x'.repeat(600));
        return { mode: 'live', files: [{ path: dest, kind: 'image' }] };
      }
      if (opts.noScenesDetected) {
        return { mode: 'live', files: [], result: { scenes: [], count: 0 } };
      }
      const dest = args.dest;
      mkdirSync(dest, { recursive: true });
      const f1 = join(dest, 'frame-001.jpg');
      const f2 = join(dest, 'frame-002.jpg');
      writeFileSync(f1, 'fake jpg frame 1');
      writeFileSync(f2, 'fake jpg frame 2');
      return {
        mode: 'live',
        files: [
          { path: f1, kind: 'image', meta: { timeSeconds: 0 } },
          { path: f2, kind: 'image', meta: { timeSeconds: 3.2 } },
        ],
        result: {
          scenes: [
            { start: 0, end: 3.2 },
            { start: 3.2, end: 8.0 },
          ],
          count: 2,
        },
      };
    },
  };

  const dispatcher = createWorkflowDispatcher({
    store,
    mediaDir: join(root, 'media'),
    libraryRoot: join(root, 'library'),
    executionManager: {},
    gateway: { capabilities: async () => ({}) },
    getTool: (name) => {
      if (opts.disableTools) return undefined;
      if (name === 'video_analyze') return videoAnalyzeTool;
      if (name === 'video_process') return videoProcessTool;
      return undefined;
    },
    getSeam: (name) => {
      if (opts.disableTools) return undefined;
      if (name === 'videoAnalyze') return videoAnalyzeTool;
      if (name === 'videoProcess') return videoProcessTool;
      return undefined;
    },
  });

  const dummyVideo = join(root, 'test.mp4');
  writeFileSync(dummyVideo, 'dummy video binary content');

  const url = `/omnimux-workflow/api/workspaces/${workspace.id}/storyboard-video`;
  const call = (body, extra = {}) =>
    dispatcher.dispatch({
      method: 'POST',
      url,
      body,
      origin: 'http://127.0.0.1:45120',
      ...extra,
    });

  return { call, toolCalls, store, workspace, url, dummyVideo, root, mediaDir: join(root, 'media'), dispatcher };
}

test('videoStoryboard: 成功生成分镜表并持久化 .htable 多模态数据', async (t) => {
  const h = harness(t);
  const res = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '商品营销分镜表',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.title, '商品营销分镜表');
  assert.ok(res.body.tableId.startsWith('tbl_'));
  assert.equal(res.body.rowCount, 2);
  assert.equal(res.body.columnCount, 6);

  // 校验 .htable 文件存在且格式符合超高行高与多模态附件格式
  const absPath = resolveTableAbsPath(h.store, h.workspace.id, res.body.tableId);
  assert.ok(existsSync(absPath));
  const doc = await TableStorageService.loadTable(absPath);
  assert.equal(doc.title, '商品营销分镜表');
  assert.equal(doc.rowHeight, 'low');

  // 校验包含分镜画面附件列
  const imgCol = doc.columns.find((c) => c.title === '分镜画面');
  assert.ok(imgCol);
  assert.equal(imgCol.type, 'attachment');

  const row0Attachments = doc.rows[0].cells[imgCol.id];
  assert.ok(Array.isArray(row0Attachments));
  assert.equal(row0Attachments.length, 1);
  assert.equal(row0Attachments[0].kind, 'image');
  assert.match(row0Attachments[0].url, /^\/omnimux-workflow\/media\/storyboard\//);

  // 校验工作区 canvas 快照中新增了表格节点并连线
  const updatedWs = h.store.get(h.workspace.id);
  const tableNode = updatedWs.nodes.find((n) => n.id === res.body.tableId);
  assert.ok(tableNode);
  assert.equal(tableNode.type, 'table');
  assert.equal(tableNode.data.origin, 'video_storyboard');
  assert.equal(tableNode.data.sourceVideoNodeId, 'node_video_1');

  // 校验有向连线
  const edge = updatedWs.edges.find(
    (e) => e.source === 'node_video_1' && e.target === res.body.tableId,
  );
  assert.ok(edge);
  assert.equal(edge.sourceHandle, 'out');
  assert.equal(edge.targetHandle, 'in');
});

test('videoStoryboard: 二次调用触发单一下游就地更新，不产生重复节点', async (t) => {
  const h = harness(t);
  const firstRes = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '初版分镜表',
  });
  assert.equal(firstRes.status, 200);
  const firstTableId = firstRes.body.tableId;

  // 二次调用
  const secondRes = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '精修版分镜表',
  });
  assert.equal(secondRes.status, 200);

  const updatedWs = h.store.get(h.workspace.id);
  const tableNodes = updatedWs.nodes.filter(
    (n) => n.type === 'table' && n.data?.origin === 'video_storyboard',
  );
  assert.equal(tableNodes.length, 1, '同一视频节点只能派生一个单一下游分镜表格节点');
  assert.equal(tableNodes[0].data.title, '精修版分镜表');
});

test('videoStoryboard: 分析能力不可用时直接报错，不生成保底分镜表', async (t) => {
  const h = harness(t, { disableTools: true });
  const res = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
  });

  assert.equal(res.status, 502);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error, 'analyze-unavailable');

  const snapshot = h.store.get(h.workspace.id);
  assert.equal(snapshot.nodes.filter((n) => n.type === 'table').length, 0, '失败不得新建表格节点');
});

test('videoStoryboard: 分析调用抛错时直接报错，不再降级为保底模板', async (t) => {
  const h = harness(t, {
    analyzeExecute: async () => {
      throw new Error('provider upstream 503');
    },
  });
  const res = await h.call({ nodeId: 'node_video_1', videoPath: h.dummyVideo });

  assert.equal(res.status, 502);
  assert.equal(res.body.error, 'analyze-failed');
  assert.equal(h.store.get(h.workspace.id).nodes.filter((n) => n.type === 'table').length, 0);
});

test('videoStoryboard: 分析结果中解析不出分镜镜头时直接报错', async (t) => {
  const h = harness(t, {
    analyzeExecute: async () => ({ report: '# 视频概述\n\n只有一段描述，没有任何分镜表格。' }),
  });
  const res = await h.call({ nodeId: 'node_video_1', videoPath: h.dummyVideo });

  assert.equal(res.status, 502);
  assert.equal(res.body.error, 'shots-empty');
});

test('videoStoryboard: 抽帧失败时画面单元格留空，绝不写入占位图', async (t) => {
  const h = harness(t, {
    processExecute: async () => ({ mode: 'live', files: [], result: { scenes: [], count: 0 } }),
  });
  const res = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '无帧分镜表',
  });

  assert.equal(res.status, 200);
  const absPath = resolveTableAbsPath(h.store, h.workspace.id, res.body.tableId);
  const doc = await TableStorageService.loadTable(absPath);
  const imgCol = doc.columns.find((c) => c.title === '分镜画面');
  assert.ok(imgCol);
  for (const row of doc.rows) {
    assert.deepEqual(row.cells[imgCol.id], [], '抽帧失败必须留空，不得写占位图');
  }

  const framesDir = join(h.mediaDir, 'storyboard', res.body.tableId);
  const produced = existsSync(framesDir) ? readdirSync(framesDir) : [];
  assert.deepEqual(produced, [], '不得写入任何伪造帧文件');
});

test('videoStoryboard: 拒绝跨域写入 (not-local)', async (t) => {
  const h = harness(t);
  const res = await h.call(
    { nodeId: 'node_video_1', videoPath: h.dummyVideo },
    { origin: 'https://evil.com' },
  );
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'not-local');
});

test('videoStoryboard: 请求参数缺失校验 (invalid-request)', async (t) => {
  const h = harness(t);
  const noNode = await h.call({ videoPath: h.dummyVideo });
  assert.equal(noNode.status, 400);

  const noVideo = await h.call({ nodeId: 'node_video_1' });
  assert.equal(noVideo.status, 400);
});

test('videoStoryboard: 当 scene_detect 未检测出切镜时，根据脚本时间点自动触发 video_thumbnail_extract 抽取真实分镜帧', async (t) => {
  const h = harness(t, { noScenesDetected: true });
  const res = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '无切镜平滑视频分镜表',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  // 验证触发了 video_thumbnail_extract 抽帧能力
  const thumbCalls = h.toolCalls.filter(
    (c) => c.tool === 'video_process' && c.args.capability === 'video_thumbnail_extract',
  );
  assert.ok(thumbCalls.length >= 2, '应当针对每个分镜时间戳触发关键帧抽取');

  // 校验生成的分镜表格内挂载了抽出的图片
  const absPath = resolveTableAbsPath(h.store, h.workspace.id, res.body.tableId);
  const doc = await TableStorageService.loadTable(absPath);
  const imgCol = doc.columns.find((c) => c.title === '分镜画面');
  assert.ok(imgCol);
  assert.equal(doc.rows[0].cells[imgCol.id][0].name, 'frame-001.jpg');
  assert.equal(doc.rows[1].cells[imgCol.id][0].name, 'frame-002.jpg');
});

test('videoStoryboard & videoDeconstruct: 同一视频节点下各自拥有独立的下游表格节点且互不冲突覆盖', async (t) => {
  const h = harness(t);

  // 1. 先调用 video_storyboard 生成分镜表
  const sbRes = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '第一版分镜表',
  });
  assert.equal(sbRes.status, 200);
  const sbTableId = sbRes.body.tableId;

  // 2. 再对同一个视频节点调用 video_deconstruct 生成拆解表
  const deconstructUrl = `/omnimux-workflow/api/workspaces/${h.workspace.id}/deconstruct-video`;
  const dcRes = await h.dispatcher.dispatch({
    method: 'POST',
    url: deconstructUrl,
    body: {
      nodeId: 'node_video_1',
      videoPath: h.dummyVideo,
      title: '第一版拆解表',
    },
    origin: 'http://127.0.0.1:45120',
  });
  assert.equal(dcRes.status, 200);
  const dcTableId = dcRes.body.tableId;

  // 验证：两个表格具备不同的 tableId
  assert.notEqual(sbTableId, dcTableId, '分镜表与拆解表必须拥有独立的 tableId');

  // 验证：画布快照上同时存在两个独立的表格节点与两条连线
  const wsAfterBoth = h.store.get(h.workspace.id);
  const sbNode = wsAfterBoth.nodes.find((n) => n.data?.origin === 'video_storyboard');
  const dcNode = wsAfterBoth.nodes.find((n) => n.data?.origin === 'video_deconstruct');
  assert.ok(sbNode, '分镜表节点必须保留');
  assert.ok(dcNode, '拆解表节点必须独立存在');
  assert.equal(sbNode.data.tableId, sbTableId);
  assert.equal(dcNode.data.tableId, dcTableId);

  // 验证：连线有两条，分别连接到两个表格
  const edgesFromVideo = wsAfterBoth.edges.filter((e) => e.source === 'node_video_1');
  assert.equal(edgesFromVideo.length, 2, '源视频节点应分别连向两个下游表格');

  // 3. 再次触发 video_storyboard，仅就地更新分镜表，不影响拆解表
  const sbRes2 = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '更新版分镜表',
  });
  assert.equal(sbRes2.status, 200);
  assert.equal(sbRes2.body.tableId, sbTableId, '再次做分镜应复用已有分镜表 tableId');

  const wsAfterSbUpdate = h.store.get(h.workspace.id);
  const sbNodeUpdated = wsAfterSbUpdate.nodes.find((n) => n.data?.origin === 'video_storyboard');
  const dcNodeUntouched = wsAfterSbUpdate.nodes.find((n) => n.data?.origin === 'video_deconstruct');
  assert.equal(sbNodeUpdated.data.title, '更新版分镜表');
  assert.equal(dcNodeUntouched.data.title, '第一版拆解表', '更新分镜表绝不改变拆解表');

  // 4. 再次触发 video_deconstruct，仅就地更新拆解表，不影响分镜表
  const dcRes2 = await h.dispatcher.dispatch({
    method: 'POST',
    url: deconstructUrl,
    body: {
      nodeId: 'node_video_1',
      videoPath: h.dummyVideo,
      title: '更新版拆解表',
    },
    origin: 'http://127.0.0.1:45120',
  });
  assert.equal(dcRes2.status, 200);
  assert.equal(dcRes2.body.tableId, dcTableId, '再次拆解应复用已有拆解表 tableId');

  const wsFinal = h.store.get(h.workspace.id);
  const sbFinal = wsFinal.nodes.find((n) => n.data?.origin === 'video_storyboard');
  const dcFinal = wsFinal.nodes.find((n) => n.data?.origin === 'video_deconstruct');
  assert.equal(sbFinal.data.title, '更新版分镜表');
  assert.equal(dcFinal.data.title, '更新版拆解表');
});

function invoke(h, body) {
  return h.dispatcher.dispatch({
    method: 'POST',
    url: h.url,
    body,
    origin: 'http://127.0.0.1:45120',
  });
}

function reseed(h, nodes, edges) {
  const current = h.store.get(h.workspace.id);
  h.store.save(h.workspace.id, { expectedVersion: current.version, nodes, edges });
}

function assertSourceVideoUntouched(h) {
  const source = h.store.get(h.workspace.id).nodes.find((n) => n.id === 'node_video_1');
  assert.ok(source, '源视频节点必须仍然存在');
  assert.equal(source.type, 'material');
  assert.equal('executionStatus' in source.data, false, '源视频节点不得被写入 executionStatus');
  assert.equal('executionError' in source.data, false, '源视频节点不得被写入 executionError');
}

test('videoStoryboard: 工作区已预建 targetNodeId 节点时就地收敛，不新增第二个表格节点', async (t) => {
  const h = harness(t);
  const targetNodeId = 'node_table_client_1700000000100_cd34';
  const base = h.store.get(h.workspace.id);
  const nodes = base.nodes.slice();
  nodes.push({
    id: targetNodeId,
    type: 'table',
    position: { x: 530, y: 370 },
    data: {
      label: '生成中…',
      origin: 'video_storyboard',
      sourceVideoNodeId: 'node_video_1',
      status: 'generating',
      executionStatus: 'running',
    },
  });
  reseed(h, nodes, [
    {
      id: `edge_node_video_1_${targetNodeId}`,
      source: 'node_video_1',
      target: targetNodeId,
      sourceHandle: 'out',
      targetHandle: 'in',
    },
  ]);

  const res = await invoke(h, {
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '预建节点分镜表',
    targetNodeId,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.tableId, targetNodeId, '服务端必须原样采用客户端预建的 targetNodeId');
  assert.equal(res.body.tablePath, `.omnimux/tables/${targetNodeId}.htable`);

  const snapshot = h.store.get(h.workspace.id);
  const tableNodes = snapshot.nodes.filter((n) => n.type === 'table');
  assert.equal(tableNodes.length, 1, '不得为同一操作新增第二个表格节点');
  assert.equal(tableNodes[0].id, targetNodeId);
  assert.equal(tableNodes[0].data.tableId, targetNodeId);
  assert.equal(tableNodes[0].data.title, '预建节点分镜表');
  assert.equal(tableNodes[0].data.status, 'ready');
  assert.equal(tableNodes[0].data.origin, 'video_storyboard');
  assert.equal(tableNodes[0].data.sourceVideoNodeId, 'node_video_1');
  assertSourceVideoUntouched(h);

  const edge = snapshot.edges.find((e) => e.source === 'node_video_1' && e.target === targetNodeId);
  assert.ok(edge, '源视频节点到预建表格节点的连线应保留');

  const savedDoc = await TableStorageService.loadTable(
    resolveTableAbsPath(h.store, h.workspace.id, targetNodeId),
  );
  assert.equal(savedDoc.title, '预建节点分镜表');
  assert.equal(savedDoc.rows.length, 2);
  assert.ok(existsSync(join(h.mediaDir, 'storyboard', targetNodeId)), '分镜帧目录应采用 targetNodeId');
});

test('videoStoryboard: 未预建节点时以合法 targetNodeId 作为新节点 id 与 tableId', async (t) => {
  const h = harness(t);
  const targetNodeId = 'node_table_client_1700000000101';

  const res = await invoke(h, {
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '直接预指定分镜节点',
    targetNodeId,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.tableId, targetNodeId);

  const snapshot = h.store.get(h.workspace.id);
  assert.equal(snapshot.nodes.length, 2, '应只有源视频节点与新建表格节点');
  const tableNode = snapshot.nodes.find((n) => n.id === targetNodeId);
  assert.ok(tableNode, '新节点 id 必须采用 targetNodeId');
  assert.equal(tableNode.type, 'table');
  assert.equal(tableNode.data.tableId, targetNodeId);
  assert.equal(tableNode.data.title, '直接预指定分镜节点');
  assert.equal(tableNode.data.origin, 'video_storyboard');
  assertSourceVideoUntouched(h);

  const edge = snapshot.edges.find((e) => e.source === 'node_video_1' && e.target === targetNodeId);
  assert.ok(edge, '源视频节点到新表格节点的连线应写入');
  assert.ok(existsSync(resolveTableAbsPath(h.store, h.workspace.id, targetNodeId)));
});

test('videoStoryboard: 非空但非法的 targetNodeId（路径穿越/空格/超长/非字符串）一律 400 invalid-request', async (t) => {
  const h = harness(t);
  const invalidValues = ['../escape', 'node table', 'a'.repeat(129), '-leading-dash', 'a/b', '节点_1', 12345];

  for (const targetNodeId of invalidValues) {
    const res = await invoke(h, { nodeId: 'node_video_1', videoPath: h.dummyVideo, targetNodeId });
    assert.equal(res.status, 400, `targetNodeId=${String(targetNodeId)} 必须被拒绝`);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error, 'invalid-request');
  }

  assert.equal(h.toolCalls.length, 0, '非法 targetNodeId 不得触发视频理解或抽帧');
  const snapshot = h.store.get(h.workspace.id);
  assert.equal(snapshot.nodes.filter((n) => n.type === 'table').length, 0, '非法请求不得创建表格节点');
  assert.equal(snapshot.edges.length, 0, '非法请求不得创建连线');
  assertSourceVideoUntouched(h);
});

test('videoStoryboard: targetNodeId 被非表格节点占用时返回 400，绝不覆写', async (t) => {
  const h = harness(t);
  const base = h.store.get(h.workspace.id);
  const nodes = base.nodes.slice();
  nodes.push({
    id: 'node_material_occupied',
    type: 'material',
    position: { x: 900, y: 50 },
    data: { materialType: 'text', label: '其它素材节点' },
  });
  reseed(h, nodes, base.edges);

  const res = await invoke(h, {
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    targetNodeId: 'node_material_occupied',
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid-request');
  assert.match(res.body.message, /非表格节点/);
  assert.equal(h.toolCalls.length, 0);

  const snapshot = h.store.get(h.workspace.id);
  const occupied = snapshot.nodes.find((n) => n.id === 'node_material_occupied');
  assert.ok(occupied, '被占用的非表格节点必须原样保留');
  assert.equal(occupied.type, 'material');
  assert.equal(occupied.data.label, '其它素材节点');
  assert.equal(snapshot.nodes.filter((n) => n.type === 'table').length, 0);
  assertSourceVideoUntouched(h);
});

test('videoStoryboard: targetNodeId 被异类型/其它视频下游节点占用时返回 400，不夺用其它操作节点', async (t) => {
  const h = harness(t);
  const base = h.store.get(h.workspace.id);
  const nodes = base.nodes.slice();
  nodes.push({
    id: 'node_deconstruct_owned',
    type: 'table',
    position: { x: 530, y: 50 },
    data: {
      origin: 'video_deconstruct',
      sourceVideoNodeId: 'node_video_1',
      tableId: 'node_deconstruct_owned',
      title: '已有拆解表',
    },
  });
  nodes.push({
    id: 'node_other_video_storyboard',
    type: 'table',
    position: { x: 1200, y: 370 },
    data: {
      origin: 'video_storyboard',
      sourceVideoNodeId: 'node_other_video',
      tableId: 'node_other_video_storyboard',
      title: '其它视频分镜表',
    },
  });
  reseed(h, nodes, base.edges);

  const foreignType = await invoke(h, {
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    targetNodeId: 'node_deconstruct_owned',
  });
  assert.equal(foreignType.status, 400);
  assert.equal(foreignType.body.error, 'invalid-request');
  assert.match(foreignType.body.message, /其它来源/);

  const foreignSource = await invoke(h, {
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    targetNodeId: 'node_other_video_storyboard',
  });
  assert.equal(foreignSource.status, 400);
  assert.equal(foreignSource.body.error, 'invalid-request');
  assert.match(foreignSource.body.message, /其它视频节点/);

  const snapshot = h.store.get(h.workspace.id);
  const deconstruct = snapshot.nodes.find((n) => n.id === 'node_deconstruct_owned');
  assert.equal(deconstruct.data.title, '已有拆解表', '绝不能覆写拆解表节点');
  assert.equal(deconstruct.data.tableId, 'node_deconstruct_owned');
  const otherStoryboard = snapshot.nodes.find((n) => n.id === 'node_other_video_storyboard');
  assert.equal(otherStoryboard.data.title, '其它视频分镜表', '绝不能覆写其它视频的分镜表');
  assert.equal(otherStoryboard.data.sourceVideoNodeId, 'node_other_video');
  assert.equal(snapshot.nodes.filter((n) => n.type === 'table').length, 2, '失败请求不得新增表格节点');
  assertSourceVideoUntouched(h);
});

test('videoStoryboard: 已有同源下游 tableId 优先于 targetNodeId，避免产生第二个节点', async (t) => {
  const h = harness(t);
  const first = await invoke(h, { nodeId: 'node_video_1', videoPath: h.dummyVideo, title: '首版分镜' });
  assert.equal(first.status, 200);
  const firstTableId = first.body.tableId;

  const second = await invoke(h, {
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '二版分镜',
    targetNodeId: 'node_table_client_priority_sb',
  });

  assert.equal(second.status, 200);
  assert.equal(second.body.tableId, firstTableId, '已存在的同源下游 tableId 优先级最高');

  const snapshot = h.store.get(h.workspace.id);
  assert.equal(snapshot.nodes.filter((n) => n.type === 'table').length, 1, '不得新增第二个表格节点');
  assert.equal(snapshot.nodes.find((n) => n.id === 'node_table_client_priority_sb'), undefined);
  assert.equal(snapshot.nodes.find((n) => n.id === firstTableId).data.title, '二版分镜');
});

test('videoStoryboard: targetNodeId 为空串/纯空白时视为未提供（不报错也不参与复用）', async (t) => {
  const h = harness(t);

  for (const targetNodeId of ['', '   ']) {
    const res = await invoke(h, { nodeId: 'node_video_1', videoPath: h.dummyVideo, targetNodeId });
    assert.equal(res.status, 200, `targetNodeId=${JSON.stringify(targetNodeId)} 应视为未提供`);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.tableId.startsWith('tbl_'), '未提供 targetNodeId 时 tableId 仍由服务端生成');
  }

  const snapshot = h.store.get(h.workspace.id);
  assert.equal(snapshot.nodes.filter((n) => n.type === 'table').length, 1, '单一下游约束仍然成立');
  assertSourceVideoUntouched(h);
});
