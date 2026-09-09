# dsh-publish 五段式一级页布局架构（PRD-v2.3）

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 独立环境、旧 `dev start` 与合入前浏览器验收要求退役，产品和布局层级不变。当前流程见 [dev-pipeline](../../../docs/contracts/dev-pipeline.md) 和 [plugin-qa](../../../docs/contracts/plugin-qa.md)：worktree 自动化/静态与独立评审 → required CI/MQ → main → 按需 Dev 45120/ego 验收。历史结果不重标。

架构：高见远 ／ 输入：主理人「五段式 UI 布局架构核对」+ PRD-v2.3 + 资产中心真实现 + 一级页合同
版本观察：Harness Slot Catalog `shell.overlay` list / 产品树 `omnimux-assets` 为视觉同构真源
核对日期：2026-08-25

> **v2.4 覆盖条**：四层壳 / 五 Tab / 三视图 **不动**。Table 列合同改为 14 列（8 维指标空槽 + ⋮），状态 pill 走中文单真源。详见 `docs/architecture-ui-table-v2.4.md`。

---

## 0. 选型结论（一句话可执行）

**挂载点 = `ctx.slots.inject("shell.overlay")` id `dsh-publish-stage`，形态 = 函数插件（Host/Client 双半边不变），产物 = dsh.bundle。**

本轮只重构一级页 Client 壳层（4 层布局 + 舞台内 Drawer/Composer），不新开工具、不新开 Service、不换 Slot、不混用 `cordis_define`。

---

## 1. 归属映射（逐项排除 → 唯一选型）

| 候选 | 裁决 | 理由 |
|---|---|---|
| 新模型可见工具 `ctx.tools` | **否** | 布局不进入 system prompt；列表仍走既有 `publish_list_records` / `GET /dsh-publish/records`。 |
| 新用户命令 `ctx.commands` | **否** | 无新命令语义。 |
| 后台任务 `ctx.jobs` | **否** | 账本仍在 `records.json`；submit 后台通道已存在。 |
| 会话事件 waterfall / serial | **否** | 无新增模型可见输入。 |
| 对外 Service 三层 | **否** | 不对外提供布局服务。 |
| LLM 适配器 | **否** | 与模型提供方无关。 |
| 新 Client Slot / 替换 `sidebar` / `conversation.view` | **否** | 一级页合同座是 `shell.overlay`；`conversation.view` 会留下会话头和 composer。 |
| 官方 `details` 列 / `layout.openDetails` | **否** | 官方 details 被对话详情占用；详情走舞台内 Drawer。 |
| 改官方 `packages/` 或另起插件 | **否** | 官方包只读；发布中心已是 `personal/dsh-publish` Mixed bundle。 |
| 会话内 `cordis_define` 动态包 | **否** | 本包已是可安装 `dsh.bundle`，两套产物严禁混用。 |
| 抄商品中心「FilterBar 右侧塞主 CTA」 | **否** | 那是 v2.3 明确作废的旧 IA；商品中心本身尚未对齐 4 层合同。 |
| **既有 overlay 内按资产中心 4 层骨架重构 PublishStage** | **是** | 可卸载（fiber 自动撤销 Slot/locale/CSS）、可组合（不抢别人 overlay id）、升级不翻车（Host 契约不变）。 |

被否决后的唯一可执行句：**不改 Host 装配；Client 把 `PublishStage` 改成资产中心同构的 4 层壳，Drawer/Composer 作为舞台内 Layer 5 浮层。**

---

## 2. 四层合同 ↔ 五段视觉（不要做成 5 个 DOM 层）

官方强制是 **4 层**（`docs/contracts/first-level-page-layout.md` + 根 `AGENTS.md`）。用户截图口径的「标题 / 描述 / 操作行 / 控制栏 / 内容区」= Layer 1 拆成 Title+Description。Drawer 与 Composer **不是** 第 5 个页面层，是舞台内浮层，关掉后 4 层壳还在。

