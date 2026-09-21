# 代码审查 · Issue #2514 灵感预览弹窗分镜复制/标题

审查员：审秋毫（Shen）  
结论来源：本机 `ocr` CLI，禁止自然语言补审。

## 审查概况

| 项 | 值 |
| --- | --- |
| 工作树 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/inspiration-modal-shot-copy-issue-2514` |
| 分支 | `agent/inspiration-modal-shot-copy-issue-2514` |
| 范围 | workspace 未提交改动（暂存/未暂存/未跟踪）相对 `origin/main` |
| 基线 SHA | `9fa3fc2b3d4e743a49cad7e055af593e389c4603` |
| 目标 SHA | 无提交；工作区脏，HEAD 同基线 `9fa3fc2b3` |
| Issue | https://github.com/omnimux-ai/omnimux-dsh/issues/2514 |
| OCR | v1.12.8，session `81b1f91b-e3f4-4149-84f1-51d3fad782bf`，status `complete`，exit 0 |
| 模型 | `dsh-opencode4` / `deepseek-v4.1-flash` |
| 审阅文件 | 7（完成 7，失败 0） |
| 保留意见 | 严重 0 / 高 0 / **中 2** |
| 丢弃低档 | 0 |
| 命令行阻断 | 否 |
| 是否阻断合入 | **是（路由工程师）**：存在中档意见，按闸门不得标 Pass |

CLI 实际纳入：

- `plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx`
- `plugins/omnimux-inspiration/src/client/locales.js`
- `plugins/omnimux-inspiration/src/client/styles.js`
- `plugins/omnimux-inspiration/src/client/test-fixtures/ui-kit-shim.mjs`
- `tests/e2e/inspiration-shot-copy.e2e.test.mjs`
- `tests/e2e/inspiration-shot-copy.fixture.jsx`
- `tests/e2e/inspiration-shot-copy.fixture.mjs`

CLI 排除（未进入 LLM 审查，不得当作已审）：

- `plugins/omnimux-inspiration/src/client/styles.test.js`（default_path）
- `plugins/omnimux-inspiration/src/client/inspiration-shot-copy-render.test.js`（default_path）
- `specs/inspiration-modal-shot-copy.spec.md`（unsupported_ext）
- `pnpm-lock.yaml`（`--exclude`）

OCR 对产品源文件（弹窗 / locales / styles / shim）**未产出**严重/高/中意见。两条保留意见全部落在 e2e 断言强度。

## 证据命令

```bash
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/inspiration-modal-shot-copy-issue-2514
ocr review --preview --audience agent --background-file /tmp/ocr-dsh-2514-background.md --rule /tmp/ocr-dsh-2514-rule.json
ocr review --audience agent --format json \
  --background-file /tmp/ocr-dsh-2514-background.md \
  --rule /tmp/ocr-dsh-2514-rule.json \
  --exclude 'pnpm-lock.yaml' \
  --output /tmp/ocr-dsh-review.json
# OCR_EXIT:0
# JSON 副本：.agent-reports/inspiration-modal-shot-copy-issue-2514/ocr-review.json
```

背景文件：`/tmp/ocr-dsh-2514-background.md`  
规则文件：`/tmp/ocr-dsh-2514-rule.json`（`merge_system_rule: true`，未能覆盖 default_path 对 `*.test.js` 的排除）

## 必须处理（中）

按文件分组。严重/高：无。

### `tests/e2e/inspiration-shot-copy.e2e.test.mjs`

#### 1. 中 · test · L40 — 单条复制缺席断言过弱

- **行号**：40（已与工作区文件对上）
- **OCR 原文**：per-shot copy 缺席断言依赖文本启发式（`/复制|Prompt|copyPrompt/i` 扫 `button.textContent` / `aria-label`），弱于组件曾使用的权威标记 `omnimux-inspiration-shot-copy-btn`。图标-only / `title`-only / 原 class 回归会漏检，锁不住验收标准 (1)。
- **建议改法**（OCR `suggestion_code`）：同时统计 `.omnimux-inspiration-shot-copy-btn` 数量并断言为 0。

```js
shotCopyButtons: cards.flatMap((card) => [...card.querySelectorAll('button')].filter((button) => /复制|Prompt|copyPrompt/i.test(button.textContent || button.getAttribute('aria-label') || ''))).length,
shotCopyBtnClasses: cards.flatMap((card) => [...card.querySelectorAll('.omnimux-inspiration-shot-copy-btn')]).length,
```

- **类别**：test

#### 2. 中 · test · L30 — 中栏整段复制断言歧义

- **行号**：30（已与工作区文件对上）
- **OCR 原文**：`.omnimux-inspiration-modal-script-panel` 内有两个 `.omnimux-inspiration-modal-copy`——整段脚本 `CopyButton`（文档序第一）与翻译 `Button`（`InspirationPreviewModal.jsx` 约 644 / 652）。`querySelector` 取第一个，若整段 CopyButton 被删、翻译按钮仍在，`panelCopy === true` 仍成立，锁不住「整段复制必须保留」。
- **建议改法**：用复制专用标记（复制文案/label）断言，不要共用 class。
- **类别**：test

## 路由结论

**Engineer（寇豆码）**

- 严重 0、高 0、中 2 → 不得标 Pass。
- 命令行已跑完 → 非 Blocked。
- 合入：按审查闸门，先处理上述两条 e2e 断言，再进入 QA。产品源文件本轮 OCR 无中档以上意见。

## 本角色未做

- 未自行通读补审被 CLI 排除的 `styles.test.js` / `inspiration-shot-copy-render.test.js` / spec。
- 未改业务代码、未改测试。

---

# Round 2 · 2026-09-21 22:13

审查员：审秋毫（Shen）  
结论来源：本机 `ocr` CLI，禁止自然语言补审。第 2 轮（工程师已按第 1 轮中档意见改测试）。

## 审查概况

| 项 | 值 |
| --- | --- |
| 工作树 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/inspiration-modal-shot-copy-issue-2514` |
| 分支 | `agent/inspiration-modal-shot-copy-issue-2514` |
| 范围 | workspace 未提交改动（暂存/未暂存/未跟踪）相对 `origin/main` |
| 基线 SHA | `9fa3fc2b3d4e743a49cad7e055af593e389c4603` |
| 目标 SHA | 无提交；工作区脏，HEAD 同基线 `9fa3fc2b3` |
| Issue | https://github.com/omnimux-ai/omnimux-dsh/issues/2514 |
| OCR | v1.12.8，session `98228d87-3707-46c0-81d8-6d0c626e390c`，status `complete`，**OCR_EXIT:0** |
| 模型 | `dsh-opencode4` / `deepseek-v4.1-flash` |
| 审阅文件 | 7（完成 7，失败 0） |
| 保留意见 | **严重 0 / 高 0 / 中 0** |
| 丢弃低档 | 0（comments 数组为空，无低档可丢） |
| 命令行阻断 | 否 |
| 是否阻断合入 | **否** |

