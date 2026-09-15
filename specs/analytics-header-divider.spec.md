# 数据分析看板分割线迁移到 tab 选项卡与标题描述之间 · 规格

关联 Issue：#1869
变更面：插件客户端 Stage（`plugins/omnimux-analytics`）
风险等级：R2（单插件非破坏性界面修复）

---

## 1. 目标（Objective）

### 背景与问题陈述

数据分析看板一级页（`AnalyticsStage`）当前的分割线渲染在 **tab 选项卡行下方**、筛选行上方：

```
┌ PageHeader ── 标题「数据分析看板」 + 描述 ─────────────┐
│ ActionNavRow ── [发布效果分析][私信]  上次同步… 立即同步 │   ← 与页头挤在同一区块
├──────────────── Divider（当前位置）───────────────────┤
│ FilterBar ── 平台 / 账号 / 发布时间 / 近30天 / 搜索    │
└──────────────────────────────────────────────────────┘
```

tab 选项卡行因此被并进页头区块，与「标题 + 描述」之间没有分隔，页面顶部的区块划分不清晰。

### 目标状态

分割线上移到「标题 + 描述」与 tab 选项卡行**之间**：
`PageHeader` → `Divider` → `ActionNavRow` → `FilterBar`，且 tab 行下方不再有这条分割线。

```
┌ PageHeader ── 标题「数据分析看板」 + 描述 ─────────────┐
├──────────────── Divider（目标位置）───────────────────┤
│ ActionNavRow ── [发布效果分析][私信]  上次同步… 立即同步 │
│ FilterBar ── 平台 / 账号 / 发布时间 / 近30天 / 搜索    │
└──────────────────────────────────────────────────────┘
```

### 用户故事

- 作为看板使用者，我在打开「数据分析看板」时，能一眼分清「页面标题区」与「数据筛选/内容区」，页头与内容区之间有明确的分隔。

### 不做什么（Non-goals）

- 不修改 `/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit`（组件库属另一工作区）。
- 不修改 `PageHeader` / `Divider` / `Tabs` / `ActionNavRow` / `FilterBar` 的内部实现。
- 不改变 tab 切换、同步、筛选、导出、关闭的任何行为。
- 不做与本诉求无关的重构。

---

## 2. 成功标准（Success Criteria，可测）

| 编号 | 验收标准 | 判定手段 |
| --- | --- | --- |
| AC-1 | stage 渲染后 DOM 顺序为：标题描述区 → 分割线 → tab 选项卡行 → 筛选行。分割线元素在 `PageHeader` 之后、`ActionNavRow` 之前。 | 真实浏览器取 `compareDocumentPosition` / `Node.DOCUMENT_POSITION_FOLLOWING` |
| AC-2 | 分割线仍是 1px 高、`role="separator"`、水平方向，颜色走设计令牌 `--dsw-alias-border-l2`（不出现裸色值）。 | 计算样式 `height === '1px'`、`backgroundColor` 等于 token 解析值 |
| AC-3 | 分割线左右贯通 stage 全宽（左右各 0 额外内缩），宽度等于 stage 内容宽度。 | 计算几何：`divider.width ≈ stage.width` |
| AC-4 | tab 选项卡行（`ActionNavRow`）下方**不再**有这条分割线：stage 内 `role="separator"` 元素唯一，且在 tab 行之前。 | 统计 stage 内水平 separator 数量 === 1，且其 `top < ActionNavRow.top` |
| AC-5 | tab 行与筛选行之间不出现视觉断裂：tab 行与筛选行垂直间距与修复前的对应节奏同量级（>0 且无明显空白断层）。 | 实测 `FilterBar.top - ActionNavRow.bottom` |
| AC-6 | 标题描述与分割线之间、分割线与 tab 行之间间距协调：两段间距均在 8px ~ 28px 区间内。 | 实测两段净空数字 |
| AC-7 | 键盘可达与 tab 切换行为不变：tab 仍可聚焦、方向键/回车切换、`aria-selected` 唯一。 | 真实浏览器键盘事件 + DOM 断言 |
| AC-8 | 浅色与深色主题均正常：分割线在两种主题下都可见且取到主题令牌值。 | 两种主题各取一次计算样式 + 截图 |
| AC-9 | 回归测试锁定「分割线必须在 PageHeader 与 ActionNavRow 之间，且不在 ActionNavRow 之后」。 | 新增 `analytics-stage-divider.test.js`（react-dom/server 渲染真实 AnalyticsStage 后断言元素顺序）与 `analytics-header-divider.e2e.test.js`（headless Chrome 渲染真实 stage 后断言几何与顺序），随 `pnpm --filter omnimux-analytics test` 执行；并做红绿验证 |
| AC-10 | 相关自动化测试与静态门禁（`pnpm verify:stages`）通过。 | 命令退出码 + 真实用例数 |

