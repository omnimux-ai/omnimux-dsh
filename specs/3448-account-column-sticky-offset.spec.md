---
status: active
issue: 3448
base: 1c90dfe25dae5d99c37bfa26018dccf68cfed222
---

# 3448 账号监控左栏吸附在 Tab 栏下方

## 用户反馈

账号监控页向下滚动后，左侧账号列会滑到一级 Tab/工具栏之上（截图里被 Tab 栏裁住）。预期：滚到顶部后左栏固定在 Tab 栏下方，只有右侧内容继续滚动。

## 原因

`.omnimux-rival-accounts { position: sticky; top: 12px }` 使用视口/滚动容器顶部作为吸附点，没有计入 `.omx-stage-sticky` 一级导航的高度（骨架偏移变量 `--stage-sticky-offset`，默认 44px），因此左栏会进入 sticky header 的覆盖区。

## 实现

- `RivalAccountColumn` 实测 `.omx-stage-scroll` 高度与 `.omx-stage-sticky` 头部高度，写入 `--omnimux-rival-scroll-h` / `--omnimux-rival-sticky-h`；
- `top: calc(var(--omnimux-rival-sticky-h, var(--stage-sticky-offset, 44px)) + 12px)`；
- `max-height: calc(var(--omnimux-rival-scroll-h, 100vh) - var(--omnimux-rival-sticky-h, var(--stage-sticky-offset, 44px)) - 24px)`，吸附后整列在真实 scrollport 内、列表独立滚动；
- ≤720px 保持 `position: static; max-height: 240px`。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | 滚动 300px | 左栏 top = 实测 sticky header 底部 + 12，不进入 header |
| A2 | 继续滚动 | 右栏内容继续移动，左栏 rect 不变 |
| A3 | 左栏列表超长 | 列表内部滚动，页面高度不由左栏撑开 |
| A3b | tab 隐藏期间缩放后切回 | 重新测量 scrollport，列底仍在 scrollport 内；0px 读数被忽略 |
| A4 | ≤720px | 堆叠 static 行为不变 |
| A5 | 选择/刷新 | 行为不变 |

## 验证

插件核心套件、styles 断言、真实浏览器滚动几何（44px sticky header + 滚动容器：滚动前后 rect、右栏位移、左栏 rect 稳定）、`verify-stage-contracts`、`verify-anti-slop`、`scan-ui-gates` 与 main 对照、`impact-matrix`。

## 文档影响

纯吸附偏移修复；不改接口/数据/Stage 合同。
