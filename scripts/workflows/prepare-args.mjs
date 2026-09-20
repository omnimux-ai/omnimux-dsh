#!/usr/bin/env node
// scripts/workflows/prepare-args.mjs
//
// 配方预生成器：把「确定性计算」从 OmniMux 侧搬回本地。
//
// 为什么需要它：
//   batch-shoot.v0.js.txt 的 args.pools 需要四个池子共 113KB。args 是模型逐字写进
//   工具参数的，让模型手抄 113KB JSON 既不可能抄对、也白烧上万 token。
//   但其中绝大部分是「确定性计算」所需的输入，本不需要经过模型的手。
//
//   本脚本在本地跑 v0 脚本体的 dry-run，算出配方，只把配方（约 4KB）写成 args。
//   OmniMux 侧读这个文件，直接当 args 提交给 batch-shoot.v1.js.txt 扇出。
//
// 用法：
//   node scripts/workflows/prepare-args.mjs \
//     --name "护发精油" \
//     --selling "不油腻,顺毛躁" \
//     --audience "25-35 岁女性" \
//     --roles "beauty:reviewer:6,home:mom:6" \
//     --seed 20260920 \
//     --out scripts/workflows/out/args.json
//
// 算法不重复实现：本脚本直接执行 batch-shoot.v0.js.txt 的脚本体，
// 与 OmniMux 侧跑的是同一段代码、同一个 seed，配方完全一致。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const POOL_DIR = join(HERE, 'pools');
const V0_FILE = join(HERE, 'batch-shoot.v0.js.txt');

const BEGIN = '// 脚本正文开始';
const END = '// 脚本正文结束';

// ---------------------------------------------------------------- 参数解析
function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const opt = parseArgv(process.argv.slice(2));

if (opt.help) {
  console.log(`
用法：
  node scripts/workflows/prepare-args.mjs --name <商品名> --roles <角色清单> [选项]

必填：
  --name     商品名称
  --roles    角色与条数，格式 "垂类:身份:条数"，多个用逗号分隔
             例："beauty:reviewer:6,home:mom:6"

可选：
  --selling  卖点，逗号分隔
  --audience 目标人群
  --url      商品链接
  --seed     随机种子（默认 20260920）；同 seed 配方完全一致
  --out      输出路径（默认 scripts/workflows/out/args.json）
  --list     只列出可用的垂类与身份 id，然后退出
`);
  process.exit(0);
}

function loadPool(name) {
  return JSON.parse(readFileSync(join(POOL_DIR, `${name}.json`), 'utf8'));
}

const pools = {
  method: loadPool('method'),
  persona: loadPool('persona'),
  hook: loadPool('hook'),
  format: loadPool('format'),
};

if (opt.list) {
  console.log('\n可用垂类（--roles 第一段）：');
  for (const v of pools.persona.verticals) {
    console.log(`  ${v.id.padEnd(11)} ${v.name}`);
  }
  console.log('\n可用身份（--roles 第二段）：');
  for (const p of pools.persona.identities) {
    console.log(`  ${p.id.padEnd(11)} ${p.name}   ${p.voice}`);
  }
  console.log('\n示例：--roles "beauty:reviewer:6,home:mom:6"\n');
  process.exit(0);
}

if (!opt.name || !opt.roles) {
  console.error('缺少必填参数。用 --help 看用法。');
  process.exit(2);
}

// ---------------------------------------------------------------- 角色解析
const VALID_VERTICALS = new Set(pools.persona.verticals.map((v) => v.id));
const VALID_IDENTITIES = new Set(pools.persona.identities.map((p) => p.id));

const requests = String(opt.roles)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((chunk) => {
    const [verticalId, identityId, countRaw] = chunk.split(':');
    if (!verticalId || !identityId) {
      console.error(`角色格式错误："${chunk}"，应为 "垂类:身份:条数"。`);
      process.exit(2);
    }
    if (!VALID_VERTICALS.has(verticalId)) {
      console.error(`未知垂类 "${verticalId}"。可用：${[...VALID_VERTICALS].join(', ')}`);
      process.exit(2);
    }
    if (!VALID_IDENTITIES.has(identityId)) {
      console.error(`未知身份 "${identityId}"。可用：${[...VALID_IDENTITIES].join(', ')}`);
      process.exit(2);
    }
    const count = Number(countRaw || 6);
    if (!Number.isFinite(count) || count < 1) {
      console.error(`条数非法："${countRaw}"（应为正整数）。`);
      process.exit(2);
    }
    return { verticalId, identityId, count };
  });

if (requests.length === 0) {
  console.error('--roles 解析后为空。');
  process.exit(2);
}

const seed = opt.seed ? Number(opt.seed) : 20260920;
if (!Number.isFinite(seed)) {
  console.error(`--seed 非法："${opt.seed}"。`);
  process.exit(2);
}

