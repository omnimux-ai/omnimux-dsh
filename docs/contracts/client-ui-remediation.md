---
title: "Client UI 形态定界与 4 层整改合同"
id: "contract-client-ui-remediation"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-08-31"
authors: ["x", "agent-architect"]
subsystem: "omnimux-accounts"
---

# Client UI 形态定界与 4 层整改合同

> **规范级别**：**强制 (MANDATORY)** —— 本文件是严过关《全量插件 Client UI 规范与 4 层布局硬合规审计》（整体合规率 35%，FAIL）的架构落地真源。
> **配套**：`first-level-page-layout.md`（4 层骨架）· `ui-design-guidelines.md`（控件/几何）· `stage-guards.md`（关页保活）· `sidebar-extra-entries.md`（顶距/入口）· 根 `AGENTS.md` Frontend 段。
> **金标实现**：`plugins/omnimux-assets/src/client/AssetsStage.jsx` + `styles.js` + `src/client-layout.test.js`。
> **禁止**：改官方 `packages/`；跨插件 `import` 非本包 client 模块；把共享壳做成 `omnimux` hub 服务；杀/重启桌面 App。

---

## 0. 一句话选型

`挂载点 = 工作台 Tab（ctx.betterSidebar.registerTab + window.__omnimuxWorkbench.open）；形态 = 各垂直对象插件自有 Stage 根填满右栏；产物 = dsh.bundle；共享 4 层壳下沉 dsh-ui-kit（非 Cordis 插件），不新建 omnimux-stage-shell。shell.overlay 仅残留 LoginGate / Apps / Clip portal。`

被否决：

| 备选 | 否决理由 |
|---|---|
| 中枢 `omnimux` 导出 `StageShell`，垂直 `from 'omnimux'` | `hub.md` + doctor §12 垂直禁 hub import；`dsh-plugin-dev` 禁跨包 client import |
| 新 Cordis 插件 `omnimux-stage-shell` + Service | UI 无 Host 状态，Service 三层过重，加载序与卸载边会把一级页绑死 |
| 会话内 `cordis_define` 动态包发壳 | 产物形态混用；动态包禁 import/JSX/TS |
| 替换官方 `root` / `sidebar` / `conversation` | Slot Catalog 过宽；工作台座是 `dsh-better-sidebar`，overlay 只留登录门 / Apps / clip portal |
| 各插件继续手抄骨架、不抽 kit | Assets 已是金标，其余 6 个一级页会继续漂移；doctor 无法钉 props |

---

## 1. 页面形态定界

每个一级工作台页（及残留 overlay）必须先归类，再套规范。**未归类 = 默认 A 类（标准 4 层资产库）**，不得事后用「特异」逃检。座见 [workbench-split.md](./workbench-split.md)。

```
一级工作台页（better-sidebar Tab；残留 overlay 仅 LoginGate / Apps / Clip portal）
├── A. 标准 4 层资产库 / 列表页     ← 全量 Pattern A+B+C，零豁免
├── B. 特异形态页
│   ├── B1 流程画布（外框合规 / 内芯豁免）
│   ├── B2 监控仪表盘（4 层语义映射，非 Grid 卡片）
│   ├── B3 多通道集市（Layer 3A Tab 为骨架）
│   ├── B4 创作工作台（inspector / 侧栏，非一级资产库）
│   └── B5 中枢抽屉 / Settings 座（非资产库；仍走 B+C）
└── C. 非页面表面（sidebar.extra 行、settings.plugin.item）← 只走 B+C，不套 4 层
```

### 1.1 A 类 —— 标准 4 层一级资产库 / 列表页

判定：工作台 `*:library` / `*:plaza` Tab（或残留 overlay）+ 用户心智是「库」（增删改查 + 搜索过滤 + 网格/列表）。**必须** 4 层齐全：Header / Action Row / 单行 FilterBar / Content。主 CTA **禁止**进 FilterBar。根节点填满右栏容器（`position: absolute; inset: 0` 或等价 flex 100%），**禁止** `position: fixed` + `--stage-*` 盖住会话列。

