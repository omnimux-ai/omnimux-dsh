/**
 * 端到端契约测试：创作画布多执行并发（Issue #2255）
 *
 * 验证目标（跨真实源文件的契约，不只是单文件字符串）：
 * 1. 执行状态存储以「运行槽列表」为真源，并对控制条/节点投影出聚合视图。
 * 2. 控制器不再因画布上已有存活执行而丢弃新提交；提交去重是按提交键而非全局。
 * 3. 终态事件按 executionId 归属，一条执行的结束/失败不收敛另一条执行的在飞节点。
 * 4. 节点的生成按钮忙碌态取自身执行状态，不是画布全局状态。
 * 5. 岛屿重载恢复该工作区**全部**存活执行。
 * 6. 工作流自动级联语义不变：DAG 仍按拓扑分层 + 并行度节流。
 *
 * 文件放在 `tests/`（而非 `tests/e2e/`）：插件自带的测试脚本按
 * `tests/*.test.mjs` 收集，`tests/e2e/` 目前没有执行者。文件名保留
 * `.e2e.test.` 后缀，质量门禁仍按端到端测试识别。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = rel => readFileSync(join(here, '../src', rel), 'utf8');

const storeSrc = src('canvas/store/executionStore.ts');
const controllerSrc = src('canvas/hooks/useExecutionController.ts');
const nodeSrc = src('canvas/editor/components/MaterialNode/index.tsx');
const barSrc = src('canvas/editor/components/ExecutionBar.tsx');
const schedulerSrc = src('workflow/execution/ExecutionScheduler.ts');

/** 一个 `case '...'` 分支的正文（到下一个 case 为止），避免固定长度窗口。 */
function switchBranch(source, caseName) {
  const marker = `case '${caseName}'`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `源码中应存在 ${marker} 分支`);
  const end = source.indexOf("case '", start + marker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

test('E2E: 执行状态存储以运行槽列表为真源并投影聚合视图 (#2255)', () => {
  assert.match(storeSrc, /export interface ExecutionRun\b/, '必须存在运行槽类型');
  assert.match(storeSrc, /runs:\s*ExecutionRun\[\]/, '运行槽列表必须是存储状态');
  assert.match(storeSrc, /export function projectRuns\(/, '聚合视图必须由 projectRuns 投影');
  assert.match(storeSrc, /activeRunCount:\s*runs\.filter\(/, '活跃执行条数必须由运行槽派生');
  assert.match(storeSrc, /setRunNodeStatus:\s*\(executionId,\s*nodeId,\s*status\)/, '节点状态必须能按执行归属写入');
});

test('E2E: 控制器不再以画布全局状态拦截新提交 (#2255)', () => {
  // 旧行为：任一执行存活即 return，第二次点击被静默丢弃。
  assert.doesNotMatch(
    controllerSrc,
    /if\s*\(\s*startingRef\.current\s*\|\|\s*LIVE_STATUSES\.has\(/,
    'startExecution 不得再因画布上已有存活执行而直接返回',
  );
  assert.match(
    controllerSrc,
    /const submissionKey = /,
    '去重必须收敛到单次提交键（同一节点重复点击），而不是整块画布',
  );
  assert.match(controllerSrc, /startingRef\.current\.has\(submissionKey\)/, '按提交键去重');
  assert.match(controllerSrc, /startingRef\.current\.delete\(submissionKey\)/, '提交结束后必须释放提交键');
});

test('E2E: 每个执行独立持有事件流与节点状态归属 (#2255)', () => {
  assert.match(controllerSrc, /streamsRef = useRef\(new Map<string, EventSource>\(\)\)/, '事件流必须按执行 id 分别持有');
  assert.match(controllerSrc, /const executionId = typeof data\.executionId === 'string'/, '事件必须按载荷中的执行 id 归属');
  assert.match(controllerSrc, /executionId\?:\s*string/, '收敛函数必须声明可选的执行 id 参数');
  assert.match(
    controllerSrc,
    /const ownedByOtherLiveRun = \(nodeId: string\): boolean =>/,
    '必须存在「该节点仍被其它存活执行持有」的判定',
  );
  assert.match(
    controllerSrc,
    /run\.executionId !== executionId[\s\S]{0,160}isLiveExecutionStatus\(run\.status\)/,
    '判定必须同时检查执行身份与存活状态',
  );
  for (const terminal of ['execution_complete', 'execution_error', 'execution_cancelled']) {
    assert.match(
      switchBranch(controllerSrc, terminal),
      /settleInFlightNodes\([^)]*executionId\)/,
      `${terminal} 的收敛必须限定在本执行`,
    );
  }
});

test('E2E: 重载恢复该工作区全部存活执行 (#2255)', () => {
  assert.match(
    controllerSrc,
    /const live = \(list\.body\.executions \?\? \[\]\)\.filter\(\(row\) => isLiveExecutionStatus\(row\.status\)\)/,
    '必须取出全部存活执行（旧实现只 find 第一条）',
  );
  assert.match(controllerSrc, /for \(const \{ row, snapshot \} of snapshots\)/, '必须逐条恢复订阅');
});

test('E2E: 节点忙碌态取自身执行状态而非画布全局状态 (#2255)', () => {
  assert.match(
    nodeSrc,
    /const execBusy = useExecutionStore\(\(state\) => \{\s*const nodeStatus = state\.nodeStatuses\[id\]/,
    '节点生成按钮的忙碌态必须按节点自身判定',
  );
  assert.doesNotMatch(
    nodeSrc,
    /const execBusy = useExecutionStore\(\(state\) => state\.status === 'pending'/,
    '不得再读取画布全局执行状态',
  );
});

test('E2E: 执行控制条展示并发执行条数 (#2255)', () => {
  assert.match(barSrc, /activeRunCount/, '控制条必须读取活跃执行条数');
  assert.match(barSrc, /data-testid="wf-exec-active-count"/, '并发条数必须有稳定测试锚点');
  assert.match(barSrc, /exec\.activeCount/, '并发条数文案必须走词条');
});

test('E2E: 工作流自动级联语义不变——拓扑分层 + 并行度节流', () => {
  assert.match(schedulerSrc, /getTopologicalGroups\(\)/, 'DAG 拓扑分层必须保留');
  assert.match(schedulerSrc, /const slots = this\.maxParallel - this\.runningNodes\.size/, '并行度节流必须保留');
  assert.match(schedulerSrc, /canExecute\(nodeId\)/, '依赖判定必须保留');
});
