# 公共资产卡片「保存到本地」悬停控件规格 (Issue #2663)

> **文档性质**：PRD 原型 + UI 元素与文案字典规格（Spec Plan）。产品经理许清楚签发的**唯一真源**。
> **适用对象**：前端开发（裴像素）按本文件逐字实现；QA（严过关）按第 8 节清单逐条打勾；架构师（高见远）只负责数据流与并发实现，**不得修改本文件的元素与文案结论**。
> **关联契约（L1，强制）**：
> - `docs/contracts/icon-design-standards.md`（两级图标降级选型；UI04 门禁）
> - `docs/contracts/ui-copywriting-and-naming-standards.md`（动词纯粹律、术语字典、中英一一对应）
> - `docs/contracts/ui-design-guidelines.md`（几何、圆角、Token、图标按钮规范）
> **本次改动性质**：**一处 DOM 增键 + 一处文案统一**，零新组件、零新弹层、零新图标文件。

---

## 1. 用户故事与业务目标

**一句话**：正在「资产库 → 公共」页签里挑素材的用户，悬停卡片时即可一键把该素材下载进**本地资产库的对应分类**，不必先点开预览弹窗再点「收藏到本地」。

**业务目标**

| 目标 | 说明 |
| :--- | :--- |
| 消除两步绕行 | 现状：悬停 → 点卡片开弹窗 → 点弹窗底部按钮保存。目标：悬停 → 点右上角保存键，一次点击闭环。 |
| 复用既有后端能力 | `plugins/omnimux-assets/src/cloud-catalog.js:362 saveToLocal(id,{name,type})` 已按 `typeForCategory(row.category)` 归入对应分类，并对 `source === 'cloud:<id>'` 的既有行**直接复用**（天然去重）。本次**零后端改动**。 |
| 复用既有反馈通道 | 保存控制器 `use-cloud-save.js` 的 `useCloudSave({t})`、`CLOUD_NOTICE_MS = 2400` 与 `AssetsStage.jsx:551` 的通知条 `<p className="omnimux-assets-cloud-notice">` 均已存在，本次只新增一个入口，不新增反馈组件。 |

**Non-Goals（明确不做，任何越界实现一律驳回）**

1. **不做**卡片内多按钮之外的任何新控件（无「更多」菜单、无批量选择、无右键菜单）。
2. **不做**卡片上的可见文字标签、胶囊徽章、装饰图标、口号副标题、括号解释、重复意义角标。
3. **不改**「加入会话」按钮的图标（`ChatIcon`）、位置（簇内最右）、文案（`card.addToConversation` / `card.addedToConversation`）与 **1800ms 勾选回馈节奏**。
4. **不改**控件簇骨架值 `gap: 6px` / `top: 8px` / `right: 8px` / `z-index: 5`（理由见第 3.3 节）。
5. **不改**预览弹窗「保存到本地」按钮的图标（现为 `PlusIcon`）与 `aria-pressed` 语义。该按钮以加号表达「保存」确属语义错配，但改图标会扩大本次视觉影响面，**记录为独立后续单**，本次只对齐中文措辞（见第 5.2 节）。
6. **不新增**自造 SVG 图标（禁止写入 `plugins/omnimux-assets/src/client/icons.jsx`）。
7. **不引入**前端直连接口、预签名 URL 或任何新的下载链路；保存一律经 `use-cloud-save.js` → `cloud-save.js` → `POST /omnimux/assets/cloud/save`。

---

## 2. 原型（ASCII 线框）

### 2.1 悬停态卡片右上角控件簇

```
                    卡片右边缘
                         |
  +----------------------|----------------------------------------+
  | 卡片（.omnimux-assets-cloud-card，悬停 / focus-within 时浮现） |
  |                                                               |
  |                      +-------+     +-------+                  |  <- 两键上沿 top: 8px
  |                      | save  | 6px | chat  |                  |
  |                      | 28x28 |<--->| 28x28 |                  |  <- 键高 28px（8~36px）
  |                      | (NEW) |     | (既有)|                  |
  |                      +-------+     +-------+                  |  <- 两键下沿 36px
  |                          |     |     |     |                  |
  |                         70px  42px  36px   8px  <- 该边距卡片右边缘的距离
  |                      左=保存到本地   右=加入会话                 |
  |                                                               |
  +---------------------------------------------------------------+
   ^ 卡片上边缘

  坐标（相对卡片右上角，单位 px）：
  - 保存键（omnimux-assets-cloud-save）：right 42 -> 70，top 8 -> 36
  - 加入会话（omnimux-assets-cloud-chat）：right 8  -> 36，top 8 -> 36
  - 两键之间净间隙 = 6px（gap）；簇总宽 = 28 + 6 + 28 = 62px；簇高 = 28px
```

### 2.2 卡片其余部位：**零改动**

