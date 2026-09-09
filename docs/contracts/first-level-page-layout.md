---
title: "OmniMux 全局插件一级页 UI 布局结构方法论与开发规范"
id: "contract-first-level-page-layout"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-08-31"
authors: ["x", "agent-architect"]
subsystem: "omnimux-assets"
---

# OmniMux 全局插件一级页 UI 布局结构方法论与开发规范

> **规范级别**：**强制 (MANDATORY)** —— 所有 OmniMux 插件一级页（工作台 Tab：项目库、资产中心、Skill 市场、商品中心、账号矩阵等；座见 [workbench-split.md](./workbench-split.md)）必须严格遵循此方法论。根节点填满右栏，禁止 `position:fixed` 盖会话。  
> **设计真源**：对齐「项目库」、「资产中心」、「Skill 市场」三张核心业务页的共同视觉与交互骨架。  
> **形态定界 / 豁免 / 整改批次**：先读 [`client-ui-remediation.md`](./client-ui-remediation.md)。未归类的一级页默认按标准 4 层资产库执行，不得事后用「特异」逃检。  
> **金标实现**：`plugins/omnimux-assets/src/client/AssetsStage.jsx`。Layer 3A Tab 必须用 `dsh-ui-kit` `Button role="tab"`，禁止裸 `<button>`。
> **文案与微文案契约**：严格遵循《OmniMux 全局 UI 命名与微文案规范》（`docs/contracts/ui-copywriting-and-naming-standards.md`），所有 Filter Chips 与下拉首项唯一指定为 `全部`，禁止出现 `所有类型`、`全部平台` 等冗余命名。

---

## 一、 核心页面共同点解构（The Common DNA）

通过对比 **「项目库」**、**「资产中心」**、**「Skill 市场」**，可以提炼出 5 个高度一致的 UI 骨架共同点：

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. 页面头部区 (Header)                                                                      │
│   [ 大标题 H1 (24-28px Bold) ]                                         [ (可选) 业务插画 ]  │
│   [ 业务叙事副标题 (13-14px 灰字) ]                                                          │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. 独立动作行 (Action Row - 紧贴副标题下方，左对齐)                                           │
│   [ ✦/＋ 主新建/核心动作 (黑胶囊高亮) ]   [ 📖/⤓ 次级操作/教程/导入 (白底边框胶囊) ]             │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. 维度导航与过滤工具栏 (Nav & Facet Toolbar)                                                │
│   (A. 可选顶层 Tab 下划线)   【 本地项目 / 资产 】    共创项目 / 协作                         │
│   (B. 分类过滤 Chip 胶囊)   [全部]  角色  场景  风格包  道具  自定义                                  │
│                                                                                             │
│   ────── 靠左：业务属性过滤 ──────                 ────── 靠右：工具簇 ──────              │
│                                                   [ 🔍 搜索输入框 (Pill) ] [ 排序下拉 ∨ ] [▦][☰]│
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. 响应式内容流 (Content Stream)                                                            │
│   - 网格模式：minmax(220-280px, 1fr) 悬浮卡片（封套立体感 / 缩略图 / 状态 Badge / 底部动作） │
│   - 列表模式：单行表头数据表格 (Table Row / Checkbox 批量操作)                               │
│   - 状态插槽：加载态 (Loading...) / 居中空态引导 (Empty State with Action)                    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3 页元素对照映射表

