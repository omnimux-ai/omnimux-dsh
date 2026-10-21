# Issue #3503 静默吞错存量分诊证据

- 任务：`chore(common): 685 处静默吞错存量分诊——先止血假成功与凭据残留`（P0 market/auth + P1 sidebar）
- 本文件是 P1 `sidebar-toggle-topbar.js` catch 收敛的过程证据；P0 与全量集成验收见 `verification.md`。
- 分支：`agent/common-silent-catch-triage-issue-3503`
- base SHA：`d2d54d177dac869f8a8cdabeb0c601a81ac571dc`
- 采集时间：2026-10-21 11:54–12:20 (Asia/Taipei)
- 口径注意：本目录的基线/前后计数是 **worktree-dirty** 扫描（base SHA 记录 `origin/main`，统计对象为含未提交改动的本工作树）；合入后以 PR head 复核。

## 环境

| 项 | 值 |
|---|---|
| Node | v25.8.0 |
| Chrome | Google Chrome 155.0.8059.85 |
| CHROME_PATH | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| worktree | `.worktrees/common-silent-catch-triage-issue-3503`（仓库根） |
| 依赖 | 复用主检出 node_modules，未重新安装 |

## 1. 静默 catch 扫描（`node scripts/verify-silent-catch.mjs --json`）

只统计本任务文件 `plugins/omnimux/src/client/sidebar-toggle-topbar.js`（改动前 → 改动后）：

| 口径 | 改动前 | 改动后 |
|---|---|---|
| SC1 空 catch | 0 | 0 |
| SC2 仅注释 catch | 41 | 0 |
| SC3 有语句无痕迹（允许） | 3 | 4 |

- 改动后剩下的 4 处 SC3：3 处是原本就存在的赋值降级（`return 1e9` / `measured = 0` / `panelLeft = null`），
  第 4 处是新 helper `safeDom` 自身的 catch（体内只有 `return fallback` + 意图注释，符合 SC3）。
- 全仓最终计数（全部 teammate 完成后由 Lead 复采）：SC1=241、SC2=399、SC3=885、合计 1525
  （基线 242/444/882/1568 → 确证形态 -46，SC3 +3 均为有语句留痕的新形态）。详见 `verification.md`/`after.json`。

## 2. 真实内核 QA（`node scripts/three-column-collapse-qa.mjs`）

命令（worktree 根目录）：

```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node scripts/three-column-collapse-qa.mjs
```

结果：**PASS**，exit 0，34 条断言全部 `pass !== false`，`errors: []`，
`cleanup.allReleased = true`（HTTP server 关闭、临时 Chrome profile 删除），
Chrome 动态空闲端口 + 临时 profile，测完即焚。关键 stdout：

```text
✅ PASS · 会话栏 485px → 485px（保持），右栏 1155px → 1435px（吸收 280px）
   反向对照：旧 auto 规则下右栏塌为 0px，夹具未失真
✅ 缩放档位：1920→492 / 2560→684 / 1440→360（±2px）
   证据归档: docs/evidence/three-column-collapse-qa-report.json
```

- 脚本直接读取生产真源：`conversation-box.js` 的 `PRODUCT_STAGE_CHROME`、
  `sidebar-toggle-topbar.js`（本任务改动文件，断言其写入 `--omnimux-conversation-width`）、
  `conversation-ratio.js`；几何由真实模块导出函数在真实 Chrome 页面中计算，不是字面量副本。
- 原始产物 `docs/evidence/three-column-collapse-qa-report.json` / `*-collapsed.png` 是仓库跟踪文件，
  已在归档后 `git checkout --` 恢复，避免污染他人证据；本目录保存本次运行的副本。

## 3. 单元 / jsdom E2E / 整包回归

| 命令 | 结果 |
|---|---|
| `node --test plugins/omnimux/src/client/sidebar-toggle-topbar.test.js plugins/omnimux/src/client/sidebar-toggle-topbar.e2e.test.js` | **95 pass / 0 fail**（88 既有单测 + 7 新增 jsdom E2E） |
| `pnpm --filter omnimux test` | **3605 pass / 0 fail**，exit 0（386 个测试文件；3 个 phase：network guard 2 + ordinary 3514 + resource/E2E 89） |