| 插件 | 页面 | 现状（相对金标） | 归类 |
|---|---|---|---|
| `omnimux-assets` | `AssetsStage.jsx` | 金标：L1 标题+副标题+Refresh/Close IconButton；L2 `+添加资产`/`导入资产包`；L3 chips+Search+Sort+View；L4 Grid/List | **A / GOLD** |
| `omnimux-products` | `ProductsStage.jsx` | L1 刷新是 `Button` 不是 IconButton；**无 L2**；主 CTA 塞进 FilterBar `actions`；无 chips / sort / view | **A / P0** |
| `omnimux-accounts` | `AccountsStage.jsx` + `AccountsSection.jsx` | Stage 只有标题+Close，无副标题/Refresh；OverviewBar 占 L2；**主 CTA `+ 连接` 与 FilterBar 同行** | **A / P0** |
| `omnimux-inspiration` | `InspirationStage.jsx` + `InspirationSection.jsx` | Stage 只有标题+Close；过滤/搜索沉在 Section；无独立 Action Row | **A / P0** |
| `omnimux-workflow` | `projects/ProjectLibraryPage.jsx` | 有副标题，但 **主 CTA 进 Header**；FilterBar classic（search 在左、无 tools） | **A / P0** |
| `omnimux-publish` | `PublishStage.jsx` | 一级页 + 三 Tab 账本；控件已 kit，骨架未对齐 4 层 | **A（允许 3A Tab）/ P1** |

A 类 **零豁免**。OverviewBar / KPI 条只能作为 **L2 与 L3 之间的可选条带**（`StageKpiStrip`），不得替代 Action Row，不得把主 CTA 吸进去。

### 1.2 B 类 —— 特异形态与豁免边界

特异页 **不是**「整页免检」。外框 / Modal / Toolbar / 库页仍走 Pattern B+C；只有表内标明的内芯免 4 层与免标准表单控件。

| 形态 | 插件 / 表面 | 必须遵守 | 合理豁免（写进 doctor allowlist） | 禁止借口 |
|---|---|---|---|---|
| **B1 流程画布** | `omnimux-workflow` `CanvasTab.jsx` 外框；`src/canvas/` 内芯 | 外框：L1 标题+Close（可无 L2/L3）；外框 Button/IconButton 走 kit；填满右栏；关页保活 | `src/canvas/**` 节点图、连线、节点内芯、React Flow viewport、视频时间轴几何（`left/width` 百分比） | 外框手写 `<button>`；把项目库页当画布豁免；canvas Modal/Toolbar 生写控件 |
| **B2 监控仪表盘** | `omnimux-analytics` `AnalyticsStage.jsx` | L1 标题+副标题+Refresh/Close（可附加 Theme/Export IconButton）；L2 用 Tab+同步，**不**造「新建」CTA；L3 单行 FilterBar；L4 滚动图表区；kit + token | L4 图表 SVG 的 `--series-color` / `--pill-color` CSS 变量注入；无 Grid/List 切换 | 自研 FilterBar 替代 kit；L4 生写 `<button>`；页面级 `data-theme` 绕开 host token（theme toggle 可留，但色值必须走 `--dsw-alias-*`） |
| **B3 多通道集市** | `omnimux-market` plaza Tab（`plaza-shell` / `PlazaTab`） | L1 = Tablist（插件/技能/专家/连接器）+ Close IconButton；每 Tab 内搜索走 kit `FilterBar`；关页保活；填满右栏 | 无「+新建」L2（集市不是资产库）；Tab 内容区各自列表/详情 | 搜索 CTA 与 FilterBar 抢行造成换行；`document.body` 全屏 portal；`claimProductStage` |
| **B4 创作工作台** | `omnimux-clip` `OpenReelStudioTab`（主座）；`CanvasTab` | 主座 = `betterSidebar.registerTab`；左侧行走 `__omnimuxWorkbench.open`；Hub `toggleCluster` 首位切 gui↔split；可见控件走 kit；token | 非一级资产库，不套 4 层。Clip overlay 仅保留画布 portal | 侧栏点击 `claimProductStage`；用 overlay 当主入口；自研 `ActionButton` 长期替代 kit Button |
| **B5 中枢抽屉** | `omnimux` `AppsStage.jsx`、LoginGate、Profile、PluginsSection | 可见控件走 kit；零 inline blob；`--stage-*` 定位；关页保活 | 非资产库，不套 L2/L3；Settings 座走 `settings-ui.md` | 整页 `style={{ position:fixed, top, left, … }}` 几何对象；生写关闭 `<button>` |
| **C 非页面** | 各插件 `sidebar-entry`、`settings.plugin.item` | 行高 32px / 图标 14px（`sidebar-extra-entries.md`）；kit IconButton | 不套 4 层 | 私自 observer 放置侧栏行 |

