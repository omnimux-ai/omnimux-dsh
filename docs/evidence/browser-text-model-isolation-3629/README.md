# 浏览器插件 · 对话与文本生成模型独立配置（Issue #3629）

真实浏览器（未打包扩展，`scripts/lib/extension-e2e.mjs` 单进程、自清理）验收证据。
本目录是本次交付的专属实测证据，不是首页冒烟图。

## 1. 验收对象

- 工作树：`.worktrees/browser-text-model-isolation-issue-3629`
- 规格：`specs/browser-text-model-isolation.spec.md`
- 扩展构建产物：`plugins/omnimux-browser/extension/dist`（`node scripts/build.mjs` 重建后验收）
- 运行方式：Chrome for Testing + `--load-extension`，扩展页 `chrome-extension://<id>/panel/index.html`

## 2. 真实浏览器断言（acceptance-report.json）

| 断言 | 结果 |
| --- | --- |
| A1 对话模型行存在（「对话模型与推理等级」） | pass |
| A1 文本生成模型行存在（「文本生成模型与推理等级」） | pass |
| A1 两行各有独立 select | pass |
| A5 文本生成模型可切换 | pass |
| A1 切换后 `dshSettings.textModel` 生效 | pass |
| A1 对话模型键未被文本切换改动 | pass |

关键观察（`acceptance-report.json`）：

- 对话行 `value = gpt-6-astra`；文本行 `value = ''`（首项即「跟随对话模型」空值）。
- 切换文本行为 `gpt-6-astra` 后：`dshSettings.textModel = gpt-6-astra`、`textEffort = medium`。
- 同一次切换后 `localStorage['omnimux_default_model']` 保持 `null`（对话选择器存储未被文本行触碰）。

截图：`01-settings-before.png`（两行均已渲染）、`02-settings-after.png`（切换后）。

## 3. 同批次自动化验证（同工作树）

| 命令 | 结果 |
| --- | --- |
| `cd plugins/omnimux-browser && node node_modules/vitest/vitest.mjs run` | 20 passed / 3 skipped（26 文件）；**329 passed / 6 skipped**；3 个套件加载失败（`composition`、`session-purge`、`tests/e2e/bridge-extension.e2e`）——缺 `@deepseek-ai/cordis-*`、`playwright-core` 等未安装依赖，**base（主检出 main）同命令同样失败**，与本次改动无关 |
| `cd plugins/omnimux-browser/extension && ./node_modules/.bin/vitest run` | 158 passed（158 文件）；**1714 passed | 1 expected fail**，0 失败 |
| `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`（extension） | 105 行错误，与主检出同命令逐条一致（仅行号位移），无新增 |
| `node node_modules/typescript/bin/tsc -b` + `tsdown` + client 拷贝（宿主） | 成功（`lib/index.js` 161.57 kB） |
| `node scripts/verify-model-contracts.mjs --strict` + `verify-modality-matrix.mjs` | ok（admission errors=0） |
| `node scripts/verify-product-baseline.mjs` | ok |
| `node scripts/verify-stage-contracts.mjs` | PASS（14 Stage / 8 sidebar targets） |
| `node --test scripts/verify-anti-slop.test.mjs` | fail 0 |
| `git diff --check` | 无空白错误 |

`pnpm --filter … build:server` 在本工作树因 pnpm 11 的 pre-run 依赖检查（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，node_modules 为共享链接）中止；改用等价本地工具链（tsc -b → tsdown → 复制 client.js）执行并通过。

## 4. 未覆盖 / 限制

- 未调用真实模型 API（遵守 model API authority）；钉定与会话路由由宿主单测与扩展 worker 单测以桩宿主验证。
- Dev 45120 真机验收为人工职责，本证据不声称取得。
- 扩展 `dist/` 为 gitignore 产物：改动 `extension/src` 后必须 `node scripts/build.mjs` 才能让未打包扩展验收反映改动。