```
PublishStage  (shell.overlay #dsh-publish-stage)
│
├── Layer 1 · Page Header          ← 用户 Layer 1 Title + Description
│     H1 22px/700 + 副标题 13px 浅灰     右侧 Refresh / Close IconButton
│
├── Layer 2 · Action Row           ← 用户 Layer 2 Action Bar
│     [+ 新增发布 primary] [批量管理 outline] [导出 outline]
│
├── Layer 3 · FilterBar            ← 用户 Layer 3 Control Bar
│     左 Status Tabs（secondary/ghost chip）
│     右 SearchField + 排序 + 作品类型 + 发布模式 + 视图切换
│
├── Layer 4 · Content Viewport     ← 用户 Layer 4
│     Grid 卡片  |  Table 列表  |  Calendar 月网格   （三视图互斥）
│     空态 / 错态 / 批量底栏 都在本层
│
└── Layer 5 · 舞台内浮层（不占文档流）
      Drawer 右侧 320px（对齐资产中心 AssetDetail）
      Composer 用 ModalDialog 覆盖舞台，禁止卸掉 4 层壳
```

**红线（Golden Rules，抄资产中心）：**

1. 主 CTA **绝对不可**放进 Layer 3。当前实现把 `+ 新建发布` 放在 header 右侧，属合同违约，必须拆到 Layer 2。
2. 业务 Tab **绝对不可**放进 Header。当前 `dsh-pub-tabs` 在标题下方独占一行，必须迁入 FilterBar 左侧。
3. 严禁 raw 可见 `<button>` / `<select>` / `<input>`。当前 Tab 是手写 `<button class="dsh-pub-tab">`，必须改 `dsh-ui-kit` `Button`。
4. 零 inline style 色值；色/边/字一律 `var(--dsw-alias-*, fallback)`。舞台定位只允许 CSS 变量 `--stage-top/left/width/height`。
5. 控件高 32px，FilterBar 单行 44–48px，`flex-wrap: nowrap`。圆角跟 kit：控件 8px，卡片 12px，弹窗 16px。**禁止**为了「截图里的胶囊」把按钮改成 `border-radius: 999px`（`ui-design-guidelines.md` 明确禁混用 999 与 8）。

---

## 3. 视觉真源：对齐资产中心，而不是发明第二套皮肤

截图语言（「黑胶囊 / 白描边胶囊 / 药丸 Tab / 搜索胶囊」）翻译成 **kit + token**，数值锁死为资产中心实现，而不是 24px+/14px 的口头约数。

