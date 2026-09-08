# Issue #773 / #776 T04 实施报告：工坊客户端 UI、侧栏入口调整与 /skill-creator 会话挂载

- **任务编号**：#773 / #776 T04 (W07 / W08)
- **任务目标**：工坊客户端 UI、侧栏入口位置调整与 /skill-creator 会话挂载
- **工作树基线**：`.worktrees/skill-workshop-773`，HEAD / base = `580234923268673562cacb5cd01aebdb780339e1`
- **实施分支**：`agent/market-skill-workshop-issue-773`
- **实施工程师**：Alex (Engineer)
- **完成日期**：2026-09-08

---

## 1. 关键实施内容

### 1.1 侧栏入口调整（移除 footer，移至项目正下方）
- **移除底部入口**：在 `plugins/omnimux-market/src/client/apply.js` 中彻底移除 `slots.inject("sidebar.footer.action", ...)` 注入，不再占用侧栏底部 Settings 脚部操作区。
- **中枢协调器挂载**：通过 `window.__omnimuxSidebar` 协调器（`api.register`）挂载侧栏条目：
  - `id`: `omnimux-market-entry`
  - `rank`: `4.1`（严格位于“项目” rank 4 正下方）
  - `markers`: `data-omnimux-market-entry` 与 `data-omnimux-esc-entry`
  - `度量规格`：行高 32px、水平内边距 `0 8px`、图标 14×14、字体 14px/20px、圆角 8px
  - `动作绑定`：点击唤起 `window.__omnimuxWorkbench?.open?.({ tabId: "omnimux-market:plaza" })`
  - `Alpha 状态标记`：保留原协调器内建 `markAlphaEntry` 逻辑，遵循全局产品生命周期发布策略。

### 1.2 工作台 UI 精简与双 Tab
严格落实用户“移除我截图里面没有的元素，不要随意添加花里胡哨冗余的设计”要求：
- **双 Tab 结构**：
  - 默认激活主 Tab 为 `Skill`（技能发现），二级 Tab 为 `我的 Skill`。
  - 插件、专家、连接器 Tab 保持隐藏（底层数据、工具与存储完全保留，不破坏原有能力）。
- **极简原生白/灰视觉体系**：
  - 顶部 Header：大标题 `Skill`、副标题 `发现、安装并管理 Skill，扩展 OmniMux 的创作能力`、双操作按钮（主按钮 `通过 OmniMux 创建`、次按钮 `+ 安装Skill`）。
  - 分类栏：11 项顺序严格遵循 PRD §6.1 / AC-05：全部、精选、短剧漫剧、专业影视、动画、商业广告、电商、教育、创意实验、音频音乐、平台工具。
  - 官方精选：当且仅当推荐数量 ≥ 1 时展示 `官方精选` 区块；0 项时彻底不渲染且不留占位空间；卡片采用标准 4 列 16:9 比例，悬停展示等宽操作按钮（`查看详情` 与 `去对话中试试`），彻底移除作者/认证/下载量等冗余底行。
  - 其他 Skill 列表：在非精选分类下展示双列横条卡片，右侧配紫色 Switch 开关；未安装项点击开关提示安装确认，已安装项点击开关实现启用/停用切换。
  - 我的 Skill：专属工具栏提供分类与来源下拉筛选，支持 `自动更新` 开关持久化；双列展示已安装技能，支持启用/停用与详情管理。
  - 极简详情弹窗：抽屉/弹窗精简为名称、完整说明、来源、分类、版本、状态四元信息及操作按钮（去对话中试试、启用/停用、确认卸载、安装），去除旧 TRACE 雷达、星标评分与认证徽章。
  - 安装弹窗：提供规范文件拖放区域与文件要求提示（包含 SKILL.md 的 .zip 包或直接拖入 SKILL.md）。

### 1.3 真实 `/skill-creator` 新会话预填（无损会话契约）
在 `plugins/omnimux-market/src/client/session-create.js` 中实现严格的会话分配与预填机制：
- **无损原会话 A**：通过公开读面捕获当前会话 A 状态（只读驻留内存，绝不改写、清空其草稿、附件或 preset）。
- **全新会话 B 分配**：调用官方 `sessions.create({ workspaceId })` 创建真实会话 B，确保 `sessionBId !== sessionAId`，不复用旧空会话。
- **会话激活与视图联动**：调用 `sessions.open(sessionBId)`，并通过公共 Workbench `setFocus('split')` 显露对话列。
- **规范安全预填**：严格预填指定格式内容：
  ```text
  /skill-creator
  帮我使用它来创建一个新的技能。首先询问我这个技能应该做什么。
  ```