画布内芯豁免 **精确 glob**（doctor 读取，禁止口头豁免）：

```
omnimux-workflow/src/canvas/**
!omnimux-workflow/src/canvas/**/ui/**
!omnimux-workflow/src/client/**
```

`src/canvas/ui/`（CustomSelect / CustomModal / CustomDropdown）是 **外框级控件仿制品，不豁免**，P1 用 kit 替换。Harness 与 `src/canvas/harness/` 测试岛不进生产门禁。

---

## 2. 架构图（文字层级）

```
[Host Cordis 对象插件]  dsh.bundle / cordis.patch.yml
        │  inject: slots, locale, betterSidebar, …
        │  ctx.betterSidebar.registerTab → 工作台 Tab 根
        │  左栏 open() → window.__omnimuxWorkbench.open({ tabId })
        │  ctx.effect 只收 style tag / observer；Tab 随 Fiber 卸
        ▼
[Client Stage / Tab 根]  各插件 src/client/*Stage.jsx（填满右栏）
        │  定位：absolute inset 0 / flex 100%；禁止 position:fixed + --stage-* 盖会话
        │  关页：everOpened + display:none（stage-guards）；Close = closeTab
        ▼
[dsh-ui-kit]  共享包，非插件，打进各 client.js；external react / primitives
        ├── StageRoot / StageHeader / StageActionRow     ← Pattern A 新增
        ├── Button / IconButton / SearchField / InputField / DropdownSelect
        ├── FilterBar（Standard 模式：filters 左，search+tools 右）
        └── ModalDialog / ConfirmModal
        ▼
[官方 primitives + --dsw-alias-*]  全量消费官方原生 CSS Tokens，零外部主题覆盖
```

清理策略：

| 资源 | 谁建 | 谁清 |
|---|---|---|
| Slot 注册 | `ctx.slots.inject` + `register` | Fiber 卸载自动 |
| locale 文案 | `ctx.locale.define` | Fiber 卸载自动 |
| `styles.js` `<style id="omnimux-*-styles">` | `inject*Styles()` | **必须** `ctx.effect(() => () => tag.remove())`；幂等 id |
| ResizeObserver / interval | Stage `useLayoutEffect` | effect return |
| `--stage-*` | 运行时 CSS 变量 | 随节点卸载 |
| 主题 | DSH 官方原生主题服务 (`ctx.theme`) | 零覆盖层、无须清理 |

---

## 3. 扩展点清单

| 挂载点 | 作用 | 清理方式 | 备注 |
|---|---|---|---|
| `ctx.betterSidebar.registerTab` + `window.__omnimuxWorkbench` | 一级工作台 Tab | Fiber / `unregisterTab` | **唯一一级业务座**；禁 `conversation.view` / `details`；禁库页 `shell.overlay` |
| `ctx.slots.inject("shell.overlay")` | 残留：LoginGate / Apps / Clip portal | Fiber 自动 | 禁止再给库页注册 |
| `window.__omnimuxSidebar.register` | 新会话下方入口 | 协调器幂等；插件卸时 `unregister` | 禁自挂 observer |
| `window.__omnimuxStage.claim/release` | 一级页互斥 | 关页 release | 与 `dsh-product-stage` 事件双通道 |
| `dsh-ui-kit` 值导入 | 标准控件 + Stage 壳 | 随 client bundle；kit CSS `data-dsh-ui-kit` 侧效应 | **不是** Cordis inject 服务 |
| `ctx.theme.overrideTokens` | 禁用（回归官方原生主题） | — | 严禁调用 overrideTokens 覆写调色盘 |
| `settings.plugin.item` / `settings.plugins.tab` | 插件配置卡 | Fiber 自动 | 禁一级 `settings.section` 放业务页 |
| `ctx.tools.register` | 模型可见工具 | Fiber 自动 | **本次整改不改工具面** |
| `cordis_define` | — | — | **禁用**（产物形态） |