| 元素 | 口头/截图口径 | 落地（抄 `omnimux-assets`） | 禁止 |
|---|---|---|---|
| 舞台底 | 纯白/轻浅 | `background: var(--dsw-alias-bg-base)` | 自绘灰底、渐变 |
| 标题 | 24px+ | **22px / 700 / line-height 30px / letter-spacing -0.01em** | 16px 旧标题（现状） |
| 副标题 | 14px 浅灰 | **13px / 20px / `var(--dsw-alias-label-secondary)`** | 省略副标题（现状） |
| Header 右 | 刷新+关闭 | `IconButton variant="ghost" size="sm"` ×2 | 主题切换、扫码、客服、外链、铃铛；**主 CTA 也不在这里** |
| 顶距 | 一级页契约 | Header `padding: 16px 20px 8px`（资产中心实值）；Action Row `8px 20px 14px`；整体仍 `no-drag`，**不加 44/56px 躲拖拽带** | 自造第二套顶距 |
| 主按钮 | 黑实心胶囊 | `Button variant="primary"`，高 32px，圆角 **8px**，填充 `var(--dsw-alias-button-primary-fill)`（浅色=近黑，深色=近白，x.ai 桥接已处理） | 手写 hex 黑、`border-radius: 999px` |
| 次按钮 | 白底浅灰线框胶囊 | `Button variant="outline"`，同高同圆角，`border-color: var(--dsw-alias-border-l2)` | raw `<button>`、ghost 冒充次按钮 |
| Status Tab | 黑实心小药丸 | `Button size="sm" variant={active ? "secondary" : "ghost"}` + `aria-pressed`。激活是浅底+描边高亮，**不是**黑实心（黑实心留给主 CTA，避免两个「最重」控件抢焦点） | 手写 `.dsh-pub-tab`、下划线大 Tab、Header 居中 Tab |
| 搜索 | 胶囊+放大镜 | `SearchField`（kit 自带 `IconSearchOutline16`），宽 200–260px（wrap `220px` 同资产），`debounceMs={250}`，圆角 **8px** | 自绘 input、emoji 🔍 |
| 排序/筛选 | 下拉 | `DropdownSelect`（禁止原生 `<select>`） | 系统蓝白菜单 |
| 视图切换 | 网格/列表/日历 | 三段 `IconButton size="xs"` 包在 `dsh-pub-view-toggle` 里，几何抄 `.omnimux-assets-view-toggle`（8px 圆角、2px 内垫、layer-1 底） | 文字三段按钮挤工具栏 |
| Grid 卡 | 现代卡片 | 见 §5.4 | 现状「小缩略图横排 + padding 12 的扁卡片」 |

参考实现路径（只读，不要改资产中心）：

- 结构：`product/omnimux-dsh/plugins/omnimux-assets/src/client/AssetsStage.jsx`
- 几何：`.../omnimux-assets/src/client/styles.js`（header / action-row / toolbar / card / detail）
- 合同测试样板：`.../omnimux-assets/src/client-layout.test.js`
- FilterBar 标准模式：`filters` 在左、`tools` 在右。`personal/dsh-ui-kit/src/toolbar/Toolbar.tsx` 在 `filters + tools` 且不传 `search`/`actions` 时走 Standard mode。

---

## 4. 架构图（文字版层级）

```
dsh-publish（既有 Mixed bundle，装配不变）
├── Host（本轮原则上不动）
│   ├── apply(ctx) 函数插件
│   ├── inject = ['tools', 'systemPrompt']
│   ├── ctx.tools × 9 publish_*     （fiber 卸载自动撤销）
│   ├── webServer prefix /dsh-publish
│   └── RecordStore records.json
│         已有 status_filter: draft | submitted | reviewing | published | failed | all
│         本轮仅允许：tabCounts() 补 published / retry 计数（见任务 2）
│
└── Client
    ├── inject = ['slots', 'locale']
    ├── ctx.locale.register('dsh-publish')
    ├── ctx.effect(ensureCss)          ← 根类名隔离，卸载摘 style
    ├── sidebar extra row（既有 coordinator，不自挂 observer）
    └── ctx.slots.inject('shell.overlay')
          id: dsh-publish-stage
          order: 22
          组件: PublishStage
          ├── Layer 1 Header
          ├── Layer 2 Action Row
          ├── Layer 3 FilterBar
          ├── Layer 4 Viewport (Table | Grid | Calendar)
          └── Layer 5 Drawer + Composer Modal
```

数据流（展示仍遵守 architecture-ui-slim.md，本轮不改真源）：

```
records.json ──GET /dsh-publish/records?status=<tab>──┐
GET /dsh-publish/state → counts                       ├─→ ViewModel
GET /omnimux/accounts（只读 join，不进 Table 列）─────┘
```

---

## 5. 扩展点 / 挂载点清单

