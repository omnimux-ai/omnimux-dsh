# dsh-ui-kit

DeepSeek Harness 插件共用 UI 包。扩容结构性组件与原子控件：Button / SearchField / InputField / Toolbar / FilterBar / Dialog / EmptyState / StageContainer / StageHeader / PageHeader / Tabs / StatBar / ActionRow，几何对齐 OmniMux 工作台（控件 32px，工具栏 44–48px），颜色 100% 消费官方 `--dsw-alias-*` / `--dsw-specific-*` Token。

这是 **共享组件库**，不是 Cordis 插件：没有 `dsh.bundle` / `cordis.patch.yml`。消费方（personal / product 插件的 Client bundle）把它打进自己的 `client.js`，并把 `react`、`react-dom`、`@deepseek-ai/dsh-client-ui-primitives` 保持 external。

## 设计约束与裁定真源

| 项 | 约定与裁定 |
|---|---|
| **一级 Stage 主标题** | **`20px / 600 / 28px`**（唯一真源：`design.md` §4.2 "Display / Page Title"） |
| **页头几何** | `padding: 12px 20px`、`min-height: 56px`、`border-bottom: none`、`-webkit-app-region: no-drag` |
| **副标题** | `13px / 400 / 18px`，色值 `var(--dsw-alias-label-secondary)` |
| **颜色** | 只写 `var(--dsw-alias-*)` / `var(--dsw-specific-*)`，**严禁 Hex / rgba 字面量** |
| **高度** | Button / Search / Input / DropdownSelect / Tabs = 32px；`sm` 28px；`xs` 24px |
| **圆角** | 基础控件 8px（`sm`/`xs` 6px）；Dialog 16px |
| **图标** | 官方 primitives `Icon*` 组件，**严禁 emoji / 字符图标** |
| **下拉** | 官方 `Menu`，**严禁裸 `<select>`** |
| **弹窗** | 官方 `Modal` 外壳 |
| **主题** | 跟随宿主 light / dark，靠 CSS 变量级联，**禁止任何 JS 主题切换或 filter 覆写** |

## 安装

```bash
pnpm add dsh-ui-kit@file:/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit
```

peer：`react`、`react-dom`、`@deepseek-ai/dsh-client-ui-primitives`（与宿主 ModuleLoader 共享，零冗余打包）。

消费方 tsdown / bundler 必须 external：

```ts
["react", "react-dom", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"]
```

## 组件 API

### 1. PageHeader & StageHeader

一级 Stage 顶栏标准页头。标题字号严格采用裁定真源 **`20px / 600 / 28px`**。
`StageHeader` 保持向后兼容（作为 `PageHeader` 的转发别名）。

```tsx
import { PageHeader } from 'dsh-ui-kit'

<PageHeader
  title="资产库"
  subtitle="管理平台关联的角色、场景与音色资产"
  badge={<span className="badge">34</span>}
  breadcrumb={<nav>首页 / 资产</nav>}
  tabs={{
    items: [
      { id: 'all', label: '全部' },
      { id: 'roles', label: '角色', badge: 12 },
      { id: 'scenes', label: '场景', badge: 22 },
    ],
    activeId: tabId,
    onChange: setTabId,
  }}
  actions={<Button variant="primary">新建资产</Button>}
  onRefresh={handleRefresh}
  refreshing={isRefreshing}
  onClose={handleClose}
/>
```

| Prop | 类型 | 说明 |
|---|---|---|
| `title` | `ReactNode` | 页面主标题（字号 `20px / 600 / 28px`；string 时自动渲染 `<h1>`） |
| `subtitle` | `ReactNode` | 次级描述文案（字号 `13px / 400 / 18px`） |
| `badge` | `ReactNode` | 紧跟标题的角标/计数器 |
| `breadcrumb` | `ReactNode` | 标题上方的面包屑导航 |
| `tabs` | `{ items, activeId, onChange }` | 顶部三段式分段器（嵌入式 Tabs） |
| `actions` | `ReactNode` | 右侧自定义操作区域（如主行动点按钮） |
| `onRefresh` | `() => void | Promise<void>` | 刷新回调（自动渲染 IconButton + IconRefreshOutline16） |
| `refreshing` | `boolean` | 刷新旋转态（自动切换为 IconLoadingOutline16 并禁用） |
| `refreshTitle` | `string` | 刷新按钮 Tooltip（默认 'Refresh'） |
| `onClose` | `() => void` | 关闭回调（自动渲染 IconButton + IconCloseOutline16） |
| `closeTitle` | `string` | 关闭按钮 Tooltip（默认 'Close'） |

---

### 2. Tabs

独立可复用的分段切换器。满足 `role="tablist"` / `role="tab"` / `aria-selected` 无障碍标准。

```tsx
import { Tabs } from 'dsh-ui-kit'

<Tabs
  items={[
    { id: 'overview', label: '概览' },
    { id: 'logs', label: '执行日志', badge: 'New' },
    { id: 'settings', label: '设置', disabled: true },
  ]}
  activeId={activeTab}
  onChange={setActiveTab}
  size="default" // 'default' (32px) | 'sm' (28px)
/>
```

| Prop | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `items` | `PageHeaderTabItem[]` | **必填** | 选项列表（含 id, label, badge, disabled） |
| `activeId` | `string` | **必填** | 当前选中的 Tab ID |
| `onChange` | `(id: string) => void` | **必填** | 切换选中项回调 |
| `size` | `'default' | 'sm'` | `'default'` | 高度规格（default 32px，sm 28px） |

---

### 3. StatBar