---

## 4. Config 字段

本次是 UI 骨架整改，**不新增 Host `Config`**（无运行时 knobs）。门禁与豁免是仓库静态契约，坏清单必须显式失败。

| 字段 | 位置 | 默认 | 坏值行为 |
|---|---|---|---|
| （无）插件 Config | — | — | 不要把「是否 4 层」做成用户开关 |
| `UI_MORPHOLOGY` | `scripts/ui-morphology.json`（新建） | 见 §1 表 | doctor 读不到 / schema 不合法 → **FAIL** |
| `UI_LINT_STRICT` | env，doctor | unset=生产 FAIL | `0` 仅本地调试降 WARN，CI 禁止 |

可调几何（32 / 28 / 24 / 44–48）写在 kit CSS，不进插件 Config。

---

## 5. 三个整改 Pattern

### Pattern A —— 一级页 4 层标准架构

**模板真源**：`first-level-page-layout.md` §二 + Assets 实现。落地时把壳抽到 kit，避免再手抄。

kit 新增（P0 先合 kit，再改页面，避免 6 个插件同时改接口）：

```tsx
// personal/dsh-ui-kit 新增导出（工程师落地）
<StageRoot className="omnimux-*-stage" style={{ '--stage-top': ..., ... }}>
  <StageHeader
    title={t('stage.title')}
    subtitle={t('stage.subtitle')}          // A 类必填
    onRefresh={refresh}                     // A 类必有；B 类按形态
    onClose={() => stage.set(false)}
    extraActions={/* analytics: theme/export IconButtons */}
  />
  <StageActionRow                          // A 类必有；B2/B3 用语义等价行
    primary={<Button variant="primary" leadingIcon={<PlusIcon />}>{t('action.primary')}</Button>}
    secondary={<Button variant="outline">…</Button>}
  />
  <FilterBar compact
    filters={chips}                         // 左：全部 + 类型 chips
    tools={<>                               // 右：禁止再塞主 CTA
      <SearchField stretch debounceMs={0} />
      <DropdownSelect /* 最近更新 / 按名称 */ />
      <ViewToggle grid|list />
    </>}
  />
  <main className="omnimux-*-body">{children}</main>
</StageRoot>
```

硬规则（从金标钉死）：

1. FilterBar **Standard 模式**：有 `filters` + `tools`，**不要**同时传 `search`+`actions`（那会掉进 Classic，CTA 吸到右侧）。
2. 主 CTA 只活在 `StageActionRow`。
3. Header 右侧只有 IconButton（Refresh / Close）；Products 今天的「刷新」字面 Button 要改掉。
4. 顶距：`padding: 12px 20px 12px`（`sidebar-extra-entries.md`）；Assets 当前 header `16px 20px 8px` 作为 P1 对齐项，不挡 P0 结构。
5. 关页保活：`if (!stage || !everOpened) return null` 仅用于从未打开。

`first-level-page-layout.md` 模板里 Layer 3A 仍是裸 `<button class="omnimux-stage-tab">` —— **P0 改文档+实现为 kit `Button role="tab"`**，禁止工程师按旧模板抄。

### Pattern B —— UI Kit 去原生化

替换表（可见控件，一对一）：

| 原生素材 | 换成 | 验收 |
|---|---|---|
| `<button>` | `Button` / `IconButton` | 源码无 `<button\b`（测试文件除外） |
| `<input type="text\|search">` | `InputField` / `SearchField` | 无裸 text input |
| `<select>` | `DropdownSelect` | 无系统蓝白菜单 |
| 自研 FilterBar / omx-dropdown | kit `FilterBar` | 单行 44–48px |
| 自研 Modal | `ModalDialog` / `ConfirmModal` | 无手写遮罩 |
| emoji / 字符图标 | primitives `Icon*` | `icon-design-standards.md` |

允许残留：

- `<input type="file" style={{ display: 'none' }} />`（隐藏文件桥）
- SVG / `<canvas>` / React Flow 内芯
- 测试夹具 HTML 字符串

**accounts `+ {t('connect')}` 文本加号** 改 `leadingIcon={<IconPlusOutline16 />}`。

### Pattern C —— CSS Token 化与 Zero-Inline-Style