| 挂载点 | 作用 | 清理方式 |
|---|---|---|
| `ctx.slots.inject('shell.overlay')` id `dsh-publish-stage` | 一级产品舞台 | Slot 注册随 fiber 自动撤销 |
| `window.__omnimuxSidebar.register` id `dsh-publish-entry` | 新会话下方入口 | `ctx.effect(mountSidebarEntry)` disposer |
| `ctx.locale.register('dsh-publish')` | 中英文案 | `ctx.effect` disposer |
| `ensureCss()` → `<style id="dsh-publish-style">` | 舞台 CSS，根类名 `.dsh-pub-*` | `ctx.effect` 摘节点 |
| `ctx.tools` × 9 `publish_*` | 模型面（本轮不改签名） | 工具注册随 fiber 撤销 |
| `webServer` `/dsh-publish` | UI HTTP 同源面 | Host `ctx.effect(mount)` |
| `localStorage['dsh-publish-view']` | 视图记忆（table/cards/calendar） | 卸载不强制清；key 带插件前缀避免污染 |
| **禁止** `layout.openDetails` | — | 详情只走舞台内 Drawer |
| **禁止** `conversation.view` | — | 会留下会话头 |
| **禁止** 插件自挂 MutationObserver | — | 侧栏只 register 一次 |

Layer 5 不是 Slot，是 overlay 组件树内部状态：

| 内部表面 | 打开 | 关闭 | 清理 |
|---|---|---|---|
| Detail Drawer | 点 Table 行 / Card / 日历 pill | ✕ / backdrop / Esc | `setDetail(null)`，不改 Slot |
| Composer Modal | Layer 2 `+ 新增发布` 或草稿「继续编辑」 | 取消 / 提交成功后关 | 不 `return null` 卸 4 层壳；关页仍 `data-visible=false` 保活 |

---

## 6. Config 字段表

Host `Config`（`src/config.js`）本轮 **不改既有字段语义**。布局可调参数新增 `ui` 段，坏值在 `parsePublishConfig` 响亮失败，不写死在 JSX。

| 字段 | 类型 | 默认 | 约束 | 用途 |
|---|---|---|---|---|
| `dataDir` | string? | 空 | 可选路径 | 既有 |
| `accountsOverlayPath` | string? | 空 | 可选路径 | 既有 |
| `platforms` | object | `BUILTIN_PLATFORMS` | 深合并 | 既有能力矩阵 |
| `statusMap` | object | `BUILTIN_STATUS_MAP` | value ∈ submitted/reviewing/published/failed | 既有 |
| `maxMediaMb` | number | 512 | >0 | 既有 |
| `submitTimeoutSeconds` | number | 120 | >0 | 既有 |
| **`ui.defaultView`** | `'table' \| 'cards' \| 'calendar'` | `'table'` | 枚举外失败 | 无 localStorage 时的首屏视图 |
| **`ui.searchDebounceMs`** | number | 250 | ≥0 整数 | SearchField `debounceMs` |
| **`ui.weekStartsOn`** | `'sun' \| 'mon'` | `'sun'` | 枚举外失败 | 日历周起始 |
| **`ui.allTabIncludesDrafts`** | boolean | `false` | 必须 boolean | `all` Tab 是否含草稿。PRD §2.4.1 默认假设不含；Host `status_filter=all` 当前 `return true`（含草稿），**Client 在 false 时改打 `submitted`**，避免改 Host 谓词引发工具面回归 |

视图记忆：`localStorage['dsh-publish-view']` 覆盖 `ui.defaultView`。非法值回落默认，不抛到页面。

---

## 7. 各层编码规格（给林深）

### 7.1 模块切分（按依赖）

```
src/client/
  PublishStage.jsx          只组 4 层壳 + 浮层开关，不写过滤谓词
  chrome/
    StatusTabs.jsx          Layer 3 左
    ToolsCluster.jsx        Layer 3 右
  views/
    RecordsTable.jsx        Layer 4 table
    RecordsGrid.jsx         Layer 4 cards（重画，对齐资产卡）
    RecordsCalendar.jsx     Layer 4 calendar
  RecordDetail.jsx          Layer 5 Drawer（改右侧栏，不再整页替换）
  Composer/index.jsx        Layer 5 Modal（包进 ModalDialog）
  styles.js                 几何抄资产中心，类名前缀 dsh-pub-
  locales.js                补齐 v2.3 文案 key
```

