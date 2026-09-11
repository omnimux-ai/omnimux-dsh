# OmniMux 插件系列 UI 设计规范 —— DeepSeek Harness 原生 UI 体系适配（v2.0）

> **权威等级**：L1（最高设计与交互契约）  
> **适用范围**：本仓库（`omnimux-dsh`）内全部带 Web 客户端的插件 —— `plugins/omnimux`（Hub 壳层与货架页）、`plugins/omnimux-accounts`、`plugins/omnimux-assets`、`plugins/omnimux-products`、`plugins/omnimux-inspiration`、`plugins/omnimux-workflow`、`plugins/omnimux-clip`、`plugins/omnimux-publish` 及后续新增垂直插件。  
> **单一事实源**：本文件与 [`docs/contracts/ui-design-guidelines.md`](docs/contracts/ui-design-guidelines.md) 共同构成插件 UI 开发的唯一事实源；任何与旧版本（v1.0 x.ai 品牌岛）冲突之处，一律以本文档为准。

---

## 1. 核心架构原则与设计体系演进

### 1.1 彻底弃用外部 x.ai 覆盖层，全面回归官方原生

在早期版本中，OmniMux 曾尝试引入外部 x.ai 调色盘，并通过 `--omx-*` 样式岛或 `ctx.theme.overrideTokens()` 全壳染色方案。经实战验证，该路径存在以下致命技术缺陷：
1. **破坏官方交互与状态流转**：官方 DSH 按钮 Hover/Active、Focus Ring、发送箭头、Badge 状态等高度依赖精确匹配的 `--dsw-*` 色彩矩阵。外部覆盖层破坏了暗色主题下的交互反馈（如发送按钮白底白字失真、链接焦点环丢失）。
2. **对比度受损与无障碍性（a11y）降级**：过度追求单色极简导致 Light 模式下次级文本对比度低于 WCAG AA 要求的 4.5:1，Dark 模式下边框对比度仅 1.28:1，大幅降低高强度工作下的可读性。
3. **上游升级维护负担重**：DSH 高频迭代时，外部 84+ Token 映射极易产生死 Token 或缺失映射。

**v2.0 决议（参见 [`docs/decisions/2026-08-27-adopt-dsh-native-ui-system.md`](docs/decisions/2026-08-27-adopt-dsh-native-ui-system.md)）**：
- **100% 消费官方 Token**：以 DeepSeek Harness 官方原生 `--dsw-alias-*`（语义别名层）与 `--dsw-specific-*`（特定组件层）为唯一色彩与主题真源。
- **严禁全壳染色与外部调色板**：彻底废除 `ctx.theme.overrideTokens()`、`xai-theme.js` 与全局 `<style>` 样式劫持。
- **严禁私造平行变量体系**：彻底废除 `--omx-*` 独立变量体系与 `.omx-scope` 样式隔离岛。
- **零 JS 暗黑/明亮无缝自适应**：完全遵循宿主 `data-theme="dark" | "light"` 与 CSS 变量原生级联，严禁在组件层编写属性级 JS 补丁或使用 `filter: invert()`。

---

## 2. 核心交互与几何铁律（Hard Rules）

依据 [`docs/contracts/ui-design-guidelines.md`](docs/contracts/ui-design-guidelines.md)，所有插件客户端界面必须严格遵循以下六大铁律：

### 2.1 统一几何与 32px 控件高基准（Geometry & 32px Baseline）
- **基准高度**：所有输入框（Search/Input）、下拉触发器（Dropdown Trigger）、图标按钮（IconButton）、次级操作按钮统一为 **`32px`**（`height: 32px; box-sizing: border-box;`）。
- **紧凑变体**：密集表格行内小按钮允许使用 `28px`（`--btn-sm`）或 `24px`（`--btn-xs`），禁止出现 `26px`/`30px`/`36px`/`40px` 等不合规高度。

### 2.2 8px 标准圆角体系（Radius Hierarchy）
- **基础控件圆角**：按钮、输入框、下拉框统一为 **`8px`**。
- **浮层与卡片圆角**：Popover 菜单、下拉列表浮层、卡片容器统一为 **`10px ~ 12px`**。
- **模态弹窗外壳**：Modal Dialog 统一为 **`16px`**。
- **红线约束**：严禁在同一工具栏中混用 `9999px`（胶囊圆角）与 `8px`（标准圆角）。胶囊圆角仅限特定的过滤 Chip 或状态 Badge。