| 规则 | 做法 |
|---|---|
| 禁止 `style={{ ...几何/色值 blob }}` | 声明进 `styles.js`，className 引用 |
| 允许的 inline | **仅** CSS 自定义属性：`--stage-*`、`--dsw-accounts-platform-color`、图表 `--series-color` |
| 色值 | `var(--dsw-alias-*, fallback)`；fallback 可写 hex，**裸 hex/rgba 当主值 FAIL** |
| 平台品牌色 | 先在 styles.js 定义 `--omnimux-platform-tiktok: var(--dsw-alias-*, #…)` |
| 动态宽高（时间轴、进度条） | `style={{ '--x': px }}` + CSS `width: var(--x)`，禁止 `style={{ width: px }}` 对象（画布内芯 glob 豁免） |
| AppsStage 整页 fixed 几何 | 迁到 class + `--stage-*`，与 Assets 同一套 |

---

## 6. 分阶段路线图（零回归）

原则：**先门禁后改码**；PR 范围遵循 [plugin-git-pr](plugin-git-pr.md)；合入前隔离 worktree 自动化/静态检查与独立评审，通过 required CI/MQ 后按需 Dev 物化及 45120 ego-browser 共享探针验收；不建合入前独立运行环境、不默认强杀 App。本文件的 L1–L4 页面层级仍为 UI 结构分类，不是测试环境。

### P0 —— 挡住回归 + 四个标准库页对齐金标（约 5 个工作日）

| 批次 | 责任 | 工期 | 内容 | 验证 |
|---|---|---|---|---|
| P0.0 | 工程师 + 架构 | 0.5d | 落地 `scripts/ui-morphology.json` + doctor §14 静态门禁（先 **WARN** 一天对照，再升 FAIL） | `yarn omnimux:doctor` 退出码稳定；清单外文件零误杀 |
| P0.1 | 工程师 | 0.5d | kit 导出 `StageRoot/Header/ActionRow` + FilterBar Standard 单测；改 layout 合同去掉裸 tab button | `pnpm typecheck && pnpm build` in `personal/dsh-ui-kit` |
| P0.2 | 工程师 | 1d | **Products** 拆 L2 Action Row、Refresh→IconButton、补 sort/view 或显式「无类型则 chips=全部」 | 合入前相关自动化/静态与独立评审；合入后 Dev/ego 截图四层 |
| P0.3 | 工程师 | 1d | **Accounts** Stage 补副标题+Refresh；CTA 移出 FilterBar 进 Action Row；OverviewBar 降为 L2.5 | 同上，账号连接主路径不回归 |
| P0.4 | 工程师 | 1d | **Inspiration** 过滤上提为 Stage L3；`+添加灵感` 进 L2；checkbox 改 kit 或可访问 Button `aria-pressed` | 导入/分析主路径不回归 |
| P0.5 | 工程师 | 1d | **ProjectLibraryPage** CTA 出 Header 进 L2；FilterBar 改 Standard `filters`+`tools` | 新建项目 / 打开画布不回归 |
| P0.6 | QA | 0.5d | 四页对照 Assets 金标走 `plugin-qa.md` 五维 | 报告 PASS 才升 doctor 4 层规则为 FAIL |

P0 完成标准：A 类四页源码能被 `client-layout` 同类断言扫过；doctor §14 对 A 类 **FAIL**，对 B 类内芯 **豁免命中**。

### P1 —— 特异页外框 + 中枢抽屉 + kit 替换（约 4 日）

| 批次 | 责任 | 内容 |
|---|---|---|
| P1.1 | 工程师 | Workflow **外框** `WorkflowStage` 补副标题（可空文案键）；`src/canvas/ui/*` 换 kit |
| P1.2 | 工程师 | Analytics：确认 L2 语义=Tab+Sync（豁免「新建」）；去掉绕 host 的页面级色值 |
| P1.3 | 工程师 | Market：Plaza 顶栏几何改 `--stage-*`；FilterBar 保持 Standard，提交按钮不造成换行 |
| P1.4 | 工程师 | `omnimux` `AppsStage` / LoginGate / Profile* 去 inline blob + 生 button（B5） |
| P1.5 | 工程师 | `omnimux-publish` 升 A 类（3A Tab 合法）；oil-creator `ActionButton` → kit |
| P1.6 | QA | B 类外框 + 中枢抽屉回归 |

