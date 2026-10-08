---
title: "plugin-offline-cloud-matrix — 插件离线/云端定界与侧栏动态可见性合同"
id: "contract-plugin-offline-cloud-matrix"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-30"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# plugin-offline-cloud-matrix — 插件离线/云端定界与侧栏动态可见性合同

本页是既有访问与数据源分类，不定义对外产品范围或证明业务已可用。现行主线见[产品定位](product-positioning.md)；账号、发布和分析说明不授权矩阵运营扩展，也不因文档同步隐藏或停用旧插件。

> 目的：规范 OmniMux 插件在离线（Local/Offline）与云端强依赖（Cloud-dependent）场景下的能力定级、数据源归属、侧栏入口显式门闩协议及方案 D 游客拦截规则。

## 1. 核心交互铁律 (Core Invariants)

1. **侧栏全量常驻可见 (Sidebar Fully Visible)**：
   无论离线插件还是云端插件，在侧边栏均**全量常驻渲染与可见**，保持产品功能全景透明且布局稳定，严禁未登录时动态隐藏 cloud 插件入口。
2. **离线入口直接进入 (Offline = Direct Stage Open)**：
   离线可用插件（Workflow、Assets、Products、Clip 等）点击直接打开 Stage 并浏览/使用其本地持久化数据与核心功能，点击绝不弹登录。
3. **云端入口显式门闩 (Cloud = Explicit Auth Gate)**：
   强依赖云端账号、指标、授权与云端服务流的插件（Analytics、Publish、Accounts、Inspiration 等），常驻可见；用户点击时触发显式登录鉴权（`ensureLogin({ kind: 'explicit' })`），鉴权成功后打开 Stage，用户取消则不打开。
4. **方案 D 游客会话抑制 (Policy D: Navigation-Only Suppression)**：
   用户取消登录（`cancel()`）后，Policy D 严格仅在当前会话内抑制 `kind: 'nav'` 类型的被动导航弹窗；用户显式点击触发的 `kind: 'explicit'` 以及业务写操作 `kind: 'write'` **永不抑制**，始终弹出登录门闩。

## 2. 插件能力定级与数据源矩阵 (Access Matrix)

| 插件标识 (`id`) | 业务入口 | 侧栏 Rank | 数据源与能力特征 | 访问定级 (`access`) | 未登录侧栏表现 | 免登可操作范围 |
|---|---|---|---|---|---|---|
| `omnimux-workflow` | 创作 / 项目 | 5 | 本地 DAG 画布 / 本地 JSON / 项目相对路径资源 | `offline` | **常驻显示** | 本地画布编辑、节点拖拽、离线脚本执行、本地素材管理 |
| `omnimux-assets` | 资产库 | 4 | `$DSH_HOME/omnimux/assets/data/files/` 物理实体化 | `offline` | **常驻显示** | 浏览已下载资产、角色/场景/风格包检视、本地导入 |
| `omnimux-products` | 产品库 | 6 | `$DSH_HOME/omnimux/products/data/` 本地持久化 | `offline` | **常驻显示** | 浏览商品数据、卖点/人群管理、本地图片引用 |
| `omnimux-clip` | 剪辑工坊 | 8.2 | 浏览器内置 WebCodecs/Canvas/WebGPU 渲染管线 | `offline` | **常驻显示** | 多轨时间轴剪辑、波形预览、本地视频导出 |
| `omnimux-analytics` | 数据分析 | 10 | 云端社媒账号多维指标聚合、云端 API 统计 | `cloud` | **常驻显示，点击显式登录** | 必须登录 OmniMux 云端账号以同步社媒运营数据 |
| `omnimux-publish` | 账号发布中心 | 9 | 云端账号矩阵分发通道、云端 Token 鉴权与台账 | `cloud` | **常驻显示，点击显式登录** | 必须登录 OmniMux 云端账号以管理授权与发布通道 |
| `omnimux-accounts` | 账号矩阵 | 3 | 云端 OAuth 绑定与多平台凭据中心 | `cloud` | **常驻显示，点击显式登录** | 必须登录 OmniMux 云端账号以获取跨平台凭据 |
| `omnimux-inspiration` | 灵感素材库 | 7 | 云端公共灵感流与远程 Showcase 实时 Feed | `cloud` | **常驻显示，点击显式登录** | 必须登录 OmniMux 云端账号以拉取云端公共案例 |

## 3. 侧栏入口动态可见性协议 (Sidebar Visibility Protocol)

`dsh-ui-kit` 中的 `createSidebarEntry` 是全量侧栏额外入口的唯一标准构造器。

### 3.1 选项扩展规范

```ts
export interface SidebarEntryOptions {
  id: string
  rank: number
  label: string | (() => string)
  iconSvg: string
  stageStore: StageStore
  locale?: { subscribe?: (fn: () => void) => () => void }
  customClassName?: string
  datasetKey?: string
  /**
   * 插件数据源与访问定级 (默认 'offline')
   * - 'offline': always visible, clicks open stage directly without auth gating
   * - 'cloud': cloud-dependent; always visible in sidebar, clicks trigger explicit auth gating
   */
  access?: 'offline' | 'cloud'
  /** @deprecated 请使用 access 替代；旧参数保留向前兼容 */
  requireAuth?: boolean
  authReason?: string | (() => string)
}
```

### 3.2 显式鉴权流转生命周期

1. **常驻挂载**：
   - 全量入口节点正常渲染并由 `SidebarCoordinator` 统一布局展示；
2. **点击分流**：
   - 若 `access === 'offline'`，点击直接调用 `stageStore.open()`；
   - 若 `access === 'cloud'`，点击调用 `ensureLogin({ kind: 'explicit', reason, onSuccess: () => stageStore.open() })`；
3. **销毁与退订**：
   - 当插件卸载时，自动清理相关订阅与 DOM 节点。

## 4. 鉴权网关方案 D 会话抑制契约 (Policy D Implementation)

在 `plugins/omnimux/src/client/auth-gate.js` 中：

1. **策略常量激活**：
   ```js
   export const AUTH_GATE_POLICY = Object.freeze({
     gateNavigation: true,
     suppressNavigationAfterCancel: true, // 方案 D 激活
   })
   ```
2. **抑制状态机**：
   - 当用户在弹窗中点击 ✕（触发 `cancel()`）时，置位 `navSuppressed = true`；
   - 当收到被动导航性质的 `ensureLogin({ kind: 'nav' })` 且 `navSuppressed === true` 时，直接短路放行 `onSuccess({ logged_in: false, suppressed: true })`，不将门打到 `prompt` 或发起 HTTP 探测；
   - 用户主动显式登录 `ensureLogin({ kind: 'explicit' })` 以及写操作 `ensureLogin({ kind: 'write' })` **绝不抑制**，始终进入 `prompt`；
   - 触发登出或收到后端 401 时，重置 `navSuppressed = false`。
