# 增量 PRD：Composer「+」命令直达触发 + 资产库选择器共享组件化

- **Language**: 中文（zh-CN）
- **归属插件**: `plugins/omnimux`（composer 附件子系统所在；共享组件的落位由架构师定，见 §8 Q3）
- **状态**: 实施中；触发路线以 [clientAction 增量设计](2026-09-05-composer-add-client-action-overlay-design.md) 为准。本文的 capture 与 Enter popup 方案已被替代，真实原生混选与 UI 验收仍须完成。
- **日期**: 2026-09-05
- **上游档案**: [2026-09-04-composer-add-file-assets-prd.md](2026-09-04-composer-add-file-assets-prd.md)（基线 PRD，已落地 Issue #493 → PR #501/#513/#523/#526）
- **性质**: 增量 PRD。只覆盖「触发链路改造」与「资产库选择器组件化」两个增量，不重述基线 PRD 已定的附件写入管线、配额、去重、物化规则（全部沿用）。

---

## 1. 背景与现状链路

基线 PRD 落地后，当前链路为：官方 composer「+」按钮打开原生命令列表 → 我们通过官方 `commandUi.register` 贡献的「添加文件或文件夹」「从资产库添加」两个条目出现在列表中 → 点击条目后官方 `dispatch()` **一律**打开 popupSelect 二级弹层（分别是「选择文件…/选择文件夹…」两行、或「打开资产库…」单行确认）→ 再触发系统文件面板 / 资产库弹窗（`AssetPickerModal`）。老板新要求：**去掉二级弹层、点击即直达**；并把资产库选择弹窗抽象为可多处复用的共享组件。本 PRD 即针对这两个增量。

```
现状（已合入 main）：
[+] → 原生命令列表 → 「添加文件或文件夹」→ 官方 popupSelect 二级弹层 → 系统文件面板
                   → 「从资产库添加」    → 官方 popupSelect 二级弹层 → AssetPickerModal
目标：
[+] → 原生命令列表（条目不变）→ 点击条目 → 【立即】系统文件面板 / 资产库选择弹窗
```

---

## 2. 产品目标与非目标

### 2.1 Product Goals

1. **一步直达**：从「+」命令列表点击我们的条目到目标窗口（系统文件面板 / 资产库选择弹窗）打开，中间**零官方二级弹层**，操作步数从 3 步降为 2 步。
2. **资产选择能力组件化**：资产库选择弹窗抽象为与 composer 流程解耦的共享组件（建议名 `AssetPicker`，见 §4），同一套选择能力可被 composer、工作流画布、其他插件的「选资产」场景复用，禁止各场景复制粘贴后样式/逻辑漂移。
3. **零回归**：命令列表条目位置、文案、可搜索性保持现状；附件写入仍唯一走 AttachmentStore 事件总线管线；官方升级导致的入口失效应有兜底路径（popupSelect 作为 fallback）。

### 2.2 非目标（Out of Scope）

- ❌ 不改动命令列表的呈现方式本身（条目仍在原生「+」列表里，不自建菜单替换官方列表）。
- ❌ 不改动系统文件面板 / 资产库弹窗内部的既有交互与视觉（除组件化迁移所必需的结构调整）。
- ❌ 不处理「单面板混选文件+文件夹」的产品定义变更——能力边界待架构实测（见 §8 Q2），本 PRD 按「文件 / 文件夹两种面板」现状定义交互。
- ❌ 拖拽上传、粘贴直传、附件持久化等基线 PRD 已列非目标，继续排除。
- ❌ 不做技术选型拍板（A/B/C 路线由架构师 + 老板决定，见 §7）。

---

## 3. 用户故事与交互流程

### 3.1 User Stories

1. **US-1 直达添加文件/文件夹**：As a 会话用户，I want 在「+」列表点击「添加文件或文件夹」后**立即**看到系统自带文件管理窗口，so that 我不再需要在一层多余的确认弹层上多点一次。
2. **US-2 直达资产库**：As a 内容创作者，I want 点击「从资产库添加」后**立即**打开资产库选择弹窗，so that 我可以直接开始挑选资产。
3. **US-3 兜底可用**：As a 会话用户，当直达机制因官方升级失效时，I want 键盘 Enter / 兜底路径仍能通过官方 popupSelect 完成同样的添加，so that 功能永不彻底失联。
4. **US-4 资产选择复用**：As a 工作流画布用户，I want 在画布节点上选择资产时看到与会话侧**同一个**资产选择弹窗，so that 我的挑选心智与操作习惯全产品一致。
5. **US-5 配额与去重语义一致**：As a 任意场景的使用者，I want 共享组件的已选上限、剩余配额、已添加置灰语义由调用方注入且表现一致，so that 无论从哪里打开选择器，规则都可预期。