---

## 3. 命令（Commands）

在任务工作树根目录 `.worktrees/analytics-header-divider-issue-1869` 执行：

```bash
# 目标插件单测 + E2E 测试
pnpm --filter omnimux-analytics test

# 静态 Stage 合同门禁
pnpm verify:stages

# UI 设计规范静态门禁（原生控件 / 内联样式 / 裸色 / 字阶）
pnpm test:ui
```

浏览器取证（隔离工作树内、动态端口、随测随清）：使用 ego-browser 打开 stage 夹具页并注入真实 `ANALYTICS_CSS`，取计算样式与截图，证据落盘工作树内 `tmp/analytics-header-divider/`（门禁证据路径）并复制到 `qa-evidence/analytics-header-divider/`。

---

## 4. 项目结构（Project Structure）

| 路径 | 说明 |
| --- | --- |
| `plugins/omnimux-analytics/src/client/AnalyticsStage.jsx` | 唯一业务源码改动点：`<Divider />` 位移 |
| `plugins/omnimux-analytics/src/client/styles.js` | 仅当实测间距需要微调时才改（stage 作用域内、走设计令牌） |
| `plugins/omnimux-analytics/src/client/analytics-stage-divider.test.js` | 新增防复发测试：渲染真实 stage，锁定分割线位于 PageHeader 与 ActionNavRow 之间 |
| `plugins/omnimux-analytics/src/client/analytics-header-divider.e2e.test.js` | 新增端到端测试：headless Chrome 渲染真实 stage，断言 DOM 顺序、几何与筛选栏无底边框 |
| `specs/analytics-header-divider.spec.md` | 本规格 |
| `tmp/analytics-header-divider/` | 浏览器取证运行证据（截图 + 结构化 JSON） |
| `qa-evidence/analytics-header-divider/` | 证据留存副本（修复前/后 × 浅色/深色） |
| `.agent-reports/analytics-header-divider/` | 结论报告 |

---

## 5. 代码风格（Code Style）

沿用仓库既有风格：React 函数组件、具名导出、2 空格缩进、无分号；样式一律走 CSS 变量令牌，禁止内联样式与裸色值。

```jsx
const DIVIDER_CLASS = 'omnimux-analytics-stage-divider'

return (
  <div className="omnimux-analytics-stage">
    <PageHeader ... />
    <Divider className={DIVIDER_CLASS} />
    <ActionNavRow ... />
    <FilterBar ... />
  </div>
)
```

---

## 6. 测试策略（Testing Strategy）

