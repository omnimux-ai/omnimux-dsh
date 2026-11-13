# 规格：impact-matrix 的 Dev 归属机器字段迁移到 desktop-bot（#4099）

关联：**#4099**（本单）、#4094（治理口径，已合）、#4100/#4102（门禁互斥修复，已合）。

## 1. 背景

#4094 把 Dev 真机验收归属从人工改为桌面端 Bot，但当时只改了文档与 `impact-matrix.mjs` 的人类可读文案；机器可读字段 `dimensions.dev.target` 仍是 `'human'`，`ci-verdict.mjs` 也强制该校验，导致代码判定与治理文档相反——按文档传 `desktop-bot` 会被判无效矩阵。

当时不能改的原因是两个门禁互斥（模板用例名静态化必然触发 `test-assertion-removed-or-rewritten` 且不可声明）。#4102 已修好：归因迁移走文件级 `:: *` 声明通道，纯静态化跨桶补偿放行。因此本单可以走正路，**不再回退文案**。

## 2. 范围（一次性收尾）

1. `scripts/impact-matrix.mjs`：`dev.target` 由 `'human'` → `'desktop-bot'`，删除两行 follow-up 注释（已不再是 follow-up）。
2. `scripts/impact-matrix.mjs`：`dev.reason` / `summary` 恢复桌面端 Bot 口径（此前已由 #4094 的分支落地，本单随静态化一起带入）。
3. `scripts/ci-verdict.mjs`：`dev.target !== 'human'` 校验放开为 `'desktop-bot'`，报错文案保持「桌面端 Bot 开发版验收」自洽。
4. 断言级联：`impact-matrix.test.mjs` 全部 `dev.target` 断言、`ci-verdict.test.mjs` 4 处、`auto-pipeline.test.mjs` 1 处，以及 `ci-verdict.test.mjs` 的过期注释。
5. `scripts/impact-matrix.test.mjs` 采用静态化版本（14 个 UI 文件用例 + 5 个非 UI 组合展开为具名 `it()`，用例名与断言内容与模板渲染结果逐字一致）；该静态化在 #4100 修好测试门禁后的一次性迁移中产生。

## 旧标准变更

本单改写了既有受保护测试的断言，按四段式声明：

- `scripts/impact-matrix.test.mjs` :: `*`
- `scripts/ci-verdict.test.mjs` :: `non-UI changes mark browser and Dev acceptance not applicable rather than passed`
- `scripts/ci-verdict.test.mjs` :: `UI static CI passes while isolated-worktree browser verification stays post-merge pending and Dev is never required`
- `scripts/ci-verdict.test.mjs` :: `Host runtime changes no longer require Dev acceptance and never invent browser requirements`
- `scripts/ci-verdict.test.mjs` :: `CLI derives impact from explicit files or strict git diff and clears failure labels`
- `scripts/auto-pipeline.test.mjs` :: `evaluateVerdict only certifies pre-merge static/tests and leaves worktree browser acceptance pending without a Dev gate`

**原断言**：`assert.equal(matrix.dimensions.dev.target, 'human')`（`impact-matrix.test.mjs` 各用例与 CLI 用例）、`assert.equal(verdict.dimensions.dev.target, 'human')`（`ci-verdict.test.mjs` 四处、`auto-pipeline.test.mjs` 一处）；`impact-matrix.test.mjs` 另含模板字面量用例名 `it(\`requires ego-browser for ${file}\`)` / `it(\`marks non-UI changes not applicable: ${JSON.stringify(files)}\`)`。

**必须改的理由**：`dev.target` 的机器口径随 #4094 的治理改动迁移到桌面端 Bot 所属（`'desktop-bot'`），旧断言锁定的是已废止的 `'human'`；不改则测试与 `impact-matrix.mjs` / `ci-verdict.mjs` 的实现不一致，回归必红。模板用例名必须静态化：它是 `dynamic-test-options-needs-review`（不可声明）的唯一消除方式，也是本单能改动该文件的前提（#4102 已为此开放归因迁移通道）。

**新期望证据**：
- `dev.target` 断言全部改为 `'desktop-bot'`；
- `ci-verdict.mjs` 校验与文案同步后，CLI 与 API 产出的 `dimensions.dev.target` 为 `'desktop-bot'`；
- 实跑 `node --test scripts/impact-matrix.test.mjs scripts/ci-verdict.test.mjs scripts/auto-pipeline.test.mjs` → 56/56 pass；
- `node scripts/verify-test-standard-declarations.mjs . cbb140a9` → exit 0。

## 不变量

- `dev.required` 仍为 `false`、`phase` 仍为 `post-merge`：Dev 验收不阻塞合并，只改执行者与机器归属。
- 浏览器验收维度（`browser.target: 'worktree'`）不变。
- 真实断言削弱仍硬拒；本单只迁移归属值，不放宽任何断言强度。

## 验收

- 三套测试全绿、`test:ci` 全绿、门禁 exit 0、`node --check` OK；
- `git diff cbb140a9 -- scripts/impact-matrix.mjs` 中不再有 `'human'` 或 follow-up 注释；
- `specs/dev-acceptance-ownership.spec.md` 的「留待 #4099、被 #4100 阻塞」过期叙事已清理。