const product = {
  name: String(opt.name),
  ...(opt.url ? { url: String(opt.url) } : {}),
  ...(opt.selling ? { sellingPoints: String(opt.selling).split(',').map((s) => s.trim()).filter(Boolean) } : {}),
  ...(opt.audience ? { audience: String(opt.audience) } : {}),
};

// ---------------------------------------------------------------- 执行 v0 脚本体
const raw = readFileSync(V0_FILE, 'utf8');
const bi = raw.indexOf(BEGIN);
const ei = raw.indexOf(END);
if (bi < 0 || ei < 0) {
  console.error('batch-shoot.v0.js.txt 缺少脚本正文边界标记。');
  process.exit(1);
}
const body = raw.slice(bi + BEGIN.length, ei);

// 与 verify-batch-shoot.mjs 相同的注入方式：脚本体跑在 async IIFE 里。
// dry-run 模式不会调用 agent()，这里给的实现只为满足引用。
const noopAgent = async () => {
  throw new Error('prepare-args 只跑 dry-run，不应触发 agent()');
};

const fn = new Function(
  'args', 'agent', 'parallel', 'pipeline', 'phase', 'log',
  `return (async () => {${body}\n})()`,
);

let result;
try {
  result = await fn(
    { product, requests, pools, seed, dryRun: true },
    noopAgent,
    async (tasks) => Promise.all(tasks.map((t) => t())),
    async (tasks) => {
      const out = [];
      for (const t of tasks) out.push(await t());
      return out;
    },
    () => {},
    () => {},
  );
} catch (e) {
  console.error(`配方生成失败：${e.message}`);
  process.exit(1);
}

if (!result || !Array.isArray(result.recipes) || result.recipes.length === 0) {
  console.error('配方为空，检查池子与角色配置。');
  process.exit(1);
}

// ---------------------------------------------------------------- 输出 args
const args = {
  product,
  recipes: result.recipes,
  seed,
};
if (opt.out2) args.alt = opt.out2;

if (opt.dryRun) args.dryRun = true;

const outPath = opt.out
  ? resolve(process.cwd(), String(opt.out))
  : join(HERE, 'out', 'args.json');

mkdirSync(dirname(outPath), { recursive: true });
const payload = JSON.stringify(args, null, 1);
writeFileSync(outPath, payload, 'utf8');

// ---------------------------------------------------------------- 摘要
// 按显示宽度对齐：中文/全角字符占 2 格，padEnd 按字符数算会导致表格错位
function displayWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch)
      ? 2
      : 1;
  }
  return w;
}
function padW(s, n) {
  const str = String(s);
  return str + ' '.repeat(Math.max(1, n - displayWidth(str)));
}

console.log(`\n配方生成完成 · seed=${seed} · ${result.recipes.length} 条\n`);
console.log(
  '  #  ' + padW('垂类', 12) + padW('身份', 12) + padW('手法', 36) + padW('Hook', 12) + padW('形态', 16) + '指纹',
);
console.log('  ' + '-'.repeat(104));
for (const r of result.recipes) {
  console.log(
    '  ' + padW(r.index, 3) +
      padW(r.vertical.name, 12) +
      padW(r.identity.name, 12) +
      padW(r.method.id, 36) +
      padW(r.hook.name, 12) +
      padW(r.format.name, 16) +
      r.fingerprint,
  );
}

// 自检：指纹唯一 / 同角色内手法与 Hook 不重样
const fps = new Set(result.recipes.map((r) => r.fingerprint));
const byRole = {};
for (const r of result.recipes) {
  const k = `${r.vertical.id}:${r.identity.id}`;
  byRole[k] = byRole[k] || { methods: [], hooks: [] };
  byRole[k].methods.push(r.method.id);
  byRole[k].hooks.push(r.hook.id);
}
const dupRole = Object.entries(byRole).filter(
  ([, v]) => new Set(v.methods).size !== v.methods.length || new Set(v.hooks).size !== v.hooks.length,
);

console.log(`\n自检：指纹唯一 ${fps.size === result.recipes.length ? '✓' : '✗'} · 同角色内不重样 ${dupRole.length === 0 ? '✓' : '✗ ' + JSON.stringify(dupRole)}`);
console.log(`\nargs 已写入：${outPath}`);
console.log(`体积：${Buffer.byteLength(payload, 'utf8')} 字节（可直接作为 workflow 工具的 args 提交）\n`);
console.log('下一步：在 OmniMux 会话里读这个文件 + batch-shoot.v1.js.txt 的脚本体，提交 workflow 工具。\n');

if (fps.size !== result.recipes.length || dupRole.length > 0) {
  process.exit(1);
}
