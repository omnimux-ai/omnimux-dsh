# Issue #773 / #776 T04 独立 QA 验收报告：工坊客户端 UI、侧栏入口调整与 /skill-creator 会话挂载

## 1. 验收结论与路由判定

- **验收结论**：**IS_PASS: YES**
- **智能路由**：**Route: NoOne**（所有测试与契约检查 100% 通过，无遗留阻塞缺陷，无需工程返修）
- **任务编号**：#773 / #776 T04 (W07 / W08)
- **验收对象**：工坊客户端 UI、侧栏入口位置调整与 /skill-creator 会话挂载
- **工作树基线**：`.worktrees/skill-workshop-773`，HEAD / base = `580234923268673562cacb5cd01aebdb780339e1`
- **实施分支**：`agent/market-skill-workshop-issue-773`
- **QA 工程师**：Edward (QA Engineer)
- **验收日期**：2026-09-08

---

## 2. 验收依据与规格参考

1. **工程实施报告**：`docs/implementation/issue-773-ui.md`（Alex 工程师交付）
2. **产品需求文档 (PRD)**：`docs/specs/2026-09-08-skill-workshop/prd.md`（用户 U10 约束、AC-01~15、AC-38~44）
3. **架构设计文档**：`docs/specs/2026-09-08-skill-workshop/architecture.md`（§4.5 会话契约、W07/W08）
4. **侧栏入口契约**：`docs/contracts/sidebar-extra-entries.md`（行高 32px、padding 0 8px、图标 14×14、字号 14px/20px、圆角 8px）

---

## 3. 重点审查项目逐项核验结果

### 3.1 侧栏入口位置与规范（`plugins/omnimux-market/src/client/apply.js`）

| 审查项 | 规范要求 | 实际代码实现 | 核验结论 |
|---|---|---|---|
| **移除 footer 入口** | 彻底移除底部 `sidebar.footer.action`，不占用 Settings 脚部 | `apply.js` 中已删除 `slots.inject("sidebar.footer.action", ...)`；全包单测显式断言 `assert.ok(!client.includes('slots.inject("sidebar.footer.action"'))` | **PASS** |
| **侧栏协调器挂载** | 通过 `window.__omnimuxSidebar.register` 挂载在“项目”（rank 4）正下方 | 调用 `api.register({ id: "omnimux-market-entry", rank: 4.1, ... })`，精确设置 rank 为 4.1 | **PASS** |
| **入口元素 Markers** | 设置 DOM 标记识别条目属性 | `btn.setAttribute("data-omnimux-market-entry", "")` 及 `btn.setAttribute("data-omnimux-esc-entry", "")` 双标记就绪 | **PASS** |
| **尺寸与度量规范** | 符合 `sidebar-extra-entries.md`：32px 行高、`0 8px` 内边距、14×14 图标、14px/20px 文字、8px 圆角 | `SIDEBAR_ENTRY_STYLES` 声明 `height: 32px; padding: 0 8px; border-radius: 8px; font-size: 14px; line-height: 20px;`；图标 wrap 与 SVG 声明 `width: 14px; height: 14px;` | **PASS** |
| **动作与 Tab 绑定** | 点击侧栏条目时准确打开工作台 Tab | 点击监听事件执行 `window.__omnimuxWorkbench?.open?.({ tabId: "omnimux-market:plaza", title: "Skill工坊" })`，不侵占 `claimProductStage` | **PASS** |
| **Alpha 状态与生命周期** | 保留协调器内建标记逻辑 | 通过 `window.__omnimuxSidebar` 注册，由中枢协调器统一按 `alpha-release.md` 管理 Alpha 状态，无插件私自覆盖 | **PASS** |

### 3.2 工作台 UI 精简与视觉规范（`skill-plaza.js`、`plaza-shell.js`、`skills-ui.js`、`css.js`）