工程师本轮相对第 1 轮的测试收紧（OCR 已审 e2e，未审 `*.test.js`）：

- `shotCopyBtnClasses: document.querySelectorAll('.omnimux-inspiration-shot-copy-btn').length` 并断言为 0（关闭 round 1 中档 1）
- 中栏在 `.omnimux-inspiration-modal-panel-actions` 内找文案恰好为「复制」的按钮；右栏在 `.omnimux-inspiration-deconstruct-heading` 内同样按文案找（关闭 round 1 中档 2）

CLI 实际纳入（7，与 preview Will review 一致）：

- `plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx`
- `plugins/omnimux-inspiration/src/client/locales.js`
- `plugins/omnimux-inspiration/src/client/styles.js`
- `plugins/omnimux-inspiration/src/client/test-fixtures/ui-kit-shim.mjs`
- `tests/e2e/inspiration-shot-copy.e2e.test.mjs`
- `tests/e2e/inspiration-shot-copy.fixture.jsx`
- `tests/e2e/inspiration-shot-copy.fixture.mjs`

CLI 排除（未进入 LLM 审查，不得当作已审）：

- `plugins/omnimux-inspiration/src/client/styles.test.js`（default_path）
- `plugins/omnimux-inspiration/src/client/inspiration-shot-copy-render.test.js`（default_path）
- `specs/inspiration-modal-shot-copy.spec.md`（unsupported_ext）
- `pnpm-lock.yaml`（`--exclude`，preview 未列出）

OCR message：`Review complete: 0 finding(s) across 7 selected item(s).`  
`comments: []`，`coverage.failed: []`。第 1 轮两条中档未再出现。

## 证据命令

```bash
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/inspiration-modal-shot-copy-issue-2514
ocr review --preview --audience agent \
  --background-file /tmp/ocr-dsh-2514-r2-background.md \
  --rule /tmp/ocr-dsh-2514-r2-rule.json \
  --exclude 'pnpm-lock.yaml'
ocr review --audience agent --format json \
  --background-file /tmp/ocr-dsh-2514-r2-background.md \
  --rule /tmp/ocr-dsh-2514-r2-rule.json \
  --exclude 'pnpm-lock.yaml' \
  --output /tmp/ocr-dsh-review.json
# OCR_EXIT:0
# JSON 真源：/tmp/ocr-dsh-review.json
# JSON 副本：.agent-reports/inspiration-modal-shot-copy-issue-2514/ocr-review-r2.json
```

背景文件：`/tmp/ocr-dsh-2514-r2-background.md`  
规则文件：`/tmp/ocr-dsh-2514-r2-rule.json`（`merge_system_rule: true`，仍未能覆盖 default_path 对 `*.test.js` 的排除）  
elapsed：1m15s（manifest `elapsed_ms` 74742）

## 必须处理

无。严重 / 高 / 中均为 0。

## 路由结论

**Pass**

- 严重 0、高 0、中 0 → 按闸门可标 Pass。
- 命令行已跑完且 exit 0 → 非 Blocked。
- 合入：本轮 OCR **不阻断合入**。第 1 轮中档 2 条在本轮 comments 中未复发。
- 配合轮次：第 2 轮（上限 2 轮）；本轮无严重/高/中，停止审查循环。

## 本角色未做

- 未自行通读补审被 CLI 排除的 `styles.test.js` / `inspiration-shot-copy-render.test.js` / spec。
- 未改业务代码、未改测试。