- **严禁自动发送（No Auto-Send）**：不派发任何 Enter 键或 submit 事件，等待用户人工确认。
- **文本 CAS 保护**：检查目标输入框，若用户已有输入或输入框已有内容，严禁覆盖；若用户中途切换到会话 C，立即终止写入，防止 cross-session 污染。
- **连点防抖（Idempotency）**：维护 `inflightSessionCreation` 单一 Promise 守卫，防止重复连点产生多重空会话。

---

## 2. 变更文件清单

| 文件路径 | 状态 | 变更职责说明 |
|---|---|---|
| `plugins/omnimux-market/src/client/session-create.js` | 新增 | `/skill-creator` 与 `trySkillInSession` 无损会话创建与 CAS 预填 |
| `plugins/omnimux-market/src/client/apply.js` | 修改 | 移除底部 `sidebar.footer.action`，改为 `__omnimuxSidebar` rank 4.1 挂载 |
| `plugins/omnimux-market/src/client/skill-plaza.js` | 修改 | 重构为双 Tab、11分类、官方精选4列16:9、其他Skill双列条卡与安装弹窗 |
| `plugins/omnimux-market/src/client/skills-ui.js` | 修改 | 精简 `DetailCard`，去除冗余 TRACE/星标，保留来源/版本/状态与操作 |
| `plugins/omnimux-market/src/client/plaza-shell.js` | 修改 | 适配双 Tab 工坊容器，保持 `PLAZA_TABS`/`PLAZA_HIDDEN_TABS` 兼容守卫 |
| `plugins/omnimux-market/src/client/css.js` | 修改 | 注入极简白/灰原生设计与弹窗、药丸、开关、16:9卡片完整样式 |
| `plugins/omnimux-market/src/client/i18n.js` | 修改 | 补齐中英文 Skill 工坊、双 Tab、精选、安装等国际化文案 |
| `plugins/omnimux-market/scripts/concat-client.mjs` | 修改 | 将 `session-create.js` 加入打包 fragments 列表并打包输出 |
| `plugins/omnimux-market/lib/client.js` | 构建产物 | 重新构建生成的客户端单一 ModuleLoader 产物 (246,317 bytes) |
| `plugins/omnimux-market/src/client/workbench-seat.test.js` | 修改 | 更新侧栏挂载断言（验证移至 `__omnimuxSidebar` rank 4.1，移除 footer） |
| `plugins/omnimux-market/src/tests/client-bundle.test.ts` | 修改 | 更新打包 bundle 断言（移除 footer.action 依赖，验证 `__omnimuxSidebar`） |
| `plugins/omnimux-market/src/client/skill-workshop-ui.test.js` | 新增 | 12项专项目标自动化测试（双Tab、11分类、16:9封面、CAS、无自动发送） |

---

## 3. 门禁核验与测试证据