| 审查项 | 规范要求 | 实际代码实现 | 核验结论 |
|---|---|---|---|
| **双 Tab 结构** | 默认呈现 `Skill`（技能）与 `我的 Skill` 双 Tab；老三样隐藏但能力无损 | 默认状态 `mainTab === "discover"`（显示 Skill）与 `mainTab === "mine"`（显示我的 Skill）；外层老三样 tablist 设为 `display: "none"`，保留底层数据及调用逻辑无损 | **PASS** |
| **清除假元素/视觉极简** | 彻底清除所有非截图元素（无假推荐、假星级、旧 TRACE 雷达），采用白/灰原生高质感设计 | 已清除原界面的伪造推荐徽章、假星级评分组件与 TRACE 五维雷达图，采用极简 `#121316` / `#16171a` 深灰底色与 `--dsw-alias-*` 原生 Token | **PASS** |
| **11 个分类名称与顺序** | 严格遵循 PRD §6.1 / AC-05 顺序（全部、精选、短剧漫剧、专业影视、动画、商业广告、电商、教育、创意实验、音频音乐、平台工具） | `WORKSHOP_DOMAIN_ORDER` 精确匹配 9 大领域分类，加上 `全部` 与 `精选`，按序渲染 11 个药丸按钮 | **PASS** |
| **官方精选区块渲染** | 推荐数为 0 时彻底隐藏，≥1 时呈现 4 列 16:9 卡片，悬停显露等宽操作按钮，无冗余底行 | `featuredItems.length > 0 ? h("section", ...)`（0 项彻底不渲染）；CSS `.featured-grid` 设 `repeat(4, 1fr)`，卡片宽高比 `16/9`；`.featured-hover-actions` 悬停展示等宽「查看详情」与「去对话中试试」；无冗余底行 | **PASS** |
| **其他 Skill 条卡交互** | 双列横条卡片，右侧紫色 Switch；未安装提示安装确认，已安装切换启用/停用 | `.regular-grid` 为 `repeat(2, 1fr)`；右侧配紫色 `WorkshopSwitch` 开关；未安装项触发 `ConfirmInstallModal`，已安装项切换 `enabled` | **PASS** |
| **我的 Skill 工具栏与筛选** | 工具栏提供分类与来源下拉筛选，支持自动更新开关 | `mine-toolbar` 提供分类下拉药丸（`.pill-dropdown`）、来源下拉药丸、自动更新开关；无已安装项时友好展示空状态提示 | **PASS** |
| **极简详情弹窗** | 弹窗仅保留名称、完整说明、四元信息网格（来源/分类/版本/状态）及操作按钮 | `DetailCard` 渲染标题、说明、`ws-detail-meta-grid`（来源、分类、版本、状态）以及操作区（去对话中试试、启用/停用、确认卸载、安装） | **PASS** |
| **安装拖拽弹窗** | 提供规范文件拖放区域与文件要求提示 | `InstallModal` 提供拖拽与文件选择，支持 `.zip` / `.md`，明确提示文件要求（包含 SKILL.md 的 .zip 包或直接拖入 SKILL.md） | **PASS** |

### 3.3 真实 `/skill-creator` 新会话预填与无损契约（`plugins/omnimux-market/src/client/session-create.js`）

| 审查项 | 规范要求 | 实际代码实现 | 核验结论 |
|---|---|---|---|
| **原会话 A 状态保全** | 原会话 A 的草稿、附件、preset 与上下文原封不动，只读保全 | 经 `sessions.list.getSnapshot()` 只读捕获当前状态，仅驻留内存，全文件无任何 `sessionA.draft = ...`、`sessionA.text = ...` 改写或清空逻辑 | **PASS** |
| **独立会话 B 分配与显露** | 调用原生 `sessions.create` 创建全新独立会话 B 并显露对话列 | 调用 `sessions.create({ workspaceId })` 产生新 ID，校验 `sessionBId !== sessionAId`；调用 `sessions.open(sessionBId)` 并唤起 `workbench.setFocus("split")` 显露对话列 | **PASS** |
| **目标内容精确预填** | 预填目标内容严格一致：<br>`/skill-creator`<br>`帮我使用它来创建一个新的技能。首先询问我这个技能应该做什么。` | 代码中常量严格预填：<br>`/skill-creator\n帮我使用它来创建一个新的技能。首先询问我这个技能应该做什么。` | **PASS** |
| **核心红线：严禁自动发送** | **绝对禁止自动发送（No Auto-Send）**，不得派发 Enter 键或 submit 事件 | 仅通过标准 input setter 和 `InputEvent("input")` 同步文本内容并聚焦，全文件 0 处 `composer.submit()`、0 处 `Enter` 键盘事件模拟、0 处 `submit` 事件派发 | **PASS** |
| **文本 CAS 保护机制** | 若目标已有用户输入禁止覆盖；若用户切换至会话 C 放弃写入 | 循环复核目标输入框：若 `composer.value.trim().length > 0` 立即终止预填；若 `currentActive !== sessionBId` 立即放弃写入退出，杜绝 cross-session 污染 | **PASS** |
| **连点与幂等防抖** | 防止用户重复快速点击产生多个空会话 | 维护全局 `inflightSessionCreation` 单例 Promise 守卫，并发点击复用同一未完成操作，完成或异常在 `finally` 块中重置 | **PASS** |

---

## 4. 门禁核验与测试执行证据

### 4.1 单元测试全量验证（`npm --prefix plugins/omnimux-market run test`）

