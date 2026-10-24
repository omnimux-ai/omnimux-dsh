# 《新会话输入框滚动自动吸底恢复规格（Spec）》

- **状态**：**已批准（用户直接指令）**
- **生效工作树**：`.worktrees/inspiration-composer-scroll-autodock`
- **生效分支**：`agent/inspiration-composer-scroll-autodock`
- **归档路径**：`specs/composer-scroll-autodock-restore.spec.md`
- **取代**：`specs/picker-sticky-docking.spec.md` 第 25–28 行「默认纯滚动不弹底」条款（见 §五）

---

## 一、需求背景与目标（Objective）

用户在新会话（探索/引导页）滚动浏览时，顶部输入框（Hero 输入框）随页面滚出视口后，**期望它自动滑到页面底部停靠（吸底）**，以便在浏览任何位置都能直接输入；滑回页面顶部时再自然归位。当前该交互已不存在。

代码溯源（`git blame` 与 `git log -S`）：

1. **PR #2703**（commit `071e3bb96`，2026-09-26）引入 `isIntentDrivenRef` 意图门禁，并配套 `specs/picker-sticky-docking.spec.md` 明确「废除旧有的 `scrollTop > leaveThreshold` 盲目自动吸底」——这是纯滚动不再吸底的**唯一根因**；
2. **PR #2730**（`8d9042a86`，09-27）把意图改为跨滚动持久化；
3. **PR #2921**（`e4b3db4c8`，10-02）删除 `omnimux:composer:dock-intent` 事件通道，吸底入口收敛为 `dock(item)`；
4. **PR #2954**（`8f5667021`，10-02）把该 hook 从 `plugins/omnimux/src/client/session-guide/` 迁到 `plugins/omnimux-inspiration/src/explore/`，门禁逻辑原样搬走。

本任务恢复滚动自动吸底，同时**保留** #2703 中仍然正确的部分（主动收起后的滚动静默），并保持 680px 宽度铁律与既有零抖动机制不变。

---

## 二、行为契约（Acceptance Contract）

| # | 触发 | 期望状态 | 说明 |
| --- | --- | --- | --- |
| AC-1 | 纯向下滚动，顶部输入框完全滚出视口（`scrollTop > leaveThreshold`） | `placement = docked`，宿主打上 `data-omnimux-dock-open` | 无需任何点击意图 |
| AC-2 | 向上滚动回到顶部槽位露头范围（`scrollTop <= revealThreshold`） | 自动回到 `placement = inline`，移除吸底标记 | 归位阈值不变 |
| AC-3 | 处于 `revealThreshold` 与 `leaveThreshold` 之间的迟滞死区 | 维持上一状态，绝不横跳 | 沿用现有迟滞 |
| AC-4 | 用户主动收起（`undock()` / 收起按钮）后上下滚动 | 严格静默，绝不自动弹起 | 保留 #2703 的正确部分 |
| AC-5 | 主动收起后滑回页面最顶部（`scrollTop <= revealThreshold`） | 收起态复位，之后可再次自动吸底 | 保留 #2703 的复位语义 |
| AC-6 | 显式交互（卡片选用 / 加号选素材 / 复刻，`dock(item)`） | 立即吸底并聚焦，且唤醒收起态 | 现有入口不变 |
| AC-7 | 自然滚动触发的吸底 | 绝不篡改用户滚动位置、绝不执行 380ms FLIP 位移 | `pendingApplyRef` 为空的既有分支 |
| AC-8 | 输入框宽度 | 顶部态与吸底态均严格 680px（`DOCK_MAX_WIDTH = 680`） | 铁律不变 |

**状态机**：`inline ⇄ docked` 由滚动位置驱动；`isCollapsedRef` 是唯一的静默闸门（只在主动收起时置位，在显式交互或滑回最顶部时清零）；`isIntentDrivenRef` 因不再承载任何判定而整体移除。

---

## 三、用户操作旅程与验收用例

**旅程 A（本任务主场景）**：进入新会话 → 页面停在顶部，输入框在 Hero 处 → 向下滚动浏览 Skills/软件应用/黄金开场等货架 → 顶部输入框滚出视口 → **输入框自动停靠到页面底部**，可直接点击输入 → 向上滚回顶部 → 输入框回到 Hero 原位。