指标看板栏，供 accounts、analytics 等概览数据卡片消费。趋势图标强制消费官方 primitives `IconChevron*`。

```tsx
import { StatBar } from 'dsh-ui-kit'

<StatBar
  items={[
    {
      key: 'total',
      label: '总发布量',
      value: '1,248',
      trend: { direction: 'up', value: '+12.5%' },
      extra: '较上周同比',
    },
    {
      key: 'fail',
      label: '失败任务',
      value: '3',
      trend: { direction: 'down', value: '-2' },
      extra: '已自动告警',
    },
  ]}
/>
```

| Prop | 类型 | 说明 |
|---|---|---|
| `items` | `StatItem[]` | 指标项数组（key, label, value, trend, extra） |
| `trend.direction` | `'up' | 'down' | 'neutral'` | 趋势方向（自动绑定成功/错误/次级色彩与官方 Chevron 图标） |
| `trend.value` | `string` | 趋势文案（如 "+12%"） |

---

### 4. ActionRow

二级操作行容器，保持单行流不换行（`flex-wrap: nowrap`），支持左侧主次操作与右侧辅助操作。

```tsx
import { ActionRow, Button } from 'dsh-ui-kit'

<ActionRow
  primaryAction={<Button variant="primary">批量导出</Button>}
  secondaryActions={<Button variant="secondary">重试失败项</Button>}
  rightActions={<Button variant="ghost">查看帮助</Button>}
/>
```

| Prop | 类型 | 说明 |
|---|---|---|
| `primaryAction` | `ReactNode` | 左侧主行动点 |
| `secondaryActions` | `ReactNode` | 左侧次级操作项 |
| `rightActions` | `ReactNode` | 右侧操作项（自动应用 `margin-left: auto`） |

---

### 5. Button / IconButton

```tsx
import { Button, IconButton } from 'dsh-ui-kit'
import { IconPlusOutline16, IconRefreshOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

<Button variant="primary" leadingIcon={<IconPlusOutline16 />} loading={saving}>
  保存
</Button>

<IconButton aria-label="刷新" variant="ghost" onClick={reload}>
  <IconRefreshOutline16 />
</IconButton>
```

| Prop | 值 |
|---|---|
| `variant` | `primary` `secondary`（默认）`ghost` `outline` `danger` |
| `size` | `default` 32px · `sm` 28px · `xs` 24px |
| `loading` | 内置 `IconLoadingOutline16` 旋转；同时 disabled |
| `leadingIcon` / `trailingIcon` | 16px 图标槽 |
| IconButton `aria-label` | 必填；缺 `title` 时用作 Tooltip |

---

### 6. SearchField

```tsx
<SearchField
  placeholder="搜索账号"
  shortcut="⌘K"
  debounceMs={200}
  onValueChange={setQuery}
  onClear={() => setQuery("")}
  stretch
/>
```

---

### 7. InputField / DropdownSelect

```tsx
<InputField
  label="显示名"
  prefix={<IconUserOutline16 />}
  hint="用于侧栏展示"
  error={errors.name}
  required
/>

<DropdownSelect
  aria-label="状态"
  value={status}
  options={[
    { value: 'all', label: '全部' },
    { value: 'live', label: '已连接' },
  ]}
  onChange={setStatus}
/>
```

---

### 8. Toolbar / FilterBar

```tsx
<FilterBar
  search={<SearchField stretch placeholder="搜索" onValueChange={setQ} />}
  filters={<DropdownSelect aria-label="平台" value={platform} options={platforms} onChange={setPlatform} />}
  actions={<Button variant="primary" leadingIcon={<IconPlusOutline16 />}>新建</Button>}
/>
```

---

### 9. Dialog / ModalDialog / ConfirmModal

```tsx
<ModalDialog open={open} onClose={close} title="编辑资产" footer={<Button variant="primary">保存</Button>}>
  <InputField label="名称" value={name} onChange={...} />
</ModalDialog>

<ConfirmModal
  open={ask}
  title="删除账号"
  message="删除后不可恢复。"
  confirmLabel="删除"
  confirmVariant="danger"
  onConfirm={remove}
  onClose={() => setAsk(false)}
/>
```

---

### 10. GenWaveCard

1:1 移植自 `omnimux-dsh/.tmp/chatgpt-gen-loading-card.html` 的点阵生成动效卡（canvas 绘制 28×29 点阵 + 尺寸/亮度双波场 + 同层椭圆进度胶囊）。**固定深色既定视觉**：色值封装在 `genWavePalette.ts`（实测色），不消费 `--dsw-alias-*`；深色宿主直接放置即可。

```tsx
import { GenWaveCard } from 'dsh-ui-kit'

<GenWaveCard statusText="Listing uploaded files and workspace path" />
<GenWaveCard statusText={task.label} progress={task.pct} />
```

| Prop | 类型 | 说明 |
|---|---|---|
| `statusText` | `string` | 顶部任务文案（外部供给） |
| `progress` | `number` | 0–100；传入后外部接管，停演示缓动 |
| `autoProgress` | `boolean` | 默认 `progress === undefined` 时跑 0→96% 演示缓动 |
| `className` / `style` | — | 根元素透传；`prefers-reduced-motion` 下定格参考帧 |

---

## 本地开发与构建

```bash
cd /Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit
pnpm typecheck
pnpm build
node --test src/kit-export.test.js
```

产物：`lib/index.js` + `lib/index.d.ts`。CSS Modules 在构建期哈希为 `dshUk-<file>-<local>`，运行时注入 `<style data-dsh-ui-kit>`，消费方无需再配 CSS loader。