执行结果：
```text
> omnimux-market@0.2.13-omni.0 test
> npm run build && node --test --test-concurrency=1 lib/tests/*.test.js src/expert/*.test.js src/client/*.test.js

wrote /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773/plugins/omnimux-market/lib/client.js (246317 bytes, 21 fragments)
...
▶ Skill Workshop UI & Session Contract (Issue #773 / #776)
  ✔ sidebar entry is positioned under projects (rank 4.1) via __omnimuxSidebar and footer action is removed (0.491208ms)
  ✔ session create helper creates real session B via sessions.create without modifying session A (0.112375ms)
  ✔ session create helper prefills /skill-creator with prompt without auto-sending (no auto-send) (0.086459ms)
  ✔ session create helper performs CAS check preventing overwrite of existing user input (0.066667ms)
  ✔ trySkillInSession helper quotes /<slug> without auto-send (0.051833ms)
  ✔ skill plaza renders dual tabs: Skill and 我的 Skill (0.053875ms)
  ✔ category order conforms to PRD §6.1 / AC-05 (11 items) (0.086166ms)
  ✔ featured section renders 4-column 16:9 cards and hides completely when 0 items (0.095417ms)
  ✔ category featured hides other skills regular section (AC-14, AC-11) (0.070292ms)
  ✔ install modal provides drag & drop and requirements notice (0.078917ms)
  ✔ switch toggle prompts installation confirmation for uninstalled skills (0.460708ms)
  ✔ css defines minimalist design matching demo (0.255916ms)
✔ Skill Workshop UI & Session Contract (Issue #773 / #776) (2.427708ms)
▶ market workbench seat (sidebar must not claim overlay)
  ✔ plaza action uses the workbench open, not the product stage claim (1.04075ms)
  ✔ client apply registers plaza tab on betterSidebar (0.256666ms)
  ✔ plaza entry is registered to __omnimuxSidebar under projects (rank 4.1), not in footer (0.138959ms)
  ✔ registers the composer Skill picker on conversation.input.left (0.096958ms)
  ✔ Skill trigger uses a puzzle icon and has no border (0.238292ms)
  ✔ skill plaza consumes SkillShelf rules instead of SkillHub categories (0.1245ms)
  ✔ plaza view consumes a one-shot skills tab intent (0.0775ms)
  ✔ plaza icon SVG carries explicit square width and height (0.131917ms)
  ✔ plaza title is Skill工坊 / Skill Workshop (0.446416ms)
  ✔ plaza shell has no in-tab FocusBar and does not claim overlay (0.126834ms)
✔ market workbench seat (sidebar must not claim overlay) (3.342708ms)
...
ℹ tests 640
ℹ suites 8
ℹ pass 640
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 13121.570958
```
- **统计**：共 640 项测试，8 个测试套件，**640 全部通过，0 失败，0 告警，0 跳过**。

### 4.2 TypeScript 类型检查（`npm --prefix plugins/omnimux-market run typecheck`）

```text
> omnimux-market@0.2.13-omni.0 typecheck
> tsc -p tsconfig.json --noEmit
(exit code 0, no errors)
```
- **结论**：类型定义 100% 严密，无任何 TS 报错。

### 4.3 代码风格与差异检查（`git diff --check`）

```text
(no output, exit code 0)
```
- **结论**：无任何行尾空白符或合并冲突标记。

### 4.4 官方 Slot 治理全仓静态扫描（`node scripts/verify-slot-contracts.mjs`）

```text
[Slot Governance Scanner] Scanning plugin client source files...
✓ Slot contracts verified on 1648 client files. 0 violations.
```
- **结论**：全仓 1648 个客户端文件 0 违规，符合 Single Occupant 规范，无侵占行为。

### 4.5 依赖与运行时边界扫描（`node scripts/verify-plugin-boundaries.mjs`）

```text
✅ verify-plugin-boundaries: 2144 source file(s) across plugins verified for dependency and runtime boundaries.
```
- **结论**：全仓 2144 个源文件全部符合插件隔离与依赖边界规范。

---

## 5. 综合评审结论

1. **功能完整度**：侧栏入口平稳迁移至“项目”正下方（rank 4.1），footer 入口彻底净化移除；工坊工作台完整呈现 `Skill` 与 `我的 Skill` 双 Tab 架构及 11 项标准分类，官方精选 4 列 16:9 卡片及悬停等宽操作按钮交互顺畅；其他 Skill 双列条卡与开关交互符合直觉；`/skill-creator` 独立会话分配与安全预填完全达成预期。
2. **安全红线**：严禁自动发送（No Auto-Send）红线完全守住；文本 CAS 保护与 cross-session 防污染机制健全；原会话 A 状态完整只读保全。
3. **门禁指标**：全包单测 640/640 全部通过，TS 类型检查 0 错误，Slot 扫描与架构边界扫描 0 违规，代码质量达到上线标准。

**最终结论**：
**IS_PASS: YES**
**Route: NoOne**
本阶段（T04）验收通过，主理人可安全推进后续综合闭环与交付流程。