新增 E2E 覆盖（`sidebar-toggle-topbar.e2e.test.js`，真实 jsdom DOM，非源码文本断言）：

1. 残留插件节点 `remove()` 抛错时安装仍完成，注入 toggle 存在且点击仍穿透到官方按钮（`assert.equal(officialClicks, 1)`）。
2. 四个 `MutationObserver.disconnect()` 全部抛错时 `cleanup()` 不抛，HTML 标记/注入节点/官方标记全部清理。
3. 注入节点已被宿主移除后 `cleanup()` 仍完成、不抛。
4. 残留新会话按钮 `remove()` 抛错时 `injectTopbarNewSessionButton(doc,false)` 不抛且仍返回 `null`。
5. `triggerClick`：React props 分支抛错 → 降级到 `dispatchEvent`（`assert.equal(dispatched, 1)`）。
6. `triggerClick`：React props 与 `dispatchEvent` 都失败 → 最后一段 `el.click()` 仍生效。
7. `ensureSidebarToggleTopbar` 在 remove 抛错时仍返回注入按钮（导出面契约不变）。

## 3.1 增量静默 catch 检查（`scripts/lib/silent-catch-delta.mjs`）

```bash
node --input-type=module -e "import { newSilentCatchHits } from './scripts/lib/silent-catch-delta.mjs'; \
  console.log(newSilentCatchHits(process.cwd(), { changedFiles: ['plugins/omnimux/src/client/sidebar-toggle-topbar.js'] }))"
```

结果：`newSC1SC2 = 0`（hits 为空）、`newSuspected = 1`（即新增的 `safeDom` 自身 SC3 catch），
baseRef = `d2d54d177dac869f8a8cdabeb0c601a81ac571dc`。

## 4. 文件清单

| 文件 | 说明 |
|---|---|
| `README.md` | 本证据说明 |
| `silent-catch-counts.json` | 本文件 SC1/SC2/SC3 前后计数 + 全仓快照 + head SHA（机器可读） |
| `three-column-collapse-qa-report.json` | 真实 Chrome QA 原始报告（34 断言、cleanup 全部释放） |
| `three-column-collapse-collapsed.png` | 真实内核截图（1920×993，收起左栏后会话栏保持 485px） |
| `three-column-collapse-viewport-tiers.png` | 2560×1080 缩放档位截图 |

本任务改动文件（写入作用域内）：

| 文件 | 改动 |
|---|---|
| `plugins/omnimux/src/client/sidebar-toggle-topbar.js` | 41 处 SC2 catch → 私有 `safeDom(fn, fallback)`；新增 helper 自身 1 处 SC3；导出面、选择器、CSS、几何逻辑均未改 |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.e2e.test.js` | 新增 7 个 jsdom E2E 用例（强断言） |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js` | 未改：既有断言全部绑定行为而非 try/catch 文本，88 用例原样通过 |

## 残留风险

- QA 覆盖三分栏几何与缩放档位；本次改动只替换 catch 边界，真实内核断言与改动前一致，
  但「注入按钮在极端 DOM 异常下的交互」由 jsdom E2E 覆盖，不是真实内核覆盖。
- `docs/evidence/three-column-collapse-viewport-tiers.png` 在本仓 `.git/info/exclude` 中被忽略（非跟踪文件），
  无法用 git 恢复原状，只能以本次运行产物覆盖；不影响 git 跟踪面。
- **交付注意**：本仓 `.git/info/exclude` 有 `docs/evidence/*` 规则，本目录 10 个新证据文件也是
  local-ignored（`git status` 不显示）。提交时需 `git add -f docs/evidence/silent-catch-triage-3503/`，
  否则 guard-quality-loop 的 `missing-evidence-for-ui-delivery` 会把它们视为不存在。
- safeDom 保持「不新增日志」：这些 catch 仍无显式痕迹（SC3 语义），错误只通过既有降级行为体现；
  符合本任务「不新增 SC1/SC2、不为收敛加 console」的约束。