### 2.3 工具栏单行流（Single-Row Toolbar Flow）
- **无折行**：搜索与筛选工具栏一律声明 `flex-wrap: nowrap;`，在标准桌面视口下严禁被子元素撑成多行。
- **弹性伸缩**：
  - 搜索框自适应拉伸：`flex: 1 1 200px; min-width: 140px; max-width: 260px;`。
  - 下拉筛选器、排序按钮组、视图切换按钮：`flex-shrink: 0;`。
  - 右侧主要行动点（CTA，如 `+ 连接账号`、`+ 新建资产`）：`margin-left: auto; flex-shrink: 0;`。

### 2.4 严禁裸用原生 `<select>`
- WebKit 与 macOS Electron 环境下原生 `<select>` 会触发系统级蓝白相间菜单，严重破坏暗黑质感与主题一致性。
- **必须**使用定制 React Popover 下拉浮层（基于毛玻璃浮层面板）或统一引入 `@deepseek-ai/dsh-client-ui-primitives` / `dsh-ui-kit` 中的 `DropdownSelect`。

### 2.5 严禁使用字符与 Emoji 充当图标 (UI04 硬门禁)
- 严禁在按钮或标签中使用 `↑`、`↓`、`×`、`✕`、`🔍`、`⚙️`、`✅`、`🗑️`、`🎬`、`⚡` 等 Unicode 字符或 Emoji。
- **必须**统一使用矢量 SVG 图标（优先使用 `@deepseek-ai/dsh-client-ui-primitives` 内置图标，缺省时使用 `lucide-react`）。
- **硬性门禁卡点 (UI04)**：由 `scripts/guard-ui-rules.mjs` 与 CI `scripts/scan-ui-gates.mjs` 自动强校验，违规代码在编辑时被 PreToolUse Hook 打断，在 CI 时直接阻断构建。特化场景须使用 `// exempt-ui04 <业务原因>`。

### 2.6 WCAG AA 无障碍对比度（Accessibility & Contrast）
- 正文及关键交互文本对背景的对比度必须 ≥ **4.5:1**。
- 大号文本（≥ 18px 或加粗 ≥ 14px）对比度必须 ≥ **3.0:1**。
- 弱文本（`label-tertiary`）仅限用于非关键元数据与占位符，严禁用于正文或核心数据。

---

## 3. 色彩映射表与 Token 矩阵

全量插件客户端样式强制消费官方原生 `--dsw-alias-*`（别名层）与 `--dsw-specific-*`（专用层）Token，严禁硬编码裸色值。

### 3.1 背景层 Token（Canvas & Background Layers）

| CSS Token | 语义与用途 | Dark 模式参考值 | Light 模式参考值 |
|---|---|---|---|
| `--dsw-alias-bg-base` / `--dsw-alias-bg-primary` | 页面主背景底色、Stage 根画布 | `#111113` / `#16181d` | `#ffffff` |
| `--dsw-alias-bg-layer-1` / `--dsw-alias-bg-secondary` | 输入框背景、次级卡片容器、表格交替带 | `rgba(255,255,255,0.04)` | `#f7f7f8` |
| `--dsw-alias-bg-layer-2` | 嵌套容器、更深层浮起卡片 | `rgba(255,255,255,0.06)` | `#f0f1f3` |
| `--dsw-alias-bg-layer-3` | 强调层卡片、浮动小面板 | `rgba(255,255,255,0.08)` | `#e5e7eb` |
| `--dsw-alias-bg-elevated` | Popover 下拉菜单、Dialog 弹窗主体、浮层菜单 | `#1c1c1f` | `#ffffff` |
| `--dsw-alias-bg-mask-1` | 模态弹窗遮罩、背景暗化蒙层 | `rgba(0, 0, 0, 0.55)` | `rgba(0, 0, 0, 0.35)` |
| `--dsw-alias-bg-module-platform` | 平台图标/资产预览内嵌槽位背景 | `rgba(255,255,255,0.03)` | `rgba(0,0,0,0.03)` |

### 3.2 文本与内容层 Token（Typography & Labels）

