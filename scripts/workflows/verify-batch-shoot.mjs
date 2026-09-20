#!/usr/bin/env node
// scripts/workflows/verify-batch-shoot.mjs
//
// batch-shoot.v0.js.txt 的本地校验器。
// 用 mock 钩子执行脚本体，验证编排逻辑；不调用真实模型、不需要 DSH 运行时。
//
// 用法：node scripts/workflows/verify-batch-shoot.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT_FILE = join(HERE, 'batch-shoot.v0.js.txt');
const POOL_DIR = join(HERE, 'pools');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------------------------------------------------------------- 静态检查
console.log('\nbatch-shoot.v0.js.txt 本地校验\n');
console.log('[1] 静态约束');

const raw = readFileSync(SCRIPT_FILE, 'utf8');
const BEGIN = '// 脚本正文开始';
const END = '// 脚本正文结束';
const bi = raw.indexOf(BEGIN);
const ei = raw.indexOf(END);
if (bi < 0 || ei < 0) {
  console.error('  找不到脚本正文边界标记，无法校验');
  process.exit(1);
}
const body = raw.slice(bi + BEGIN.length, ei);

check('无 import / require 语句', !/^\s*(import|export)\s|require\s*\(/m.test(body));
check(
  '无随机源（Math.random / Date.now / new Date）',
  !/Math\.random|Date\.now|new\s+Date\s*\(/.test(body),
);
check('含 return 语句', /\breturn\s/.test(body));
check('以钩子 agent() 扇出', /\bagent\s*\(/.test(body));

// ---------------------------------------------------------------- 载入池子
console.log('\n[2] 变量池');

function loadPool(name) {
  try {
    return JSON.parse(readFileSync(join(POOL_DIR, `${name}.json`), 'utf8'));
  } catch (e) {
    return { __error: e.message };
  }
}

const method = loadPool('method');
const persona = loadPool('persona');
const hook = loadPool('hook');
const format = loadPool('format');

check('method.json 可读且非空', !method.__error && method.methods?.length > 0,
  method.__error || `${method.methods?.length} 个手法`);
check('persona.json 可读且非空',
  !persona.__error && persona.verticals?.length > 0 && persona.identities?.length > 0,
  persona.__error || `${persona.verticals?.length} 垂类 × ${persona.identities?.length} 身份`);
check('hook.json 可读且非空', !hook.__error && hook.hooks?.length > 0,
  hook.__error || `${hook.hooks?.length} 个 Hook`);
check('format.json 可读且非空', !format.__error && format.formats?.length > 0,
  format.__error || `${format.formats?.length} 种形态`);
check('池子无重复手法 id',
  new Set(method.methods?.map((m) => m.id)).size === method.methods?.length);

// ---------------------------------------------------------------- mock 运行时
// agent() 的选项白名单。取自真实 worker 的校验：
//   dsh-workflow-worker-thread/lib/worker.cjs  readAgentOptions()
//   `agent() option "name" is not recognized (supported: label, phase, schema, provider, model)`
// 这条曾被漏掉：本地校验全绿，但真实运行时 agent({ name }) 直接 WorkflowError。
// 所以 mock 必须同构记录选项键，任何越界键都要被判 FAIL。
const AGENT_OPTION_ALLOWLIST = ['label', 'phase', 'schema', 'provider', 'model'];

function makeRuntime() {
  const trace = {
    phases: [],
    logs: [],
    agentCalls: 0,
    agentOptionKeys: [],
    unknownOptions: [],
    labelMissing: 0,
  };
  const runtime = {
    trace,
    agent: async (prompt, opts) => {
      trace.agentCalls += 1;
      const keys = opts === undefined ? [] : Object.keys(opts);
      trace.agentOptionKeys.push(keys);
      const unknown = keys.filter((k) => !AGENT_OPTION_ALLOWLIST.includes(k));
      if (unknown.length > 0) trace.unknownOptions.push(unknown);
      if (!keys.includes('label')) trace.labelMissing += 1;
      // 回一个合法 JSON，模拟子代理结构化输出
      return JSON.stringify({
        hookLine: '你是不是也遇到过这种情况',
        shots: [
          { idx: 1, durationSec: 3, visual: '手持产品特写', voiceover: '先看这个', onScreenText: '实测' },
          { idx: 2, durationSec: 5, visual: '使用过程', voiceover: '用了两周', onScreenText: null },
          { idx: 3, durationSec: 4, visual: '效果对比', voiceover: '差别在这', onScreenText: '对比' },
          { idx: 4, durationSec: 3, visual: '产品收尾', voiceover: '链接放这了', onScreenText: '点击' },
        ],
        cta: '点左下角看看',
        caption: '用了两周的真实感受',
        __promptLength: prompt.length,
      });
    },
    parallel: async (tasks) => Promise.all(tasks.map((t) => t())),
    pipeline: async (tasks) => {
      const out = [];
      for (const t of tasks) out.push(await t());
      return out;
    },
    phase: (title) => { trace.phases.push(title); },
    log: (msg) => { trace.logs.push(msg); },
  };
  return runtime;
}

async function runScript(args) {
  const runtime = makeRuntime();
  const fn = new Function(
    'args', 'agent', 'parallel', 'pipeline', 'phase', 'log',
    `return (async () => {${body}\n})()`,
  );
  const value = await fn(
    args, runtime.agent, runtime.parallel, runtime.pipeline, runtime.phase, runtime.log,
  );
  return { value, trace: runtime.trace };
}

function buildArgs({ seed, count, dryRun, verticals }) {
  return {
    product: {
      name: '测试商品·护发精油',
      url: 'https://example.com/p/1',
      sellingPoints: ['不油腻', '顺毛躁'],
      audience: '25-35 岁女性',
    },
    requests: verticals.map((v) => ({ ...v, count })),
    pools: { method, persona, hook, format },
    seed,
    dryRun,
  };
}

// ---------------------------------------------------------------- dry-run
console.log('\n[3] dry-run：配方生成');

const REQ = [{ verticalId: 'beauty', identityId: 'reviewer', count: 6 },
             { verticalId: 'home',   identityId: 'mom',      count: 6 }];
const EXPECT = 12;

let dry;
try {
  dry = await runScript(buildArgs({ seed: 20260920, count: 6, dryRun: true, verticals: REQ.map(({ verticalId, identityId }) => ({ verticalId, identityId })) }));
} catch (e) {
  check('脚本可执行', false, e.message);
  console.log('\n脚本抛出异常，后续校验中止。\n');
  process.exit(1);
}

check('脚本可执行', true, dry.value.mode);
check('产出配方数等于请求条数', dry.value.total === EXPECT, `${dry.value.total} / ${EXPECT}`);
check('批次内配方指纹唯一',
  new Set(dry.value.recipes.map((r) => r.fingerprint)).size === EXPECT);

const beautyMethods = dry.value.recipes.filter((r) => r.vertical.id === 'beauty').map((r) => r.method.id);
const beautyHooks = dry.value.recipes.filter((r) => r.vertical.id === 'beauty').map((r) => r.hook.id);
check('同角色内手法不重样', new Set(beautyMethods).size === beautyMethods.length,
  `${new Set(beautyMethods).size}/${beautyMethods.length}`);
check('同角色内 Hook 不重样', new Set(beautyHooks).size === beautyHooks.length,
  `${new Set(beautyHooks).size}/${beautyHooks.length}`);
check('手法取自垂类候选（美妆命中 UGC/展示类）',
  dry.value.recipes.filter((r) => r.vertical.id === 'beauty')
    .every((r) => ['UGC & Testimonial', 'Product Showcase'].includes(r.method.category)));
check('每条配方携带指纹与合规位',
  dry.value.recipes.every((r) => r.fingerprint && 'compliance' in r));

// 行业适配：category 是广告形式维度，不能代表行业；适配靠 method.domain 黑名单。
const methodIndex = new Map(method.methods.map((m) => [m.id, m]));
check('配方手法全部为 creative（未抽到工具类/占位类）',
  dry.value.recipes.every((r) => {
    const m = methodIndex.get(r.method.id);
    return m && (m.kind || 'creative') === 'creative';
  }),
  `池中 creative ${method.methods.filter((m) => (m.kind || 'creative') === 'creative').length} / ${method.methods.length}`);
check('美妆配方无行业错配（不含 saas/pharma/家居服务等锁定手法）',
  dry.value.recipes
    .filter((r) => r.vertical.id === 'beauty')
    .every((r) => {
      const m = methodIndex.get(r.method.id);
      const dom = (m && m.domain) || [];
      const declared = ['beauty'];
      return !dom.some((d) => !declared.includes(d));
    }),
  dry.value.recipes.filter((r) => r.vertical.id === 'beauty').map((r) => r.method.id).join(', '));

// ---------------------------------------------------------------- 可复现性
console.log('\n[4] 确定性与随机性');

const dryAgain = await runScript(buildArgs({ seed: 20260920, count: 6, dryRun: true, verticals: REQ.map(({ verticalId, identityId }) => ({ verticalId, identityId })) }));
const sig = (v) => v.recipes.map((r) => r.fingerprint).join(',');
check('同 seed 完全可复现', sig(dry.value) === sig(dryAgain.value));

const dryOther = await runScript(buildArgs({ seed: 987654321, count: 6, dryRun: true, verticals: REQ.map(({ verticalId, identityId }) => ({ verticalId, identityId })) }));
const overlap = dry.value.recipes.filter((r, i) => r.fingerprint === dryOther.value.recipes[i].fingerprint).length;
check('异 seed 产生不同组合', sig(dry.value) !== sig(dryOther.value),
  `相同配方 ${overlap}/${EXPECT}`);

// ---------------------------------------------------------------- full
console.log('\n[5] full 模式：子代理扇出');

const full = await runScript(buildArgs({ seed: 20260920, count: 6, dryRun: false, verticals: REQ.map(({ verticalId, identityId }) => ({ verticalId, identityId })) }));
check('每个配方启动一个子代理', full.trace.agentCalls === EXPECT, `${full.trace.agentCalls} 次`);
check('子代理输出全部解析成功', full.value.failed === 0, `失败 ${full.value.failed}`);
check('返回结构含 scripts 与 byFingerprint',
  Array.isArray(full.value.scripts) && Object.keys(full.value.byFingerprint).length === EXPECT);
check('每条脚本带配方指纹（可归因）',
  full.value.scripts.every((s) => typeof s.fingerprint === 'string' && s.fingerprint.length === 8));
check('phase 叙事被调用', full.trace.phases.length > 0, full.trace.phases.join(' → '));

// ---------------------------------------------------------------- 异常路径
console.log('\n[6] 异常兜底');

let caught = false;
try {
  await runScript({ product: { name: 'x' }, requests: [{ verticalId: 'nope', identityId: 'nope', count: 1 }], pools: { method, persona, hook, format }, seed: 1, dryRun: true });
} catch (e) {
  caught = /unknown persona/.test(e.message);
}
check('未知角色标识被显式拒绝', caught);

let caughtPool = false;
try {
  await runScript({ product: { name: 'x' }, requests: [], pools: {}, seed: 1, dryRun: true });
} catch (e) {
  caughtPool = /args\.pools 不完整/.test(e.message);
}
check('池子缺失时 fail loud', caughtPool);

let caughtCap = false;
try {
  await runScript({
    product: { name: 'x' },
    requests: [{ verticalId: 'health', identityId: 'expert', count: 60 }],
    pools: { method, persona, hook, format },
    seed: 1,
    dryRun: true,
  });
} catch (e) {
  caughtCap = /不重复组合只有/.test(e.message);
}
check('请求条数超出候选池容量时 fail loud（不静默产出重复配方）', caughtCap);

// ---------------------------------------------------------------- v1 扇出版
console.log('\n[7] v1 扇出版：配方由 args 传入');

const v1raw = readFileSync(join(HERE, 'batch-shoot.v1.js.txt'), 'utf8');
const v1bi = v1raw.indexOf(BEGIN);
const v1ei = v1raw.indexOf(END);
check('batch-shoot.v1.js.txt 存在正文边界标记', v1bi > 0 && v1ei > v1bi);

const v1body = v1raw.slice(v1bi + BEGIN.length, v1ei);
check('v1 无随机源', !/Math\.random|Date\.now|new\s+Date\s*\(/.test(v1body));
check('v1 无 import / require', !/^\s*(import|export)\s|require\s*\(/m.test(v1body));
// 真实 worker 只认 label/phase/schema/provider/model。用错过一次（name），本地没拦住。
check(
  'v1 agent() 选项静态白名单（写死 name 之类会挂）',
  !/(?:^|[^.\w])agent\s*\([^)]*\)\s*[,;]?\s*\{?[^}]*\bname\s*:/.test(v1body) &&
    /\blabel\s*:/.test(v1body),
);

async function runV1(args) {
  const runtime = makeRuntime();
  const fn1 = new Function(
    'args', 'agent', 'parallel', 'pipeline', 'phase', 'log',
    `return (async () => {${v1body}\n})()`,
  );
  const value = await fn1(
    args, runtime.agent, runtime.parallel, runtime.pipeline, runtime.phase, runtime.log,
  );
  return { value, trace: runtime.trace };
}

const v1full = await runV1({ product: { name: '护甲油' }, recipes: dry.value.recipes, seed: 20260920 });
check('v1 每个配方启动一个子代理', v1full.trace.agentCalls === EXPECT, `${v1full.trace.agentCalls} 次`);
check('v1 指纹原样透传（归因钥匙不丢）',
  v1full.value.scripts.every((s, i) => s.fingerprint === dry.value.recipes[i].fingerprint));
check('v1 子代理输出全部解析成功', v1full.value.failed === 0, `失败 ${v1full.value.failed}`);
check('v1 返回摘要索引，供超限时兜底',
  Array.isArray(v1full.value.index) && v1full.value.index.length === EXPECT);
// 运行时同构校验：mock 记录每次 agent() 收到的选项键，越界即 FAIL。
// 这条是为了让「脚本用了不存在的钩子选项」在本地就暴露，而不是等到 OmniMux 里炸。
check(
  'v1 agent() 选项运行时白名单',
  v1full.trace.unknownOptions.length === 0,
  v1full.trace.unknownOptions.length
    ? '越界键 ' + JSON.stringify(v1full.trace.unknownOptions)
    : `全部合法（${v1full.trace.agentOptionKeys.length} 次调用）`,
);
check(
  'v1 每次 agent() 都带 label（workflow 进度面板靠它辨识）',
  v1full.trace.labelMissing === 0,
  v1full.trace.labelMissing ? `缺 label ${v1full.trace.labelMissing} 次` : '齐全',
);

const v1dry = await runV1({ product: { name: '护甲油' }, recipes: dry.value.recipes, seed: 20260920, dryRun: true });
check('v1 dryRun 不启动子代理', v1dry.trace.agentCalls === 0);

let caughtEmpty = false;
try {
  await runV1({ product: { name: 'x' }, recipes: [], seed: 1 });
} catch (e) {
  caughtEmpty = /args\.recipes 为空/.test(e.message);
}
check('v1 配方缺失时 fail loud', caughtEmpty);

let caughtDup = false;
try {
  const dup = [dry.value.recipes[0], { ...dry.value.recipes[1], fingerprint: dry.value.recipes[0].fingerprint }];
  await runV1({ product: { name: 'x' }, recipes: dup, seed: 1, dryRun: true });
} catch (e) {
  caughtDup = /指纹重复/.test(e.message);
}
check('v1 配方指纹重复时 fail loud（否则归因失真）', caughtDup);

// ---------------------------------------------------------------- 汇总
const passed = results.filter((r) => r.ok).length;
console.log(`\n结果：${passed}/${results.length} 通过\n`);
if (passed !== results.length) {
  console.log('失败项：');
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  process.exit(1);
}
console.log('编排逻辑校验通过。下一步在 OmniMux 会话内提交 workflow 工具做真实运行。\n');
