<!-- LESSONS.md (omnimux-dsh 仓级)  reviewed-through: 1ec38f08a24ed7333ba6c479421e4248ae9aafd5 (2026-11-13) -->
# Lessons from merged work

<!--
说明：本文件是本仓「复盘飞轮」的真相源。每条 = 规则 + 为什么 + 证据。
- 每晚由「评审」Bot 对本仓当天已合并改动复盘，追加/更新 0–3 条（宁缺毋滥；无则写「今日无新增」）。
- `seen N` = 该规则在不同天被复盘命中的次数；`首次 YYYY-MM-DD` 记录首次出现日。
- seen ≥ 3 的规则由 PM 把关晋升进 docs/code-standards.md；能机器判定者转 scripts/guard-*.mjs 守卫测试（失败信息须回引本规则）。
- 复盘只读：不改代码、不碰生产；证据里不写密钥/内部地址明文。
-->

## 评审范围（Review scope）
- **评审/自检必须跑与 CI 同源的 diff-aware 全量门禁，且必须在「已提交的 HEAD/commit」上跑（不能只测未提交工作区或挑包）**（seen 2；首次 2026-11-12）
  - 为什么：本地薄验证与 CI 门禁不同源、或只覆盖未提交内容，问题会留到 CI 才红，等于评审没拦住。
  - 证据：PR #4075 的 lifecycle 阻断直到 CI 才暴露（本地只跑了挑包 `node --test`）；PR #4092 用例 `t:(key)=>zh[key]` 本地 PASS，但 CI `Static gates & regression` 报 `dynamic-test-member-needs-review`（不可声明豁免）→ range 门禁必须含已提交 commit。

## 修复定位（Fix targeting）
- **改 UI 前先在实机确认目标 class/slot 在当前构建被渲染（DOM 计数 > 0），再动手**（seen 1；首次 2026-11-12）
  - 为什么：否则会修到源码里存在、但已被注释下架的旧组件，白改一场。
  - 证据：PR #4075 修了 `plugins/omnimux/src/client/index.js` 中已 “temporarily taken down” 的 AppsStage；实机目标 `.omnimux-apps-stage` DOM 计数=0，真实可见页是官方 sidebar-right guide。

## 合并纪律（Merge discipline）
- **开 PR 即带 `Closes #<issue>` + 风险标签**（seen 1；首次 2026-11-12）
  - 为什么：缺 Closes/risk 会卡 Merge Queue 定级，延误合并。
  - 证据：PR #4075 因缺 `Closes`/risk 标签被 Merge Queue 定级 F4 卡住。
- **合并前只合「被评审的那个 head」（用 `--match-head-commit`）**（seen 1；首次 2026-11-12）
  - 为什么：防止评审后又推送新提交，合进没人评审、没人跑过的代码。
  - 证据：合并纪律固化项（详见 docs/contracts/plugin-git-pr.md）；以评审确认的 head 为唯一合并对象。

## 运行安全（Runtime safety）
- **不在 Bot 干活/投递回复时强重启（会写坏会话单帧）**（seen 1；首次 2026-11-12）
  - 为什么：强重启会破坏正在收发的会话单帧，造成会话损坏。
  - 证据：11-11 事故——Bot 在投递回复过程中被强重启，写坏会话单帧。

## 门禁 / 测试标准（Gate standards）
- **改测试门禁或迁移会话门禁前，必须先在基线 HEAD 上跑全量门禁，验证「可声明放行且两条标准不互斥」；门禁改动要小步、可回归，避免引出连锁返工**（seen 1；首次 2026-11-13）
  - 为什么：两条测试标准互斥会让「纯静态化/归因迁移」无法通过任何声明放行，只能再开新门禁去修，形成连锁返工。
  - 证据：2026-11-13 门禁互斥返工链——#4099（dev.target 迁移）被 #4100（门禁互斥）阻塞 → #4102（解 #4100）→ #4107/#4108（多模板以解 #4099）→ #4106 再 rebase；同日 #4095→#4098 亦为评审返修。

## 消息 / 事件 source（Message source）
- **改消息/事件 source kind 或相关枚举必须覆盖所有 producer，并加能拦「结构性」问题的守卫（kind 缺失 / 为空 / 等于 catch-all，而非仅匹配字面量）**（seen 1；首次 2026-11-13）
  - 为什么：#3742 的 rc.3 迁移漏掉 plugins/omnimux，导致每一轮对话都失败；守卫若只认字面量、docstring 却宣称「拼变量也拦」，会放过变量间接/数组展开等写法。
  - 证据：PR #4111（注入消息改用 producer-owned source kind，修「每轮对话失败」，根因 #3742 漏包，merge bee36c6f）；#4110 的首版守卫对 `const K='plugin';kind:K` 与 `['pl','ugin'].join('')` 实测漏检（评审复核）。