```
  +---------------------------------------------------------------+
  |                                    +-------+ +-------+        |
  |                                    | save  | | chat  |        |
  |                                    +-------+ +-------+        |
  |  +-------------------------------------------------------+    |
  |  |  缩略图 / 立绘 / 声音底板（.omnimux-assets-cloud-thumb）  |    |  <- 不变
  |  |  音频行仍在这里挂播放键；视频行仍悬停秒播                  |    |
  |  +-------------------------------------------------------+    |
  |  | 标题一行（.omnimux-assets-card-title，超长省略）           |    |  <- 不变
  |  | 描述一行（.omnimux-assets-cloud-desc，仅非媒体类渲染）     |    |  <- 不变
  |  +-------------------------------------------------------+    |
  +---------------------------------------------------------------+
```

- 悬停暗化遮罩 `.omnimux-assets-cloud-card-mask`：不变，仍被控件簇（`z-index: 5`）盖住。
- 音频行悬停自动试听、视频行悬停播放、点击卡片打开预览弹窗：**全部不变**（保存键自行 `stopPropagation`）。

### 2.3 两种布局共用一份卡片（一处改动覆盖全部）

| 布局 | 渲染点 | 卡片宽度 | 62px 簇宽余量 |
| :--- | :--- | :--- | :--- |
| 「全部」分类横向流 | `CloudCategoryRow.jsx:153` | 最窄 `flex: 0 0 190px` | 190 − 62 − 8 = 120px，充裕 |
| 分类网格（Masonry） | `CloudAssetsView.jsx:638` | 随列宽自适应 | 同上量级，充裕 |

- 两处渲染点**都必须**把保存能力下发给 `CloudAssetCard`（见第 8.1 节改动面）。
- `kind === 'text'`（文档类，无缩略图）的卡片同样出现该控件簇——保存能力按**行**提供，不按类型裁剪。

---

## 3. UI 元素白名单（唯一决策）

### 3.1 允许出现的元素（穷举，多余一个都不行）

| 元素 ID | 元素类型 | 精确内容 | 显示/交互规则 |
| :--- | :--- | :--- | :--- |
| `card.actions.cluster` | 容器 `div` | 类名 `omnimux-assets-cloud-actions`（**已存在，不改**） | 常驻 DOM；`position:absolute; top:8px; right:8px; z-index:5; display:flex; align-items:center; gap:6px` |
| `card.actions.save` | `IconButton`（`variant="ghost"` `size="sm"`） | 类名 `omnimux-assets-cloud-action omnimux-assets-cloud-save`；图标 `<IconDownloadOutline16 size={16} />` | 簇内**第一个**（最左）；`opacity:0` → 卡片 `:hover` / `:focus-within` 时 `opacity:1`；hover 反色；点击保存 |
| `card.actions.chat` | `IconButton`（`variant="ghost"` `size="sm"`） | 类名 `omnimux-assets-cloud-action omnimux-assets-cloud-chat`；图标 `<ChatIcon size={16} />` | 簇内**第二个**（最右）；行为 100% 不变（含 1800ms `CheckIcon` 回馈） |
| `card.actions.save` 的 `aria-label` / `title` | 属性文本 | idle 与 saved 两态见第 5 节 | 两属性**必须同值同源**，纯图标按钮缺一即驳回 |
| `stage.notice` | 既有 `<p className="omnimux-assets-cloud-notice">` | 见第 5 节 | **不改结构、不改位置、不改 2400ms 计时**；仅新增 CSS 单行截断（见 3.4） |

`card.actions.save` 的三态视觉（**复用既有控件语言，不新增任何样式语汇**）：

| 态 | 图标 | 按钮可用性 | 视觉 |
| :--- | :--- | :--- | :--- |
| idle | `IconDownloadOutline16` 16px | 可用 | 与「加入会话」完全相同的底板、描边、反色 |
| saving | `IconLoadingOutline16`（由 `IconButton loading` 原生提供，**禁止自造转圈**） | `loading` 自动置为不可用，并带 `aria-busy="true"` | 同上底板 + 原生 spinner |
| saved | `CheckIcon` 16px（**复用既有 `./icons.jsx` 的 `CheckIcon`**） | `disabled` | 同上底板；沿用 ui-kit 既有 `disabled` 降透明处理，**禁止为它单独写 opacity 覆盖** |

### 3.2 明确禁止清单（红线，出现即 `PM_SIGN_OFF: REJECT`）

- 禁止任何**可见文字标签**（不得把「保存到本地」写成按钮旁的文本或按钮内文字）。
- 禁止任何**胶囊徽章 / 状态角标 / 计数点 / 红点**（无 `NEW`、无 `已保存` 角标、无数目角标）。
- 禁止任何**装饰性 emoji 或 Unicode 字符**充当图标（UI04 硬门禁：`× ✕ ↑ ↓ ↗ ↘ ▶ ✓ ✔` 及一切 `Extended_Pictographic`）。
- 禁止任何**口号式副标题**（如「一键收入囊中」「从此不再丢失」）与**括号解释**（如 `保存（下载到本地库）`）。
- 禁止**重复意义角标**：=`已保存` 不得同时表现为「按钮变勾 + 角标/描边/底色强调」；成功态只允许**一个**视觉信号（勾）。
- 禁止在簇内加**第三个按钮**（无「复制链接」、无「更多」）。
- 禁止改动「加入会话」按钮的图标、DOM 次序（仍为簇内最后一个）、文案与 1800ms 回馈节奏。
- 禁止新增 `data-*` 状态属性（专门点名：**不得复活 `data-saved`**）——已保存状态经 `disabled` 与 `aria-label` 即可观测。
- 禁止为 saved/saving 态单独复制一份底板 CSS（必须走 3.3 的共享类）。