### 3.2 交互流程（三条入口，逐步流）

**流程 A：添加文件或文件夹（直达系统面板）**

1. 用户点击 composer「+」→ 原生命令列表展开，「添加文件或文件夹」条目在列（现状不变）。
2. 用户点击该条目（鼠标 click）→ **不经过**官方 popupSelect 二级弹层，立即调起系统自带文件管理窗口。
3. 文件面板默认进入「选择文件」模式；「选择文件夹」的引导方式见 §8 Q2（单面板混选能力待实测；若不可混选，则面板内或入口处需有切换到文件夹模式的路径，具体形态由架构实测结果反哺产品确认）。
4. 用户在系统面板完成选择 → 走既有 `/omnimux/assets/pick` → `/omnimux/composer/attachments/materialize` → AttachmentStore 管线，Tray 出现附件；取消则无任何副作用。

**流程 B：从资产库添加（直达选择弹窗）**

1. 用户点击「+」→ 命令列表中点击「从资产库添加」→ **立即**打开资产库选择弹窗（共享组件 `AssetPicker`，见 §4）。
2. 弹窗内分类 tab、卡片多选、已选上限、去重置灰、空态/加载态/错误态全部沿用现状行为。
3. 确认 → 既有 instantiate 管线写入 Tray 并关闭弹窗；取消/✕/Esc 关闭，无副作用。

**流程 C：popup 兜底行为（fallback）**

1. 触发条件（任一）：用户通过键盘方向键选中条目后按 **Enter**（走官方 dispatch 标准路径）；或直达机制（拦截/插槽）检测失效。
2. 行为：回落到**现状**的官方 popupSelect 二级弹层（「选择文件…/选择文件夹…」或「打开资产库…」），功能等价、仅多一步。
3. 该兜底路径必须作为**长期保留**的防御层，不因直达上线而删除；官方升级回归时优先验证兜底是否仍可用。

---

## 4. 资产库选择器共享组件（AssetPicker）PRD 章节

### 4.1 组件定位与命名

- **建议组件名**：`AssetPicker`（共享选择器）；现状实现为 `plugins/omnimux/src/client/composer-add/AssetPickerModal.jsx`，与 composer 流程（AttachmentStore 配额、`occupied`/`alreadyIds` 注入、instantiate 管线）耦合。
- **定位**：一个**纯受控的资产多选选择器**——负责「展示资产库 + 分类浏览 + 多选 + 上限/去重约束 + 确认/取消回调」，**不负责**确认后资产的去向（写会话附件、挂画布节点、引用进表单等由调用方在 `onConfirm` 回调里自行处理）。
- **归属**：独立共享模块/包的落位（hub 内 shared client 目录 vs 独立包 vs 留在 omnimux 导出）**由架构师定**，PRD 只约束：消费方不得 import hub 内部实现细节，只能消费公开导出的组件 API（AGENTS.md 包边界铁律）。

### 4.2 Props / 能力清单

| 能力 | 建议接口 | 语义与验收要点 |
|---|---|---|
| 开关控制 | `open: boolean`、`onClose: () => void` | 受控组件；Esc / ✕ / 取消均触发 `onClose`；关闭不选中任何资产。 |
| 数据源 | 内置默认拉取 Host `/omnimux/assets/library`；可选 `fetchAssets?: () => Promise<Asset[]>` 注入覆盖 | 默认零配置可用；调用方可注入过滤后的资产集（如画布只给「图片类」）。加载中骨架/加载失败错误态 + 重试沿用现状。 |
| 分类 tab | 内置 6 分类 + 「全部」（`character/scene/style/prop/knowledge/custom`）；可选 `categories?: string[]` 收窄 | tab 项高 32px、选中态消费 DSW token；收窄时「全部」语义=收窄后集合的并集。 |
| 多选 | 内置选中态管理；可选 `maxSelect?: number` | 卡片点击切换选中（描边 + ✓ 角标）；达到上限后未选卡片置灰并提示「最多还能添加 N 项」。**上限默认值与 AttachmentStore 的 8 解耦**：组件自身不设硬编码上限，由调用方经 `maxSelect`/`occupied` 注入。 |
| 已占用/配额语义 | `occupied?: number`（默认 0） | 语义=「调用方目标容器已被占用的位数」。剩余配额 = `maxSelect − occupied − 已选数`，在底部确认栏实时显示「已选 X 项 · 还可添加 Y 项」。composer 场景传 Tray 当前条数；画布等无配额场景传 `maxSelect: Infinity` 或不传上限。 |
| 去重 / 已添加 | `alreadyIds?: Set<string> \| string[]` | 命中 id 的卡片呈现「已添加」置灰态、不可再勾选；不改变这些资产在调用方容器中的既有状态。 |
| 确认回调 | `onConfirm: (assets: Asset[]) => void \| Promise<void>` | 确认按钮在 `已选数 > 0 且 !busy` 时可点；回调执行期间按钮 busy；**组件对回调结果不做写入假设**，关闭与否建议由调用方控制（或提供 `closeOnConfirm?: boolean`，默认 true——见 §8 Q4）。 |
| 文案/主题 | `t` 注入或内置 zh-CN 默认文案；UI 100% `--dsw-*` token | 不得出现裸 hex；Modal 16px 圆角、控件 32px 高，遵循 `design.md`。 |
| 空态引导 | 可选 `emptyAction?: { label, onClick }` | 默认空态=「资产库暂无资产」+「去资产库导入」（打开 `omnimux-assets:library` workbench Tab）；调用方可覆盖跳转行为。 |