**旅程 B（回归保护）**：向下滚动使输入框吸底 → 点击底部输入框的收起 → 上下滚动页面，底部**不再**弹出输入框 → 滚回页面最顶部 → 收起态复位，再向下滚动仍能自动吸底。

**旅程 C（回归保护）**：在任意滚动位置点击卡片「复刻/选用」→ 输入框在底部就位并聚焦，视口不发生跳动。

**验收用例**：

1. 单元：`composer-docking.test.js` 断言纯滚动越过 `leaveThreshold` 后 `placement === 'docked'` 且宿主具备吸底标记；滑回 `revealThreshold` 内回到 `inline` 且标记移除。
2. 单元：收起后滚动保持 `inline`，滚回最顶部后再次下滑可吸底。
3. E2E（已执行套件）：`converged-tab-docking.e2e.test.js` 覆盖滚动自动吸底与归位；显式 `dock(item, { force: true })` 仍坚决吸底。
4. 真实浏览器：在本工作树内跑新会话页，滚动截图取证「顶部输入框滚出视口 → 底部出现输入框」与「滚回顶部 → 归位」。

---

## 假设

1. 用户要恢复的是「浏览时输入框始终可达」，而 #2703 的「底部保持纯净开阔」是当年为避免遮挡与滚动抖动做出的取舍；两者冲突时以本次用户指令为准。
2. `isIntentDrivenRef` 在移除后没有任何其它消费者：它只在本 hook 内被声明、置位与判定（`grep` 仅命中本文件 4 处），删除不会影响其它模块或插件。
3. 宿主滚动容器锚点 `[data-conversation-scroll]` 与 window 双通道监听仍然有效，`readPageScrollTop` 取三者最大值即能反映真实滚动位置。
4. 自然滚动吸底走 `pendingApplyRef === null` 分支，因此不会锁滚动位置或播放 FLIP 动画，不存在「吸底把页面拉回顶部」的旧缺陷回归。

## 证伪方式

1. **推翻本规格的核心假设**：若在 Dev/工作树中滚动新会话页面时，`placement` 越过 `leaveThreshold` 仍保持 `inline`，则说明恢复未生效（例如门禁未被真正移除、或滚动监听未挂上）。
2. **反向证伪（过度修复）**：若点击「收起」后仅滚动页面，输入框又自动弹起，则说明 `isCollapsedRef` 静默闸门被误伤，本规格 AC-4 不成立。
3. **抖动回归证伪**：若滚动吸底瞬间页面滚动位置被改写（`scrollTop` 变化 ≥1px）或播放 380ms 位移动画，则 AC-7 不成立。
4. **宽度回归证伪**：若吸底态或顶部态输入框宽度偏离 680px（`guard-ui11-composer-width.test.mjs` 与 `composer-width-680px.e2e.test.js` 红），则 AC-8 不成立。
5. **重复契约证伪**：本任务同时修复 `plugins/omnimux/tests/e2e/picker-sticky-docking.e2e.test.mjs`（该文件自 #2954 起因读取已迁移文件而 ENOENT，且未被任何脚本执行）；若其被移除的契约 3/4 断言在 `plugins/omnimux-inspiration/src/explore/picker-sticky-docking.test.js`（已执行套件）中不存在对应覆盖，则该「去重」构成覆盖削弱。

---

## 六、新用户基线（Product Baseline）

纯前端交互改动，依赖官方宿主既有的会话页 DOM 锚点与滚动容器；**不依赖**本地模型服务、兼容代理、开发端口、开发 profile 或绝对检出路径。全新用户安装登录后进入新会话页即可获得该交互；锚点缺失时 `getComposerScrollThresholds` 退化为基线阈值（`READ_TOP_MAX=10` / `DOCK_LEAVE_MAX=20`），行为为「轻微滚动即吸底」，不会静默失败或报错。

---

## 七、文档影响