| 层次/功能区 | ① 项目库 (Project Library) | ② 资产中心 (Asset Center) | ③ Skill 市场 (Skill Hub) | 全局抽象规范标准 |
|:---|:---|:---|:---|:---|
| **Layer 1: 标题区** | **项目库**<br>整理创作页面、管理项目资产，集中呈现项目内容 | **资产中心**<br>沉淀可复用的角色、场景、风格包、道具等素材，在新的创作页空间中快速调用 | **Skill**<br>发现、安装并管理 Skill，扩展 MiniMax Design 的创作能力 | **H1 标题 + 业务价值副标题**（右侧允许放 3D 业务吉祥物/插画或关闭/刷新按钮） |
| **Layer 2: 动作行** | `[ + 新建项目 ]` (主)<br>`[ 📖 查看教程 ]` (次) | `[ + 添加资产 ]` (主)<br>`[ ⤓ 导入资产包 ]` (次) | `[ ✦ 通过 Design 创建 ]` (主)<br>`[ + 安装 Skill ]` (次) | **独立操作行**：左对齐，主动作（黑胶囊）+ 次动作（Outline 胶囊） |
| **Layer 3A: 顶层 Tab** | `本地项目` (下划线高亮) · `共创项目 ☁` | *(单维度业务，省略 3A)* | `Skill ⓘ` (下划线高亮) · `我的 Skill` | **业务主分类 Tab**（可选，当存在本地/云端或广场/我的时候使用下划线激活样式） |
| **Layer 3B: 分类 Chips** | *(由 3A 承载)* | `[全部]` `角色` `场景` `风格包` `道具` `自定义` | `[全部]` `精选` `短剧漫剧` `专业影视` `动画` `商业广告` … | **单行 Filter Chips**：靠左排列，第一个为 `全部`（浅灰底色胶囊高亮） |
| **Layer 3C: 右侧工具簇** | `[ 🔍 搜索项目 ]` + `[ 最近更新 ∨ ]` | `[ 🔍 搜索资产 ]` + `[ 最近更新 ∨ ]` + `[▦][☰]` | `[ 🔍 搜索 Skill... ]` | **右对齐工具集群**：搜索输入框（Pill/220px）+ 排序下拉 + 视图切换按钮组 |
| **Layer 4: 内容区** | 叠层立体文件夹卡片 (Project Card) | 媒体预览 + 属性 Badge 资产卡片 / 表格 | 卡片网格 / 加载骨架屏 | **Grid / List 双模自适应内容流** |

---

## 二、 全局一级页布局方法论（The "4+1" Tier Architecture）

每个 DSH/OmniMux 一级页的 JSX 结构必须严格按以下 4 层结构组织：

### 1. 结构骨架代码模板 (Template)

```jsx
import { Button, DropdownSelect, FilterBar, IconButton, SearchField } from 'dsh-ui-kit'

export function StandardStage({ t, stage, ...props }) {
  const [activeTab, setActiveTab] = useState('local')
  const [filterType, setFilterType] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('updated_at')
  const [viewMode, setViewMode] = useState('grid')

  return (
    <div className="omnimux-stage" data-visible={open ? 'true' : 'false'}>
      {/* ── Layer 1: Page Header ───────────────────────── */}
      <header className="omnimux-stage-header">
        <div className="omnimux-stage-heading">
          <h1 className="omnimux-stage-title">{t('stage.title')}</h1>
          <p className="omnimux-stage-subtitle">{t('stage.subtitle')}</p>
        </div>
        <div className="omnimux-stage-header-actions">
          {/* 右侧辅助控制：刷新 / 关闭 */}
          <IconButton variant="ghost" size="sm" onClick={refresh}><RefreshIcon /></IconButton>
          <IconButton variant="ghost" size="sm" onClick={() => stage.set(false)}><CloseIcon /></IconButton>
        </div>
      </header>

      {/* ── Layer 2: Action Row (独立操作行) ─────────────── */}
      <div className="omnimux-stage-action-row">
        <Button variant="primary" leadingIcon={<PlusIcon />} onClick={handleCreate}>
          {t('action.primary')}
        </Button>
        <Button variant="outline" leadingIcon={<SecondaryIcon />} onClick={handleSecondary}>
          {t('action.secondary')}
        </Button>
      </div>

      {/* ── Layer 3A: (可选) 业务主分类 Tab —— 必须 kit Button，禁止裸 <button> ── */}
      {hasTopTabs ? (
        <div className="omnimux-stage-tabs" role="tablist">
          <Button
            role="tab"
            variant={activeTab === 'local' ? 'secondary' : 'ghost'}
            size="sm"
            aria-selected={activeTab === 'local'}
            onClick={() => setActiveTab('local')}
          >
            {t('tab.local')}
          </Button>
          <Button
            role="tab"
            variant={activeTab === 'cloud' ? 'secondary' : 'ghost'}
            size="sm"
            aria-selected={activeTab === 'cloud'}
            onClick={() => setActiveTab('cloud')}
          >
            {t('tab.cloud')}
          </Button>
        </div>
      ) : null}

      {/* ── Layer 3B & 3C: Single-Row FilterBar ─────────── */}
      <FilterBar
        className="omnimux-stage-toolbar"
        compact
        // 靠左：Filter Chips
        filters={categories.map((cat) => (
          <Button
            key={cat.key}
            variant={filterType === cat.key ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={filterType === cat.key}
            onClick={() => setFilterType(cat.key)}
          >
            {cat.label}
          </Button>
        ))}
        // 靠右：搜索 + 排序 + 视图切换
        tools={(
          <div className="omnimux-stage-tools-cluster">
            <SearchField
              value={query}
              placeholder={t('search.placeholder')}
              debounceMs={0}
              onValueChange={setQuery}
            />
            <DropdownSelect
              value={sortKey}
              options={sortOptions}
              onChange={setSortKey}
            />
            <div className="omnimux-stage-view-toggle">
              <IconButton variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="xs" onClick={() => setViewMode('grid')}>
                <GridIcon />
              </IconButton>
              <IconButton variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="xs" onClick={() => setViewMode('list')}>
                <ListIcon />
              </IconButton>
            </div>
          </div>
        )}
      />

      {/* ── Layer 4: Main Content Area ──────────────────── */}
      <main className="omnimux-stage-body">
        {loading ? <LoadingIndicator /> : (
          <ContentGrid
            items={visibleItems}
            viewMode={viewMode}
            onOpen={handleOpen}
            emptyState={<EmptyGuide onAction={handleCreate} />}
          />
        )}
      </main>
    </div>
  )
}
```