### P2 —— 内芯债与个人插件（约 3 日，可并行）

| 批次 | 内容 |
|---|---|
| P2.1 | 画布节点/时间轴 **仅** token 化能收的色值；几何 inline 保持豁免 |
| P2.2 | `dsh-agent-team-gui` / 其余 personal 一级表面 |
| P2.3 | Assets header 顶距 16→12 与合同对齐（视觉微调，单独 PR） |
| P2.4 | 文档：`ui-design-guidelines.md` 仍示范裸 `<button>` 的 Dropdown —— 改为「必须 kit」，避免双真源 |

每 PR 合入前回归：相关插件测试、静态检查与独立评审；合入后才同步 Dev，刷新指定页面并用 ego-browser 共享探针检查打开/关闭/空态/主 CTA。**不得**顺手改 Host 路由 / 工具 schema。

---

## 7. 自动化防退化门禁

挂在现有 `scripts/dev-doctor.sh` **§14**（已有 1–13：profile / 关页 / 写闸 / 空态 / hub import / files）。**不**新建并行 doctor 入口。CI = fork `yarn omnimux:doctor`。

### 7.1 扫描范围

- 根：`product/omnimux-dsh/plugins/*/src/client/**` + `personal/dsh-*/src/client/**`
- include：`*.jsx *.js *.tsx *.ts` 以及 `styles.js`
- exclude：`**/*.{test,spec}.*`、`**/lib/**`、`**/node_modules/**`、`ui-morphology.json` 的 `exemptGlobs`

### 7.2 规则（静态；优先正则，必要时轻量 AST）

| ID | 规则 | 实现 | A 类 | B 内芯 |
|---|---|---|---|---|
| UI01 | 禁止可见 `<button` / `<select` / `<input`（非 hidden file） | 正则 `<button\b` `<select\b` `<input\b` + 负向 `(type=['\"]file['\"].*display:\s*['\"]none` | FAIL | 豁免 glob 跳过 |
| UI02 | 禁止非自定义属性的 `style={{` | 正则 `style=\{\{` 后必须每键匹配 `--[A-Za-z0-9-]+` | FAIL | 豁免 |
| UI03 | `styles.js` / `.css` 色值必须 `var(--dsw-alias-` 或 `var(--dsw-specific-` | 裸 `#RGB` / `rgba?(` 不在 `var(` 同语句 → FAIL | FAIL | 豁免 |
| UI04 | A 类 Stage 必须同时出现 header / action-row / `<FilterBar` / body | 对 `ui-morphology.json` 里 `kind=standard-library` 的 `entryFile` 做断言（复制 Assets `client-layout.test.js`） | FAIL | 不适用 |
| UI05 | A 类 FilterBar 禁止 `actions=` 承载主 CTA | `actions=\{` 在该 entryFile → FAIL | FAIL | 不适用 |
| UI06 | 可见控件必须 `from 'dsh-ui-kit'`（或 kit 相对路径） | 文件含 Button/IconButton 使用但无 import → FAIL | FAIL | 外框 FAIL |
| UI07 | emoji 字符图标 | 沿用 `icon-design-standards` 已有扫描；无则本段补 | WARN→FAIL | 外框 |

正则不够就上 `acorn-walk`（doctor 已是 node 脚本）。**不要**上 ESLint 新插件栈，避免与现有 `node --test` 双轨。

### 7.3 `scripts/ui-morphology.json` 草案

```json
{
  "$schema": "ui-morphology.schema.json",
  "standardLibrary": [
    { "plugin": "omnimux-assets", "entryFile": "src/client/AssetsStage.jsx", "gold": true },
    { "plugin": "omnimux-products", "entryFile": "src/client/ProductsStage.jsx" },
    { "plugin": "omnimux-accounts", "entryFile": "src/client/AccountsStage.jsx" },
    { "plugin": "omnimux-inspiration", "entryFile": "src/client/InspirationStage.jsx" },
    { "plugin": "omnimux-workflow", "entryFile": "src/client/projects/ProjectLibraryPage.jsx" },
    { "plugin": "omnimux-publish", "entryFile": "src/client/PublishStage.jsx", "phase": "P1" }
  ],
  "special": [
    { "plugin": "omnimux-workflow", "kind": "canvas", "shellFile": "src/client/WorkflowStage.jsx", "exemptGlobs": ["src/canvas/**", "!src/canvas/ui/**"] },
    { "plugin": "omnimux-analytics", "kind": "dashboard", "shellFile": "src/client/AnalyticsStage.jsx" },
    { "plugin": "omnimux-market", "kind": "plaza", "shellFile": "src/client/plaza-shell.js" },
    { "plugin": "omnimux", "kind": "hub-drawer", "shellFile": "src/client/AppsStage.jsx" },
    { "plugin": "dsh-oil-creator", "kind": "workbench", "shellFile": "src/client/ContentInspector.tsx" }
  ]
}
```

