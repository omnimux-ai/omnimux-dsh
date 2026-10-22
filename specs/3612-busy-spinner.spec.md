# 胶囊动作执行中显示旋转 loading 图标（Issue #3612）

## 用户旅程与目标

用户在媒体卡上点胶囊的任一动作（加入资产库 / 下载素材 / 加入对话）后，被点的按钮立刻变成旋转的 loading 图标，直到真实回执返回（成功转勾选、失败恢复原图标）。当前 busy 态只是一个静态「+」，用户看不出"正在执行"。

## 范围

- `overlay-icons.ts`：新增 `spinner` 图标（缺口圆环弧线），`STATE_ICON.busy` 由 `plus` 改为 `spinner`；保留其它图标与 `ICON_BY_ACTION` 映射不变。
- `styles.css`：
  - 新增 `@keyframes omnimux-capsule-spin`（`to { transform: rotate(360deg) }`）。
  - `.omnimux-capsule-icon.is-busy svg { animation: omnimux-capsule-spin 0.8s linear infinite; }`。
  - `@media (prefers-reduced-motion: reduce)` 下关闭该动画（仍显示静态 spinner）。
  - 不改 `.is-busy` 的 `opacity` / `pointer-events`，不改命中区与颜色。
- TikTok 网格工具栏（`surfaces/media-trigger.ts`）：若其 busy 态也用同一图标集渲染按钮图标，则复用 spinner；若只维护 aria-busy 与文案，则不需要改（保持现状）。
- 不改文案、`aria-busy` 语义、动作行为、下载/保存链路。
- 回归用例追加到既有测试文件（不新建 `.ts` 测试文件）：busy 图标名、动画样式与 reduced-motion 守卫；busy 结束后图标与动画恢复。

## 验收用例

| ID | 场景 | 期望 |
| --- | --- | --- |
| S1 | 动作进行中 | 该按钮 `data-icon="spinner"`；`svg` 计算样式 `animation-name` 为旋转动画、`animation-duration` 在 0.7–1.1s、`iteration-count: infinite` |
| S2 | 动作结束（成功/失败） | `data-icon` 回到 done/原图标，`animation-name` 为 `none`，不残留旋转 |
| S3 | `prefers-reduced-motion: reduce` | `animation-name: none`，图标仍为 spinner |
| S4 | 其它槽位 | 未在执行的槽位不出现 spinner / 动画 |
| S5 | 单测 + typecheck + build + 受控 runner e2e | 全绿；e2e 用真实 X 形态卡片（下载需后台 syndication，busy 窗口可达 100–300ms）做 MutationObserver 采样 + 计算样式断言 + 截图 |

## 假设

- 旋转动画只需 CSS，不需要 JS 定时器或逐帧绘制；`is-busy` 类在 SVG 重绘前就已加到按钮上，动画对每次重绘都生效。
- busy 期间按钮已 `pointer-events: none`，加动画不会引入新的点击/遮挡风险；`prefers-reduced-motion` 下静态缺口环仍能表达"进行中"。

## 证伪方式

- 若真实浏览器里 `is-busy` 期间 `animation-name` 为空、或图标仍为「+」、或动作结束后动画残留，则假设不成立：用受控 runner 的 MutationObserver + `getComputedStyle` 采样与截图对照重查。
- 若 reduced-motion 下仍旋转，或未执行的槽位出现 spinner，则说明选择器范围过宽，需要收窄到 `.is-busy` 槽位。

## 新用户基线

新装扩展默认生效；不依赖宿主连接，不新增权限；所有动作的 busy 窗口都适用。

## 非目标

- 不改动作文案与状态机（idle/busy/done/error 的语义）。
- 不引入进度百分比、骨架屏或按钮尺寸变化。
- 不改其它页面级悬浮控件（FAB、场景标记）。

## 回滚

单 PR：revert 恢复静态「+」与无动画的 busy 样式，无数据迁移、无契约变化。

## 文档影响

无用户文案变更；PR 与 issue 记录样式与无障碍取舍。
