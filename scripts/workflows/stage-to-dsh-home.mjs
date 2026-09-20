#!/usr/bin/env node
// scripts/workflows/stage-to-dsh-home.mjs
//
// 把批量出片的运行期产物「物化」到 DSH home 下，供 OmniMux 会话直接读取。
//
// 为什么需要这一步：
//   OmniMux app 受 macOS 隐私授权（TCC）约束，只能读取它已获授权的目录
//   （会话工作区、$DSH_HOME、/tmp）。项目仓位于 ~/Desktop 下且未获授权，
//   所以 app 侧的 read 工具与 bash 都会以 EPERM("Operation not permitted") 失败。
//   实测证据：同一会话里 `ls <会话工作区>` 成功，而 `ls ../dsh-plugin` 失败。
//
//   注意：这不是 DSH 自身的沙箱造成的。DSH 的 seatbelt 策略只有
//   `(deny file-write*)`，不拦读；app 代码里也不存在任何 file-read 规则。
//
// 因此约定：
//   项目仓 = 唯一事实来源（可 review、可回归）
//   $DSH_HOME/omnimux/recipes = 运行期暂存区（只读消费）
//   每次改完脚本或池子，跑一次本脚本把产物同步过去。
//
// 用法：
//   node scripts/workflows/stage-to-dsh-home.mjs
//   node scripts/workflows/stage-to-dsh-home.mjs --home ~/.dsh
//   node scripts/workflows/stage-to-dsh-home.mjs --verify

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

/** 候选 DSH home，按优先级探测。 */
const HOME_CANDIDATES = ['~/.omnimux-dev', '~/.dsh', '~/.dsh-dev'];

/** 需要物化的文件：源（相对仓库）→ 目标文件名。 */
const ARTIFACTS = [
  { src: 'scripts/workflows/batch-shoot.v1.js.txt', dest: 'batch-shoot.v1.js.txt', required: true },
  { src: 'scripts/workflows/out/args.json', dest: 'args.json', required: false },
  { src: 'scripts/workflows/out/args-dry.json', dest: 'args-dry.json', required: false },
];

function parseArgs(argv) {
  const out = { home: null, verify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--home') out.home = argv[++i];
    else if (a === '--verify') out.verify = true;
  }
  return out;
}

function expand(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

function pickHome(explicit) {
  if (explicit) return expand(explicit);
  for (const c of HOME_CANDIDATES) {
    const p = expand(c);
    if (existsSync(p)) return p;
  }
  return null;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

const opts = parseArgs(process.argv.slice(2));
const home = pickHome(opts.home);

if (!home) {
  console.error('✗ 找不到 DSH home。用 --home 显式指定，例如 --home ~/.omnimux-dev');
  process.exit(1);
}

const stageDir = join(home, 'omnimux', 'recipes');

if (opts.verify) {
  if (!existsSync(stageDir)) {
    console.error(`✗ 暂存目录不存在：${stageDir}\n  先不带 --verify 跑一次。`);
    process.exit(1);
  }
  console.log(`暂存目录：${stageDir}`);
  for (const a of ARTIFACTS) {
    const p = join(stageDir, a.dest);
    if (!existsSync(p)) {
      console.log(`  ✗ ${a.dest}  缺失`);
      continue;
    }
    const text = readFileSync(p, 'utf8');
    const src = join(REPO, a.src);
    const same = existsSync(src) && readFileSync(src, 'utf8') === text;
    console.log(
      `  ${same ? '✓' : '≠'} ${a.dest}  ${text.length} 字符  sha256:${sha256(text)}` +
        (same ? '' : '  ← 与仓库不一致，需重新物化'),
    );
  }
  process.exit(0);
}

mkdirSync(stageDir, { recursive: true });

const staged = [];
let missingRequired = false;

for (const a of ARTIFACTS) {
  const src = join(REPO, a.src);
  if (!existsSync(src)) {
    const mark = a.required ? '✗' : '·';
    console.log(`${mark} 跳过 ${a.src}（源文件不存在）`);
    if (a.required) missingRequired = true;
    continue;
  }
  const text = readFileSync(src, 'utf8');
  writeFileSync(join(stageDir, a.dest), text);
  staged.push({ dest: a.dest, src: a.src, chars: text.length, sha: sha256(text) });
  console.log(`✓ ${a.dest}  ← ${a.src}  ${text.length} 字符  sha256:${sha256(text)}`);
}

if (missingRequired) {
  console.error('\n✗ 必需产物缺失，物化未完成。');
  process.exit(1);
}

const manifest = [
  '# 批量出片 · 运行期暂存区',
  '',
  '本目录由 `node scripts/workflows/stage-to-dsh-home.mjs` 生成，**不要手工编辑**。',
  '事实来源在仓库 `scripts/workflows/`，改了那边要重新跑一次物化。',
  '',
  `暂存目录：\`${stageDir}\``,
  '',
  '| 文件 | 来自 | 字符数 | sha256 前 16 位 |',
  '| :--- | :--- | ---: | :--- |',
  ...staged.map((s) => `| \`${s.dest}\` | \`${s.src}\` | ${s.chars} | \`${s.sha}\` |`),
  '',
  '## 为什么放这里',
  '',
  'OmniMux app 受 macOS 隐私授权限制，只能读它已获授权的目录（会话工作区、DSH home、/tmp）。',
  '项目仓在 `~/Desktop` 下且未获授权，app 侧读它会 `EPERM: operation not permitted`。',
  '把运行期产物放到 DSH home 下，app 就能正常读取。',
  '',
].join('\n');

writeFileSync(join(stageDir, 'MANIFEST.md'), manifest);

console.log(`\n物化完成 → ${stageDir}`);
console.log(`已写入 ${staged.length} 个产物 + MANIFEST.md`);
console.log('\n在 OmniMux 会话里改用这个路径读：');
for (const s of staged) console.log(`  ${join(stageDir, s.dest)}`);