### 4.3 复用场景清单（≥3 处）

| # | 场景 | 调用方 | 差异点（经 props 注入，不改组件内部） |
|---|---|---|---|
| 1 | **Composer「从资产库添加」**（本 PRD 范围） | `plugins/omnimux` composer-add | `occupied` = Tray 条数、`alreadyIds` = 已入 Tray 的 entityId、`maxSelect` = 8、`onConfirm` = instantiate → AttachmentStore。 |
| 2 | **工作流画布节点选资产** | `omnimux-workflow` | `onConfirm` = 挂到节点 asset 引用；`categories` 可按节点类型收窄（如生图节点只给 character/scene/style）；无 Tray 配额，`maxSelect` 按节点槽位数注入（多为 1）。 |
| 3 | **产品库 / 发布中心等「选资产」场景**（如给产品选主图、给发布草稿配封面） | `omnimux-products` / `omnimux-publish` 等 | `maxSelect` 常为 1；`onConfirm` = 写业务表单的资产路径引用；`emptyAction` 可指向各自导入引导。 |

> 场景 2、3 本期**只定义组件契约、不实施接入**；接入各自插件时另立项。本期交付的硬要求是：组件 API 按上表设计并经架构评审确认可满足这三类场景。

### 4.4 与现有 AssetPickerModal 的迁移关系

- `AssetPickerModal.jsx` / `AssetPickerCard.jsx` / `kind.js` 中的配额与选择逻辑（`remainingQuota`、`toggleSelect`、`isAlreadyAdded`、`ASSET_CATEGORIES`）是**迁移的代码与测试基线**：`picker-logic.test.js` 等既有单测应随逻辑一并迁移并保持绿。
- 迁移为**原地抽象**：composer 流程改造为「composer 适配层（occupied/alreadyIds/onConfirm 组装）→ 共享 AssetPicker」的调用关系；对外可见行为（视觉、配额提示、去重 toast、空态）**零变化**。
- 迁移完成后，`composer-add/` 目录内不应再存在第二份选择器实现；旧组件文件是否保留为薄封装由架构师定，但禁止双份逻辑并存漂移。

---

## 5. 需求池 P0 / P1 / P2

### P0（Must have）

| # | 需求 | 说明 / 依赖 |
|---|---|---|
| P0-1 | 「添加文件或文件夹」点击直达系统文件面板 | 鼠标点击条目后无官方二级弹层，系统面板立即出现；取消无副作用。依赖 §7 路线拍板（A/B/C 其一）。 |
| P0-2 | 「从资产库添加」点击直达资产库选择弹窗 | 同上，立即打开共享 `AssetPicker`。 |
| P0-3 | 命令列表条目保持不变 | 两个条目仍在原生「+」命令列表，名称/描述/模糊可搜索性不变（`commandUi.register` 贡献维持）。 |
| P0-4 | popupSelect 兜底路径保留 | 键盘 Enter 走官方 dispatch 时回落现状 popupSelect，功能等价；作为防御层长期保留并纳入官方升级回归清单。 |
| P0-5 | 共享组件 `AssetPicker` 抽象落地 | 按 §4.2 能力清单实现；composer 场景改走共享组件；对外行为零回归；既有单测迁移通过。 |
| P0-6 | 写入管线不变 | 两个入口确认后仍唯一走 AttachmentStore 事件总线管线；8 条上限、指纹去重、物化规则全部沿用基线 PRD。 |

