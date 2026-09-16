# 灵感社区吸附栏容器高度自适应与锁定修复规格（Issue #1977 跟进）

- 任务单：Issue #1977（灵感社区向上滚动吸附栏固定失效）
- 分支：`fix/inspiration-sticky-flex-fix-issue-1977`
- 关联契约：`docs/contracts/first-level-page-layout.md` §二·补

## 1. 目标（Objective）

**问题**：在 Dev 端口网页环境实测发现，灵感社区整页向上滚动时，吸附栏无法固定在顶部，滚过一定距离后直接移出屏幕上方。

**深层根因**：
- 外层滚动容器 `.omnimux-inspiration-stage` 设置了 `display: flex; flex-direction: column; height: 100%`。
- 子容器 `.omnimux-inspiration-stage-body` 及孙容器 `.omnimux-inspiration-root` 作为列向 Flex 子项，默认具有 `flex-shrink: 1` 且无 `flex: none` 保护，其渲染高度被弹性收缩为视口净高度（约 882px），而没有随内部卡片网格真实高度展开（约 4129px）。
- 根据 CSS Sticky 规范，吸附元素不能超出其包含块（Containing Block）的高度边界。当整页滚动超过 882px 时，包含块底部触碰吸附栏，强制将吸附栏带出屏幕。

**修复方案**：
- 为 `.omnimux-inspiration-stage-body` 与 `.omnimux-inspiration-root` 显式设置 `flex: none;`（即 `flex: 0 0 auto`）。
- 确保两个容器在主轴方向高度不被 Flexbox 压缩，完整展开至全部卡片真实高度（> 2000px），为 `.omx-stage-sticky` 提供完整的吸附跨度，全程紧贴顶部。

## 2. 验收标准（可测）

| ID | 场景 | 期望 |
|---|---|---|
| AC-1 | 灵感社区滚动条向下滑动至 500px / 1000px / 2000px | 吸附栏顶边相对视口顶部距离始终保持固定（diff: 0px，stuck: true） |
| AC-2 | 检查包含块高度 | `.omnimux-inspiration-stage-body` 与 `.omnimux-inspiration-root` 高度随内容卡片完整自适应展开（高度 > 2000px） |
| AC-3 | 门禁与静态规则 | `pnpm verify:stage-scroll` 保持 7/7 页面合规，`pnpm test:ui` 0 违规 |
| AC-4 | 自动化端到端测试 | 在真实 Chromium 内核中模拟真实滚轮滚动至 1000px+，吸附栏保持吸附 |

## 3. 边界（Boundaries）

- **总是**：只修复 Flex 伸缩约束，不改变设计规范与页面视觉尺寸。
- **绝不**：在内容区域私自添加第二条滚动条。