- **更新**：新增本规格；`specs/picker-sticky-docking.spec.md` 标注其「纯滚动不弹底」条款已被本规格取代（保留历史原文，仅加状态说明）。
- **保留**：`docs/evidence/picker-sticky-docking-verified.md` 作为 #2703 当次实测的历史记录，不回改。
- **不新增**：无新契约文件；宽度铁律仍由 `scripts/guard-ui-design.mjs`（UI11）与既有测试持有。

---

## 八、涉及文件与不在范围

**涉及**：

1. `plugins/omnimux-inspiration/src/explore/useComposerDocking.js`：移除意图门禁与 `isIntentDrivenRef`，保留收起静默闸门，同步更新 hook 顶部契约注释。
2. `plugins/omnimux-inspiration/src/explore/composer-docking.test.js`：把「纯滚动默认不吸底」改写为「纯滚动自动吸底 + 收起静默 + 归位复位」。
3. `plugins/omnimux-inspiration/src/explore/converged-tab-docking.e2e.test.js`：补一条滚动自动吸底的 E2E 断言。
4. `plugins/omnimux/tests/e2e/picker-sticky-docking.e2e.test.mjs`：移除读取已迁移文件的两个契约（3/4，其覆盖已在 omnimux-inspiration 已执行套件中），保留 hub 自有契约（controller.js / styles.js）。

**不在范围**：不改 680px 宽度与 `styles.js`；不改宿主 DSH 官方源码；不改 `omnimux:explore:scroll-to-tab` 与 Tab 吸顶；不新增设置项；不重构吸底几何算法；不修 `.mjs` e2e 文件从未被执行这一既有流水线问题（仅记录）。

---

## 九、验证计划（最小充分命令集）

```bash
# 1. 行为单测（工作树内）
node --test plugins/omnimux-inspiration/src/explore/composer-docking.test.js
node --test plugins/omnimux-inspiration/src/explore/picker-sticky-docking.test.js
node --test plugins/omnimux-inspiration/src/explore/converged-tab-docking.e2e.test.js

# 2. 包级回归（受影响插件）
pnpm --filter omnimux-inspiration test

# 3. 客户端/Stage 变更门禁
pnpm verify:stages
node --test scripts/verify-anti-slop.test.mjs
pnpm test:gates

# 4. 影响面判定
node scripts/impact-matrix.mjs --git-diff --base origin/main

# 5. 真实浏览器验收（工作树隔离，port: 0 自清理）
pnpm test:worktree-web
```

---

## 旧标准变更

- `plugins/omnimux-inspiration/src/explore/composer-docking.test.js` :: `useComposerDocking: 意图驱动模式——纯向下滚动默认不吸底，显式意图触发后才吸底`

**原断言**：`assert.equal(hookApi.placement, 'inline', '未触发输入框时纯向下滚动必须保持 inline')`，同用例内另有 `assert.equal(hookApi.open, false)`、`assert.equal(hookApi.attached, false)` 两条同义期望——即把「纯向下滚动必须保持 inline」固化为标准。

**必须改的理由**：该用例固化的正是 #2703 引入、本任务要推翻的意图门禁行为，与 hook 自身文档契约第 2 条（滚出顶部视口即吸底）自相矛盾。恢复自动吸底后，同一滚动输入的期望必须随之变为吸底，否则「恢复」无法被任何测试表达；不改则该任务永远无法通过测试。

**新期望证据**：
- 改写后断言（同一用例、同一滚动输入）：`placement === 'docked'`、`isDocked === true`、`host.hasAttribute(DOCK_OPEN_ATTR) === true`。
- 另新增独立用例覆盖同一契约（纯加法，不删用例、不改其它断言指纹）。
- 真机验收：`journey:autodock-on-scroll-out` PASS——`scrollTop=865 > 阈值316` → 吸底，卡片底边 500 / 视口 520（正好 `DOCK_BOTTOM=20`）；`journey:autodock-initial-inline`、`journey:autodock-release-on-scroll-back` 同批 PASS。
- 落笔人：该期待值变更由用户（人类）在收到 PreToolUse 硬门禁拒绝后手工落笔，Agent 未自行改写断言指纹。