### P1（Should have）

| # | 需求 | 说明 |
|---|---|---|
| P1-1 | 直达失效自检与降级 | 若 B/C 路线的挂载/拦截在启动时检测失败，自动降级为纯官方 popup 行为（即现状），并打 debug 日志；不得在 UI 上报错打扰用户。 |
| P1-2 | 埋点补全 | 在既有 `composer_add_*` 事件基础上区分触发路径：`{path: 'direct' \| 'popup-fallback'}`，用于观测直达覆盖率与拦截失效率。 |
| P1-3 | 共享组件最小示例 / 开发页 | 供画布等后续场景接入前联调（可用现有原型/测试页机制，形式由架构定）。 |

### P2（Nice to have）

| # | 需求 | 说明 |
|---|---|---|
| P2-1 | 组件内搜索 | 基线 PRD 中弹窗搜索（P1-5）延续到共享组件层统一实施。 |
| P2-2 | 分类计数徽标 / 最近分类记忆 | 沿用基线 PRD P2 条目，在共享组件层实现一次、处处生效。 |
| P2-3 | 键盘完整操作 | 弹窗内方向键移动、空格选中、Enter 确认（基线 P2-3 延续）。 |

---

## 6. 技术约束与事实（已核实，可直接采信）

以下事实由产品经理侦察核实，作为 PRD 层约束；实现方案归架构阶段：

1. **官方 dispatch 一律 popup**：官方 `dsh-client-ui-commands` 的 `CommandUiRuntime.dispatch()` 对插件贡献**一律** openPopup（popupSelect shell），官方**不存在**「点击即执行」的贡献类型。→ 老板问题「官方现有逻辑是否不兼容点击即直达」的答案：**是的，不兼容**；维持纯官方机制则二级弹层无法去除，必须换方案（B 或 C）。
2. **宿主裸命令虽直达但有副作用**：官方宿主级裸命令可点击即执行，但会在会话时间线留下持久 command 流节点（聊天噪音），产品体验不可接受，**排除**。
3. **`conversation.input.left/right` 插槽可用**：官方 composer 存在 input 左/右插槽（+号旁工具行），可挂完全自主行为的自有图标按钮（可直达）。
4. **capture 拦截已验证可行**：我们此前对官方按钮做过 capture 阶段事件拦截（`bindAddButton`）并验证可行——即「保留列表条目、点击我们条目时拦截直达、键盘 Enter 走官方 popup 兜底」技术上成立；代价是**依赖官方菜单 DOM 结构**，官方每次升级需回归。
5. **macOS 系统面板能力边界**：osascript 的 `choose file` / `choose folder` 是两种面板；单面板混选文件+文件夹的能力**待实测**（架构师处理，见 §8 Q2）。

---

## 7. 路线选项（A / B / C）

> ⚠️ **路线拍板 = 架构师 + 老板**。本 PRD 不预选，仅列产品视角的利弊与体验影响。

| 路线 | 机制 | 利 | 弊 / 风险 | 产品体验 |
|---|---|---|---|---|
| **A. 官方现状 popup** | 维持 `commandUi.register` + popupSelect 二级弹层（现状） | 零 DOM 依赖、官方升级零回归风险、实现已合入 | **不满足老板「点击即直达」要求**；多一步操作 | 3 步：列表 → 二级弹层 → 目标窗口 |
| **B. 拦截直达（popup 兜底）** | 保留列表条目；capture 阶段拦截我们条目的 click，直接触发系统面板/选择弹窗；键盘 Enter 走官方 popup 兜底 | 入口形态完全不变（用户心智零迁移）；有兜底防御层；已验证可行 | 依赖官方菜单 DOM 结构与事件链，官方升级可能静默失效（有 P1-1 降级兜底）；拦截边界（右键、辅助技术触发）需架构穷举 | 2 步直达；失效时自动回落 3 步 |
| **C. input.left 插槽自有按钮** | 在「+」旁插槽挂自有图标按钮，按钮行为完全自主直达；命令列表条目可保留也可移除 | 行为完全自主、零 DOM 拦截脆弱性；比列表更显眼 | 「+」旁多一个图标，工具行视觉变化需老板确认；与官方「+」的功能分工（官方项 vs 我们项）需要清晰心智，避免用户困惑两个入口；插槽占用需过 `verify:slots` 契约 | 1 步直达（点图标即开）；列表条目若保留则与 B 叠加 |

