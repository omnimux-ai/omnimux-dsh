# 输入框素材卡槽靠左对齐优化规格（Composer Attachment Slot Align Left Spec）

- 任务分支：`agent/omnimux-composer-attachment-align-left`
- 日期：2026-09-24
- 责任人：前端开发工程师 · 裴像素（Pixel / 像素匠）
- 依据：产品经理（许清楚）下发的 PRD / 原型 / Spec / Plan 四件套及设计规范 `design.md`

## 1. 背景与根因（Problem & Root Cause）

在会话输入框中，素材导轨（`.omx-attachment-dock`）此前已调整回输入框卡片 `[data-composer-card]` 内侧挂载。外层 `[data-composer-card]` 本身已经负责在全屏大区域中居中。
而在 `plugins/omnimux/src/client/session-guide/styles.js` 中，此前遗留了针对外挂时代的居中兜底样式：
```css
[data-omnimux-starter-host] .omx-attachment-dock {
  width:100%!important;
  max-width:var(--dsh-composer-card-max-width, 952px)!important;
  margin-inline:auto!important;
  box-sizing:border-box!important;
}
```
**根因分析**：
在卡片内部的 `.omx-attachment-dock` 若继续被限制 `max-width: 952px` 且 `margin-inline: auto`，会在大屏或吸底态（`[data-omnimux-dock-open]` 时输入框变宽）下在卡片内部触发二次居中，产生 70px~120px 的巨大左侧空白 margin，导致素材卡槽无法靠左对齐，与底栏加号按钮无法垂直共线。

## 2. 目标与用户体验旅程（Objective & User Journey）

1. **用户操作旅程**：
   - 用户在会话引导页或常规会话中添加图片、视频等素材附件；
   - 素材缩略图卡槽在输入框卡片内展开。
2. **期望界面反馈**：
   - 素材导轨 `.omx-attachment-dock` 100% 贴合卡片内壁，绝不产生居中外边距（`margin: 0!important`，`max-width: 100%!important`）；
   - 首张卡片由自身 `padding-left: 12px` 严格与底栏加号（+）按钮垂直共线靠左对齐；
   - 无论是新会话未吸底态还是吸底态（`[data-omnimux-dock-open]`），在任何视口宽度下均保持靠左对齐一致性。

## 3. 验收标准（Acceptance Criteria）

- **AC-1（样式规范修正）**：
  在 `plugins/omnimux/src/client/session-guide/styles.js` 中将 `[data-omnimux-starter-host] .omx-attachment-dock` 样式更新为：
  ```css
  /* 素材导轨贴合输入框内壁，首张卡片由自身 padding-left: 12px 严格与底栏加号按钮垂直共线靠左对齐 */
  [data-omnimux-starter-host] .omx-attachment-dock {
    width:100%!important;
    max-width:100%!important;
    margin:0!important;
    box-sizing:border-box!important;
  }
  ```
- **AC-2（卡片内壁贴合硬约束）**：
  在 `plugins/omnimux/src/client/session-guide/styles.js` 中同时为 `[data-composer-card] .omx-attachment-dock` 声明相同贴壁契约：
  ```css
  [data-composer-card] .omx-attachment-dock {
    width:100%!important;
    max-width:100%!important;
    margin:0!important;
    box-sizing:border-box!important;
  }
  ```
- **AC-3（E2E 测试断言更新）**：
  在 `plugins/omnimux/src/client/session-guide/docked-slot-position.e2e.test.js` 中：
  原测试 `test('e2e: 未吸底时，素材条与输入框同宽并居中')` 翻新为断言素材导轨贴合卡片内壁（`maxWidth` 为 `100%`，`margin` 为 `0` / `0px`，消除 `auto` 居中），确保靠左对齐契约生效。
- **AC-4（卡槽测试断言更新）**：
  在 `plugins/omnimux/src/client/attachments/tray-slot.test.js` 中：
  将旧正则断言更新为匹配 `max-width:100%!important;[^}]*margin:0!important`。
- **AC-5（自动化回归）**：
  运行测试套件全部通过，0 失败，0 告警。

## 4. 边界与禁忌（Boundaries & Anti-Overdesign）

- 严格遵循团队治理契约，100% 执行产品经理核定的样式与结构；
- 零自由发挥：严禁添加任何多余包装层、胶囊徽章、装饰图标或副标题；
- 严禁在卡片内部引入新的写死固定像素宽度；
- 完全遵循 `design.md` 设计体系。

## 5. 验证命令（Commands）

```bash
node --test plugins/omnimux/src/client/attachments/tray-slot.test.js plugins/omnimux/src/client/session-guide/docked-slot-position.e2e.test.js
```
