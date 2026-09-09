# Issue #824 QA 验收报告：视频合成剪辑器返回按钮文案改为退出编辑并调整至导出按钮右侧

## 验收结论：PASS

- 关联 Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/824
- 关联 PR: PR #825
- 测试环境: L2 独立隔离环境（Port: 44203, URL: http://127.0.0.1:44203/）
- 驱动工具: ego-browser (Chromium 原生真实渲染 + CDP 盒模型实测与全屏截图)
- 测试日期: 2026-09-09
- 验收人: 严过关 (QA) / 齐活林 (主理人)

---

## 真实 L2 实测指标

### 1. 按钮位置与相对排列
- **顺序验证**: `exitAfterExport: true`（Export 按钮位于左侧，退出编辑按钮位于右侧）
- **同行对齐**: `sameRow: true`（Export 按钮 top: 11px，退出编辑按钮 top: 12px，垂直方向水平严格对齐）
- **间距与尺寸**: 
  - Export 按钮: 77px × 38px
  - 退出编辑按钮: 112px × 36px (中文“退出编辑”) / 112px × 36px (英文“Exit editor”)
  - 两者水平间距: 38px（含 Export 下拉箭头扩展区与标准 gap）
- **防截断验证**: `notClipped: true`（退出编辑按钮右边界 1902px，距离屏幕右边界 1920px 留有 18px 安全边距，绝无截断或溢出）

### 2. 文案与多语言
- **中文模式**: 渲染为 **“退出编辑”**（内嵌 14px 返回/退出箭头 SVG 图标）
- **英文模式**: 渲染为 **“Exit editor”**（内嵌 14px 返回/退出箭头 SVG 图标）
- `zh` 与 `en` 词典中均更新 `'tab.returnToCanvas'` 与 `'tab.exitEditor'` 键值

### 3. 点击交互与关闭验证
- 真实点击退出编辑按钮后：
  - 触发 `handleReturnToCanvas`
  - 成功捕获并派发全局事件 `omnimux-clip-close`，携带 `{ nodeId: "node-comp-824" }`
  - `window.__omnimuxClipStageStore` 状态置为 `false`
  - 剪辑器视图平滑退出回到画布，底层 editor 实例保活，重新打开数据完好保留

### 4. 实机截图证据
- 中文渲染实机截图: `.workbuddy/evidence/issue-824-exit-editor-zh-l2-screenshot.png`
- 英文渲染实机截图: `.workbuddy/evidence/issue-824-exit-editor-l2-screenshot.png`

### 5. 单测与门禁
- `pnpm --filter omnimux-clip test`: 104/104 PASS
- `pnpm verify:stages`: 10 Stage / 8 sidebar targets PASS
- `pnpm check:boundaries`: 2175 files PASS
- `pnpm lint:i18n`: 100% Quality Gate Passed
- `node scripts/scan-ui-gates.mjs`: UI01~UI10 0 violations PASS
