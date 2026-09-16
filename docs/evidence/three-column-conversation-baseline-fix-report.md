# 会话栏保宽基准取样缺陷修复（工单 #2074 续）

## 结论

PR #2076 交付的「收起左侧栏保持会话栏宽度」在**开发版真机实测**中暴露缺口，已修复：
会话栏基准宽度此前只要「左栏未收起」就会取样，应用启动早期右侧工作台尚未挂载时会话栏
本来就占满剩余宽度（1920 − 280 = 1640），这个单栏全宽读数被记成基准并持续复用，
收起左栏后把 1640px 钉死在第二轨，右栏只剩 280px。

| 实测状态（1920 视口） | 修复前 | 修复后（预期） |
| --- | --- | --- |
| 展开 | 280 / 776 / 864，基准 1640px | 280 / 776 / 864，基准 776px |
| 收起 | 0 / **1640** / **280**（会话栏吞掉右栏） | 0 / **776** / **1144**（右栏吸收左栏宽度） |

## 修复内容

| 文件 | 改动 |
| --- | --- |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.js` | 新增 `RIGHT_COLUMN_MIN_PX = 200` 与导出常量 `CONVERSATION_WIDTH_FALLBACK_PX = 420`；新增 `readRightColumnPx` 与 `resolveConversationWidth`：**仅当同一帧右侧工作台列 ≥ 200px（确证三分栏）时才更新基准**，收起态与单栏形态一律复用上次可信读数或 420px 契约回退值 |
| `plugins/omnimux/src/client/conversation-box.js` | 保宽规则的 CSS 变量回退值由 480px 收敛为 420px，与 `CONVERSATION_WIDTH_FALLBACK_PX` 及 `WORKBENCH_CONVERSATION_TARGET_PX` 同尺度 |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js` | 新增「单栏全宽读数不得成为基准」用例；三分栏读数用例补齐右侧列宽度桩 |
| `specs/three-column-conversation-baseline.spec.md` | AC-201 ~ AC-204 |

## 验证证据

### 1. 真实内核几何门禁（工作树隔离）

```
node scripts/three-column-collapse-qa.mjs
✅ PASS · 会话栏 485px → 485px（保持），右栏 1155px → 1435px（吸收 280px）
   反向对照：旧 auto 规则下右栏塌为 0px，夹具未失真
```

真实 Chromium、动态端口（服务 + CDP 均为 0）、临时 profile 测后删除、PNG + JSON 留证。
CSS 逐字抽取自 `conversation-box.js` 的 `PRODUCT_STAGE_CHROME`，抽取失败即抛错。

### 2. 单元与回归

| 套件 | 结果 |
| --- | --- |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js` | 63/63 通过（含新增 2 项基准取样用例） |
| `plugins/omnimux/src/client/three-column-collapse.e2e.test.js` | 6/6 通过 |

### 3. 缺陷发现方式

上一版 PR（#2076）的隔离夹具**不会**复现本缺陷：夹具每一帧都是三分栏，右栏始终有宽度，
因此基准取样条件恒成立。缺陷只在真实客户端「右栏后挂载」的启动时序下出现 ——
这正是开发版 CDP 实测的价值，已作为本任务固定的验收步骤保留。

## 未覆盖 / 未知

- 未覆盖右侧工作台在会话中途被关闭后再次打开、且期间左栏发生过收起的组合时序；
  该路径下基准保持上次可信分栏读数，行为与「无新读数」一致。
- 未在 Windows / Linux 桌面模式下实测。
