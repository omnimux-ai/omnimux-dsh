# UI 四件套：会话输入栏「自动/手动」模型选择器（Issue #2966）

> 签发人：产品经理 许清楚（PM） ｜ 状态：**Approved for Dev**
> 真源约束：工程规格 `specs/2966-extension-auto-model-picker.spec.md`（验收口径）、`design.md` v2.0（视觉/几何契约）。
> 本文档是前端实现 UI 元素与文案的**唯一真源**：白名单之外的组件一律视为非法元素；文案以第四节逐字稿为准，前端原样复制、严禁改写。

---

## 一、PRD 摘要

### 1.1 背景与目标
浏览器插件（侧栏面板与网页悬浮工作站共用同一输入栏）目前只能在设置页改模型。本期在会话输入栏附件（回形针）按钮右侧新增「自动/手动」模型选择触发器（纯文本样式），让用户在发送前就近确认或锁定模型，不回设置页。

### 1.2 用户故事
- 作为插件用户，我在默认状态下看到「自动 ⌄」按钮，无需决策即可发送；每条消息由 Jev 在发送前自动选型。
- 我想固定某个模型时，点开面板关掉「自动」，从列表点一个模型，按钮立即显示该模型名，且此偏好跨会话保留。
- 我想回到自动时，打开面板开启开关，列表收起，按钮恢复「自动」。

### 1.3 范围边界（与规格一致）
- **范围内**：输入栏文本触发按钮、上浮模型面板（标题/自动开关/说明/模型列表）、模式与手动偏好持久化、宿主侧 Jev 自动路由下发、列表数据源两级兜底。
- **不做（Non-Goals）**：
  - 推理强度（effort）选择不进本面板，沿用既有默认值；
  - 不做模型搜索框、不做分组表头Tab、不做每模型价格/折扣标签；
  - 不做回合级模型角标回显（消息气泡上不回显本轮用了哪个模型）；
  - 不做任何 Badge/勋章/装饰图标（`PRO`、`新品`、`💎` 等一律不出现）；
  - 不影响媒体/画布场景的模型选择器。

### 1.4 成功标准（UI 面）
对照规格第七节验收：按钮位置与触发态正确、面板开合与焦点管理合规、开关驱动列表显隐、点选后按钮文案与持久化写入、双语逐字一致、空态兜底。**具体验收动作以工程规格为准，本文不重复搬运。**

---

## 二、原型结构描述（确定性线框）

### 2.1 触发按钮（纯文本触发器，Issue #2972 修订）
- **位置**：会话栏底部操作条，附件（回形针）按钮**右侧**、发送按钮**左侧**，同排。
- **几何**：高 `28px`（紧凑变体，Composer 操作条基准），内边距 `0 4px`，内含元素间距 `4px`。**取消胶囊造型**：无边框、无底块背景、无 `999px` 圆角。
- **结构**：`[可选品牌图标 14px] 文本 13px/500 [Chevron SVG 12px]`。
  - 自动态：无品牌图标，文本 = `自动` / `Auto`；
  - 手动态：品牌图标（14px）+ 已选模型显示名（如 `GPT-5.5`），名称过长截断 `max-width: 120px` + `text-overflow: ellipsis`。
- **样式**：透明底、无边框，文字 `--muted`（label-secondary 档）；hover 文字加深至 `--ink-strong` + 浅底块 `rgba(255,255,255,0.08)`（圆角 `8px`，仅作 hover 底块形状，非常驻背景）；展开态（open）仅文字加深至 `--ink-strong`，不加底块；按压 `scale(0.96)`；`focus-visible` 保留 `--focus-ring`；`aria-haspopup="dialog"`，`aria-expanded` 如实同步。
- **Chevron**：12px SVG `chevron-down`，面板展开时旋转 180°。