`PublishStage` 继续 `useSyncExternalStore(stage.subscribe, stage.getSnapshot)`，关页 `data-visible=false` 保活，禁止 `if (!open) return null`。

### 7.2 Layer 1 Header

```jsx
<header className="dsh-pub-stage-header">
  <div className="dsh-pub-stage-heading">
    <h1 className="dsh-pub-stage-title">{t('stage.title')}</h1>
    <p className="dsh-pub-stage-subtitle">{t('stage.subtitle')}</p>
  </div>
  <div className="dsh-pub-stage-controls">
    <IconButton variant="ghost" size="sm" aria-label={t('stage.refresh')} onClick={refresh}><RefreshIcon /></IconButton>
    <IconButton variant="ghost" size="sm" aria-label={t('stage.close')} onClick={() => stage.set(false)}><CloseIcon /></IconButton>
  </div>
</header>
```

文案锁定：

- `stage.title` = `内容发布中心`（替换现状「多渠道发布中心」）
- `stage.subtitle` = `统一管理多平台社媒内容分发、定时排期与状态追踪，提升矩阵运营效率`

CSS 锁（从资产中心逐字对齐）：

```
.dsh-pub-stage-header { display:flex; align-items:flex-start; gap:12px; padding:16px 20px 8px; }
.dsh-pub-stage-title { margin:0; font-size:22px; font-weight:700; line-height:30px; letter-spacing:-0.01em; }
.dsh-pub-stage-subtitle { margin:4px 0 0; font-size:13px; line-height:20px; color: var(--dsw-alias-label-secondary); }
```

### 7.3 Layer 2 Action Row

```jsx
<div className="dsh-pub-action-row">
  <Button variant="primary" leadingIcon={<PlusIcon />} onClick={openComposer}>{t('action.create')}</Button>
  <Button variant="outline" onClick={toggleBatch}>{t('action.batch')}</Button>
  <Button variant="outline" onClick={exportCsv}>{t('action.export')}</Button>
</div>
```

- 文案：`+ 新增发布` / `批量管理` / `导出`
- 批量管理只切换 Layer 4 的选择模式，不改 Layer 2 位置
- 导出：当前过滤结果 CSV，列 `ID, Title, Type, Platforms, Date, Status, Mode`，UTF-8 BOM；禁止 Profile / Likes / Views
- CSS：`padding: 8px 20px 14px; gap: 10px; align-items:center;` 与资产中心 `.omnimux-assets-action-row` 一致

### 7.4 Layer 3 FilterBar

```jsx
<FilterBar
  className="dsh-pub-stage-toolbar"
  compact
  filters={STATUS_TABS.map((tab) => (
    <Button
      key={tab.key}
      variant={statusTab === tab.key ? 'secondary' : 'ghost'}
      size="sm"
      aria-pressed={statusTab === tab.key}
      onClick={() => setStatusTab(tab.key)}
    >
      {tab.label}
    </Button>
  ))}
  tools={(
    <div className="dsh-pub-tools-cluster">
      <div className="dsh-pub-search-wrap">
        <SearchField value={query} placeholder={t('search.placeholder')} debounceMs={debounce} stretch onValueChange={setQuery} />
      </div>
      <DropdownSelect value={sortKey} options={sortOptions} onChange={setSortKey} />
      <DropdownSelect value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
      <DropdownSelect value={modeFilter} options={modeOptions} onChange={setModeFilter} />
      {/* 平台下拉：账号面无数据则整颗隐藏 */}
      <div className="dsh-pub-view-toggle">
        <IconButton variant={view==='table'?'secondary':'ghost'} size="xs" aria-pressed={view==='table'} aria-label={t('view.table')} onClick={() => setView('table')}><ListIcon /></IconButton>
        <IconButton variant={view==='cards'?'secondary':'ghost'} size="xs" aria-pressed={view==='cards'} aria-label={t('view.cards')} onClick={() => setView('cards')}><GridIcon /></IconButton>
        <IconButton variant={view==='calendar'?'secondary':'ghost'} size="xs" aria-pressed={view==='calendar'} aria-label={t('view.calendar')} onClick={() => setView('calendar')}><CalendarIcon /></IconButton>
      </div>
    </div>
  )}
/>
```

