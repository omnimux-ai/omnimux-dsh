---
status: active
issue: 3497
base: 51b7e470a4c8e55c696bbf6ec321db2667fe7131
---

# 3497 账号监控「立即复刻」未展开会话栏

## 现象

账号监控时间线/详情点「立即复刻」后附件已加入，但会话栏没有出现；灵感库「加入会话」能正常激活。

## 根因

`rival-add-to-chat.js` 的 `revealConversation` 只调用 `setConversationCollapsed(false)` + `setFocus('split')`。宿主右侧栏处于 **全屏 fullscreen** 时，插件折叠键本来就是 `false`，旧链路没有可执行的动作，会话仍被宿主全屏挡住。内核官方 `ensureConversationVisible()` 会先退出宿主右侧栏全屏，再清折叠键并保持 split；灵感库/合集已用该入口。

## 假设

根因假设：点击「立即复刻」时附件已经成功写入，但宿主右侧栏仍处于 fullscreen；插件折叠键在 fullscreen 下为 false，旧链路 collapse+focus 没有可执行动作。官方 `ensureConversationVisible()` 先退出宿主 fullscreen，因此用它作为主路径即可让会话栏可见，附件与数据逻辑无需改动。

## 方案

- `rival-add-to-chat.revealConversation(workbench, windowObject)`：优先 `workbench.ensureConversationVisible()`（无参）；异常/缺失回退 `setConversationCollapsed(false)` + `setFocus('split')`；0/50ms 重放；所有异常静默，不阻断附件成功。
- 调用点传入 window，确保全局 workbench 可取。
- 补单测：ensure 存在时优先且只走 ensure；ensure 抛错时回退；ensure 缺失时保持旧行为；全屏态下 ensure 仍被调用。
- Dev 真机：账号监控点「立即复刻」后会话栏可见、附件卡片出现。

## 证伪方式

若在宿主右侧栏全屏状态下点击「立即复刻」，`ensureConversationVisible` 未被调用，或调用后 `data-sidebar-right-panel` 仍为 fullscreen、会话列宽度仍为 0，则上述根因假设不成立。可执行：单元测试断言调用序列，真实 Dev 复验前后 DOM 属性与会话宽度；macOS 上运行插件套件与 `node scripts/verify-stage-contracts.mjs`。

## 验收

| # | 用例 | 期望 |
|---|---|---|
| A1 | 会话栏折叠 | 点击后 uncollapse + split，会话可见 |
| A2 | 宿主右侧栏全屏 | 点击后退出全屏，会话栏可见，附件成功 |
| A3 | 官方 API 缺失/抛错 | 回退旧链路，附件仍成功，不抛错 |
| A4 | 连续点击 | 0/50ms 重放不会改变 Tab/画布，不自动发送 |
| A5 | 范围 | 只改账号监控 rival 露出；拆解弹窗/灵感库保持原语义 |

## 验证

插件核心套件（rival-add-to-chat / replicate-to-chat 及其它）、真实 Dev 页点击「立即复刻」前后 DOM/截图、stage contracts、anti-slop、scan-ui-gates。
