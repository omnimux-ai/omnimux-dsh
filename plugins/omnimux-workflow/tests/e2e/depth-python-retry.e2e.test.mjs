/**
 * 深度视频解释器发现与失败重试契约（Issue #3574）。
 *
 * 真实证据见 docs/evidence/video-depth-python-3574/：默认环境自动选中 python3.14
 * 成功产出深度视频；浏览器 503→重试→成功，两次请求都是 POST /video-depth。
 * 本文件在 node:test 里锁住客户端重试分流与解释器选择契约。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');
const read = (rel) => readFileSync(join(pluginRoot, rel), 'utf8');

const materialNodeSrc = read('src/canvas/editor/components/MaterialNode/index.tsx');
const depthSrc = read('../omnimux-video/src/engine/capabilities/depth.js');

test('E2E 重试分流：深度视频节点的「重新生成」走深度转换，不落普通视频生成', () => {
  assert.match(materialNodeSrc, /nodeData\.origin === 'video_depth'/, '必须按 origin 识别深度视频节点');
  assert.match(materialNodeSrc, /handleRetryDepthVideo/, '必须有深度转换专用重试处理');
  assert.match(materialNodeSrc, /convertVideoToDepth/, '重试必须调用深度视频接口');

  const retryBranch = materialNodeSrc.indexOf("nodeData.origin === 'video_depth'");
  const genericGenerate = materialNodeSrc.indexOf('handleGenerate();', retryBranch);
  assert.ok(retryBranch > -1, '缺少深度视频重试分支');
  assert.ok(genericGenerate > retryBranch, '通用生成重试必须排在深度视频分支之后');

  const handlerBlock = materialNodeSrc.slice(
    materialNodeSrc.indexOf('const handleRetryDepthVideo'),
    materialNodeSrc.indexOf('const handleMediaRetry'),
  );
  assert.ok(handlerBlock.includes('convertVideoToDepth'), '重试处理必须调用深度接口');
  assert.equal(handlerBlock.includes('handleGenerate()'), false, '重试处理不得调用普通生成');
  assert.ok(handlerBlock.includes('sourceVideoPath') || handlerBlock.includes('sourceVideoNodeId'), '重试必须能解析源视频');
});

test('E2E 解释器发现：候选链版本优先，显式配置优先且不回退', () => {
  const candidatesMatch = /DEPTH_PYTHON_CANDIDATES = \[([\s\S]*?)\]/.exec(depthSrc);
  assert.ok(candidatesMatch, '必须声明解释器候选链');
  const candidates = candidatesMatch[1]
    .split(',')
    .map((item) => item.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  assert.deepEqual(candidates, ['python3.16', 'python3.15', 'python3.14', 'python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3']);

  assert.match(depthSrc, /explicit \? \[explicit\] : DEPTH_PYTHON_CANDIDATES\.slice\(\)/, '显式配置只能作为唯一候选');
  assert.match(depthSrc, /selectDepthPython/, '必须存在解释器选择函数');
  assert.match(depthSrc, /configured: configuredPython/, '执行时必须使用显式配置参与选择');
  assert.ok(
    depthSrc.includes("configured python '${explicit}' cannot run the depth engine"),
    '显式失败必须高声报错，不能静默回退',
  );
  assert.ok(depthSrc.includes('tried: ${tried}'), '自动发现失败时必须列出已尝试解释器');
  assert.match(depthSrc, /clearDepthPythonCache/, '必须提供缓存失效入口供测试/诊断');
});

test('E2E 缓存与环境：自动发现结果被缓存，深度结果回传实际解释器', () => {
  assert.match(depthSrc, /depthPythonCache\.set\(cacheKey, pythonBin\)/, '自动发现成功后必须缓存');
  assert.match(depthSrc, /const cached = depthPythonCache\.get\(cacheKey\)/, '重复调用必须命中缓存');
  assert.match(depthSrc, /python: runtime\.kind === 'uv'/, '深度结果必须回传实际使用的运行时（系统 Python 或 uv）');
});