### 2.2 上浮面板
- **定位**：以触发按钮为锚点，**向上展开**，面板底边距按钮顶边 `8px`，水平**左对齐按钮左缘**；右侧越界时收缩对齐视口右缘留 `8px`。
- **几何**：宽度 **`280px`** 固定（`min(280px, calc(100vw - 16px))`）；圆角 `10px`；背景 `var(--dsw-alias-bg-elevated)` + `backdrop-filter: blur(16px)`；边框 `1px solid var(--dsw-alias-border)`；阴影 `0 10px 28px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)`；进场动效 `0.12s cubic-bezier(0.16,1,0.3,1)`，Y 位移 `+4px → 0`（向上展开的反向位移）+ 透明度 `0 → 1`。
- **内部结构**（自上而下，内边距 `4px` 容器）：

```
┌──────────────────────────┐
│ 模型                     │  ← panel.title   12px/500 label-secondary, 内边距 8px 10px 4px
│ ┌──────────────────────┐ │
│ │ 自动            (●━) │ │  ← auto 行：左文案 13px label-primary，右 switch
│ └──────────────────────┘ │
│ 每条消息自动选择模型      │  ← 说明文案 12px/16px label-tertiary, 内边距 0 10px 8px
│ ──────────────────────── │  ← 分隔线 1px border-l1（仅 OFF 时出现）
│ [◦] GPT-6-Astra          │  ← 模型行（仅 OFF 时出现）
│     旗舰通用模型          │
│ ...                      │
└──────────────────────────┘
```

- **「自动」行**：高 `36px`，左标签 13px `label-primary`，右侧开关 `role="switch"`（轨道 `32×18px`，拇指 `14px`，ON 态填充 `var(--dsw-alias-brand-primary)`，OFF 态 `var(--dsw-alias-bg-layer-3)`），`aria-checked` 如实同步。开关默认 **ON**。
- **说明文案**：一行，12px，`label-tertiary`，内容锁定为第四节 `modelPicker.auto.help`。无论开关 ON/OFF 均显示。
- **分隔线**：仅在开关 OFF（列表可见）时渲染，`margin: 0 10px`，`border-l1`。
- **模型列表区**（仅 OFF）：最大高 `264px`，超出 `overflow-y: auto`；分组只拍平渲染，**不渲染分组表头**（无「ChatGPT (Codex)」分组行）。
- **模型行**：高 `44px`，内边距 `6px 10px`，圆角 `8px`；结构 `[品牌图标 20px] [名称 13px/500 label-primary + 副标题 12px label-tertiary] [选中态]`；整行可点击，`role="option"`，`aria-selected` 如实。hover 背景 `interactive-bg-hover`；选中态 = 行右侧 **12px `check` SVG**（`label-primary`），**不用** radio 圆点、不用左侧色条。
- **空态**：列表数据源两级兜底均空时，列表区渲染一行空态文案（12px `label-tertiary`，内边距 `16px 10px`，无图标），不渲染残缺行。
- **关闭行为**：点击面板外 / `Esc` / 点选模型行后自动收起；关闭后焦点回到触发按钮；`Tab`/`Shift+Tab` 焦点圈锁在面板内。

---

## 三、UI 元素白名单（前端允许渲染的全部组件枚举）