| CSS Token | 语义与用途 | Dark 模式参考值 | Light 模式参考值 |
|---|---|---|---|
| `--dsw-alias-label-primary` | 一级正文、高亮标题、主要图标、输入框文字 | `#ffffff` / `#f3f4f6` | `#111827` |
| `--dsw-alias-label-secondary` | 二级正文、表头标签、描述文本、次级图标 | `rgba(255,255,255,0.72)` | `#4b5563` |
| `--dsw-alias-label-tertiary` | 占位符、辅助元数据、面包屑分隔符 | `rgba(255,255,255,0.40)` | `#9ca3af` |
| `--dsw-alias-label-dimmed` | 弱占位符、无内容提示文案 | `rgba(255,255,255,0.28)` | `#cbd5e1` |
| `--dsw-alias-label-primary-inverted` / `--dsw-alias-label-primary-foreground` | 实心深色/主按钮上的反转文字颜色 | `#111827`（随主题反色） | `#ffffff` |

### 3.3 边框与分隔线层 Token（Borders & Dividers）

| CSS Token | 语义与用途 | Dark 模式参考值 | Light 模式参考值 |
|---|---|---|---|
| `--dsw-alias-border-l1` | 极细弱分隔线、列表内嵌分界 | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)` |
| `--dsw-alias-border` / `--dsw-alias-border-l2` | 常规控件边框、表格横线、卡片边框 | `rgba(255,255,255,0.12)` | `#e5e7eb` |
| `--dsw-alias-border-l3` / `--dsw-alias-border-hover` | 悬停高亮描边、聚焦预备态 | `rgba(255,255,255,0.22)` | `#d1d5db` |
| `--dsw-alias-border-l4` | 选中态/激活态强描边、外框强调 | `rgba(255,255,255,0.32)` | `#9ca3af` |

### 3.4 交互与按钮层 Token（Interaction & Buttons）

| CSS Token | 语义与用途 | Dark 模式参考值 | Light 模式参考值 |
|---|---|---|---|
| `--dsw-alias-brand-primary` | 品牌强调色、焦点环、选中项高亮 | `#3b82f6` / `#60a5fa` | `#2563eb` |
| `--dsw-alias-interactive-bg-hover` | 列表项/导航项/次级按钮 Hover 背景 | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.05)` |
| `--dsw-alias-interactive-bg-active` | 列表项选中/按压背景、当前激活项 | `rgba(255,255,255,0.14)` | `rgba(0,0,0,0.09)` |
| `--dsw-alias-button-primary-fill` | 主行动按钮实心填充底色 | `var(--dsw-alias-brand-primary)` | `var(--dsw-alias-brand-primary)` |
| `--dsw-alias-button-primary-hover` | 主行动按钮 Hover 底色 | `#2563eb` / `#3b82f6` | `#1d4ed8` |
| `--dsw-alias-state-business-tertiary` | Focus 状态外发光光晕 (`box-shadow`) | `rgba(59, 130, 246, 0.22)` | `rgba(37, 99, 235, 0.20)` |

### 3.5 状态与语义层 Token（Semantic Status）

| CSS Token | 语义与用途 | 文本/图标色 | 背景/浅色填充色 |
|---|---|---|---|
| `--dsw-alias-state-error-primary` / `--dsw-alias-label-danger` | 危险操作、校验失败、严重错误 | `#f87171` (Dark) / `#dc2626` (Light) | `rgba(239, 68, 68, 0.12)` |
| `--dsw-alias-state-warn-primary` / `--dsw-alias-label-warning` | 警告、只读降级、待确认操作 | `#fbbf24` (Dark) / `#d97706` (Light) | `rgba(245, 158, 11, 0.12)` |
| `--dsw-alias-status-success` / `--dsw-alias-label-success` | 成功、已就绪、运行正常 | `#4ade80` (Dark) / `#16a34a` (Light) | `rgba(34, 197, 94, 0.12)` |

### 3.6 双主题黑白中性底与极光紫角色分工表（对标 MiniMax 图 1 与图 3）

遵循三层职责正交体系（Structural Monochrome / Action Ink & Paper / AI Intelligence Violet），严禁主按钮彩色通胀：

