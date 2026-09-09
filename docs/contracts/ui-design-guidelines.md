---
title: "OmniMux UI Design & Interaction Guidelines"
id: "contract-ui-design-guidelines"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
authors: ["x", "agent-architect"]
subsystem: "omnimux-accounts"
---

# OmniMux UI Design & Interaction Guidelines

> 适用于所有 OmniMux 系列插件客户端界面（一级独立页、侧边栏入口、弹窗 Dialog、设置面板、卡片与工具栏）。
> 目的：杜绝系统原生控件割裂感、排版换行凌乱、字符图标简陋与圆角混乱，保证全栈深色沉浸式质感。
> 文案与命名标准必须同步遵循：《OmniMux 全局 UI 命名与微文案规范》（`docs/contracts/ui-copywriting-and-naming-standards.md`）。

---

## 1. 核心铁律（Hard Rules）

1. **严禁裸用原生 `<select>`**：
   - WebKit / macOS Electron 下原生 `<select>` 会弹出系统蓝白相间的原生菜单，破坏暗黑质感。
   - **必须**使用定制 React Popover Dropdown（如 `omnimux-accounts` 的 `DropdownSelect`）或使用 `appearance: none; -webkit-appearance: none;` + 细线定制 SVG Chevron + 暗黑 option 面板。
2. **严禁使用文本字符与 Emoji 充当图标**：
   - 严禁在按钮或界面标签中使用 `↑`、`↓`、`⊞`、`≣`、`×`、`✏️`、`🗑️`、`🎯`、`🎬`、`⏱️`、`⚡`、`✅` 等原生 emoji 或字符。
   - **必须**遵循《OmniMux 图标组件选型与迁移规范》（`docs/contracts/icon-design-standards.md`），优先使用 `@deepseek-ai/dsh-client-ui-primitives` 原生图标组件，缺省时使用 `lucide-react` 矢量 SVG 组件。
3. **工具栏单行流（Single-row Toolbar）**：
   - 搜索与筛选工具栏一律声明 `flex-wrap: nowrap;`，严禁在宽屏下被子元素撑成两行。
   - 搜索框自适应拉伸（`flex: 1 1 200px; min-width: 140px; max-width: 260px;`）。
   - 下拉筛选器、排序按钮组、视图切换按钮一律 `flex-shrink: 0;`。
   - 右侧主要行动按钮（CTA 如 `+ 连接账号`、`+ 新建资产`）设为 `margin-left: auto; flex-shrink: 0;`。
4. **统一几何与圆角（Geometry Consistency）**：
   - 控件高度基准：**`32px`**（输入框、下拉框、图标按钮、次级操作按钮）。
   - 基础圆角：**`8px`**（按钮、输入框、下拉触发器）；浮层/卡片圆角：**`10~12px`**；弹窗外壳：**`16px`**。
   - 严禁在同一工具栏混用 `borderRadius: 999`（胶囊）与 `borderRadius: 8`。

---

## 2. 标准组件规范（Component Standards）

### 2.1 下拉菜单选择器（Dropdown Select）

标准结构：触发按钮（含当前标签与可旋转 180° 的 Chevron） + 绝对定位的毛玻璃浮层面板。

```jsx
// 结构示范
<div className="omx-dropdown" ref={containerRef}>
  <button
    type="button"
    className={`omx-dropdown-trigger ${open ? 'omx-dropdown-trigger--open' : ''}`}
    onClick={() => setOpen(!open)}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span>{currentLabel}</span>
    <svg className="omx-dropdown-chevron" viewBox="0 0 16 16" width="12" height="12">
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>
  {open && (
    <div className="omx-dropdown-menu" role="listbox">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="option"
          aria-selected={opt.value === value}
          className={`omx-dropdown-item ${opt.value === value ? 'omx-dropdown-item--selected' : ''}`}
          onClick={() => { onChange(opt.value); setOpen(false); }}
        >
          <span>{opt.label}</span>
          {opt.value === value && <CheckIcon />}
        </button>
      ))}
    </div>
  )}
</div>
```

**浮层面板样式标准**：
- 背景：`var(--dsw-alias-bg-elevated, #1c1c1f)` + `backdrop-filter: blur(16px)`
- 边框：`1px solid var(--dsw-alias-border, rgba(255,255,255,0.14))`
- 圆角：`10px`，内边距：`4~6px`
- 阴影：`0 10px 28px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)`
- 进场动效：`animation: omx-pop 0.12s cubic-bezier(0.16, 1, 0.3, 1)`（Y 轴位移 `-4px` → `0`，透明度 `0` → `1`）
- 交互保障：绑定全局 `pointerdown`（点击外部收起）与 `keydown Escape`。

#### 2.1.2 触发器与选项文案黄金契约（Mac/Linear 范式）
- **触发器文案**：默认全量态显示为维度名（如 `[ 平台 ▾ ]`）或名值对（`[ 平台: 全部 ▾ ]`），过滤态显示具体值（`[ TikTok ▾ ]`）。严禁多个下拉默认态裸露为 `[ 全部 ▾ ]`。
- **下拉首项**：首项（重置项）文案**唯一强制为 `全部` (All)**，严禁拼接维度名为 `全部平台`、`全部账号`、`全部发布来源`。
- **维度命名**：必须使用纯实体名词（`平台`、`账号`、`发布方式`、`时间跨度`、`状态`），禁止冗余定语。

### 2.2 图标操作按钮（Icon Buttons）

