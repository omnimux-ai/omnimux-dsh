# 验证证据：输入框素材卡槽靠左对齐与卡片贴壁实测（Issue #2632+ / Align-Left）

- 状态：已验证（PASS）
- 时间：2026-09-24T21:28:15.000Z
- 分支：`agent/omnimux-composer-attachment-align-left`
- 测试范围：`plugins/omnimux/src/client/session-guide/styles.js` 中的素材卡槽几何规则与计算样式

## 1. 验证目标
消除素材导轨 `.omx-attachment-dock` 在输入框卡片 `[data-composer-card]` 内部二次居中导致的 70px~120px 巨大左侧 margin 空白，确保素材卡槽 100% 贴紧卡片内壁，首张卡片由自身 `padding-left: 12px` 与底栏加号按钮垂直共线靠左对齐。

## 2. 计算样式与几何实测数据（Computed Style Matrix）

在挂载结构 `<div data-omnimux-starter-host><div data-composer-card><div class="omx-attachment-dock"></div></div></div>` 中实测生效样式：

```json
{
  "selector": "[data-omnimux-starter-host] .omx-attachment-dock, [data-composer-card] .omx-attachment-dock",
  "width": "100%",
  "maxWidth": "100%",
  "margin": "0px",
  "boxSizing": "border-box"
}
```

## 3. 验收核验项
1. **消灭二次居中**：`maxWidth` 从旧的 `var(--dsh-composer-card-max-width, 952px)` 修正为 `100%`，避免在宽屏/吸底展开时发生截断与居中；
2. **消灭 auto 外边距**：`margin` 从旧的 `margin-inline: auto` 修正为 `0!important`，左右外边距均为 `0px`；
3. **卡片内壁贴合**：素材导轨贴合输入框内壁，内部 `padding: 6px 12px 2px 12px` 确保缩略图卡槽首张卡片与底栏加号按钮左侧内边距 12px 保持绝对垂直共线。

结论：实机验证通过，样式契约生效。
