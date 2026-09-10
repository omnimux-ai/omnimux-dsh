import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
        report: `# 视频逐镜头分解

## 逐镜头分解表
| 镜头序号 | 时间段 | 景别 | 画面描述 | 关键动作 | 台词脚本 |
| --- | --- | --- | --- | --- | --- |
| 1 | 00:00 - 00:03 | 特写 | 开场抓人视觉反差 | 快速镜头推入 | "痛点前置" |
| 2 | 00:03 - 00:08 | 中景 | 实操演示过程细节 | 真实手部操作 | "效果惊艳" |
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

  return { call, toolCalls, store, workspace, url, dummyVideo, root, mediaDir: join(root, 'media') };
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
  assert.equal(doc.rowHeight, 'extraTall');

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

test('videoStoryboard: 离线/无工具时自动启用保底生成，稳定返回分镜表', async (t) => {
  const h = harness(t, { disableTools: true });
  const res = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.rowCount >= 3);

  const absPath = resolveTableAbsPath(h.store, h.workspace.id, res.body.tableId);
  const doc = await TableStorageService.loadTable(absPath);
  assert.equal(doc.rowHeight, 'extraTall');
  const imgCol = doc.columns.find((c) => c.title === '分镜画面');
  assert.ok(imgCol);
  // 保底帧也应生成有效占位图片附件
  assert.ok(Array.isArray(doc.rows[0].cells[imgCol.id]));
  assert.equal(doc.rows[0].cells[imgCol.id].length, 1);
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