### 3.1 单元测试全量验证
运行 `npm --prefix plugins/omnimux-market run test`：
```text
✔ client bundle is a single ModuleLoader factory (0.437333ms)
✔ client bundle keeps public slot keys and workbench tab registration (1.196834ms)
✔ skill shelf taxonomy (1.207125ms)
✔ skill picker logic (1.855958ms)
✔ ecommerce keyword expansion (Issue #504) (0.558291ms)
✔ plaza search payload channels (Issue #504) (0.107625ms)
✔ skill shelf single source of truth (2.445792ms)
✔ plaza tab visibility parity (0.356833ms)
▶ Skill Workshop UI & Session Contract (Issue #773 / #776)
  ✔ sidebar entry is positioned under projects (rank 4.1) via __omnimuxSidebar and footer action is removed (0.477ms)
  ✔ session create helper creates real session B via sessions.create without modifying session A (0.092792ms)
  ✔ session create helper prefills /skill-creator with prompt without auto-sending (no auto-send) (0.08425ms)
  ✔ session create helper performs CAS check preventing overwrite of existing user input (0.065667ms)
  ✔ trySkillInSession helper quotes /<slug> without auto-send (0.052666ms)
  ✔ skill plaza renders dual tabs: Skill and 我的 Skill (0.052334ms)
  ✔ category order conforms to PRD §6.1 / AC-05 (11 items) (0.079667ms)
  ✔ featured section renders 4-column 16:9 cards and hides completely when 0 items (0.082917ms)
  ✔ category featured hides other skills regular section (AC-14, AC-11) (0.058833ms)
  ✔ install modal provides drag & drop and requirements notice (0.37125ms)
  ✔ switch toggle prompts installation confirmation for uninstalled skills (0.065375ms)
  ✔ css defines minimalist design matching demo (0.196583ms)
✔ Skill Workshop UI & Session Contract (Issue #773 / #776) (2.161417ms)
▶ market workbench seat (sidebar must not claim overlay)
  ✔ plaza action uses the workbench open, not the product stage claim (1.016334ms)
  ✔ client apply registers plaza tab on betterSidebar (0.256125ms)
  ✔ plaza entry is registered to __omnimuxSidebar under projects (rank 4.1), not in footer (0.150708ms)
  ✔ registers the composer Skill picker on conversation.input.left (0.092209ms)
  ✔ Skill trigger uses a puzzle icon and has no border (0.25625ms)
  ✔ skill plaza consumes SkillShelf rules instead of SkillHub categories (0.144875ms)
  ✔ plaza view consumes a one-shot skills tab intent (0.086584ms)
  ✔ plaza icon SVG carries explicit square width and height (0.149ms)
  ✔ plaza title is Skill工坊 / Skill Workshop (0.434208ms)
  ✔ plaza shell has no in-tab FocusBar and does not claim overlay (0.135292ms)
✔ market workbench seat (sidebar must not claim overlay) (3.268084ms)
...
ℹ tests 640
ℹ suites 8
ℹ pass 640
ℹ fail 0
```
**结论**：全量 640 项测试 100% 通过，前序 628 项零回归，新增 12 项测试全部通过。

### 3.2 TypeScript 类型检查
运行 `npm --prefix plugins/omnimux-market run typecheck`：
```text
> omnimux-market@0.2.13-omni.0 typecheck
> tsc -p tsconfig.json --noEmit
```
**结论**：退出码 0，无任何类型错误。

### 3.3 Git 差异规范检查
运行 `git diff --check`：
```text
(no output, exit code 0)
```
**结论**：无任何多余尾部空格或格式冲突。

### 3.4 官方 Slot 治理全仓静态扫描
运行 `node scripts/verify-slot-contracts.mjs`：
```text
[Slot Governance Scanner] Scanning plugin client source files...
✓ Slot contracts verified on 1648 client files. 0 violations.
```
**结论**：全仓 1648 个客户端文件 0 违规，完全符合 Single Occupant 及 Slot 注册规范。

---

## 4. 全局一致性审查（Global Consistency Review）

按照工程质量准则执行跨文件一致性核验：
1. **跨文件导入与依赖一致性**：
   - `scripts/concat-client.mjs` 顺序排列 21 个 fragments，`session-create.js` 置于 `keepalive.js` 与 `skills-ui.js` 之间，使得 `createSkillSession` 与 `trySkillInSession` 在后续组件中合法可达。
   - `skill-shelf-parity.test.js` 规则真源检验通过，无任何硬编码标签冲突。
2. **接口契约一致性**：
   - 侧栏挂载点为 `window.__omnimuxSidebar`，rank 4.1，标签为 `Skill工坊`，点击打开 `omnimux-market:plaza`。
   - 工作台 Tab 保持 `PLAZA_TAB_ID = "omnimux-market:plaza"`，不侵占 `claimProductStage`。
3. **数据流与无损会话契约**：
   - 创建新会话调用原生 `sessions.create`，会话 A 的草稿、附件与上下文 100% 保留。
   - 预填内容进行严格 CAS 检查，目标已有文本不覆写，且严格不自动触发发送。
4. **代码整洁与极简视觉**：
   - 彻底移除非截图所示假推荐标签、假星标评级、旧 TRACE 雷达与复杂 tab。
   - 满足所有 Given/When/Then 验收标准（AC-01~15、AC-38~44）。

---

## 5. 审查结论

**IS_PASS: YES**

所有关键实现要求全部满足，客户端重新构建打包生成 `lib/client.js`，门禁全绿，代码已准备就绪交回主理人推进后续验收流程。
