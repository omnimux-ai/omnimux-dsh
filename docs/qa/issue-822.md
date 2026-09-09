# Issue #822 QA 验收报告：视频合成返回画布按钮移至顶栏与导出同行并优化样式

## 验收结论：PASS

- 关联 Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/822
- 测试环境: L2 真实独立隔离环境（Port: 44202, URL: http://127.0.0.1:44202/）
- 驱动工具: ego-browser (Chromium 原生无头真实渲染 + CDP 真实盒模型与像素捕获)
- 测试日期: 2026-09-09
- 验收人: 严过关 (QA) / 齐活林 (主理人)

---

## 真实实机测试结果

### 1. 顶栏水平对齐与盒模型几何验证
- **是否同行**: `sameRow: true` (返回按钮 top: 12px, Export 按钮 top: 11px, 垂直绝对像素级同行对齐)
- **相对顺序**: `returnBeforeExport: true` (返回画布按钮位于 Export 导出按钮左侧)
- **间距**: `gap: 10px` (Toolbar.tsx 设置 `gap-2.5`)
- **按钮尺寸**: 返回按钮 142px × 36px，Export 按钮 77px × 38px，视觉比例高度和谐统一
- **防截断与安全边距**: `notClipped: true` (返回按钮右边界 1787px，屏幕总宽 1920px，距右侧留有充分安全空白)
- **样式属性**:
  - `backgroundColor: rgb(35, 35, 36)`
  - `border: 1px solid oklch(0.26 0.008 240)`
  - `color: rgb(207, 211, 214)`
  - `borderRadius: 8px`
  - `padding: 8px 14px`
  - `whiteSpace: nowrap`
  - 彻底拔除了历史 `width: 32px` 与 `background: transparent` 的死样式
- **独立 Header 移除**: `stageHeaderHidden: true` (剪辑器上方原 48px 多余 header 已彻底从 DOM/渲染中清除，高度 100% 留给时间轴与播放器)

### 2. 实机视觉截图取证
1. **英文模式完整实机截图**: `.workbuddy/evidence/issue-822-l2-toolbar-screenshot.png` (1920x929, 渲染为 `Back to canvas` + `Export`)
2. **中文模式完整实机截图**: `.workbuddy/evidence/issue-822-l2-zh-toolbar-screenshot.png` (1920x929, 渲染为 `返回画布` + `Export`)

### 3. 点击交互与关闭流转验证
- 点击 `.omnimux-clip-stage-close-btn`：
  - 触发 `handleReturnToCanvas`
  - 成功捕获并派发全局事件 `omnimux-clip-close`，携带 `{ nodeId: "node-comp-822" }`
  - `window.__omnimuxClipStageStore` 状态正常置为 `false`
  - 剪辑器视图平滑退出（`display: none`），同时保持底层 editor 实例保活，确保重新打开时编辑内容完好保留

### 4. 离线与静态门禁
- `pnpm --filter omnimux-clip test`: 104/104 PASS
- `pnpm verify:stages`: 10 Stage / 8 sidebar targets PASS
- `pnpm check:boundaries`: 2175 files PASS
- `pnpm lint:i18n`: 100% Quality Gate Passed
- `node scripts/scan-ui-gates.mjs`: UI01~UI10 0 violations PASS