| 元素 ID | 组件类型 | 说明 | 显式红线 |
|---|---|---|---|
| `trigger.btn` | 纯文本按钮 | 附件右侧，无边框/无底块/透明底，`aria-haspopup="dialog"` | 禁加任何 Badge/角标；禁恢复胶囊造型（边框、常驻底块、999px 圆角） |
| `trigger.icon` | 品牌 SVG 图标 | 仅手动态出现，14px | 自动态不得渲染任何图标 |
| `trigger.label` | 文本 | `自动` 或模型显示名 | 禁加括号注释（如 `自动 (推荐)`） |
| `trigger.chevron` | SVG chevron | 12px，展开旋转 180° | 禁用字符 `⌄`/`▼` 等 Unicode 箭头 |
| `panel.root` | Popover 浮层 | `role="dialog"`，向上展开 | 禁改成下拉向下展开、禁全屏弹窗 |
| `panel.title` | 标题文本 | 文案 `模型`/`Model` | 禁加副标题、禁加图标 |
| `panel.autoRow` | 行容器（左文案右开关） | | 禁加第二行标签 |
| `panel.autoSwitch` | Switch 开关 | `role="switch"` | 禁加状态文字（`开`/`关`/`ON`/`OFF`） |
| `panel.helpText` | 说明文本 | 单行，锁定文案 | 禁加第二段、禁加链接 |
| `panel.divider` | 分隔线 | 仅 OFF 态出现 | — |
| `list.row` | 模型行（button/option） | 图标+名称+副标题+选中态 | 禁加锁图标、PRO 徽标、价格标签、分组表头、悬停操作按钮 |
| `list.row.brandIcon` | 品牌 SVG | 20px，按第四节图标键映射 | 禁 Emoji、禁首字母方块 |
| `list.row.check` | 选中态 SVG check | 仅当前生效行 | 禁 radio 圆点、禁左侧色条 |
| `list.empty` | 空态文本 | 一行锁定文案 | 禁加插画、禁加重试按钮（面板重开即重试） |

**白名单外一律禁止**：搜索框、Tab、Badge/Chip、tooltip 营销条、页脚链接、「查看全部模型」入口。

---

## 四、逐字文案字典（zh + en，前端原样引用）

key 命名统一前缀 `modelPicker.`。文案须进入 `PanelCopy` i18n 通道，**禁止硬编码**。

| key | zh 逐字稿 | en 逐字稿 |
|---|---|---|
| `modelPicker.trigger.auto` | `自动` | `Auto` |
| `modelPicker.trigger.ariaLabel` | `选择模型` | `Choose model` |
| `modelPicker.panel.title` | `模型` | `Model` |
| `modelPicker.auto.label` | `自动` | `Auto` |
| `modelPicker.auto.help` | `每条消息自动选择模型` | `Picks a model for each message` |
| `modelPicker.list.empty` | `暂无可用模型` | `No models available` |
| `modelPicker.list.unavailable` | `模型列表暂不可用` | `Model list unavailable` |
| `modelPicker.row.selectedAria` | `当前使用` | `In use` |

### 模型副标题字典（按模型 id；副标题 ≤12 汉字，客观描述，零营销词）

| 模型 id | 品牌图标键 | zh 副标题 | en 副标题 |
|---|---|---|---|
| `gpt-6-astra` | `openai` | `旗舰通用模型` | `Flagship general model` |
| `gpt-5.6-sol` | `openai` | `快速通用模型` | `Fast general model` |
| `gpt-5.6-terra` | `openai` | `均衡通用模型` | `Balanced general model` |
| `gpt-5.6-luna` | `openai` | `均衡通用模型` | `Balanced general model` |
| `gpt-5.5` | `openai` | `通用模型` | `General model` |
| `gpt-5.3-codex-spark` | `openai` | `代码生成模型` | `Code generation model` |
| `grok-4.20-0309-non-reasoning` | `grok` | `直接对话模型` | `Direct chat model` |
| `grok-4.20-0309-reasoning` | `grok` | `推理对话模型` | `Reasoning chat model` |
| `grok-4.20-multi-agent-0309` | `grok` | `多智能体协作` | `Multi-agent collaboration` |
| `grok-4.3` | `grok` | `通用对话模型` | `General chat model` |
| `grok-4.5` | `grok` | `通用对话模型` | `General chat model` |
| `grok-4.6` | `grok` | `通用对话模型` | `General chat model` |
| `grok-build-0.1` | `grok` | `构建辅助模型` | `Build assistance model` |

