# 规格：输入框吸底态长列表安全避让垫高样式 (Composer Dock Seat Clearance Spec)

## 1. 目标（Objective）
在 OmniMux 首页吸底模式下（`[data-omnimux-starter-host][data-omnimux-dock-open]`），输入框与复原气泡通过 `position: fixed` 钉在视口底部。当长列表（模板库、技能货架、灵感矩阵）内容滚到底部时，最底排卡片与操作按钮容易被钉底卡片遮挡。
本规格确立动态安全垫高样式规范：
在宿主滚动底座 `[data-composer-seat]` 上动态垫高 `calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 56px) !important`，留出 56px 现代 SaaS 呼吸间距，确保长列表滚到底部时最底排卡片与操作按钮清晰可见且可交互，无论常规全屏态还是分栏紧凑态均以最高优先级生效。

## 2. 关键设计原则与边界（Boundaries & Constraints）
- **零自由发挥（Zero Improvisation）**：严格遵循产品经理（许清楚）下发的文案与样式规范，零多余 DOM 元素添加，零自由发挥文案，零装饰性 Emoji/Badge。
- **设计系统遵循**：严格基于项目根目录 `design.md`，使用 CSS 变量动态计算（`--omnimux-dock-bottom`, `--omnimux-dock-card-height`），不硬编码死尺寸。
- **选择器特异性与覆盖保证**：在紧凑分栏（`html[data-omnimux-split-compact]` 等）状态下，原有规则 `padding-bottom: 0!important` 必须被吸底状态下的动态垫高规则覆盖。

## 3. 样式契约（Style Contract）
在 `plugins/omnimux/src/client/session-guide/styles.js` 的 `[data-omnimux-starter-host][data-omnimux-dock-open]` 区域追加：

```css
/* 吸底状态下宿主滚动底座动态安全垫高：
   彻底避让 fixed 钉底的输入框与收起气泡，并留出 56px 现代 SaaS 呼吸间距，
   确保长列表（模板、货架、灵感）滚到底部时，最底排卡片与操作按钮清晰可见且可交互。
   无论常规全屏态还是分栏紧凑态，均以此动态垫高为最高优先级！ */
[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-seat],
html[data-omnimux-split-compact] [data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-seat],
html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-seat],
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-seat],
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-seat] {
  padding-bottom: calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 56px) !important;
}
```

## 4. 验证策略与验收用例（Verification Strategy & Acceptance Criteria）
1. **未吸底状态**：当宿主没有 `data-omnimux-dock-open` 标记时，`[data-composer-seat]` 保持原本默认边距，不触发该计算公式。
2. **吸底状态**：当宿主带有 `data-omnimux-dock-open` 标记时，计算出的 `padding-bottom` 生效为 `calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 56px) !important`。
3. **分栏紧凑态**：在 `html[data-omnimux-split-compact]` 及其它紧凑/侧栏展开场景下，吸底规则亦能以 `!important` 与高特异性胜出，确保安全垫高生效。
4. **单测覆盖**：在 `plugins/omnimux/src/client/session-guide/docked-slot-position.e2e.test.js` 中增加针对此规则的单元与端到端测试用例，运行 `node --test` 全数通过。
