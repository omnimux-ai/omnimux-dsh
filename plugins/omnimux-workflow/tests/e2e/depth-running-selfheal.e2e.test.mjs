/**
 * 深度视频运行态自愈端到端契约（Issue #3586）。
 *
 * 真实浏览器证据见 docs/evidence/workflow-depth-running-selfheal-3586/：
 * 重新加载后遗留 running 节点自动变「中断，请重试」；再点源胶囊真正重跑。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearDepthConversionActivity,
  isDepthConversionActive,
  registerDepthConversion,
  releaseDepthConversion,
  shouldSelfHealDepthNode,
} from '../../src/canvas/editor/utils/depthConversionActivity.ts';
import {
  planVideoDepthProvisioning,
  VIDEO_DEPTH_ORIGIN,
} from '../../src/canvas/editor/utils/planVideoDepthDownstream.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');
const read = (rel) => readFileSync(join(pluginRoot, rel), 'utf8');

const materialNodeSrc = read('src/canvas/editor/components/MaterialNode/index.tsx');
const zhDict = read('src/canvas/i18n/dict.zh.ts');

const sourceVideo = { id: 'video_1', type: 'material', data: { materialType: 'video' }, position: { x: 100, y: 200 } };
const runningDepth = {
  id: 'depth_1',
  type: 'material',
  data: {
    materialType: 'video',
    executionStatus: 'running',
    origin: VIDEO_DEPTH_ORIGIN,
    sourceVideoNodeId: 'video_1',
    realPath: '/tmp/old.mp4',
  },
  position: { x: 580, y: 200 },
};

test('E2E 自愈：失联 running 节点可重试，真实进行中不误判', () => {
  clearDepthConversionActivity();
  assert.equal(shouldSelfHealDepthNode(runningDepth.data, 'depth_1'), true);
  registerDepthConversion('depth_1');
  assert.equal(shouldSelfHealDepthNode(runningDepth.data, 'depth_1'), false);
  releaseDepthConversion('depth_1');
  assert.equal(isDepthConversionActive('depth_1'), false);
  assert.equal(shouldSelfHealDepthNode({ origin: VIDEO_DEPTH_ORIGIN, executionStatus: 'completed' }, 'depth_1'), false);
});

test('E2E 重跑：running 且失联 → update（清旧媒体），running 且活跃 → noop', () => {
  const active = planVideoDepthProvisioning({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    label: '深度视频',
    currentNodes: [sourceVideo, runningDepth],
    currentEdges: [{ source: 'video_1', target: 'depth_1' }],
    isNodeActive: () => true,
  });
  assert.equal(active.mode, 'noop');

  const stale = planVideoDepthProvisioning({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    label: '深度视频',
    currentNodes: [sourceVideo, runningDepth],
    currentEdges: [{ source: 'video_1', target: 'depth_1' }],
    isNodeActive: () => false,
  });
  assert.equal(stale.mode, 'update');
  assert.equal(stale.targetNodeId, 'depth_1');
  assert.equal(stale.nodePatches[0].data.executionStatus, 'running');
  assert.equal(stale.nodePatches[0].data.realPath, undefined);
});

test('E2E 接线：组件挂载自愈、请求登记/释放、文案齐备', () => {
  assert.match(materialNodeSrc, /shouldSelfHealDepthNode/, '节点必须挂载自愈判定');
  assert.match(materialNodeSrc, /registerDepthConversion/, '请求开始必须登记活跃');
  assert.match(materialNodeSrc, /releaseDepthConversion/, '请求结束必须释放活跃');
  assert.match(materialNodeSrc, /isNodeActive: isDepthConversionActive/, '预建必须传入真实活跃判定');
  assert.match(zhDict, /'depthVideo\.toast\.interrupted': '上次深度视频转换被中断，请重试'/);
});
