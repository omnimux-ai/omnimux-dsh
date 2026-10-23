# 浏览器插件 · 对话与文本生成模型独立配置（Issue #3629）

真实浏览器（未打包扩展，`scripts/lib/extension-e2e.mjs` 单进程、自清理）验收证据。
本目录是本次交付的专属实测证据，不是首页冒烟图。

## 1. 验收对象

- 工作树：`.worktrees/browser-text-model-isolation-issue-3629`，分支 `agent/browser-text-model-isolation-issue-3629`
- 规格：`specs/browser-text-model-isolation.spec.md`（含 §7 冻结契约、§9 验收用例 A1–A6）
- 扩展构建产物：`plugins/omnimux-browser/extension/dist`（`node scripts/build.mjs` 重建后验收）
- 运行方式：Chrome for Testing + `--load-extension`，扩展页 `chrome-extension://<id>/panel/index.html`
- 桩宿主：`.workbuddy/acceptance/text-model-generation-e2e.mjs` 内的本机 WebSocket 宿主，实现 bridge 握手与
  `session.create` / `bridge.textGeneration` / `session.prompt` / `bridge.session.purge`，并**模拟宿主 strict codec**：
  缺 `provider` 的钉定一律拒绝（对齐宿主 `session/selectModel` 的 `required: ["sessionId","provider","model"]`）。

## 2. 真实浏览器断言

### 2.1 设置面板（`panel-acceptance-report.json`）

| 断言 | 结果 |
| --- | --- |
| A1 对话模型行存在（「对话模型与推理等级」） | pass |
| A1 文本生成模型行存在（「文本生成模型与推理等级」） | pass |
| A1 两行各有独立 select | pass |
| A5 文本生成模型可切换 | pass |
| A1 切换后 `dshSettings.textModel` 生效 | pass |
| A1 对话模型键未被文本切换改动 | pass |

截图：`01-settings-before.png`（两行均已渲染）、`02-settings-after.png`（切换后）。

### 2.2 生成链路（`generation-acceptance-report.json`，A5 后半 + A4 前置）

| 断言 | 结果 |
| --- | --- |
| A5 连接设置已下发扩展 | pass |
| A5 扩展已连上桩宿主（hello） | pass |
| A5 文本行显示已保存的文本模型 | pass |
| A5 生成前发出 `bridge.textGeneration` | pass |
| A5 钉定 payload 精确等于设置三元组（provider 必填） | pass |
| A5 帧序 `session.create → bridge.textGeneration → session.prompt → bridge.session.purge` | pass |
| A5 生成结果回显桩宿主正文 | pass |
| A5 生成链路未改写对话模型键 | pass |

截图：`03-generation-settings.png`（触发生成时的设置面板）。

## 3. 宿主侧关键契约（单测，A6）

- **A6 deferral 物化**：`deferSessionCreate` 默认开启时 `session.create` 只铸 provisional id，宿主
  `session.selectModel` 对未持久化会话返回 `session/not-found`。钉定顺序为
  **materialize → selectModel → 登记**；`plugins/omnimux-browser/tests/index.spec.ts` 的
  `materializes the provisional session before selectModel (A6)` 用「严格 gateway 桩（未物化会话的
  selectModel 必失败）」断言 gateway 调用序 `create → selectModel` 且应答 `{pinned:true}`；临时移除物化调用后该用例
  立即失败（反证通过，证明用例真能抓住该缺陷）。
- **provider 必填**：`bridge.textGeneration` 缺失/空串 provider → `bad-request`（`tests/server.spec.ts`）。

## 4. 同批次自动化验证（同工作树、同一提交）

| 命令 | 结果 |
| --- | --- |
| `cd plugins/omnimux-browser && node node_modules/vitest/vitest.mjs run` | 20 passed / 3 skipped（26 文件）；**338 passed / 6 skipped**；3 个套件加载失败（`composition`、`session-purge`、`tests/e2e/bridge-extension.e2e`）——缺 `@deepseek-ai/cordis-*`、`playwright-core` 等未安装依赖，**base（主检出 main）同命令同样失败**，与本次改动无关 |
| `cd plugins/omnimux-browser/extension && ./node_modules/.bin/vitest run` | 158 passed（158 文件）；**1717 passed | 1 expected fail**，0 失败 |
| `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`（extension） | 105 行错误，与主检出同命令逐条一致（仅行号位移），无新增 |
| `node node_modules/typescript/bin/tsc -b` + `tsdown`（宿主） | 成功 |
| `node scripts/build.mjs`（扩展） | 成功（`dist/background.js` 222.11 kB、`dist/panel/assets/index.js` 546.47 kB） |
| `node scripts/verify-model-contracts.mjs --strict` + `verify-modality-matrix.mjs` | ok |
| `node scripts/verify-product-baseline.mjs` | ok |
| `node scripts/verify-stage-contracts.mjs` | PASS（14 Stage / 8 sidebar targets） |
| `node --test scripts/verify-anti-slop.test.mjs` | pass 3 / fail 0 |
| `git diff --check` | 无空白错误 |

`pnpm --filter … build:server` 在本工作树因 pnpm 11 的 pre-run 依赖检查（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，node_modules 为共享链接）中止；改用等价本地工具链（tsc -b → tsdown → 复制 client.js）执行并通过。

## 5. 未覆盖 / 限制

- 未调用真实模型 API（遵守 model API authority）；钉定与会话路由由宿主单测与扩展 worker 单测以桩宿主验证。
- Dev 45120 真机验收为人工职责，本证据不声称取得。
- 扩展 `dist/` 为 gitignore 产物：改动 `extension/src` 后必须 `node scripts/build.mjs` 才能让未打包扩展验收反映改动。
- 已知残留（非阻断）：`auto-model.ts` 的钉定谓词读失败按 fail-open 继续（已加 warn 留痕）；钉定集合无 TTL（随 mount 存续，仅内存）。