| 层级 | 内容 |
| --- | --- |
| 单元测试 | 新增 `analytics-stage-divider.test.js`：用 esbuild 把真实 `AnalyticsStage` 及其全部依赖打成 Node 包后用 `react-dom/server` 渲染，断言 stage 内 `role="separator"` 唯一、其位置在 `<h1>` 之后且在任何 `omnimux-analytics-stage-action-row` 之前、tab 行与筛选行之间不再出现 separator。 |
| 端到端测试 | 新增 `analytics-header-divider.e2e.test.js`：把真实 `AnalyticsStage` 打成浏览器包后用本机 headless Chrome `--dump-dom` 打开临时页面（临时目录、自清理），断言 stage 子元素顺序为 `PageHeader → separator → action-row → filter`、分割线几何（1px 高、贯通 stage 全宽、两侧净空 8~28px）、标签行与筛选行之间无 separator、筛选栏 `border-bottom` 为 0/none。与既有 `shared-tabs-dividers.e2e.test.js` 的「分析页只剩一条分割线」验收互补（后者按真实浏览器测筛选栏无底边框，不含位置断言）。 |
| 真实浏览器取证 | ego-browser 在隔离工作树内打开 stage 夹具页，取修复前/后 × 浅色/深色的计算样式、几何与 PNG 截图；并实测 tab 切换与键盘可达未回退。 |

测试位置：`plugins/omnimux-analytics/src/client/`（与既有 `*.test.js` 同目录，随包 `test` 脚本一并执行）。

---

## 7. 边界（Boundaries）

**总是做（Always）**
- 提交前跑 `pnpm --filter omnimux-analytics test` 与 `pnpm verify:stages`。
- 样式只走既有设计令牌（`--dsw-alias-*`），并带 fallback。
- 保留 tab 行的键盘可达与 ARIA 语义。

**先问（Ask first）**
- 任何需要改动 `personal/dsh-ui-kit` 的方案。
- 任何超出 `plugins/omnimux-analytics/` 目录的改动（规格/证据/报告除外）。

**绝不做（Never）**
- 内联样式（`style={{}}`）、裸色值、改动组件库。
- 修改 `PageHeader` / `Divider` 的既有几何与令牌。
- 顺手重构无关代码，或删除既有测试。
- 合并 PR（用户级硬门禁：界面改动先演示、后合入）。

---

## 8. 与共享规范的定向偏离（Deviation from a shared spec）

`origin/main` 刚合入的 `specs/shared-tabs-dividers-polish.spec.md`（#1866 / #1868）AC-4 原文要求：**「数据分析看板中，仅保留标签栏下方的一条分割线」**。

本任务按**用户明确要求**把这条分割线移到标签栏**上方**（`PageHeader` 与 `ActionNavRow` 之间），与该条 AC 描述的期望位置相反。因此：

- 这是一次**用户指令驱动的定向调整**，不是遗漏、不是回退、也不是回归；
- 受影响范围仅「`AnalyticsStage` 这一条分割线的垂直位置」，同规范中的 AC-1（产品库分割线左右 20px 留白）、AC-2（资产库两层标签 14px 净空）、AC-3（技能市场胶囊 Tab）均不受影响；
- 处理方式：在 `specs/shared-tabs-dividers-polish.spec.md` 的 AC-4 处就地补一条被本次覆盖的说明（只标注这一条，并写明调整后数据分析页的期望位置），不改动该规范的其他条目。

---

## 9. 实测结果（Measured，真实浏览器）

夹具：工作树内 `tmp/analytics-header-divider/harness/`（动态端口、随测随清），stage 视口宽 1280px。

**DOM 顺序（stage 直接子元素）**

| 阶段 | 顺序 |
| --- | --- |
| 修复前 | `HEADER` → `action-row` → `[role=separator]` → `stage-filter` → `stage-body` |
| 修复后 | `HEADER` → `[role=separator]` → `action-row` → `stage-filter` → `stage-body` |

**几何（浅色与深色完全一致，单位 px）**

| 项 | 修复前 | 修复后 |
| --- | --- | --- |
| 分割线（top / height） | 140 / 1 | 84 / 1 |
| 分割线横向范围 | 320 → 1600（贯通 stage 全宽 1280，左右各 0 内缩） | 同左，未变 |
| 分割线 margin | 12 / 8 | 同左，未变 |
| 标题描述区 | 0 → 72（标题 12–40、描述 42–60） | 同左，未变 |
| tab 行 | 72 → 128 | 93 → 149 |
| 筛选行 | 149 → 193 | 149 → 193（未移动） |
| 描述底 → 分割线 | 80（描述底 60 → 分割线 140） | **24**（描述底 60 → 分割线 84） |
| 分割线 → tab 行内容 | —（分割线在 tab 行下方） | **8**（85 → 93） |
| tab 行内容底 → 筛选行内容顶 | 39（含分割线及其 12/8 外边距） | **18**（137 → 155，纯留白，无分割线） |