| 视觉层级 | UI 元素 | Dark 主题规范（图 1 基准） | Light 主题规范（图 3 基准） | 铁律约束 |
|---|---|---|---|---|
| **画布底色** | 工作台与 Stage 根底色 | 深曜石黑 `#0C0F17` / `#111113` | 纸白 / 极浅暖灰 `#FFFFFF` / `#F8F8F9` | 70% 视网膜纯净底色 |
| **点阵坐标** | 画布 20px 网格微米点 | `rgba(255, 255, 255, 0.07)` 径向消隐 | `rgba(0, 0, 0, 0.05)` 径向消隐 | 弱感知工程参照 |
| **常规卡片** | 节点容器、属性抽屉、提示词面板 | 半透暗石板 `#151A26`，边框 `rgba(255,255,255,0.08)` | 纯白卡片 `#FFFFFF`，边框 `rgba(0,0,0,0.08)` | 保持空间悬浮感 |
| **视听媒体卡** | **视频播放器、首尾帧预览节点** | 极暗深黑 `#080C14`，边框 `white/12%` | **依然保持深暗底（#11141D）！** | **暗房原则：浅色下视听节点不漂白** |
| **主执行按钮** | **“执行”、“提交”、“保存”、“创建”** | **纯白实心底 + 纯黑字**（对比度 > 18:1） | **纯黑实心底 + 纯白字（Ink CTA）** | **坚决不用紫色！** |
| **发送按钮** | 输入框圆形发送键 (`↑`) | **纯白圆底 + 黑色实心箭头** | **纯黑圆底 + 白色实心箭头** | **坚决不用宿主亮蓝（#3b82f6）** |
| **次级按钮** | 取消、配置、筛选下拉 | 微透暗底 `rgba(255,255,255,0.05)` | 纯白底 `rgba(255,255,255,0.9)` | 视觉降级，不抢主焦点 |
| **AI 能量流** | 节点贝塞尔连线粒子流（Beam） | **极光亮紫发光流**（`#7961F2` / `#9A88FA`） | **深邃皇家靛紫流**（`#6757E7` / `#5644D6`） | **紫色的专属舞台** |
| **品牌锁扣** | Logo 锁扣与算力套餐标签 | 香芋紫底 (`#B8B7FF`) + 曜石黑 IP | 极光紫底 (`#7961F2`) + 纯白 IP | 保持品牌图腾记忆点 |

---

## 4. 排版与字体系统（Typography System）

### 4.1 字体栈（Font Family Stacks）
- **无衬线字体栈（UI 默认）**：
  ```css
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC", sans-serif;
  ```
- **等宽字体栈（代码、路径、哈希、时间戳、技术参数）**：
  ```css
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  ```

### 4.2 字阶与层级阶梯（Type Scale）

| 级别 | Font-size / Line-height | Weight | 适用场景 |
|---|---|---|---|
| **Display / Page Title** | `20px / 28px` | 600 | 一级 Stage 页面主标题（如“资产库”、“发布中心”） |
| **Section Title** | `16px / 22px` | 600 | 模态弹窗标题、模块大区块标题 |
| **Card / Sub Title** | `14px / 20px` | 500 | 卡片标题、详情栏小标题、分组表头 |
| **Body / Input** | `13px / 18px` | 400 / 500 | 表单输入框、下拉项文本、表格常规正文、按钮文字 |
| **Caption / Meta** | `12px / 16px` | 400 | 表格辅助列、时间戳、文件大小、Badge 标签 |
| **Code / Mono** | `12px / 18px` | 400 (Mono) | 文件路径、JSON 预览、模型标识、Prompt 变量 |

---

## 5. 标准组件实现规范（Component Specifications）

### 5.1 下拉选择菜单（Dropdown Select）

结构：触发按钮（含当前标签与可旋转 180° 的 SVG Chevron） + 绝对定位的毛玻璃 Popover 菜单。

```jsx
// 标准结构示范
<div className="omx-dropdown" ref={containerRef}>
  <button
    type="button"
    className={`omx-dropdown-trigger ${open ? 'omx-dropdown-trigger--open' : ''}`}
    onClick={() => setOpen(!open)}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span className="omx-dropdown-label">{currentLabel}</span>
    <svg className={`omx-dropdown-chevron ${open ? 'open' : ''}`} viewBox="0 0 16 16" width="12" height="12">
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
          className={`omx-dropdown-item ${opt.value === value ? 'selected' : ''}`}
          onClick={() => { onChange(opt.value); setOpen(false); }}
        >
          <span>{opt.label}</span>
          {opt.value === value && <CheckIcon className="omx-check-icon" />}
        </button>
      ))}
    </div>
  )}
</div>
```

