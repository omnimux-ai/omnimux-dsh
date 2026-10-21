# 规范：X 海报入口改为互动栏图标（Issue #3474）

## 1. 目标

把 #3460 的「互动栏下方文字按钮」改为 **X 原生互动栏内的纯图标按钮**：位于**书签图标左侧**，颜色使用 OmniMux 品牌紫，保持与原生互动图标同一节奏；点击行为、海报流程与设置开关不变。

## 2. 用户操作旅程与界面反馈

1. 时间线/详情页推文：互动栏（回复、转帖、喜欢、浏览量、**书签**、分享）中，书签图标左侧出现一个紫色海报图标（20px SVG，34px 点击圆，`title`/`aria-label` =「生成海报」）。
2. Hover：图标上出现淡紫圆形底，无文字标签。
3. 点击：打开黑白主题模态（现有流程不变）→ 确认 → 出图 + 观点 → 跳发帖页附图预填。
4. 设置 →「X 海报」关闭：所有入口立即移除，observer 停止。
5. 书签不存在（部分布局/改版）：入口落到分享图标左侧；两者都不存在：落到互动栏末尾，仍可用。
6. 引用推文内部不重复挂载；只处理最外层推文 article。

## 3. 定位规则

```ts
// 书签按钮所在「互动栏直属子节点」之前；找不到则分享；再找不到返回 null（append）
findPosterActionAnchor(group: HTMLElement): Element | null
```

- 只接受 `group.closest('article') === article` 的互动栏（与 #3460 相同）。
- 书签选择器：`[data-testid="bookmark"], [data-testid="removeBookmark"]`；分享：`[data-testid="share"]`。
- 从命中按钮向上找到 `parentElement === group` 的直属节点；避免把按钮塞进别的 action 容器。
- 通过 `WeakMap<HTMLElement, HTMLElement>` 记录 article→入口；DOM 断开时重挂；互动栏内重复入口删除。

## 4. 视觉规格（代码固化）

- 容器 `.omnimux-poster-action`：`display:flex; flex:0 0 auto;`（作为互动栏 flex 子项，不拉伸）。
- 按钮 `.omnimux-poster-action-button`：34×34、圆角 50%、透明底、`padding:0`、无边框。
- 图标：20×20、`stroke="currentColor"`、`stroke-width:1.8`、圆角矩形 + 内文线条，无 emoji/字符。
- 颜色：复用扩展已放行的品牌标记色 `BRAND_MARK_COLOR`（`#b8b7ff`，唯一 owner 为 `content/surfaces/media-trigger.ts`，`tests/no-purple-theme.spec.ts` 锁定）；通过 `--omnimux-poster-brand` 注入，图标使用 `color: var(...)`，hover 背景用 `color-mix`，不新增紫色字面量。
- 可读性：图标带 1px 暗色 drop-shadow 晕边，保证白底 X 主题下仍可辨；不改变图标尺寸。
- 不写文字标签；`title` 与 `aria-label` 提供可访问名。

## 5. 验收

- 单测：`findPosterActionAnchor` 在「书签存在 / 仅分享 / 都没有」三态的返回值；入口按钮无 textContent、有 aria-label。
- 真实 Chromium fixture（含 views/bookmark/share）：入口位于互动栏内、`nextElementSibling` 为书签项、颜色为品牌紫；截图留存。
- 原有 29 个海报用例与构建不回退；不新增 manifest 权限。

## 6. 非目标

不改海报渲染、观点生成、发帖页附图、主题数量；不做悬浮 tooltip 组件；不调整其他互动图标顺序。

## 假设

X 互动栏的书签按钮是 group 的直属子节点（或仅隔一层包装），且 React 重绘不会整体替换互动栏。若书签被渲染到别的容器或 Shadow DOM，则 insertBefore 定位会失败。

## 证伪方式

真实 Chromium fixture 中若 `.omnimux-poster-action` 的 `nextElementSibling` 不再包含 `[data-testid="bookmark"]`，或入口落到互动栏外，即证伪。复跑 `docs/evidence/issue-3474` 的 CDP 脚本并检查 `entryBeforeBookmark`。