**不要**同时传 `search` + `tools` + `actions`：kit 在 `filters && search && tools==null && actions` 时会落入 Classic 模式（搜索跑到左边、CTA 跑到右边），正好踩回 v2.3 红线。搜索放进 `tools` 集群即可。

Tab → Host `status` 查询参数：

| Tab key | 文案 | Host `status` | 计数 |
|---|---|---|---|
| `all` | 全部记录 | `ui.allTabIncludesDrafts ? 'all' : 'submitted'` | `counts.submitted`（默认）或 `counts.total` |
| `drafts` | 草稿箱 (N) | `draft` | `counts.draft`，N=0 仍显示 |
| `reviewing` | 审核中 | `reviewing` | `counts.reviewing` |
| `published` | 已发布 | `published` | 需 `tabCounts()` 补 `published` |
| `retry` | 失败待重试 | `failed` | 需 `tabCounts()` 补 `failed`（含 partial_failed，因 Host 谓词是「存在 failed 子任务」） |

排序选项：`最近更新` (`updated_at` desc) / `最早创建` (`created_at` asc) / `发布时间`（Date 规则同 PRD §3.1）。默认最近更新。

作品类型：`全部` / `图文` (`image`) / `视频` (`video`)。发布模式：`全部` / `定时发布` / `即时发布`（只读派生 `settings.schedule_at`）。

工具栏 CSS：`padding: 0 20px 12px; height: 44px;`；search wrap `220px`；tools cluster `display:flex; gap:8px; align-items:center; flex-shrink:0`。溢出时先藏可选「平台」下拉，禁止折行。

### 7.5 Layer 4 Viewport

三视图互斥，容器 `.dsh-pub-body`：`flex:1; min-height:0; overflow:auto; padding:16px;`（资产中心 main 是 16px）。

**Grid 卡片（本轮视觉重点，重画现状扁卡）：**

```
┌─────────────────────────────┐
│  等比例封面 object-fit:cover │  高 112px（资产卡）
│                     [图文]  │  右上类型胶囊 11px/999 圆角
│                     [1/N]   │  多图角标仅图文且 media_ids>1
├─────────────────────────────┤
│ 标题 14/20 单行省略          │
│ 平台簇 · 时间 · 模式         │  12px secondary
│                      [⋯][✎] │  右下 IconButton xs，点按 stopPropagation
└─────────────────────────────┘
```

- 网格：`repeat(auto-fill, minmax(220px, 1fr)); gap:12px;`
- 卡：`border 1px solid var(--dsw-alias-border-l2); border-radius:12px; overflow:hidden;`
- 类型胶囊文案用「图文 / 短视频」，**禁止 emoji**（`ui-design-guidelines.md`）
- 快捷操作：草稿=编辑+删除；已提交=打开抽屉+（失败则重试）。图标走 primitives / lucide SVG
- 点击卡打开 Drawer；草稿点编辑打开 Composer
- **禁止** 8 格指标、profile-cell、Likes/Views

**Table：** 列闭合 14 列 `[ ] | Content | Platforms | Date | Status | Likes | Cmts | Shrs | Saves | Clicks | Views | Impr. | Reach | ⋮`（合同见 `architecture-ui-table-v2.4.md` §4）。行高 48–56px。`scheduled` 不是 Status pill，Date 旁用 Clock SVG。账号信息不进列。8 维指标单元格恒为居中 `-`（无真源诚实空槽）；禁止假数字。行末 ⋮ 按状态显隐四动作。