坏 JSON / 缺 entryFile / glob 匹配零文件 → doctor **FAIL**（显式失败，不许静默跳过）。

### 7.4 升闸节奏（零回归）

1. 合 P0.0：规则跑起来，全部 **WARN**，输出文件:行。
2. P0.6 QA PASS 后：UI04/UI05 对已改 A 类升 **FAIL**。
3. 某插件 PR 合入后：该插件 UI01–03 升 **FAIL**（一插件一闸，避免全家桶红）。
4. P1 结束：B 类外框 UI01–03 **FAIL**，内芯仍豁免。

---

## 8. 任务清单（工程师可执行）

| 序号 | 任务 | 依赖 | 验证标准 |
|---|---|---|---|
| T0 | 新增 `docs/contracts/client-ui-remediation.md`（本文件）并在 `first-level-page-layout.md` 顶部链到形态表 | — | 合同可检索；3A 裸 button 模板删除 |
| T1 | 写 `scripts/ui-morphology.json` + schema；doctor §14 接入（默认 WARN） | T0 | `yarn omnimux:doctor` 打印 UI01–07 命中；坏 JSON exit 1 |
| T2 | kit：`StageRoot/Header/ActionRow` + 单测 + README | T0 | `pnpm typecheck && pnpm build`；exports 含新符号 |
| T3 | Products 按 Pattern A 对齐金标 | T1, T2 | layout 测试绿；L2 可见 `+ 新建商品`；FilterBar 无 `actions` 主 CTA |
| T4 | Accounts 同 T3；OverviewBar 改 L2.5 | T1, T2 | 连接主路径 E2E；CTA 不在 toolbar 行 |
| T5 | Inspiration 同 T3 | T1, T2 | 添加灵感在 L2；搜索在 L3 右 |
| T6 | ProjectLibraryPage 同 T3 | T1, T2 | 新建项目不在 Header；打开画布仍走现会话绑定 |
| T7 | QA 四页金标对照 + 升 UI04/05 FAIL | T3–T6 | plugin-qa 报告可交付 |
| T8 | Workflow 外框 + `canvas/ui` kit 化 | T1, T2 | 画布节点拖拽不回归；CustomSelect 消失 |
| T9 | Analytics / Market 外框 B+C | T1 | 仪表盘/集市主路径不回归 |
| T10 | hub AppsStage / LoginGate / Profile Pattern B+C | T1 | 无整页 inline blob；关闭为 IconButton |
| T11 | publish + oil-creator P1 | T2 | 发布三 Tab 仍可用；inspector 主按钮为 kit |
| T12 | P2 画布 token / personal / Assets 顶距 12px | T7 | doctor 对豁免 glob 零误 FAIL |

---

## 9. 待工程师现场核对源码

- FilterBar Classic 分支（`filters + search + actions`）是否仍被 accounts/products/market 依赖 → 改完 A 类后 **删除 Classic 或标 `@deprecated` 并让 doctor 禁新用**。
- Market 单体 `boot.js` 拼接的 `require("dsh-ui-kit")` 是否打进 bundle（kit 非 ModuleLoader 共享模块，必须打包；`react` / primitives 必须 external）—— 与现网 `omnimux-publish` 相同。
- `omnimux-gallery` 是否仍有独立一级页（sidebar 合同写 gallery，plugins 目录现为 `omnimux-market`）→ 以 plugins 目录为准，gallery 不单列整改。
- Assets header `16px` vs 合同 `12px`：P0 不改视觉，P2.3 单独 PR。