**样式与交互契约**：
- **触发器高度**：严格 `32px`，内边距 `0 10px`，圆角 `8px`，背景 `var(--dsw-alias-bg-layer-1)`，边框 `1px solid var(--dsw-alias-border-l2)`。
- **Popover 菜单面板**：
  - 背景：`var(--dsw-alias-bg-elevated, #1c1c1f)` + `backdrop-filter: blur(16px);`
  - 边框：`1px solid var(--dsw-alias-border, rgba(255,255,255,0.14))`
  - 圆角：`10px`，内边距：`4px ~ 6px`
  - 阴影：`0 10px 28px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)`
  - 进场动效：`animation: omx-pop 0.12s cubic-bezier(0.16, 1, 0.3, 1)`（Y 轴位移 `-4px` → `0`，透明度 `0` → `1`）。
- **触发器文案契约（Mac/Linear 范式）**：
  - 默认全量态显示为维度名（`[ 平台 ▾ ]`）或名值对（`[ 平台: 全部 ▾ ]`），过滤态显示具体值（`[ TikTok ▾ ]`）。严禁多个下拉默认态裸露为 `[ 全部 ▾ ]`。
  - 下拉列表首项（重置项）文案**唯一强制为 `全部` (All)**，严禁拼接为 `全部平台`、`全部账号`。

### 5.2 搜索框（Search Field）
- 高度：`32px`，内边距：`0 10px 0 32px`（左侧预留 16px SVG 放大镜图标）。
- 背景：`var(--dsw-alias-bg-layer-1)`，边框：`1px solid var(--dsw-alias-border-l2)`，圆角：`8px`。
- Focus 态：`outline: none; border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px var(--dsw-alias-state-business-tertiary);`
- 占位符颜色：`var(--dsw-alias-label-tertiary)`。

### 5.3 按钮体系（Button Hierarchy）

| 按钮类型 | 样式定义 | 适用场景 | 颜色约束 |
|---|---|---|---|
| **Primary (主行动按钮)** | 背景 `var(--dsw-alias-label-primary)`，文字 `var(--dsw-alias-bg-base)`（Light 纯黑白字，Dark 纯白黑字），高度 32px/40px，圆角 8px 或 999px | 页面与节点主要 CTA（`执行`、`+ 新建`、`发布`、`保存`） | **坚决禁用紫色**（WCAG AAA 级高对比） |
| **Round Send (圆形发送钮)** | 尺寸 32px × 32px，圆角 50%，背景 `label-primary`，内嵌反色 SVG 箭头 | 聊天/Prompt 输入框右侧发送按键 | **坚决禁用宿主亮蓝（#3b82f6）** |
| **Secondary / Outline (次级按钮)** | 背景 `var(--dsw-alias-bg-layer-1)`，边框 `1px solid var(--dsw-alias-border-l2)`，文字 `var(--dsw-alias-label-primary)`，Hover 边框 `border-l3` | 次级操作、取消、导出、刷新 | 次级降级，不与主按钮争抢焦点 |
| **Ghost / IconButton (图标按钮)** | 尺寸 `32px × 32px`，背景透明或 `interactive-bg-hover`，文字 `var(--dsw-alias-label-secondary)`，Hover 提亮 | 工具栏图标、更多菜单、视图切换 | 保持中性灰阶 |
| **Brand (品牌展示胶囊)** | 背景 `linear-gradient(135deg, #6757e7, #7961f2)`，白字，高度 32px，圆角 999px | 算力购买、Annual Plan、VIP 特权标 | **特权保留**，不作为日常主操作按键 |
| **Danger (危险按钮)** | 背景 `var(--dsw-alias-state-error-primary)`，文字反白，或红字描边 | 删除、解绑、重置等破坏性操作 | 语义红 |

- **按压微动效**：所有按钮点击/按压时声明 `active: { transform: scale(0.96); }`，`transition: transform 120ms cubic-bezier(0.16, 1, 0.3, 1)`。