### 3.3 骨架值：全部原样保留（含理由与影响面）

| 属性 | 现值 | 本次结论 | 理由 |
| :--- | :--- | :--- | :--- |
| `gap` | `6px` | **保留** | 双键簇总宽 62px，在最窄 190px 卡片上仍余 120px；压缩间距会连带移动「加入会话」的既有位置，触碰禁止项。 |
| `top` | `8px` | **保留** | 与卡片内边距基准一致，改动会牵动 `card-mask` 与缩略图叠压关系。 |
| `right` | `8px` | **保留** | 「加入会话」贴角位置在既有截图与人工验收中已冻结。 |
| `z-index` | `5`（行卡片内 `4`） | **保留** | 必须高于遮罩层；下调将导致悬停时按钮被遮罩盖住。 |

**唯一允许的结构性样式改动（共享类收敛，避免双份底板）**：把既有 4 条底板规则的选择器从 `.omnimux-assets-cloud-chat` 收敛为 `.omnimux-assets-cloud-action`，并给「加入会话」按钮**追加**该类（保留 `omnimux-assets-cloud-chat` 原类名以兼容既有选择器与测试）：

```
/* 收敛前（现状，仅 chat 有底板） */
.omnimux-assets-cloud-card .omnimux-assets-cloud-chat { ... }
/* 收敛后（两个按钮共用一份底板，声明值一字不改） */
.omnimux-assets-cloud-card .omnimux-assets-cloud-action { border-radius: 8px; background: var(--dsw-alias-bg-elevated); border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); opacity: 0; transition: opacity 0.16s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
.omnimux-assets-cloud-card:hover .omnimux-assets-cloud-action,
.omnimux-assets-cloud-card:focus-within .omnimux-assets-cloud-action { opacity: 1; }
.omnimux-assets-cloud-card .omnimux-assets-cloud-action:hover:not(:disabled):not([aria-disabled="true"]) { background: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-primary); color: var(--dsw-alias-label-primary-foreground); }
```

> 影响面：`.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-actions`（`z-index:4 / opacity:0` + 悬停 `opacity:1`）**不需要任何改动**，两键自动共享同一次淡入。

### 3.4 通知条单行截断（新增的唯一一条 CSS）