- 尺寸：`32px × 32px`，内边距：`0`，`display: inline-flex; align-items: center; justify-content: center;`
- 常规态：背景 `rgba(255,255,255,0.04)`，边框 `rgba(255,255,255,0.12)`，图标颜色 `rgba(255,255,255,0.65)`
- Hover 态：背景 `rgba(255,255,255,0.08)`，边框 `rgba(255,255,255,0.22)`，图标纯白
- Active 态（按压）：`transform: scale(0.96)`
- 选中/激活态（`aria-pressed="true"`）：背景 `rgba(255,255,255,0.14)`，边框 `rgba(255,255,255,0.26)`，图标纯白，内阴影 `inset 0 1px 0 rgba(255,255,255,0.08)`

### 2.3 搜索框（Search Input）

- 高度：`32px`，内边距：`0 12px`
- 背景：`rgba(255,255,255,0.04)`，边框 `rgba(255,255,255,0.12)`，圆角 `8px`
- Hover 态：边框提亮 `rgba(255,255,255,0.22)`
- Focus 态：`outline: none; border-color: var(--dsw-alias-brand-primary, #3b82f6); box-shadow: 0 0 0 2px rgba(59,130,246,0.22);`
- 占位符颜色：`rgba(255,255,255,0.38)`

---

## 3. 颜色与 Token 标准

一律优先使用官方/OmniMux 语义 Token，暗黑模式降级色参考如下：

| Token | 推荐值 | 用途 |
|---|---|---|
| `--dsw-alias-bg-primary` | `#111113` / `#16181d` | 页面主体底色 |
| `--dsw-alias-bg-secondary` | `rgba(255,255,255,0.04)` | 输入框、次级卡片底色 |
| `--dsw-alias-bg-elevated` | `#1c1c1f` | 浮层菜单、Dialog、Popover |
| `--dsw-alias-border` | `rgba(255,255,255,0.12)` | 常规描边 |
| `--dsw-alias-border-hover` | `rgba(255,255,255,0.22)` | 悬浮高亮描边 |
| `--dsw-alias-brand-primary` | `#3b82f6` / `#60a5fa` | 选中项、激活态、焦点光晕 |
| `--dsw-alias-label-primary` | `#ffffff` / `#f3f4f6` | 一级文字、高亮图标 |
| `--dsw-alias-label-secondary` | `rgba(255,255,255,0.72)` | 二级文字、常规图标 |
| `--dsw-alias-label-tertiary` | `rgba(255,255,255,0.40)` | 占位文字、辅助说明 |

---

## 4. 变更验收核查清单（Checklist）

在交付任何 OmniMux 插件的前端修改前，必须逐项核对：

- [ ] **无折行**：工具栏在桌面标准宽度下所有筛选和操作保持同一行。
- [ ] **无原生 select**：点击下拉选项时，弹出的是暗黑毛玻璃浮层，而非系统原生蓝白菜单。
- [ ] **无文字图标**：排序箭头、网格切换、关闭等均使用精确的 SVG 图标。
- [ ] **外部关闭**：所有浮层和下拉菜单均支持点击外部及 `Esc` 键关闭。
- [ ] **微动效与反馈**：所有交互元素具备平滑的 `transition`（100~150ms）、Hover 高亮、Focus 蓝光晕以及 Active 按压缩放。
- [ ] **分阶段验证**：隔离 worktree 完成相关自动化/静态检查与独立评审，通过 PR required CI/MQ 后，按[开发环境合同](dev-pipeline.md)从已合并 `main` 物化 Dev，在 45120 使用 ego-browser 与共享 `verify:live` 验收。仅平台/壳层行为追加 Electron 证据；不将未合并源码送入 Dev/Prod，不默认重启或写生产。

---

## 5. 双重硬门禁与规范豁免标准（Dual Hard Gates & Exemption Syntax）

为杜绝违规 UI 代码（原生控件、内联样式、裸色、非标字阶）流入代码库，实施双重硬门禁物理防御：

### 5.1 第一重门禁：PreToolUse 运行时拦截守卫 (`scripts/guard-ui-design.mjs`)
- 挂载于 `.dsh/hooks.json`，在 Agent 调用 `write`/`edit` 落地代码前毫秒级检测；
- 违规代码立即被物理打断并返回 `permissionDecision: "deny"`，附带错误行号、`design.md` 对应章节及Before/After修正示例；
- 完全合规或非 UI 客户端路径即刻返回 `permissionDecision: "allow"` 放行。

### 5.2 第二重门禁：静态门禁扫描与 CI 致命阻断 (`scripts/scan-ui-gates.mjs`)
- 接入 `package.json` 的 `verify:gates`（位于 `test:gates` 前执行）；
- UI01（原生控件）、UI02（内联样式）、UI03（裸色硬编码）、UI07（非幂等导航）、UI08（私建页头类）、UI09（手写 h1）、UI10（合规字阶）全面纳入致命 FATAL 校验；
- 发现任何一处违规即触发 `process.exit(1)` 彻底阻断 CI 与合并队列。

### 5.3 规范豁免标准语法
如属第三方复杂内嵌、特化大字（如 Hero 品牌大字、KPI 数字）或不可避免的特殊业务场景，必须在违规行显式添加行级规范豁免注释：
- 原生控件豁免：`// exempt-ui01 <特化原因>` 或 `/* exempt-ui01 <特化原因> */`
- 内联样式豁免：`// exempt-ui02 <特化原因>` 或 `/* exempt-ui02 <特化原因> */`
- 裸色硬编码豁免：`// exempt-ui03 <特化原因>` 或 `/* exempt-ui03 <特化原因> */`
- 非标字阶豁免：`// exempt-ui10 <特化原因>` 或 `/* exempt-ui10 <特化原因> */`