**Calendar：** 月网格控制条落在 Layer 4 顶，不占 Layer 3。今日强调用 `var(--dsw-alias-state-error-primary)` 边框（截图红框语义，token 化）。pill 禁止互动指标。单元格 min-height 110px，超过 2 条 `+N more`。

空态：居中虚线框 12px 圆角（抄 `.omnimux-assets-empty`）+ 可点「+ 新增发布」。加载中禁止闪空态。错态顶部错误条，保留上次成功列表。

批量底栏：仅 `batchMode` 时出现在 Layer 4 顶（抄 `.omnimux-assets-selection`），可批量删草稿 / 批量重试失败子任务。

### 7.6 Layer 5 Drawer & Composer

- Drawer 宽度 320px，左边框 `var(--dsw-alias-border-l2)`，与 `.omnimux-assets-detail` 同构；区块闭合见 PRD §3.5
- Composer 用 `ModalDialog`（kit），size 覆盖主舞台；提交成功关 Modal 并打开对应 Drawer
- 两者都禁止调用 `layout.openDetails`
- 关页保活：Composer/Drawer 开着时关掉舞台，再打开应回到列表（避免幽灵 Modal）

### 7.7 Token 速查（只准用这些）

| 用途 | Token |
|---|---|
| 舞台/卡底 | `--dsw-alias-bg-base` |
| 输入/次级面 | `--dsw-alias-bg-layer-1` |
| 封面占位 | `--dsw-alias-bg-module-platform` |
| 发丝线 | `--dsw-alias-border-l2` / `--dsw-alias-border-l1` hover |
| 主字 | `--dsw-alias-label-primary` |
| 副字 | `--dsw-alias-label-secondary` |
| 占位/时间 | `--dsw-alias-label-tertiary` |
| 主按钮 | `--dsw-alias-button-primary-fill` / `--dsw-alias-button-primary-hover` / `--dsw-alias-label-primary-foreground` |
| 悬停 | `--dsw-alias-interactive-bg-hover` |
| 状态 | `--dsw-alias-state-success-primary` / `--dsw-alias-state-error-primary` / `--dsw-alias-state-warn-primary` |
| 焦点环 | `--dsw-alias-brand-primary` |

平台品牌色：先定义 `--dsh-pub-platform-<id>` 再引用，必须带 fallback。

---

## 8. 现状违约清单（实现自检，林深开工第一件事）

| # | 现状 | 合同要求 |
|---|---|---|
| 1 | Header 16px 单行标题，无副标题 | 22px H1 + 13px subtitle |
| 2 | `+ 新建发布` 在 Header 右侧 | 拆到 Layer 2，文案改为 `+ 新增发布` |
| 3 | 三 Tab 在 Header 下，raw `<button>` | 五 Tab 进 FilterBar 左，kit `Button` |
| 4 | 无 Action Row / 无 FilterBar / 无搜索排序筛选 | 按 §7.3–7.4 补齐 |
| 5 | 刷新藏在列表头 | Header 右 `IconButton` |
| 6 | 只有扁卡片，无 Table/Calendar/视图切换 | 三视图 + toggle |
| 7 | Composer/Detail 整页替换 `.dsh-pub-body` | Drawer 右侧栏 + Composer Modal，4 层壳常驻 |
| 8 | 标题文案「多渠道发布中心」 | 「内容发布中心」 |
| 9 | Tab 只有 records/drafts/reviewing | 加 published / retry |
| 10 | `tabCounts()` 缺 published/failed | Host 小补计数，不改过滤谓词语义 |

---

## 9. 任务清单

