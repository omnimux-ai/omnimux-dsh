import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { buildSync } from 'esbuild';

const buildDir = mkdtempSync(join(tmpdir(), 'video-deconstruct-route-build-'));
const bundle = join(buildDir, 'runtime.mjs');
buildSync({
  stdin: {
    contents: `
      export { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
      export { createWorkflowDispatcher } from './canvasRoutes.ts';
      export { TableStorageService } from '../storage/TableStorageService.ts';
      export { resolveTableAbsPath } from '../storage/tablePath.ts';
      export { PLACEHOLDER_FRAME_BASE64 } from '../videoDeconstruct/service.ts';
    `,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
});
const { createWorkspaceStore, createWorkflowDispatcher, TableStorageService, resolveTableAbsPath, PLACEHOLDER_FRAME_BASE64 } =
  await import(pathToFileURL(bundle).href);
after(() => rmSync(buildDir, { recursive: true, force: true }));

function harness(t, opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'video-deconstruct-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createWorkspaceStore({ workspacesDir: join(root, 'workspaces') });
  const workspace = store.create('视频拆解测试工作区');
  store.save(workspace.id, {
    expectedVersion: workspace.version,
    nodes: [
      {
        id: 'node_video_1',
        type: 'material',
        position: { x: 50, y: 50 },
        data: { materialType: 'video', label: '测试视频节点' },
      },
    ],
    edges: [],
  });

  const toolCalls = [];
  const videoAnalyzeTool = {
    async execute(args) {
      toolCalls.push(args);
      if (opts.toolExecute) return opts.toolExecute(args);
      return {
        report: `# 视频逐镜头分解

## 逐镜头分解表
| 镜头序号 | 时间段 | 景别 | 画面描述 | 关键动作 | 台词脚本 |
| --- | --- | --- | --- | --- | --- |
| 1 | 00:00 - 00:03 | 特写 | 开场反差视觉 | 快速推入 | "痛点前置" |
| 2 | 00:03 - 00:10 | 中景 | 实操演示过程 | 涂抹吸收 | "效果真实可见" |
`,
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
      if (opts.disableTool) return undefined;
      if (opts.videoProcessTool && name === 'video_process') return opts.videoProcessTool;
      return name === 'video_analyze' ? videoAnalyzeTool : undefined;
    },
    getSeam: (name) => {
      if (opts.disableTool) return undefined;
      if (opts.videoProcessTool && (name === 'videoProcess' || name === 'video_process')) return opts.videoProcessTool;
      return name === 'videoAnalyze' ? videoAnalyzeTool : undefined;
    },
  });

  const dummyVideo = join(root, 'test.mp4');
  writeFileSync(dummyVideo, 'dummy video binary content');

  const url = `/omnimux-workflow/api/workspaces/${workspace.id}/deconstruct-video`;
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

test('videoDeconstruct: 成功拆解视频并持久化 .htable 表格（包含分镜画面附件列与保底关键帧）', async (t) => {
  const h = harness(t);
  const res = await h.call({
    nodeId: 'node_video_1',
    videoPath: h.dummyVideo,
    title: '我的爆款视频拆解',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.title, '我的爆款视频拆解');
  assert.ok(res.body.tableId.startsWith('tbl_'));
  assert.equal(res.body.tablePath, `.omnimux/tables/${res.body.tableId}.htable`);
  // 增加了「分镜画面」附件列：原 6 列文本 + 1 列附件 = 7 列
  assert.equal(res.body.columnCount, 7);
  assert.equal(res.body.rowCount, 2);
  assert.equal(res.body.previewRows.length, 2);
  assert.equal(res.body.previewRows[0], '第 1 镜: 开场反差视觉');

  // 验证磁盘上的 .htable 物理文件是否真实存在且有效
  const absPath = resolveTableAbsPath(h.store, h.workspace.id, res.body.tableId);
  const savedDoc = await TableStorageService.loadTable(absPath);
  assert.equal(savedDoc.title, '我的爆款视频拆解');
  assert.equal(savedDoc.columns.length, 7);
  assert.equal(savedDoc.rows.length, 2);
  assert.equal(savedDoc.rowHeight, 'low');

  // 验证分镜表格包含 type: 'attachment' 的「分镜画面」列，且排布在第 2 列
  const colImage = savedDoc.columns.find((c) => c.title === '分镜画面');
  assert.ok(colImage, '必须包含「分镜画面」列');
  assert.equal(colImage.type, 'attachment');
  assert.equal(colImage.width, 180);
  assert.equal(colImage.visible, true, '「分镜画面」列 visible 必须为 true');
  assert.equal(savedDoc.columns[1].id, colImage.id, '「分镜画面」附件列应紧随「镜头序号」排布在第 2 列');

  // 验证每一行记录均包含合规的图片附件对象，且物理保底文件真实存在并具备合法 JPEG 头部
  for (const row of savedDoc.rows) {
    const attachList = row.cells[colImage.id];
    assert.ok(Array.isArray(attachList), '分镜画面单元格应为附件数组');
    assert.equal(attachList.length, 1);
    const attach = attachList[0];
    assert.ok(attach.assetId.startsWith('ast_'));
    assert.equal(attach.kind, 'image');
    assert.ok(typeof attach.name === 'string' && attach.name.endsWith('.jpg'));
    assert.ok(typeof attach.path === 'string');
    assert.ok(existsSync(attach.path), `保底关键帧图片必须真实存在: ${attach.path}`);
    const fileBuf = readFileSync(attach.path);
    assert.ok(fileBuf.length > 0, '保底关键帧文件内容不可为空');
    assert.equal(fileBuf[0], 0xff, 'JPEG 文件头部第 1 字节必须是 0xFF');
    assert.equal(fileBuf[1], 0xd8, 'JPEG 文件头部第 2 字节必须是 0xD8');
    assert.ok(attach.url.startsWith(`/omnimux-workflow/media/deconstruct/${res.body.tableId}/`));
    assert.equal(attach.thumbnailUrl, attach.url);
  }

  assert.equal(h.toolCalls.length, 1);
  assert.equal(h.toolCalls[0].video, h.dummyVideo);

  // 验证返回体携带 workspace 快照，并且服务端已经原子写入 canvas.json
  assert.ok(res.body.workspace);
  const latestSnapshot = h.store.get(h.workspace.id);
  assert.equal(latestSnapshot.version, res.body.workspace.version);
  const createdTable = latestSnapshot.nodes.find((n) => n.id === res.body.tableId);
  assert.ok(createdTable, '新建的表格节点应写入 canvas.json');
  assert.equal(createdTable.type, 'table');
  assert.equal(createdTable.data.tableId, res.body.tableId);
  assert.equal(createdTable.data.title, '我的爆款视频拆解');
  const edge = latestSnapshot.edges.find(
    (e) => e.source === 'node_video_1' && e.target === res.body.tableId,
  );
  assert.ok(edge, '视频节点到表格节点的连线应写入 canvas.json');
});

test('videoDeconstruct: 工具未配置或抛错时，降级为内置五维拆解保底模板且具备保底分镜图', async (t) => {
  const h = harness(t, { disableTool: true });
  const res = await h.call({
    nodeId: 'node_video_fallback',
    videoPath: h.dummyVideo,
    title: '保底拆解视频',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.title, '保底拆解视频');
  assert.ok(res.body.tableId.startsWith('tbl_'));
  assert.equal(res.body.columnCount, 7);
  assert.equal(res.body.rowCount, 3);
  assert.ok(res.body.markdown.includes('逐镜头分解与五维分析报告'));

  // 验证磁盘持久化有效且包含分镜画面列
  const absPath = resolveTableAbsPath(h.store, h.workspace.id, res.body.tableId);
  const savedDoc = await TableStorageService.loadTable(absPath);
  assert.equal(savedDoc.title, '保底拆解视频');
  assert.equal(savedDoc.rows.length, 3);
  assert.equal(savedDoc.rowHeight, 'low');

  const colImage = savedDoc.columns.find((c) => c.title === '分镜画面');
  assert.ok(colImage);
  assert.equal(colImage.type, 'attachment');
  assert.equal(colImage.width, 180);
  assert.equal(colImage.visible, true);
  assert.equal(savedDoc.columns[1].id, colImage.id);

  for (const row of savedDoc.rows) {
    const images = row.cells[colImage.id];
    assert.ok(Array.isArray(images) && images.length === 1);
    assert.equal(images[0].kind, 'image');
    assert.ok(images[0].name.startsWith('frame-'));
  }
});

test('videoDeconstruct: 无 Markdown 表格时，按五维分析维度构造结构化表格', async (t) => {
  const h = harness(t, {
    toolExecute: async () => ({
      report: `
## 一句话视频描述
以沉浸式妆造前后反差为核心钩子的爆款美妆短视频。

## I. 核心目标
* 转化目标: 引导点击左下角购买同款粉底液
* 情绪基调: 惊艳、自信

## II. 影响力分析
明线展现遮瑕力，暗线击碎早八妆容焦虑。

## III. 叙事结构
0-3s 纯素颜强反差 → 3-10s 上妆半脸对比 → 结尾展示全妆

## IV. 画面分析
高保真近景特写，原生自然光影。

## V. 核心复刻策略
[素颜痛点] + [半脸对比] + [全脸惊艳成效] + [CTA直接带货]
`,
    }),
  });

  const res = await h.call({
    nodeId: 'node_video_text_only',
    videoPath: h.dummyVideo,
    title: '五维维度表格',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  // 提取为「分析维度」和「分析内容」2 列
  assert.equal(res.body.columnCount, 2);
  // 6 个维度
  assert.equal(res.body.rowCount, 6);
  assert.equal(res.body.previewRows[0], '以沉浸式妆造前后反差为核心钩子的爆款美妆短视频。');

  const absPath = resolveTableAbsPath(h.store, h.workspace.id, res.body.tableId);
  const savedDoc = await TableStorageService.loadTable(absPath);
  assert.equal(savedDoc.columns[0].title, '分析维度');
  assert.equal(savedDoc.columns[1].title, '分析内容');
  assert.equal(savedDoc.rows.length, 6);
});

test('videoDeconstruct: 请求校验与异常阻断', async (t) => {
  const h = harness(t);

  // 1. 跨域写入请求被阻断
  const deniedRes = await h.call({ nodeId: 'node_1', videoPath: '/tmp/test.mp4' }, { origin: 'http://evil.com' });
  assert.equal(deniedRes.status, 403);
  assert.equal(deniedRes.body.error, 'not-local');

  // 2. 缺少必需参数
  const badNode = await h.call({ nodeId: '', videoPath: '/tmp/test.mp4' });
  assert.equal(badNode.status, 400);
  assert.equal(badNode.body.error, 'invalid-request');

  const badPath = await h.call({ nodeId: 'node_1', videoPath: '   ' });
  assert.equal(badPath.status, 400);
  assert.equal(badPath.body.error, 'invalid-request');

  // 3. 工作区不存在
  const badWsDispatcher = h.store;
  const badRes = await h.call({ nodeId: 'node_1', videoPath: '/tmp/test.mp4' }, {
    url: '/omnimux-workflow/api/workspaces/ws_non_existent/deconstruct-video',
  });
  assert.equal(badRes.status, 404);
});

test('videoDeconstruct: 传入工作流媒体相对路径 /omnimux-workflow/media/videos/xxx.mp4 能成功解析真实物理路径并拆解', async (t) => {
  const h = harness(t);
  const mediaVideosDir = join(h.mediaDir, 'videos');
  mkdirSync(mediaVideosDir, { recursive: true });
  const targetVideo = join(mediaVideosDir, 'video_92570ba4.mp4');
  writeFileSync(targetVideo, 'binary content of social media extracted video');

  // 1. 标准工作流媒体相对 URL，带 query 参数
  const res1 = await h.call({
    nodeId: 'node_video_extracted_1',
    videoPath: '/omnimux-workflow/media/videos/video_92570ba4.mp4?t=1725890000',
    title: '社媒提取视频拆解1',
  });

  assert.equal(res1.status, 200);
  assert.equal(res1.body.ok, true);
  assert.equal(h.toolCalls.length, 1);
  assert.equal(h.toolCalls[0].video, targetVideo);

  // 2. /dsh-workflow/media/ 前缀兼容
  const res2 = await h.call({
    nodeId: 'node_video_extracted_2',
    videoPath: '/dsh-workflow/media/videos/video_92570ba4.mp4',
    title: '社媒提取视频拆解2',
  });

  assert.equal(res2.status, 200);
  assert.equal(res2.body.ok, true);
  assert.equal(h.toolCalls.length, 2);
  assert.equal(h.toolCalls[1].video, targetVideo);

  // 3. 远端 HTTP(S) URL 在本地无文件时保留原 URL 传给拆解工具
  const res3 = await h.call({
    nodeId: 'node_video_remote',
    videoPath: 'https://cdn.example.com/videos/remote_video.mp4?auth=token',
    title: '远端视频拆解',
  });

  assert.equal(res3.status, 200);
  assert.equal(res3.body.ok, true);
  assert.equal(h.toolCalls.length, 3);
  assert.equal(h.toolCalls[2].video, 'https://cdn.example.com/videos/remote_video.mp4?auth=token');
});

test('videoDeconstruct: 服务端原子持久化与单一下游约束（多次拆解就地更新，绝不重复生成第二个节点）', async (t) => {
  const h = harness(t);

  // 预置工作区，包含一个视频节点
  const curWs = h.store.get(h.workspace.id);
  h.store.save(h.workspace.id, {
    expectedVersion: curWs.version,
    nodes: [
      {
        id: 'node_video_src',
        type: 'material',
        position: { x: 100, y: 100 },
        data: { materialType: 'video', label: '源视频', nodeWidth: 400 },
      },
    ],
    edges: [],
  });

  // 第一次拆解：应新建下游 table 节点，id 对齐 tableId，横向偏移 400 + 120 = 520
  const res1 = await h.call({
    nodeId: 'node_video_src',
    videoPath: h.dummyVideo,
    title: '拆解第1版',
  });

  assert.equal(res1.status, 200);
  assert.equal(res1.body.ok, true);
  const firstTableId = res1.body.tableId;

  // 检查磁盘 canvas.json
  const snap1 = h.store.get(h.workspace.id);
  assert.equal(snap1.nodes.length, 2, '应包含源视频节点和新建表格节点');
  const tableNode1 = snap1.nodes.find((n) => n.id === firstTableId);
  assert.ok(tableNode1);
  assert.equal(tableNode1.type, 'table');
  assert.equal(tableNode1.position.x, 100 + 400 + 120);
  assert.equal(tableNode1.position.y, 100);
  assert.equal(tableNode1.data.title, '拆解第1版');
  assert.equal(snap1.edges.length, 1);
  assert.equal(snap1.edges[0].source, 'node_video_src');
  assert.equal(snap1.edges[0].target, firstTableId);

  // 第二次对同一个源视频节点调用拆解（模拟用户再次点击拆解）
  const res2 = await h.call({
    nodeId: 'node_video_src',
    videoPath: h.dummyVideo,
    title: '拆解第2版',
  });

  assert.equal(res2.status, 200);
  assert.equal(res2.body.ok, true);

  // 严格断言单一下游约束：节点总数仍然是 2，绝不能产生第三个节点！
  const snap2 = h.store.get(h.workspace.id);
  assert.equal(snap2.nodes.length, 2, '单一下游约束：不可产生多余节点，节点总数仍为 2');
  const updatedTable = snap2.nodes.find((n) => n.id === firstTableId);
  assert.ok(updatedTable, '原有下游表格节点应被就地保留并更新');
  assert.equal(updatedTable.data.title, '拆解第2版');
  assert.equal(updatedTable.data.tableId, firstTableId, '下游已有表格节点时，数据应写回已有节点的 tableId');
  assert.equal(res2.body.tableId, firstTableId, '下游已有表格节点时，服务返回的 tableId 应严格复用');
  assert.equal(updatedTable.data.contentRev, 2, '再次拆解更新时，contentRev 必须自增递增');
  assert.equal(snap2.edges.length, 1, '连线总数仍为 1，不产生多余连线');
  assert.equal(snap2.edges[0].target, firstTableId);
});

test('videoDeconstruct: 支持通过 video_process (capability: video_scene_detect) 抽取真实关键帧并挂载为分镜画面附件', async (t) => {
  const processCalls = [];
  const videoProcessTool = {
    async execute(args) {
      processCalls.push(args);
      // 模拟抽取出两个真实关键帧文件
      const frame1Path = join(args.dest, 'scene_001.jpg');
      const frame2Path = join(args.dest, 'scene_002.jpg');
      writeFileSync(frame1Path, 'dummy image 1');
      writeFileSync(frame2Path, 'dummy image 2');
      return {
        files: [
          { path: frame1Path, meta: { timeSeconds: 0 } },
          { path: frame2Path, meta: { timeSeconds: 3.5 } },
        ],
        result: {
          scenes: [
            { start: 0, end: 3.5 },
            { start: 3.5, end: 10 },
          ],
        },
      };
    },
  };

  const h = harness(t, { videoProcessTool });
  const res = await h.call({
    nodeId: 'node_video_extract_real',
    videoPath: h.dummyVideo,
    title: '真实抽帧拆解测试',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(processCalls.length, 1);
  assert.equal(processCalls[0].capability, 'video_scene_detect');
  assert.equal(processCalls[0].input.videoUrl, h.dummyVideo);
  assert.equal(processCalls[0].input.extractFrames, true);
  assert.equal(processCalls[0].input.threshold, 0.35);

  const absPath = resolveTableAbsPath(h.store, h.workspace.id, res.body.tableId);
  const savedDoc = await TableStorageService.loadTable(absPath);
  const colImage = savedDoc.columns.find((c) => c.title === '分镜画面');
  assert.ok(colImage);

  // 验证两行数据分别对应抽取出的两张真实图片
  const row1Attach = savedDoc.rows[0].cells[colImage.id];
  assert.equal(row1Attach[0].name, 'scene_001.jpg');
  assert.equal(row1Attach[0].path, join(processCalls[0].dest, 'scene_001.jpg'));
  assert.equal(row1Attach[0].url, `/omnimux-workflow/media/deconstruct/${res.body.tableId}/scene_001.jpg`);

  const row2Attach = savedDoc.rows[1].cells[colImage.id];
  assert.equal(row2Attach[0].name, 'scene_002.jpg');
  assert.equal(row2Attach[0].path, join(processCalls[0].dest, 'scene_002.jpg'));
  assert.equal(row2Attach[0].url, `/omnimux-workflow/media/deconstruct/${res.body.tableId}/scene_002.jpg`);
});

test('PLACEHOLDER_FRAME_BASE64: 占位图标准合规（非截断，带 EOI 标识，文件大小 > 500 字节）', () => {
  const buf = Buffer.from(PLACEHOLDER_FRAME_BASE64, 'base64');
  assert.ok(buf.length > 500, '占位图大小应大于 500 字节');
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xd8); // SOI
  assert.equal(buf[buf.length - 2], 0xff);
  assert.equal(buf[buf.length - 1], 0xd9); // EOI
});