结论：分割线取其组件默认的 12/8 外边距，未引入任何内联样式或新令牌；筛选行位置完全未动，只是 tab 行整体下移 21px（= 分割线 1px + 12 + 8），标签行与筛选行之间保留 18px 净留白，不构成视觉断裂。分割线横向仍贯通 stage 全宽（左右各 0 内缩），与修复前一致——本次只做垂直位移，未改动横向对齐。

**主题与行为**

| 项 | 结果 |
| --- | --- |
| 浅色分割线取色 | `rgb(204, 204, 204)`（= 主题 `--dsw-alias-border-l2`） |
| 深色分割线取色 | `rgba(255, 255, 255, 0.12)`（= 主题 `--dsw-alias-border-l1` / `l2`） |
| tab 切换 | 点击「私信」后 `aria-selected` 正确翻转、内容区切换，分割线仍在 tab 行之上（84 < 93） |
| 键盘可达 | 焦点保持在 tab 按钮上 |
| harness 控制台错误 | 0 |

**逐字节与像素判定（修复前 / 修复后 四张截图）**

| 判定 | 结果 |
| --- | --- |
| 四图 SHA-256 | 两两互不相同（浅色/深色、前/后均不同） |
| 修复前 vs 修复后（浅色） | 差异集中在 y 80–141、x 320–1600，共 9177 px；差异行 51 行 |
| 修复前 vs 修复后（深色） | 同一区域，共 9252 px |
| 浅色 vs 深色（同阶段） | 全图差异 1 783 116 px（确为两套主题） |
| 分割线所在行 | 修复前 y=140（全宽均匀行，浅 204.0 / 深 42.0，std 0.0）；修复后 y=84（同一签名） |
| 修复后 y=140 | 已回归纯背景（浅 255.0 / 深 13.0）——标签行下方确无分割线 |

证据路径：`qa-evidence/analytics-header-divider/`（`before|after-light|dark.png`、`compare-light.png`、`compare-dark.png`、裁剪对照图）。

**红绿验证**

| 测试 | 红（源码回退到 HEAD） | 绿（还原后） |
| --- | --- | --- |
| `analytics-stage-divider.test.js` | 3 条中 2 条失败 | 3/3 通过 |
| `analytics-header-divider.e2e.test.js` | 3 条中 2 条失败（顺序断言与净空断言） | 3/3 通过 |
| 两者合计 | 6 条中 4 条失败，2 条通过 | 6/6 通过 |

**门禁实测**

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter omnimux-analytics test` | 117 tests / 34 suites，pass 117，fail 0 |
| `pnpm verify:stages` | PASS（11 个 Stage 组件、8 个 sidebar 契约） |
| `pnpm test:ui` | 511 个源文件，违规 0 |
| `plugins/omnimux/src/client/shared-tabs-dividers.e2e.test.js` | 4/4 通过 |

---

## 10. 未覆盖与待确认

- 未在真实 App（开发版真机）演示：按仓库约定，Dev 真机验收由人工执行，不作为 Agent 交付前提。
- 分割线横向仍贯通 stage 全宽，与标题/筛选内容的 20px 内缩不对齐。这是修复前既有形态，本次未改；同规范 AC-1 只对产品库提出 20px 留白要求，数据分析页未被要求。若需统一，属另一次改动，需用户确认后再做。
- 未跑全仓 `pnpm test`（改动面仅单插件源码 + 规格 + 单插件测试，已跑目标插件套件、`verify:stages`、`test:ui` 与共享分割线回归用例）。