### 5.4 数据表格（Data Table）
- **表头**：高度 `32px ~ 36px`，文字 `var(--dsw-alias-label-secondary)`（12px/16px，Font-weight: 500），下边框 `1px solid var(--dsw-alias-border-l2)`。
- **数据行**：最小行高 `40px`，单元格内边距 `8px 12px`，下边框 `1px solid var(--dsw-alias-border-l1)`。
- **Hover / Active 态**：
  - Hover 行背景：`var(--dsw-alias-interactive-bg-hover)`。
  - Selected 选中行背景：`var(--dsw-alias-interactive-bg-active)` + 左侧 2px `var(--dsw-alias-brand-primary)` 垂直指示条。
- **技术数据列**：路径、哈希、文件大小、时间戳一律使用等宽字体栈。

### 5.5 模态弹窗与确认框（Modal Dialog）
- **外壳容器**：宽度 `min(480px, calc(100vw - 48px))`，圆角 `16px`，背景 `var(--dsw-alias-bg-elevated)`，边框 `1px solid var(--dsw-alias-border)`，阴影 `0 20px 48px rgba(0,0,0,0.6)`。
- **遮罩层**：Fixed 全屏，背景 `var(--dsw-alias-bg-mask-1)`，`backdrop-filter: blur(8px)`，Z-index: `100`。
- **底部行动栏**：右对齐，间距 `8px`，取消（Secondary）+ 确认（Primary / Danger）。

### 5.6 状态标签与 Chip（Status Chip）
- **尺寸与排版**：高度 `22px ~ 24px`，圆角 `6px ~ 8px`，内边距 `0 8px`，字号 `12px`。
- **色彩规范**：文字使用对应的状态色，背景使用同色 12%~15% 半透明色（如 Success: `#4ade80` on `rgba(74, 222, 128, 0.12)`）。

### 5.7 空态与引导（Empty State）
- **布局**：垂直居中，内边距 `48px 24px`。
- **视觉层级**：上方 48px~64px 矢量 SVG 插画或图标，中间主标题（`16px` 加粗 `label-primary`），下方描述文案（`13px` `label-secondary`），底部居中主操作按钮。

---

## 6. Do's & Don'ts（开发红线）

### ✅ 必须做（Do）
1. **100% 消费官方 Token**：所有颜色、边框、背景均通过 `var(--dsw-alias-*)` 或 `var(--dsw-specific-*)` 读取。
2. **严格保持 32px 控件高与 8px 圆角**：输入框、下拉框、图标按钮全部保持几何一致。
3. **工具栏声明 `flex-wrap: nowrap`**：确保所有搜索与筛选控件在桌面视口单行流动。
4. **使用矢量 SVG 图标**：所有动作、方向指示、状态图标均采用精确 SVG。
5. **支持键盘与点击外部关闭**：所有浮层与 Popover 必须绑定全局 `pointerdown` 与 `keydown Escape` 监听。

### ❌ 严禁做（Don't）
1. **严禁硬编码裸 Hex / RGBA 颜色**：除 `transparent` 与 SVG 内部特异路径外，禁止在样式中写入任何裸色。
2. **严禁自建 `--omx-*` 或私有变量系统**：不得创建第二套主题变量。
3. **严禁调用 `ctx.theme.overrideTokens()`**：不得篡改宿主全局主题调色盘。
4. **严禁裸用原生 `<select>`**：不得出现系统蓝白原生菜单。
5. **严禁使用 Emoji 或字符充当图标**：不得在按钮或标签中塞入字符。
6. **严禁使用 `filter: invert()` 或在 JS 中特判 `theme === 'dark'`**：亮暗适配必须完全依赖 CSS 变量级联。

---

## 7. AI Agent 组件生成指令范式（Prompts）

在指导后续 AI Agent 生成或重构 UI 组件时，请使用以下标准化 Prompt 模板：

```text
基于 OmniMux UI 设计规范（design.md v2.0）生成组件：
1. 100% 消费 DSH 官方原生 Token（如 var(--dsw-alias-bg-base)、var(--dsw-alias-label-primary)、var(--dsw-alias-border-l2) 等），严禁裸 Hex/RGBA 色值。
2. 严格遵循 32px 控件基准高与 8px 圆角体系。
3. 工具栏使用单行无折行流（flex-wrap: nowrap），搜索框自适应拉伸，主 CTA 靠右（margin-left: auto）。
4. 下拉选择器使用 React Popover 毛玻璃浮层，严禁原生 <select>；所有图标使用 SVG 组件，严禁 Emoji / 字符。
5. 交互元素具备按压缩放（scale(0.96)）微动效与 Hover/Focus 状态反馈。
```
