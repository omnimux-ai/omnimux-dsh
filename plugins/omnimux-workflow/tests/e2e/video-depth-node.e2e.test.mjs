/**
 * 视频节点「深度视频」胶囊端到端契约（Issue #3547）。
 *
 * 真实浏览器路径证据见 docs/evidence/video-depth-node-3547/（ego-browser 驱动
 * 真实画布 harness：胶囊可见 → 点击预建 running 节点 → 请求 → 结算 ready）。
 * 本文件在 node:test 里固定三件事：
 * 1. 胶囊/请求/路由/能力的源码接线不漂移；
 * 2. 两段式派生节点规划的完整旅程（预建 → 成功/失败结算 → 复用）；
 * 3. 中英双字典键齐备。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  planVideoDepthProvisioning,
  planVideoDepthSettlement,
  VIDEO_DEPTH_ORIGIN,
} from '../../src/canvas/editor/utils/planVideoDepthDownstream.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');
const read = (rel) => readFileSync(join(pluginRoot, rel), 'utf8');

const materialNodeSrc = read('src/canvas/editor/components/MaterialNode/index.tsx');
const apiClientSrc = read('src/canvas/bridge/apiClient.ts');
const sharedApiSrc = read('src/shared/api.ts');
const routeSrc = read('src/workflow/routes/videoDepthRoutes.ts');
const serviceSrc = read('src/workflow/videoDepth/service.ts');
const canvasRoutesSrc = read('src/workflow/routes/canvasRoutes.ts');
const zhDict = read('src/canvas/i18n/dict.zh.ts');
const enDict = read('src/canvas/i18n/dict.en.ts');

test('E2E 接线：视频节点胶囊 → 深度视频请求 → 路由 → video_depth 能力', () => {
  assert.match(materialNodeSrc, /key: 'depth-video'/, '视频节点动作栏必须挂载 depth-video 胶囊');
  assert.match(materialNodeSrc, /t\('pill\.depthVideo'\)/, '胶囊文案必须走 i18n pill.depthVideo');
  assert.match(materialNodeSrc, /handleDepthVideo/, '必须存在点击处理函数');
  assert.match(materialNodeSrc, /planVideoDepthProvisioning/, '点击必须先预建下游节点');
  assert.match(materialNodeSrc, /convertVideoToDepth/, '必须调用深度视频 API');

  assert.match(apiClientSrc, /WORKFLOW_API_ROUTES\.videoDepth/, 'apiClient 必须走 videoDepth 路由');
  assert.match(sharedApiSrc, /workspaces\/\$\{workspaceId\}\/video-depth/, '共享路由必须指向 video-depth');
  assert.match(routeSrc, /video-depth\$/, '路由正则必须匹配 video-depth');
  assert.match(routeSrc, /assertLocalWrite/, '写入路由必须拒绝跨来源请求');
  assert.match(serviceSrc, /capability: 'video_depth'/, '服务端必须调用 video_depth 能力');
  assert.match(serviceSrc, /keepAudio: true/, '深度视频必须保留原音轨');
  assert.match(canvasRoutesSrc, /createVideoDepthRoutes/, '画布 dispatcher 必须注册深度视频路由');
});

test('E2E 旅程：预建 running 节点 → 成功结算 ready，源视频节点不被补丁', () => {
  const provision = planVideoDepthProvisioning({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    label: '产品视频 深度视频',
    currentNodes: [{ id: 'video_1', type: 'material', data: { materialType: 'video', executionStatus: 'completed' }, position: { x: 100, y: 200 } }],
    currentEdges: [],
    createNodeId: () => 'depth_1',
  });

  assert.equal(provision.mode, 'create');
  assert.equal(provision.addNodes.length, 1);
  assert.equal(provision.addNodes[0].data.executionStatus, 'running');
  assert.equal(provision.addNodes[0].data.origin, VIDEO_DEPTH_ORIGIN);
  assert.equal(provision.addEdges.length, 1);
  assert.equal(provision.nodePatches.length, 0, '预建阶段不得补丁源视频节点');

  const settlement = planVideoDepthSettlement({
    targetNodeId: provision.targetNodeId,
    label: '产品视频 深度视频',
    depthResult: {
      depthPath: '/tmp/out/depth_1.mp4',
      mediaUrl: '/omnimux-workflow/media/video-depth/ws/out/depth_1.mp4',
      previewUrl: '/api/local-file?path=%2Ftmp%2Fout%2Fdepth_1.mp4',
      title: '产品视频 深度视频',
    },
  });

  const data = settlement.nodePatches[0].data;
  assert.equal(settlement.nodePatches[0].nodeId, 'depth_1');
  assert.equal(data.executionStatus, 'completed');
  assert.equal(data.status, 'ready');
  assert.equal(data.realPath, '/tmp/out/depth_1.mp4');
  assert.equal(data.mediaUrl, '/omnimux-workflow/media/video-depth/ws/out/depth_1.mp4');
  assert.equal(data.previewUrl, '/api/local-file?path=%2Ftmp%2Fout%2Fdepth_1.mp4');
});

test('E2E 失败路径：缺依赖错误只落下游节点，可再次点击复用并重试', () => {
  const failedNode = {
    id: 'depth_1',
    type: 'material',
    data: {
      materialType: 'video',
      executionStatus: 'error',
      executionError: '本机缺少深度图 Python 依赖',
      origin: VIDEO_DEPTH_ORIGIN,
      sourceVideoNodeId: 'video_1',
    },
    position: { x: 580, y: 200 },
  };

  const retry = planVideoDepthProvisioning({
    videoNodeId: 'video_1',
    videoPosition: { x: 100, y: 200 },
    videoNodeWidth: 360,
    label: '产品视频 深度视频',
    currentNodes: [{ id: 'video_1', type: 'material', data: { materialType: 'video' } }, failedNode],
    currentEdges: [{ source: 'video_1', target: 'depth_1' }],
  });

  assert.equal(retry.mode, 'update', '失败后再次点击必须复用已有下游节点');
  assert.equal(retry.targetNodeId, 'depth_1');
  assert.equal(retry.addNodes.length, 0, '不得重复堆叠节点');
  assert.equal(retry.nodePatches[0].data.executionStatus, 'running');
  assert.equal(retry.nodePatches[0].data.executionError, undefined);
});

test('E2E 文案：中英字典均提供胶囊与错误/成功文案', () => {
  const keys = ['pill.depthVideo', 'depthVideo.nodeLabel', 'depthVideo.toast.success', 'depthVideo.toast.failed', 'depthVideo.noWorkspace', 'depthVideo.noVideo'];
  for (const key of keys) {
    assert.match(zhDict, new RegExp("'" + key + "':"), '中文字典缺少 ' + key);
    assert.match(enDict, new RegExp("'" + key + "':"), '英文字典缺少 ' + key);
  }
  assert.match(zhDict, /'pill\.depthVideo': '深度视频'/, '中文胶囊文案必须是 4 字实体名词');
});