---

## 三、 五条强制性交互与视觉准则 (Golden Rules)

### 1. 严格禁止把「主 CTA」塞入 FilterBar 搜索行
- **红线**：主创建动作（如 `+ 新建项目` / `+ 添加资产`）**绝对不可**放在搜索框旁边挤在一行。
- **必须**：副标题下方单独开辟 `Action Row`，左对齐排列，确保用户进入页面第一视觉焦点就是主创动作。

### 2. 工具栏单行严格对齐（左属性过滤，右搜索工具）
- **左边**：必须且仅承载**业务维度的 Filter Chips**（`全部` + 各业务类型），不准放输入框。
- **右边**：固定收敛为**工具集群（SearchField + DropdownSelect + ViewToggle）**，从右向左紧凑排列。
- **几何限制**：整个工具栏固定高度 `44px–48px`，`white-space: nowrap`，严禁换行折叠。

### 3. 标准控件与 0 原生裸标签红线
- 严禁在 React 视图层书写原生 HTML `<button>`、`<input>`、`<select>`。
- 必须 100% 消费 `dsh-ui-kit`（`Button`, `IconButton`, `SearchField`, `DropdownSelect`, `FilterBar`, `ModalDialog`）。
- 图标按钮必须传 `aria-label` 和 `aria-pressed`。

### 4. 100% 遵循 Theme Token 体系
- 所有色值、边框、背景一律使用 `var(--dsw-alias-*, fallback)`。
- 主按钮使用 `--dsw-alias-brand-primary` / `--dsw-alias-label-primary`，悬浮使用 `--dsw-alias-interactive-bg-hover`。
- 严禁在 CSS 中硬编码 `rgba(0,0,0,0.x)` 或 `#hex`。

### 5. 分阶段验证与 Dev 物化
- UI 布局调整先在隔离 worktree 完成相关自动化/静态检查和独立评审，经 required CI/MQ 合入后，从已合并 `main` 通过[正式同步入口](ops-entry.md)物化 Dev；没有合入前独立 App/Host 环境。
- Client 物化后刷新指定 Dev 页面，在 45120 使用 ego-browser 与共享 `verify:live` 验收；Host 变更须按[开发环境合同](dev-pipeline.md)重新加载目标进程。不得默认强杀桌面进程或写 Prod。