**产品视角备注**：B 与 C 不互斥——B 解决「列表内直达」，C 解决「更显眼的直达入口」。若老板重视「入口不变」，优先 B；若老板接受工具行加图标，C 是最稳的长期形态。组合（B+C）为体验上限，成本为两套入口的维护与回归。

---

## 8. 待确认问题（Open Questions）

| # | 问题 | 备选 | 建议 / 归属 |
|---|---|---|---|
| Q1 | **触发路线 A/B/C（或 B+C）拍板** | 见 §7 | **架构师 + 老板**；产品视角建议：入口心智不变选 B，接受加图标选 C，求上限选 B+C。 |
| Q2 | 系统面板「文件 / 文件夹」模式如何呈现？ | a. 直达面板默认文件模式，文件夹经兜底 popup 或面板内切换；b. 实测若支持单面板混选则一步到位；c. 拆成两个命令条目 | 依赖 macOS 面板混选实测（**架构师**）；实测结果出来前交互稿按 a 定义。 |
| Q3 | 共享组件的代码归属与导出形态 | hub 内 shared client 目录 / 独立包 / omnimux 公开导出 | **架构师**；PRD 约束仅：消费方不 import hub 内部、走公开 API。 |
| Q4 | `onConfirm` 后弹窗关闭语义 | `closeOnConfirm` 默认 true / 由调用方全权控制 | 建议默认 true + 可覆盖，**架构师**评审时定稿。 |
| Q5 | C 路线下命令列表条目是否保留 | 保留（双入口）/ 移除（只留图标） | 若选 C 由**老板**拍板；产品建议保留（键盘可达 + 可搜索）。 |
| Q6 | B 路线的官方升级回归机制 | 纳入每次 RC 升级 checklist（`omnimux-rc-upgrade` skill 扩展一项） | 建议纳入 RC 升级核对清单，**主理人**确认。 |

---

## 9. 验收标准（可测试表述）

**直达链路（P0-1/P0-2）**

1. Given 会话页 composer，When 鼠标点击「+」列表中的「添加文件或文件夹」，Then 系统文件管理窗口在**无官方 popupSelect 二级弹层出现**的前提下直接打开；选择取消后 Tray 无变化。
2. Given 同上，When 鼠标点击「从资产库添加」，Then 资产库选择弹窗直接打开，中间无任何官方二级弹层。
3. Given 直达生效，When 完成一次文件/资产添加，Then 附件经 AttachmentStore 写入 Tray，与现状管线行为一致（含 8 上限、去重、物化）。

**兜底（P0-4）**

4. Given 命令列表展开，When 用键盘方向键选中条目并按 Enter，Then 走官方 popupSelect 二级弹层（现状行为），功能等价可用。
5. Given 直达机制被模拟为失效（拦截未命中/插槽未挂载），Then 功能自动降级为现状 popup 行为，无 UI 报错，有 debug 日志（P1-1）。

**共享组件（P0-5）**

6. Given 共享 `AssetPicker` 以 `occupied=3, maxSelect=8, alreadyIds=[id1]` 渲染，Then 确认栏显示「已选 0 项 · 还可添加 5 项」，id1 卡片呈「已添加」置灰不可选；勾选 5 项后其余未选卡片置灰。
7. Given composer 走共享组件重构完成，Then 原 `AssetPickerModal` 对外可见行为（视觉、文案、配额、去重 toast、空态/加载/错误态）逐项与重构前一致；`composer-add/` 既有单测迁移后全绿。
8. Given 组件 API 文档/类型，Then 工作流画布场景（§4.3 场景 2）所需的 `categories` 收窄、`maxSelect=1`、自定义 `onConfirm` 均可经 props 表达，无需改组件内部（评审断言 + 最小联调示例 P1-3）。

**工程门禁（沿用基线 PRD §6）**

9. `pnpm test`、`pnpm verify:stages` 全绿；若走 C 路线新增插槽占用则 `pnpm verify:slots` 必须通过插槽契约校验。
10. 真机验收：改动前端 Client，交付前必须 `pnpm verify:live <stage>` 在 45120 Dev App 完成 ego-browser 探针（含「点击→直达窗口出现」与「Enter→popup 兜底」双路径断言）并产出 `docs/evidence/live-qa-report.json`。
11. Git/PR：遵循 `docs/contracts/plugin-git-pr.md`，独立 worktree、一插件一 PR；本需求涉及官方行为依赖（B 路线），建议按 R1 由老板人工合入。