**映射规则**：模型行 `name` 取数据行自带 `name` 字段原文；`id` 不在本字典（如回落 `modelGroups` 出现未登记模型）时，副标题回退为 `通用对话模型` / `General chat model`，品牌图标按 id 前缀回退（`gpt*`→`openai`、`grok*`→`grok`、其他→`grok` 不适用时渲染 `openai` 之外的通用处理：**图标回退键 `generic`**，用 20px 圆形字母图标不可取——回退为不渲染图标槽位，行内名称左对齐）。**注：`generic` 槽位不渲染是刻意决策，禁造假图标。**

### 语义说明（PM 裁定，写入规格开放项）
- 「自动模式」= 每条消息发送前由 Jev 为该条消息选择模型；说明文案只讲这一句，不提 Jev/积分/延迟等实现细节。
- 设置页「默认模型」与新面板手动态**共用 `omnimux_default_model` 键**，语义统一为「手动偏好」：自动开启时该值是 Jev 失败链路的兜底模型；自动关闭时它是当前生效模型。UI 文案不另行解释这一点（避免括号废话），此裁定仅约束行为。

---

## 五、遗留问题（需主理人裁决）

1. **图标回退策略**：未登记模型无品牌图标时，本稿裁定「不渲染图标槽位」（防造假图标）。若主理人希望有通用图形兜底，需指定具体 SVG 资产。
2. **手动态按钮是否带品牌图标**：本稿允许（白名单 `trigger.icon`）。若要求自动/手动按钮外观完全一致（纯文本），删除该白名单项即可，一行改动。
3. **面板宽度 280px vs 复用 `ModelPicker.jsx` 的 400–520px 自适应**：会话栏面板列表行仅 13 项无 Tab，280px 更贴 Linear 菜单密度；若要与 Hub 输入框面板视觉统一可放宽至 `320px`，不阻塞开发。

---

## 六、修订记录（Issue #2972）

交付后用户实测提出两项修订，PM 逐条核定如下：

### 6.1 触发器去胶囊化（样式变更，用户指示）
- **变更**：用户原话「不要胶囊按钮样式 只要文本和图标」。触发器从「28px 高、999px 胶囊圆角、边框 + 底块背景」改为**纯文本触发器**。
- **PM 核定（已更新 §2.1 / §3）**：
  - 保留：高 `28px`、`aria-haspopup/expanded`、chevron 12px 旋转、品牌图标 14px（仅手动态）、文本截断规则、focus ring、按压 `scale(0.96)`。
  - 移除：常驻边框、常驻底块背景、`999px` 圆角；padding 由 `0 10px` 收窄为 `0 4px`，gap 由 `6px` 收窄为 `4px`（文本触发器更紧凑，与相邻图标按钮节奏一致）。
  - hover 态裁决：**保留浅底块**。PM 在「仅文字变色」与「文字加深 + `rgba(255,255,255,0.08)` 浅底块（8px 圆角）」之间裁决后者——ghost 式浅底块是 Linear/Vercel 菜单触发器的标准 hover 反馈，在图标按钮阵列中提供足够的可点击性暗示；纯变色在 `28px` 紧凑行内反馈偏弱。底块仅在 hover 瞬间出现，不构成常驻视觉噪音，不违反极简原则。
  - open 态：仅文字加深，不再叠底块（面板已展开，无需第二强调层）。

### 6.2 面板裁剪修复（缺陷修复）
- **缺陷**：`.composer-actions-start > span { overflow: hidden }` 把 `.amp-wrap` 的绝对定位 `.amp-panel` 整体裁掉，点击触发器无面板弹出。
- **修复**：追加同级后置覆盖 `.composer-actions-start > .amp-wrap { overflow: visible }`，面板恢复可见。此为样式缺陷修复，不改变白名单与文案。

### 6.3 结论
- 两项变更均在白名单框架内收敛视觉，无新增元素、无文案改动。
- **PM_SIGN_OFF: PASS**（对照 `plugins/omnimux-browser/extension/src/panel/styles.css` `.amp-wrap`/`.amp-trigger` 实现核定，详见 §6.1/§6.2）。
