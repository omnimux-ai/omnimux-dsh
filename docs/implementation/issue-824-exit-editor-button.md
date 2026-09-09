# 工程实现报告：视频剪辑退出编辑按钮文案变更与位置调整 (Issue #824)

## 1. 任务背景与目标
针对用户提出的“返回画布 改为 退出编辑 放在 导出 右侧 而不是左侧 立即修复 测试验证合并收尾”需求（关联 Issue #824，分支 `feat/clip-exit-editor-824`），完成以下工程实施：
- **文案变更**：
  - 中文文案由“返回画布”调整为“退出编辑”；
  - 英文文案由“Back to canvas”调整为“Exit editor”；
  - 同步更新多语言词典（`zh` 和 `en`）及 `Toolbar.tsx` 中的展示逻辑；
- **位置调整**：
  - 将退出编辑按钮从 Export 导出按钮左侧移动至 Export 导出按钮组的**右侧**，形成 `[ Export 导出按钮组 ] [ 退出编辑按钮 ]` 的布局；
  - 保持原有样式体系：高度 36px、圆角 8px、14px 返回/退出 SVG 箭头图标、`whitespace-nowrap` 防截断、`WebkitAppRegion: "no-drag"` 原生防拖拽保护与 `gap-2.5` 布局间距；
- **测试用例适配与构建验证**：
  - 适配 `canvas-toolbar-mode.test.js`、`composition-locale-qa.test.js`、`host-locale.test.js` 中的文案与相对位置断言；
  - 重新构建 `lib/client.js`，运行 `omnimux-clip` 单元测试，保证 104/104 全部 PASS；
  - 静态门禁（`scan-ui-gates`、`verify:stages`、`check:boundaries`、`lint:i18n`）全部通过。

## 2. 核心修改详情

### 2.1 多语言字典与文案更新
1. **`plugins/omnimux-clip/src/client/index.js`**：
   - `zh` 字典：将 `'tab.returnToCanvas'` 更新为 `'退出编辑'`，并补充 `'tab.exitEditor': '退出编辑'`；
   - `en` 字典：将 `'tab.returnToCanvas'` 更新为 `'Exit editor'`，并补充 `'tab.exitEditor': 'Exit editor'`；
2. **`plugins/omnimux-clip/src/client/openreel/web/components/editor/Toolbar.tsx`**：
   - 更新语言文案判定：
     ```tsx
     const returnToCanvasText = hostLocale?.active === "en" ? "Exit editor" : "退出编辑";
     ```

### 2.2 工具栏右区控件顺序调整
在 `plugins/omnimux-clip/src/client/openreel/web/components/editor/Toolbar.tsx` 的 `data-toolbar-section="right"`（`openreel-toolbar-right flex items-center justify-end shrink-0 gap-2.5`）容器内：
- 原布局：`[ 退出编辑按钮 ] [ Export 导出按钮组 (isExporting / error / complete / 正常导出下拉) ]`；
- 新布局：`[ Export 导出按钮组 (isExporting / error / complete / 正常导出下拉) ] [ 退出编辑按钮 ]`；
- 完整保留样式规范：
  - `h-[36px] px-3.5 py-[8px] rounded-[8px]`
  - `bg-bg-2 hover:bg-hover border border-border hover:border-border-focus text-fg-2 hover:text-fg text-[13px] font-medium whitespace-nowrap transition-colors select-none`
  - SVG 图标尺寸 14×14
  - `style={{ WebkitAppRegion: "no-drag", pointerEvents: "auto" }}`
  - 维持 `openreel-toolbar-right` 的 `gap-2.5` 间距。

### 2.3 测试用例适配与强化
1. **`canvas-toolbar-mode.test.js`**：
   - 增加断言验证 `openreel-export-btn` 的位置索引小于 `omnimux-clip-stage-close-btn` 的位置索引，严格保证退出编辑按钮位于 Export 导出按钮的右侧；
   - 更新断言描述文案。
2. **`composition-locale-qa.test.js`**：
   - 适配 Mock 组件与 DOM 断言，中英文切换文本由“返回画布 / Back to canvas”更新为“退出编辑 / Exit editor”；
   - 保证 5 轮画布返回/重开生命周期测试全部 PASS。
3. **`host-locale.test.js`**：
   - 断言匹配 `Exit editor` 与 `退出编辑`；
   - 增加断言验证 `Toolbar.tsx` 中 `exportPos < exitPos`，确保退出编辑按钮渲染在导出按钮右侧。

## 3. 验证与门禁结果

### 3.1 单元测试（104/104 PASS）
执行命令：
`pnpm_config_verify_deps_before_run=false corepack pnpm --filter omnimux-clip test`
结果：
- 104 tests, 12 suites, **104 passed, 0 failed** (耗时 442ms)。

### 3.2 产物构建
执行命令：
`pnpm_config_verify_deps_before_run=false corepack pnpm --filter omnimux-clip build`
结果：
- 成功重新编译生成 `lib/client.js`（9539300 字节）；
- `entry-contract.test.js` 的 bundle drift guard 验证通过。

### 3.3 静态质量门禁
1. **UI01~UI10 规范静态扫描**：
   `node scripts/scan-ui-gates.mjs`
   → 分析 276 个客户端视图源文件，**0 违规拦截**。
2. **Stage 契约扫描**：
   `corepack pnpm verify:stages`
   → **PASS: 10 Stage components; 8 registered sidebar targets**。
3. **依赖与运行时边界**：
   `corepack pnpm check:boundaries`
   → **2175 source file(s) across plugins verified**。
4. **多语言与文案门禁**：
   `corepack pnpm lint:i18n`
   → **100% Quality Gate Passed!** (8 locale files & 12 manifests scanned)。

## 4. 交付物清单
- `plugins/omnimux-clip/src/client/index.js`：更新字典中英文案为“退出编辑”/“Exit editor”，补充 `tab.exitEditor`；
- `plugins/omnimux-clip/src/client/openreel/web/components/editor/Toolbar.tsx`：更新按钮文案并将其移动至 Export 导出右侧；
- `plugins/omnimux-clip/src/client/canvas-toolbar-mode.test.js`：增加退出编辑按钮位于导出按钮右侧的断言；
- `plugins/omnimux-clip/src/client/composition-locale-qa.test.js`：适配多语言组件断言；
- `plugins/omnimux-clip/src/client/host-locale.test.js`：适配多语言与相对位置断言；
- `plugins/omnimux-clip/lib/client.js`：重新构建打包产物；
- `docs/implementation/issue-824-exit-editor-button.md`：本工程实施报告。