`.omnimux-assets-cloud-notice` 追加 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`。
理由：超长资产名会让通知条换行并把整个工具区向下顶，破坏《UI 设计准则》单行流；截断后名称尾部不可读属于可接受的降级（通知条 2400ms 后自净，且成功态另有保存键勾选作为第二信号）。**禁止**为通知条加 `title` 属性、禁止加第二行说明、禁止加关闭按钮。

---

## 4. 图标决策

### 4.1 结论（唯一）

**采用 `IconDownloadOutline16`（16px），从 `@deepseek-ai/dsh-client-ui-primitives` 直接 import。**

```jsx
// plugins/omnimux-assets/src/client/CloudAssetsView.jsx 顶部新增
import { IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
// 卡片簇内使用
<IconDownloadOutline16 size={16} />
```

### 4.2 依据（四级证据链）

1. **契约强制**：`icon-design-standards.md` §1 两级降级——第一优先级 `@deepseek-ai/dsh-client-ui-primitives`，且 §1.1 明确把「通用操作（搜索、设置、加号、关闭、刷新、复制、编辑、删除、方向箭头、加载态等）」划入强制使用区；下载/保存属通用操作；§3.1 规定「标准按钮 / 工具栏图标：16px」。
2. **原生库确有该图标**：`@deepseek-ai/dsh-client-ui-primitives` 导出 `IconDownloadOutline16`（`lib/types/icons/index.d.ts:98`，实现标注 `/** ic_ds_download_outline_16 */`，16×16 viewBox，`currentColor` 填充字形）。
3. **第二优先级不可用**：`lucide-react` 在本仓**未安装、不可解析**，故不存在「原生缺省才降级」的适用情形。
4. **本插件打包链路已就绪**：`plugins/omnimux-assets/scripts/build-client.mjs:30-38` 的 `external` 列表已含 `@deepseek-ai/dsh-client-ui-primitives`（宿主 `window.__ModuleLoader__` 提供，零包体积），且同产品线已有实际先例 `plugins/omnimux-analytics/src/client/AnalyticsStage.jsx:2`。

### 4.3 红线

- **禁止**在 `plugins/omnimux-assets/src/client/icons.jsx` 新增自造 `DownloadIcon`（重复造轮子 + 绕过原生主题自适应）。
- **禁止** Emoji / Unicode 字符替代（UI04 门禁）。
- **禁止**改小到 14px 或加大到 20px——簇内两键必须同为 16px。

### 4.4 与既有 `ChatIcon` 并置的视觉重量（明确结论：**不做额外处理**）

- `ChatIcon` 来自自建 `./icons.jsx`：24×24 viewBox、`stroke: currentColor`、`strokeWidth: 1.8`，渲染 16px 时等效描边约 1.2px（线性描边体）。
- `IconDownloadOutline16` 是 16×16 viewBox 的**填充字形**（`fill: currentColor`），为 16px 显示光学调校，同等像素下观感略「实」。
- **结论**：差异属两种图标体系的固有光学差，**不做任何补偿**——不得单独覆盖 strokeWidth、不得改用 14px 缩小、不得为其加描边包裹。二者同为单色 `currentColor`、同为 16px、共用同一块底板与同一套淡入/反色，作为**一个控件簇**阅读时重量一致。若终验中发现明显失衡，整改方向是**整体核对色值继承**（共享类的 `color: var(--dsw-alias-label-primary)`），而**不是**逐图标调参。

---

## 5. 逐字文案字典（zh + en，一键一名）

### 5.1 字典（唯一真源）

| 键名 | zh（逐字锁定） | en（逐字锁定） | 出处/用途 | 新增? |
| :--- | :--- | :--- | :--- | :--- |
| `card.saveToLocal` | `保存到本地` | `Save to Library` | 卡片保存键 **idle 态** `aria-label` + `title`；saving 态沿用同一文案 | **新增** |
| `card.savedToLocal` | `已保存` | `Saved to Library` | 卡片保存键 **saved 态** `aria-label` + `title` | **新增** |
| `cloud.save.notice` | `已保存「{name}」到本地资产库` | `Saved "{name}" to the local library` | 全局通知条（卡片与预览弹窗共用） | **改名**：由 `modal.save.notice` 收敛；文案仅 `已收藏` → `已保存` |
| `error.saveFailed` | `保存到本地失败。` | `Saving to the library failed.` | 通知条失败文案（所有保存失败路径的唯一出口） | **新增** |
| `modal.saveToLocal` | `保存到本地` | `Save to Library` | 预览弹窗按钮（既有键，**仅改 zh 值**） | 沿用键名 |
| `modal.savedToLocal` | `已保存` | `Saved to Library` | 预览弹窗按钮已保存态（既有键，**仅改 zh 值**） | 沿用键名 |

**中英一一对应**：以上 6 键必须在 `plugins/omnimux-assets/src/client/locales.js` 的 `zh` 与 `en` 两个对象中**同时存在且键名逐字一致**（`pnpm lint:i18n` 强制键集 parity）；en 不得直接复制 zh。术语映射：zh「本地」＝ en「Library」，二者指同一实体「本地资产库」（通知条 en 既有措辞 `to the local library` 保留不变，作为该实体的英文基准）。

### 5.2 术语冲突裁决：「保存到本地」 vs 既有「收藏到本地」

- **裁决：卡片按钮采用「保存到本地」（en `Save to Library`），并同步把预览弹窗的中文从「收藏到本地」统一为「保存到本地」。**
- 理由（三条，按权重）：
  1. **动词纯粹律**：该动作产生真实副作用——把云端行**复制/下载**进本地资产库对应分类（`saveToLocal`），是「保存」，不是「收藏」（收藏隐含一个收藏夹式的软标记语义，与本功能的物理落库不符）。
  2. **用户原话即「保存到本地」**，且后端函数名、`cloud-save.js` 注释（“Copy one cloud catalog row into the local library”）全部使用 save 语义。
  3. **既有 en 一直写的是 `Save to Library`**——「收藏到本地」从来只是中文侧的孤例，中英本身就不一一对应；本次收敛同时消灭这处历史错配。
- **边界结论（是否超出本次改动范围）：不超出，且必须同步改。** 两个入口同处「公共」页签、同一秒内可先后出现（悬停卡片 → 点卡片开弹窗），若一处写「保存到本地」、一处写「收藏到本地」，即为同一动作两个名字——正是零同义叠加要杀的缺陷。
- **改动边界（严格限定，前端不得越界）**：只改 `locales.js` 中 `modal.saveToLocal` / `modal.savedToLocal` 的 **zh 两个字符串**，以及两处对应测试断言；**不改**弹窗按钮的 DOM、图标（保持 `PlusIcon`）、`aria-pressed`、行为与 en 文案。

### 5.3 saving 态文案（结论：**不新增文案键**）

- `aria-label` / `title` **保持 idle 文案 `card.saveToLocal`（`保存到本地`）不变**——可访问名称不因瞬时忙态跳变。
- 忙态语义由 `IconButton loading` 自动提供的 **`aria-busy="true"`** 与不可用态表达，视觉由原生 `IconLoadingOutline16` spinner 表达。
- **禁止**新增 `card.savingToLocal`（`保存中`）一类键：字典膨胀且屏幕阅读器体验并不会因此变好。

### 5.4 saving 态 → saved 态切换文案

| 迁移 | 文案键 | zh / en |
| :--- | :--- | :--- |
| saving → saved | `card.savedToLocal` | `已保存` / `Saved to Library` |
| saving → 失败（回 idle） | `error.saveFailed`（仅通知条，按钮文案回 `card.saveToLocal`） | `保存到本地失败。` / `Saving to the library failed.` |

### 5.5 saved 态与「加入会话」成功勾选的视觉区分（结论）

- **两键共用 `CheckIcon` 16px，不做颜色/形状/角标区分。** 任何「绿勾 / 加个小对勾角标 / 变高亮色」的方案都被第 3.2 节红线否决（重复意义角标 + 装饰性强调）。
- 区分靠三条**非装饰**信号：
  1. **位置**：勾在左＝保存，勾在右＝加入会话。
  2. **时长**（主信号）：**加入会话的勾是 1800ms 瞬时回馈后还原气泡；保存的勾是持久态**——只要该行仍在本次会话的 `savedIds` 内就一直保持勾 + `disabled`。
  3. **无障碍文本**：`已保存` / `Saved to Library` 与 `已添加` / `Added` 不同。
- 由此得出一条实现约束：**保存的勾绝不允许挂 1800ms 定时器**（那会把持久态误做成瞬时态，与加入会话无法区分）。

### 5.6 失败文案的取舍（复用 vs 新增：结论：**新增 `error.saveFailed`，并在 UI 层封死错误原文**）

- 现状缺陷：`use-cloud-save.js` 对 `save-failed` 才回落 `t('error.generic')`（`请求失败`），其余分支直接把宿主返回的 `message` 或异常 `message` 渲染进通知条——真实可达的例子是本地库缺失时宿主回 `local library is not available`、`catalog-unavailable`，**英文内部信息会直接出现在中文界面**。
- 结论：
  - **不**复用 `error.generic`（`请求失败` 说不出是保存失败，用户刚点了什么就不知道失败在哪一步）。
  - **新增一个** `error.saveFailed`，作为**所有保存失败路径的唯一出口**（`save-failed`、`catalog-unavailable`、`catalog-not-found`、网络异常、任何宿主 message 一律映射到它）。
  - **禁止**在通知条渲染任何宿主错误码或英文内部信息原文；宿主 `message` 只允许进开发日志/控制台，不得进 DOM。
  - 本次**不**为 `disk-space-insufficient` 等细分码单开文案（通知条是一次性告知，不是诊断通道）——细分诊断留给后续单，避免本次字典膨胀。

---

## 6. 状态机

```
                 点击保存键（asset.id 非空、非 saving、非 saved）
   [ idle ] ────────────────────────────────────────────────► [ saving ]
      ▲   ▲                                                       │
      │   │                                     成功               │ 失败/异常
      │   │                                                       ▼
      │   │                                            ① 通知条 error.saveFailed
      │   │                                            ② 按钮回 idle（可再点）
      │   └───────────────────────────────────────────────────────┘
      │
      │  阶段整体卸载后重新挂载（状态丢失，见 7.3）
      │
      └── [ saved ]  ◄──────────── 成功：通知条 cloud.save.notice + 勾 + disabled
              │
              └── 再点击：无状态迁移（按钮已 disabled，单飞控制器亦会丢弃）
```

| 迁移 | 条件 | UI 侧可见结果 |
| :--- | :--- | :--- |
| idle → saving | 点击保存键；`asset.id` 非空；该 id 不在 `savedIds`；当前无在途保存 | 按钮立刻变 spinner + 不可用 + `aria-busy="true"` |
| saving → saved | 请求成功（`ok === true`） | 图标变 `CheckIcon`；`aria-label`/`title` 变 `已保存`；按钮 `disabled`；通知条显示 `已保存「{name}」到本地资产库`，2400ms 后自净 |
| saving → idle | 请求失败或抛异常 | 按钮复原为 `IconDownloadOutline16`；通知条显示 `保存到本地失败。` |
| saved → saved | 再点击 | 无效（按钮 `disabled`，不发请求） |
| idle → idle | `asset.id === ''` | 无效（无请求、无通知条；目录行恒有 id，属兜底分支） |

**去重规则（三层，从近到远）**

1. **UI 层**：`saved === true` 或 `saving === true` 时按钮 `disabled`，物理上不产生第二次点击。
2. **控制器层**：`use-cloud-save.js` 已有 `inFlightRef` 单飞 + `savedRef.current.has(id)` 判重，同一 id 不会二次请求。
3. **后端层**：`saveToLocal` 在未指定 `name` 且已存在 `source === 'cloud:<id>'` 时**直接复用**既有资产，即使前两层被绕过也不会产生本地重复副本。

**UI 侧对并发实现的唯一硬要求**：**任何时刻点击保存键，都必须在 2400ms 内产生可观测反馈**（进入 saving/saved 或出现失败通知条）——**严禁无反馈的空点击**。若控制器维持全局单飞（A 卡保存中时 B 卡点击被静默丢弃），则 A 在途期间 B 的保存键必须一并置为不可用；具体机制（全局置灰 / 排队 / 并发放行）由架构师定，但「静默吞点击」这一形态不允许出现在验收里。

---

## 7. 边界与空态

### 7.1 重复连点 / 保存中再点

- saving 与 saved 期间按钮 `disabled`；`disabled` 的原生 `<button>` 不派发 click、不冒泡，**也不会触发卡片 `onClick` 打开预览弹窗**。
- 仍必须在 `handleSave` 首行保留 `event.stopPropagation()`（与既有 `handleAdd` 同形），作为按键落在按钮边缘时的第二道防线。
- saved 态**无倒计时、无自动还原**。

### 7.2 筛选 / 排序 / 滚动切换后的状态保持

- `saved` 状态**必须由控制器按 `String(asset.id)` 派生**，卡片自身不得持有任何本地「已保存」标记（`useState` 形式的本地标记＝禁止项）。
- 由此：切换二级分类、重新排序、无限滚动加载更多、虚拟列表重挂载之后，同一 id 的卡片仍显示勾。
- 一级页签（资产库 / 公共 / 产品库 / AI生成）切换不卸载 `AssetsStage`，故状态保持。

### 7.3 阶段整体卸载（明确记录的已知降级）

- 若 `AssetsStage` 被完全卸载（如右栏切到别的 Tab），`savedIds` 随控制器销毁，回到「公共」时按钮显示 idle。
- **判定为可接受**：本地库才是事实真源，且后端去重（6.3）保证再点一次不会产生第二份副本。**禁止**为消除该现象而把 `savedIds` 落 `localStorage` 或写成卡片本地状态。

### 7.4 云端目录未挂载（`catalog-unavailable`）时的失败表现

- **目录未挂载时卡片根本不会渲染**（该页签为空态/错误态），因此不存在「对着不存在的卡片点保存」的场景。
- **真实可达路径**是「目录在、本地库缺失」：`cloud-catalog.js:363` 抛 `AssetsError('catalog-unavailable', 'local library is not available')` → HTTP 503。
  - 通知条：`保存到本地失败。`（**严禁**显示 `catalog-unavailable` / `local library is not available` 原文）。
  - 保存键：回到 idle 且**可再次点击**（严禁停在 spinner 或停在 disabled）。
  - **不得**因为一次失败就永久置灰该行的保存键。

### 7.5 超长资产名在通知条中的处理

- 通知条单行截断（3.4），2400ms 后自净；**不换行、不撑高**工具区。
- 连续保存两行时，通知条文案**后一条覆盖前一条**，2400ms 计时重新起算（既有控制器行为，不变）。
- 名称来源于资产行原始 name，`{name}` 占位符**必须保持字面 `{name}`**（既有 `.replace('{name}', ...)` 机制不变）。

### 7.6 其它

- 保存键在**音频行**与**视频行**上的位置不受播放键影响（播放键在缩略图内，簇在卡片右上角，`z-index` 层级不变）。
- 悬停族键盘可达性：Tab 进入卡片时 `:focus-within` 让簇浮现；簇内顺序为 **保存键 → 加入会话**，与视觉左右顺序一致。

---

## 8. 实施与验收计划

### 8.1 改动面（唯一授权清单，超出一律驳回）

| 文件 | 改动 |
| :--- | :--- |
| `plugins/omnimux-assets/src/client/CloudAssetsView.jsx` | 新增 primitives import；`CloudAssetCard` 新增保存键（含 `handleSave`）+ 收窄的 props；网格渲染点（:638）透传 props |
| `plugins/omnimux-assets/src/client/CloudCategoryRow.jsx` | 「全部」分类行渲染点（:153）透传同一组 props |
| `plugins/omnimux-assets/src/client/AssetsStage.jsx` | 把**既有的** `cloudSave` 单例以窄接口下发给 `CloudAssetsView`（通知条与 `useCloudSave` 实例位置不变） |
| `plugins/omnimux-assets/src/client/styles.js` | 底板选择器收敛为共享类 `.omnimux-assets-cloud-action`；通知条单行截断 |
| `plugins/omnimux-assets/src/client/locales.js` | 第 5.1 节 6 个键（2 新增 + 1 改名 + 1 新增 + 2 改 zh 值） |
| `plugins/omnimux-assets/src/client/use-cloud-save.js` | 通知条键改 `cloud.save.notice`；失败路径统一映射 `error.saveFailed`（不再渲染宿主原文）；更新文件头注释中「grid cards themselves offer just 加入对话」的过时描述 |
| `CloudAssetsView.test.js` / `cloud-local-bridge.test.js` / `AssetPreviewModal.test.js` | 按第 9 节改写为新契约 |

**禁止改动**：`plugins/omnimux-assets/src/client/icons.jsx`、`cloud-save.js`、`cloud-catalog.js`、`http-routes.js`（后端与桥接层本次零改动）。

### 8.2 前置检查

- [ ] 动工前阅读 `design.md` 与三份 L1 契约；本 spec 与 `design.md` 冲突时以本 spec 为准并回报。
- [ ] 确认 `IconDownloadOutline16` 从 `@deepseek-ai/dsh-client-ui-primitives` 具名导入，且**未**写入 `icons.jsx`。
- [ ] 确认未新增任何内联样式（UI02）、未裸用原生控件（UI01）、未硬编码裸色（UI03）、未使用非合规字阶（UI10）。

### 8.3 验收清单（QA 逐条勾选，全部为可观测断言）

**元素与几何**

- [ ] 悬停公共资产卡片，右上角出现**恰好两个**图标按钮；DOM 次序为「保存」在前、「加入会话」在后。
- [ ] 两键均为 28×28px 圆角 8px，水平净间隙 6px，簇整体距卡片上边 8px、右边 8px；缩放到最窄卡片布局（「全部」分类行 190px 卡）时两键**不换行、不重叠、不出界**。
- [ ] 保存键 idle 图标为下载图标（16px），与「加入会话」的气泡图标同为单色，颜色随主题 Token 变化（明暗主题各验一次）。
- [ ] 两键在卡片 `:hover` 与 `:focus-within` 时淡入（`opacity: 0 → 1`），hover 时底板反色；两个按钮的反色表现完全一致。
- [ ] 卡片其余部位（缩略图、标题、描述、悬停遮罩、音频播放键、点击开弹窗）与改动前逐帧一致。

**文案与无障碍（逐字比对，含标点）**

- [ ] 保存键 idle：`aria-label` 与 `title` 均为 `保存到本地`（en 环境 `Save to Library`）。
- [ ] 保存键 saved：`aria-label` 与 `title` 均为 `已保存`（en `Saved to Library`）。
- [ ] saving 态无新增文案键：按钮可访问名称仍为 `保存到本地`，且带 `aria-busy="true"`。
- [ ] 全域检索客户端可见文案：不存在 `收藏到本地` / `已收藏` / `cloud.action.save` / `cloud.action.saved` / `cloud.save.saved` / `modal.save.notice`。
- [ ] `pnpm lint:i18n` 通过（zh/en 键集一致，无禁词命中）。
- [ ] 通知条成功文案逐字为 `已保存「{name}」到本地资产库`（en `Saved "{name}" to the local library`），资产名被正确替换。
- [ ] 纯图标按钮**同时**具备 `aria-label` 与 `title`（图标契约 §3.1 硬要求）。

**行为（真实浏览器）**

- [ ] 点击保存键：不打开预览弹窗、不触发音频/视频播放切换。
- [ ] 保存中：按钮显示原生 spinner 且不可点；重复点击不产生第二个网络请求。
- [ ] 保存成功：按钮变勾 + 不可用，通知条出现成功文案，2400ms 后通知条消失而勾**仍然保留**。
- [ ] 保存成功后切换二级分类 / 重新排序 / 滚动后再滚回：同一资产卡片的勾仍在。
- [ ] 保存成功后点击本地页签：本地资产库中该素材落在**对应分类**下。
- [ ] 同一资产在卡片与预览弹窗之间状态互通：卡片保存后打开该行预览，弹窗按钮显示已保存态（反之亦然）。
- [ ] 重复保存同一行（重新挂载后再点）：本地库**不产生重复副本**（后端复用既有 `cloud:<id>` 行）。
- [ ] 注入保存失败（本地库缺失）后点击保存键：通知条显示 `保存到本地失败。`，**不出现**任何英文内部信息或错误码；按钮回 idle 且可再次点击。
- [ ] 超长资产名（≥60 字）保存成功：通知条**单行截断**，工具栏不被顶高、不换行。
- [ ] 「加入会话」按钮：图标、位置、文案与 1800ms 勾选回馈节奏与改动前完全一致。
- [ ] 键盘：Tab 进卡片时簇浮现，簇内焦点顺序为 保存 → 加入会话；Enter 不误触预览弹窗。

**门禁**

- [ ] `pnpm verify:gates` 通过（UI04 无 Emoji/Unicode 字符图标命中）。
- [ ] 资产库插件客户端全量单测通过（含第 9 节改写后的新契约断言）。
- [ ] 产品经理执行 UI 元素与文案一致性终验，签发 `PM_SIGN_OFF: PASS`。

---

## 9. 与既有反向锁定测试的冲突清单

> 原则：**产品决策变更 → 改写为新契约，保留原测试的防膨胀意图，绝不放水成 `assert.ok(true)`。**
> 下表列出全部冲突（含任务书点名的 4 条，以及我复核补充的 3 条被我发现的额外冲突）。

| # | 文件 | 测试名 | 冲突点 | 我要求的新文案/元素结论 |
| :-- | :--- | :--- | :--- | :--- |
| 1 | `CloudAssetsView.test.js:417` | `renders the bubble icon and nothing else in that corner` | `assert.equal((cluster.match(/<IconButton/g) ?? []).length, 1)` —— 新契约下簇内是 **2** 个 IconButton | 断言改为**恰好 2** 个；保留 `<ChatIcon size={16} />` 断言；**新增** `IconDownloadOutline16 size={16}` 与「save 在 chat 之前」的次序断言，并显式断言簇内**无第三个控件、无可见文字**（名称建议 `renders the save plate left of the bubble and nothing else in that corner`） |
| 2 | `CloudAssetsView.test.js:425` | `removes the save control and its state from the card, the feed and the stylesheet` | 断言 `viewJsx` 不含 `/PlusIcon|cloud-save|handleSave|saveToLocal|data-saved|savedIds\|savingId/`、`ASSETS_CSS` 不含 `/omnimux-assets-cloud-save/` —— 新实现**必然**包含 `handleSave`、`card.saveToLocal`、`omnimux-assets-cloud-save` | 拆为两条正向契约：①**新增**「卡片确有保存控件」（类名 `omnimux-assets-cloud-save`、`handleSave`、`IconDownloadOutline16`）；②**保留原意图**的负向断言改为：卡片**不得**含 `PlusIcon`、**不得**复活 `data-saved`、**不得**持有本地已保存状态（不得出现 `useState` 型 saved 标记 / `localStorage` / 1800ms 型保存回执定时器）、`ASSETS_CSS` 中保存类名**只允许出现 `omnimux-assets-cloud-save` 一个**。③`feedJs` 两条断言（不含 `useCloudSave` / `saveToLocal`）**原样保留**——控制器仍只在 stage |
| 3 | `CloudAssetsView.test.js:437` | `drops the cloud-only save wording from both dictionaries` | 断言 `zh/en['cloud.action.save' \| 'cloud.action.saved' \| 'cloud.save.saved'] === undefined` | 三条旧键**继续禁止存在**（沿用 `undefined` 断言，不得复活）；同测试内**新增**正向断言：`zh['card.saveToLocal'] === '保存到本地'`、`en['card.saveToLocal'] === 'Save to Library'`、`zh['card.savedToLocal'] === '已保存'`、`en['error.saveFailed']` 存在。名称建议 `keeps the retired save keys dead and the card save keys live` |
| 4 | `CloudAssetsView.test.js:446` | `re-points the surviving save notice at a modal-scoped key` | `assert.match(saveJs, /setNotice\(t\('modal\.save\.notice'\)/)` 与 `assert.equal(zh['modal.saveToLocal'], '收藏到本地')` | 通知条键改名为 `cloud.save.notice`（卡片与弹窗共用，不再是 modal 专属）；`{name}` 占位符断言**保留**；`zh['modal.saveToLocal']` 断言值改为 `'保存到本地'`。名称建议 `points the shared save notice at a cloud-scoped key` |
| 5 | `CloudAssetsView.test.js:456` | `inverts the plate on hover, with no brand hue anywhere in the control`（**我复核新增**） | 切片锚点 `ASSETS_CSS.indexOf('.omnimux-assets-cloud-card .omnimux-assets-cloud-chat')` —— 底板选择器收敛为共享类后锚点失效，切片变空导致断言全灭 | 锚点改为 `.omnimux-assets-cloud-card .omnimux-assets-cloud-action`；原有 5 条断言（`bg-elevated` / `transition: opacity` / hover 反色两值 / 无 `brand-primary`）**逐条保留**；**新增**断言：共享类同时覆盖两键（`.omnimux-assets-cloud-save` 不得单独复写底板色值） |
| 6 | `cloud-local-bridge.test.js:44` | `keeps the cloud grid off the save path entirely` | 断言 `cloudFeedJs`（= `use-cloud-assets-feed.js`）不含 `useCloudSave \| saveToLocal \| savedIds \| savingId` | **不冲突，原样保留**。新契约同样要求：`use-cloud-assets-feed.js` 一行不改，控制器仍由 `AssetsStage` 单例持有，卡片只接收窄接口 |
| 7 | `cloud-local-bridge.test.js:52` | `keeps one save controller on the stage, serving the cloud preview modal`（**我复核新增**） | ①`assert.match(stageJsx, /<CloudAssetsView t=\{t\} open=\{visible\} onPreview=\{onCloudPreview\}(?: query=\{feed\.query\})? \/>/)` 会因新增下发属性而失败；②`assert.doesNotMatch(stageJsx, /<CloudAssetsView[^>]*save=\{cloudSave\}/)` 明确禁止把控制器整体塞进视图 | 断言①放宽为「`CloudAssetsView` 仍只接收窄接口」的白名单断言（禁止出现 `cloudSave` 整体对象）；断言②**保留**（stage 不得把控制器整体透传）。**新增**断言：`assert.equal((stageJsx.match(/useCloudSave\(/g) ?? []).length, 1)`（全插件仍只有一处控制器实例，含卡片入口后不得出现第二个）。名称建议 `keeps one save controller on the stage, shared by the modal and the cards` |
| 8 | `AssetPreviewModal.test.js:121-124`（**我复核新增**） | 弹窗保存按钮的字典断言 | `assert.equal(zh['modal.saveToLocal'], '收藏到本地')`、`zh['modal.savedToLocal'] === '已收藏'` —— 术语统一后中文值变更 | zh 两值改为 `'保存到本地'` / `'已保存'`；en 两值（`Save to Library` / `Saved to Library`）**原样保留**；弹窗 DOM/图标/`aria-pressed` 断言**一条都不改**（证明本次只动措辞） |

**文案变更的连带影响（必须一并核查，不留半成品）**

- `use-cloud-save.js` 文件头注释「the grid cards themselves offer just 加入对话」已过时，需同步改写（注释不是文案，但会误导下一个 agent）。
- `cloud-save.js` 的文件头注释本就写着 “Both entry points into a save — the card's hover control and the preview modal's footer”，与新契约一致，**不改**。

---

## 10. 签收

本文件为 Issue #2663 的 UI 元素与逐字文案唯一真源。前端实现完成后，由产品经理许清楚比对本文件第 3、5 节逐条核查源码与真实界面，签发：

- **`PM_SIGN_OFF: PASS`** —— 元素与文案 100% 符合本规格，零过度设计；
- **`PM_SIGN_OFF: REJECT`** —— 逐条列出越权添加的元素或篡改的文案位置，责令立即整改。

— 产品经理 许清楚