| 序号 | 任务 | 依赖 | 验证标准 |
|---|---|---|---|
| 1 | 抽 `PublishStage` 4 层壳：Header / Action Row / FilterBar / body，删 raw Tab 与 header CTA | 无 | 源码存在 `.dsh-pub-stage-header` `.dsh-pub-action-row` `<FilterBar`；`PublishStage.jsx` **无** `<button` / `<select`；主 CTA 不在 FilterBar `actions` |
| 2 | Host `tabCounts()` 补 `published` / `failed`；Client 五 Tab 映射 `status` 参数 | 1 | `GET /dsh-publish/state` 含四计数字段；点「已发布」只出 aggregate=published；点「失败待重试」只出 failed/partial_failed；`all` 默认不含草稿 |
| 3 | `locales.js` 补 stage/action/tab/search/sort/view key（中英 key 对齐）；标题改「内容发布中心」 | 1 | 窄窗口中英都不折 Header；缺 key 会在页面上露出 raw key，禁止 |
| 4 | Config 增 `ui.*` 四字段 + parse 失败用例 | 无 | `parsePublishConfig({ ui: { defaultView: 'kanban' } })` throw；默认值可加载 |
| 5 | ToolsCluster：SearchField 250ms + 三个 DropdownSelect + 三图标 ViewToggle；记忆 `dsh-publish-view` | 1, 4 | 工具栏桌面宽度单行 44px；无原生 select；切视图刷新后仍在 |
| 6 | 重画 `RecordsGrid` 对齐资产卡（等比例封面、右上类型胶囊、底栏标题/平台/时间、右下 IconButton） | 1 | 与资产中心卡并排截图：圆角 12、封面 112、徽章 top/right 8；无 emoji |
| 7 | `RecordsTable` 14 列合同 + 批量勾选；Date/Status 可排序；⋮ 行菜单 | 1, 2 | 有指标空槽 `-`、有 ⋮、无假数字；无 Profile 列；`scheduled` 不进 Status pill |
| 8 | `RecordsCalendar` 月网格 + Today + 周起始 + 今日强调框 + 无指标 pill | 4, 5 | 控制条在 Layer 4 内；`+N more`；Config `weekStartsOn` 生效 |
| 9 | Detail 改为右侧 Drawer 320px；Composer 改为 `ModalDialog`；关页再开回到列表 | 1, 6 | 打开抽屉时 Layer 1–3 仍在；Esc/backdrop 关闭；不调用 `layout.openDetails` |
| 10 | 导出 CSV（当前过滤结果，BOM + 闭列）+ 批量删草稿/重试 | 2, 7 | 文件头 `ID,Title,Type,Platforms,Date,Status,Mode`；无指标列 |
| 11 | 样式合同测试（抄 `client-layout.test.js`）+ token 扫描无裸 hex | 1–10 | `node --test` 断言 4 层 class、无 raw button、styles.js 无 `box-shadow: 0 1px 2px rgba(` 类裸阴影 |
| 12 | L2 Web 验视（`node scripts/omnimux.mjs dev start <task> dsh-publish`），**禁止**杀桌面进程 | 11 | 浅色/深色、窄窗、空态、五 Tab、三视图、Drawer、Composer 七张证据；`sync` 后 Cmd+R 生效 |

任务 2 是本轮唯一允许的 Host 触摸面（计数）。过滤谓词、工具 schema、账本字段一律不动。

---

## 10. 待工程师现场核对源码

- FilterBar Standard/Classic 分支以 `personal/dsh-ui-kit/src/toolbar/Toolbar.tsx` 当前文件为准；传参组合变了会把 CTA 吸回右侧。
- `IconButton` / `DropdownSelect` / `ModalDialog` 的具体 size 枚举以 kit `lib/index.d.ts` 为准。
- 日历图标若 primitives 无现成 Calendar，用 lucide SVG，禁止字符图标。
- `ui.allTabIncludesDrafts` 若产品改口要「全部含草稿」，只改 Config 默认，不改 Tab 结构。
