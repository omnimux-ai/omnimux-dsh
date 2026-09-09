# 工程实现报告：视频剪辑退出编辑按钮纯文本化无图标改造 (Issue #828)

## 1. 任务背景与目标
针对用户提出的“退出编辑 不要图标 只要文本按钮”需求（关联 Issue #828，分支 `feat/clip-text-only-button-828`），完成以下工程实施与质量保障：
- **移除图标**：
  - 定位 `plugins/omnimux-clip/src/client/openreel/web/components/editor/Toolbar.tsx` 中位于 Export 导出按钮右侧的退出编辑按钮；
  - 彻底移除按钮内部的 `<svg>` 返回/退出箭头图标；
  - 改造为纯文本按钮结构，采用 `inline-flex items-center justify-center` 居中布局；
- **视觉一致性**：
  - 保持与 Export 导出按钮同行并排对齐（`openreel-toolbar-right` 容器内 `gap-2.5`）；
  - 保持高度 36px（`h-[36px]`）、内边距 `px-3.5 py-[8px]`、圆角 8px（`rounded-[8px]`）；
  - 保持 Secondary 质感背景与边框（`bg-bg-2 hover:bg-hover border border-border hover:border-border-focus text-fg-2 hover:text-fg text-[13px] font-medium whitespace-nowrap transition-colors select-none shrink-0`）；
  - 保持原生窗口拖拽保护（`WebkitAppRegion: "no-drag", pointerEvents: "auto"`）；
- **单测与静态门禁**：
  - 排查并适配单测中的相关断言，在 `canvas-toolbar-mode.test.js` 中补充纯文本且不含 `<svg>` 的防退化断言；
  - 构建生成 `lib/client.js`；
  - 验证 `corepack pnpm --filter omnimux-clip test` 保持 104/104 项单测全绿；
  - 静态门禁（`scan-ui-gates`、`verify:stages`、`check:boundaries`、`lint:i18n`）全部通过。

## 2. 核心修改详情

### 2.1 工具栏退出编辑按钮纯文本化
在 `plugins/omnimux-clip/src/client/openreel/web/components/editor/Toolbar.tsx` 中：
- **修改前**：
  ```tsx
          {isCanvasMode && (
            <button
              type="button"
              onClick={handleReturnToCanvas}
              aria-label={returnToCanvasText}
              className="omnimux-clip-stage-close-btn flex items-center gap-1.5 h-[36px] px-3.5 py-[8px] rounded-[8px] bg-bg-2 hover:bg-hover border border-border hover:border-border-focus text-fg-2 hover:text-fg text-[13px] font-medium whitespace-nowrap transition-colors select-none"
              style={{ WebkitAppRegion: "no-drag", pointerEvents: "auto" } as React.CSSProperties}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className="shrink-0"
                aria-hidden="true"
              >
                <path
                  d="M9 3L4 8L9 13M4 8H14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="whitespace-nowrap">{returnToCanvasText}</span>
            </button>
          )}
  ```
- **修改后**：
  ```tsx
          {isCanvasMode && (
            <button
              type="button"
              onClick={handleReturnToCanvas}
              aria-label={returnToCanvasText}
              className="omnimux-clip-stage-close-btn inline-flex items-center justify-center h-[36px] px-3.5 py-[8px] rounded-[8px] bg-bg-2 hover:bg-hover border border-border hover:border-border-focus text-fg-2 hover:text-fg text-[13px] font-medium whitespace-nowrap transition-colors select-none shrink-0"
              style={{ WebkitAppRegion: "no-drag", pointerEvents: "auto" } as React.CSSProperties}
            >
              <span className="whitespace-nowrap">{returnToCanvasText}</span>
            </button>
          )}
  ```

### 2.2 单测防退化断言补充
在 `plugins/omnimux-clip/src/client/canvas-toolbar-mode.test.js` 中：
- 在原有的右段按钮相对位置验证后，增加断言检测退出编辑按钮代码切片：
  ```javascript
  const exitBtnEnd = src.indexOf('</button>', exitBtnIndex)
  const exitBtnSnippet = src.slice(exitBtnIndex, exitBtnEnd)
  assert.ok(!exitBtnSnippet.includes('<svg'), '退出编辑按钮必须为纯文本按钮，不包含 svg 图标')
  assert.ok(exitBtnSnippet.includes('inline-flex'), '退出编辑按钮必须使用 inline-flex 居中布局')
  ```
- 确认现有 `composition-locale-qa.test.js` 与 `host-locale.test.js` 的行为均无需改动，测试继续全量覆盖 5 轮画布切换与中英文字符串断言。

## 3. 验证与门禁结果

### 3.1 产物构建
执行命令：
```bash
pnpm_config_verify_deps_before_run=false corepack pnpm --filter omnimux-clip build
```
结果：
- 成功编译生成 `plugins/omnimux-clip/lib/client.js`（9,539,025 字节）；
- `entry-contract.test.js` 中针对 `lib/client.js` 与源码 inject 声明的一致性验证（bundle drift guard）成功匹配并放行。

### 3.2 单元测试（104/104 PASS）
执行命令：
```bash
pnpm_config_verify_deps_before_run=false corepack pnpm --filter omnimux-clip test
```
结果：
- 104 tests, 12 suites, **104 passed, 0 failed** (耗时 ~420ms)。

### 3.3 静态质量门禁
1. **UI01~UI10 规范静态扫描**：
   ```bash
   node scripts/scan-ui-gates.mjs
   ```
   → 扫描 276 个客户端视图源文件，**0 违规拦截，全部合规**。
2. **Stage 契约扫描**：
   ```bash
   corepack pnpm verify:stages
   ```
   → **PASS: 10 Stage components; 8 registered sidebar targets and their runtime contracts**。
3. **依赖与运行时边界检查**：
   ```bash
   corepack pnpm check:boundaries
   ```
   → **✅ verify-plugin-boundaries: 2175 source file(s) across plugins verified for dependency and runtime boundaries**。
4. **多语言与文案门禁**：
   ```bash
   corepack pnpm lint:i18n
   ```
   → **✅ [i18n-lint] 100% Quality Gate Passed! (8 locale files & 12 manifests scanned)**。

## 4. 交付物清单
- `plugins/omnimux-clip/src/client/openreel/web/components/editor/Toolbar.tsx`：彻底移除 `<svg>` 图标，更新类名为纯文本 `inline-flex` 居中布局；
- `plugins/omnimux-clip/src/client/canvas-toolbar-mode.test.js`：新增纯文本按钮无 SVG 图标防退化断言；
- `plugins/omnimux-clip/lib/client.js`：重新编译生成的客户端 bundle；
- `docs/implementation/issue-828-text-only-button.md`：本工程实现报告。

## 5. 后续安排
本工作树 `feat/clip-text-only-button-828` 代码与静态门禁、构建及单测已全量就绪。交由主理人安排真实 L2 环境实机测量（高度、水平对齐、纯文本展示）、ego-browser 截图取证及 PR 合并收尾。
