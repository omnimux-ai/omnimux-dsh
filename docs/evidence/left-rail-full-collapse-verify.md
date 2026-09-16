# 验证报告 · 左侧侧边栏完全收起（Issue #2077）

## 环境

- 位置：任务独立工作树 `.worktrees/left-rail-full-collapse`（分支 `fix/left-rail-full-collapse-issue-2077`）
- 被测对象：本工作树源码构建的应用本体
- 运行方式：共享测试环境引导（合成 `ui` 模式、动态端口、自清理）+ 无头 Chromium + CDP
- 页面入口：`<origin>/?dsh-desktop-mode=advanced&dsh-desktop-platform=darwin`（与 Dev 实机同一组桌面壳参数）

## 实测数据（同一会话前后对照）

| 指标 | 收起前 | 收起后 |
| --- | --- | --- |
| `html[data-omnimux-left-collapsed]` | 不存在 | 存在 |
| `--omnimux-sidebar-width` | `280px` | **`0px`** |
| 会话区起点 x | 280 | **0** |
| 会话区宽度 | 1160 | 360 |

## 断言结论

| 断言 | 结果 |
| --- | --- |
| 左侧栏收起标记置位 | ✅ |
| 镜像宽度归零 `--omnimux-sidebar-width = 0px` | ✅ |
| 会话区起点归 0（屏左无残留窄条） | ✅ |
| 桌面外壳网格首列 = `0px` | ⚠️ **不适用**：`.dshDesktopFrame` 为 Electron 外壳专属节点，纯网页端不渲染（`hasFrame:false`）。该项保留给 Dev 实机（人工）复核，未以任何方式冒充通过。 |

## 证据文件

- 结构化报告与截图：`.workbuddy/evidence/app-qa/5ecd694a-9c32-4f6e-9887-4f974d73ade5/`
  - `01-boot.png`（收起前：会话区 x=280）
  - `02-both-collapsed.png`（收起后：会话区 x=0）
  - `report.json`（含断言与逐步状态）
- 旅程脚本：`.workbuddy/scripts/left-rail-full-collapse-verify.mjs`（本地验证工具，不入库）

## 自动化测试

| 套件 | 结果 |
| --- | --- |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js` | 59 / 59 通过 |
| `plugins/omnimux/tests/e2e/left-rail-full-collapse.spec.js` | 4 / 4 通过 |

## 未覆盖

- Electron 外壳下框架首列与右侧栏全屏面板左缘的实机测量：属外壳专属行为，需在开发版实机复核（人工）。
- 未验证多显示器 / 非 1920 宽度下的表现。
