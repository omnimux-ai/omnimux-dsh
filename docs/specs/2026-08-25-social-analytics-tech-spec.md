---
title: "OmniMux 社媒数据分析看板 (omnimux-analytics) 技术架构与实现 Spec"
id: "spec-social-analytics-tech-spec"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-08-25"
authors: ["x", "agent-architect"]
subsystem: "omnimux-analytics"
---

# OmniMux 社媒数据分析看板 (omnimux-analytics) 技术架构与实现 Spec

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 Web 开发/验收流程退役，产品与架构约束不变。合入前 worktree 自动化/静态与独立评审，经 required CI/MQ 合入后按需 Dev 45120/ego 验收；见 [plugin-qa](../contracts/plugin-qa.md)。历史结果不重标。

> **版本**：v1.0.0  
> **状态**：**架构已定型 / 编码就绪**  
> **负责人**：高见远（架构师） · 交付总监：齐活林  
> **关联文档**：`2026-08-25-social-analytics-prd.md` · 原型对照：`2026-08-25-social-analytics-prototype.html`

---

## 一、 系统架构与工程定位

### 1.1 插件定位与物理边界
- **插件包名**：`omnimux-analytics`
- **物理源码目录**：`product/omnimux-dsh/plugins/omnimux-analytics/`
- **插件层级 (Tier)**：`T0: omnimux-analytics`（官方核心产品件）
- **依赖关系**：
  - 依赖 `omnimux` 执行中枢（消费 `identity` Seam 与官方 `/omnimux/analytics/*` HTTP 路由）。
  - 严禁直连外部网络或内嵌私有 HTTP Client，所有数据请求均通过 Host 路由代理。

### 1.2 物理目录与文件结构
```
product/omnimux-dsh/plugins/omnimux-analytics/
├── dsh.manifest.json                 # 插件 Manifest 清单
├── package.json                      # 声明依赖与 scripts
├── README.md                         # 插件开发与使用说明
├── scripts/
│   └── build-client.mjs              # 客户端 Bundle 打包脚本 (esbuild, React 外部化)
├── src/
│   ├── index.js                      # Host 端入口 (注册 Cordis 扩展与 HTTP 路由)
│   ├── store.js                      # 后端/Host 数据与配置服务 (可选本地快照)
│   └── client/                       # Web 前端 React 源码
│       ├── index.jsx                 # 客户端入口 (导出 Stage 挂载点)
│       ├── AnalyticsStage.jsx        # 首层页面容器 (4 层标准布局 + 关页保活)
│       ├── store.js                  # 前端状态机 (Zustand: 筛选状态 / 缓存 / 选中指标)
│       ├── api.js                    # Host API 客户端 (fetch /omnimux/analytics/*)
│       ├── theme.js                  # ECharts / CSS 主题 Token 适配器
│       ├── components/
│       │   ├── StageHeader.jsx       # Layer 1: 页面标头与操作按钮
│       │   ├── ActionNavRow.jsx      # Layer 2: 分段切页 (Posting/Inbox) 与同步机
│       │   ├── FilterBar.jsx         # Layer 3: 48px 单行级联筛选栏
│       │   ├── KpiGrid.jsx           # Layer 4.1: 核心 5 大 KPI 卡片
│       │   ├── BasicCharts.jsx       # Layer 4.2: 4 组基础柱状图 (发帖/点赞分布与走势)
│       │   ├── EngagementChart.jsx   # Layer 4.3: 复合互动多折线大盘 (9 项 Checkbox 联动)
│       │   ├── HeatmapChart.jsx      # Layer 4.4: 7x24h 最佳发布时间 5 级绿度热力图
│       │   ├── FollowerEvolution.jsx # Layer 4.5: 粉丝增长演进折线图
│       │   ├── PlatformTable.jsx     # Layer 4.6: 各平台表现明细汇总表格
│       │   ├── TopPostsTable.jsx     # Layer 4.7: 爆款内容表现排行榜表格
│       │   └── StrategyCharts.jsx    # Layer 4.8: 频次模型与互动衰减曲线
│       └── locales/
│           ├── zh-CN.js              # 中文地道文案词条
│           └── en-US.js              # 英文兜底词条
```

---

## 二、 扩展点选型与 Stage 挂载契约

### 2.1 扩展点选型 (Slots & Seams)
1. **页面挂载 (Stage Overlay)**：
   - 挂载至 `shell.overlay`，注册 Stage 标识 `analytics`。
   - 严格遵循 **关页保活金标规范**（`everOpened` 延迟挂载 + 关页 `display: none` 隐藏），切换页面时不卸载 React 树，保留用户筛选状态与图表缩放视图。
2. **侧边栏入口 (Sidebar Entry)**：
   - 挂载至 `sidebar.extra`，在 OmniMux 侧栏“应用”下方注入「数据分析」图标与入口，点击触发 `stageStore.open('analytics')`。
3. **Seam 消费**：
   - 消费 `ctx.get('identity')`：获取当前登录用户的 Profile 状态，未登录时自动唤起统一登录闸（LoginGate）。

---

## 三、 前端组件层级与 4 层布局规范实现

严格执行 `docs/contracts/first-level-page-layout.md`：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 1: StageHeader (24px 加粗 H1 "数据分析看板" + 13px 副标题 + 右侧操作组)     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 2: ActionNavRow (SegmentedTabs: [发布效果分析]/[私信] + 同步状态/按钮)   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 3: FilterBar (48px 单行: 平台/账号/来源/时间跨度 + 220px 搜索框)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Layer 4: Main Content (响应式网格与滚动容器)                                │
│   ├── KpiGrid (5 列等宽卡片, Tabular Nums)                                  │
│   ├── BasicCharts (2x2 栅格: Posts/Likes Platform & Time)                   │
│   ├── EngagementChart (全宽复合大盘 + 9 项 Checkbox 联动)                   │
│   ├── ChartsGrid2 (左: 7x24h 5 级热力图 / 右: 粉丝演进折线图)                │
│   ├── PlatformTable (各平台汇总 Breakdown, 支持各列点击排序)                │
│   ├── TopPostsTable (爆款排行, 封面缩略图 + 性能指标拆解)                   │
│   └── StrategyCharts (左: 发帖频次回归线 / 右: 2-7d 互动生命周期衰减曲线)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 核心组件实现要点

#### 1. 复合互动走势大盘 (`EngagementChart.jsx`)
- 采用轻量化 ECharts / Chart.js Canvas 渲染引擎。
- 双 Y 轴架构：左 Y 轴（绝对数值：Likes, Comments, Shares, Saves, Reach, Clicks），右 Y 轴（播放量 Views 与 百分比 ER）。
- **9 项指标即时勾选响应**：
  ```javascript
  const METRIC_DEFS = [
    { key: 'likes', label: '点赞数', color: '#ef4444', defaultVisible: true, yAxis: 0 },
    { key: 'comments', label: '评论数', color: '#3b82f6', defaultVisible: true, yAxis: 0 },
    { key: 'shares', label: '分享数', color: '#10b981', defaultVisible: true, yAxis: 0 },
    { key: 'saves', label: '收藏数', color: '#f59e0b', defaultVisible: false, yAxis: 0 },
    { key: 'views', label: '播放/浏览', color: '#8b5cf6', defaultVisible: true, yAxis: 1 },
    { key: 'impressions', label: '曝光量', color: '#06b6d4', defaultVisible: false, yAxis: 0 },
    { key: 'reach', label: '触达人数', color: '#64748b', defaultVisible: false, yAxis: 0 },
    { key: 'clicks', label: '链接点击', color: '#ec4899', defaultVisible: false, yAxis: 0 },
    { key: 'er', label: '互动率', color: '#22c55e', defaultVisible: true, yAxis: 0, dashed: true },
  ]
  ```

#### 2. 7×24 小时最佳发布时间热力图 (`HeatmapChart.jsx`)
- **网格布局**：CSS Grid `44px repeat(24, 1fr)`，纵轴显示 `周一 ~ 周日`，横轴显示 `0点 ~ 23点`。
- **5 级绿度分位数算法**：
  ```javascript
  function getHeatmapLevel(score, maxScore) {
    if (!score || score <= 0) return 'lvl-0';
    const ratio = score / (maxScore || 1);
    if (ratio < 0.25) return 'lvl-1'; // #9be9a8
    if (ratio < 0.50) return 'lvl-2'; // #40c463
    if (ratio < 0.75) return 'lvl-3'; // #30a14e
    return 'lvl-4';                    // #216e39 (峰值)
  }
  ```

---

## 四、 前端状态管理与数据缓存设计 (`src/client/store.js`)

使用轻量级状态管理（Zustand 模式），内置 **5 秒内存 TTL 缓存** 与 **300ms 筛选防抖**：

```javascript
export const useAnalyticsStore = create((set, get) => ({
  // 1. 全局筛选状态
  tab: 'posting', // 'posting' | 'inbox'
  platform: 'all',
  profileId: 'all',
  source: 'all',
  timeRange: '30d',
  searchQuery: '',

  // 2. 指标数据与状态
  loading: false,
  lastSyncedAt: Date.now() - 14 * 60 * 1000,
  cache: new Map(), // key: cacheKey -> { data, expireAt }

  // 3. 动作分发
  setFilter: (key, value) => {
    set({ [key]: value });
    get().fetchOverviewDataDebounced();
  },

  fetchOverviewData: async (force = false) => {
    const { platform, profileId, timeRange, cache } = get();
    const cacheKey = `${platform}:${profileId}:${timeRange}`;
    
    if (!force && cache.has(cacheKey) && cache.get(cacheKey).expireAt > Date.now()) {
      return set({ data: cache.get(cacheKey).data, loading: false });
    }

    set({ loading: true });
    try {
      const data = await fetchAllAnalyticsData({ platform, profileId, timeRange });
      cache.set(cacheKey, { data, expireAt: Date.now() + 5000 });
      set({ data, loading: false, lastSyncedAt: Date.now() });
    } catch (err) {
      set({ loading: false, error: err.message });
    }
  },

  syncNow: async () => {
    await triggerSyncExternal();
    await get().fetchOverviewData(true);
  }
}));
```

---

## 五、 主题适配与 UI Token 规范 (Zero-Style-Bleed)

1. **100% 消费官方 CSS 变量**：
   - 页面背景：`var(--dsw-alias-bg-base)`
   - 卡片与面板背景：`var(--dsw-alias-bg-layer-1)`
   - 模块底色：`var(--dsw-alias-bg-module-platform)`
   - 一级字色：`var(--dsw-alias-label-primary)`
   - 次级字色：`var(--dsw-alias-label-secondary)`
   - 边框线色：`var(--dsw-alias-border-l1)` / `var(--dsw-alias-border-l2)`
2. **严禁 Raw HTML 裸标签与内联 Style 对象**：
   - 按钮全部采用 `dsh-ui-kit` 或标准化 `.icon-button` / `.filter-select` 封装。
3. **图表暗黑模式自动感知**：
   - 监听 `document.documentElement` 的 `data-theme` 属性变动，动态切换 Canvas 网格线颜色（`rgba(0,0,0,0.05)` vs `rgba(255,255,255,0.08)`）及坐标轴文字颜色。

---

## 六、 打包与构建规范 (`scripts/build-client.mjs`)

使用 `esbuild` 构建单文件 Client Bundle，**强制外部化核心基础库**，严禁打入重复实例：

```javascript
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/client/index.jsx'],
  bundle: true,
  outfile: 'lib/client.js',
  format: 'esm',
  target: 'es2022',
  external: [
    'react',
    'react-dom',
    '@deepseek-ai/dsh-client-ui-primitives',
    'chart.js' // 或采用 cdn / host-provided 形式
  ],
  loader: { '.jsx': 'jsx', '.svg': 'text' },
  minify: process.env.NODE_ENV === 'production',
});
```

---

## 七、 实施与任务分解 (Task Breakdown)

| 阶段 | 模块 / 任务项 | 负责专家 | 预计产物 |
| :--- | :--- | :--- | :--- |
| **Phase 2.1** | 插件骨架与 Manifest 清单初始化 | 高见远（架构师） | `dsh.manifest.json`, `package.json` |
| **Phase 3.1** | 前端 API 模块与 Zustand Store 状态机 | 林深（工程师） | `src/client/api.js`, `src/client/store.js` |
| **Phase 3.2** | 4 层布局容器与 Stage 挂载 (关页保活) | 林深（工程师） | `AnalyticsStage.jsx`, `StageHeader.jsx`, `FilterBar.jsx` |
| **Phase 3.3** | 核心 KPI 卡片与 2x2 基础走势组件 | 林深（工程师） | `KpiGrid.jsx`, `BasicCharts.jsx` |
| **Phase 3.4** | 复合互动大盘与 7x24h 5级绿度热力图 | 林深（工程师） | `EngagementChart.jsx`, `HeatmapChart.jsx` |
| **Phase 3.5** | 明细汇总表与爆款内容排行榜 | 林深（工程师） | `PlatformTable.jsx`, `TopPostsTable.jsx` |
| **Phase 3.6** | 客户端打包脚本与 Host 路由注册 | 林深（工程师） | `scripts/build-client.mjs`, `src/index.js` |
| **Phase 4.1** | 单元测试、L2 Web 联动调试与 Doctor 审计 | 严过关（QA） | `test/*.test.js`, `doctor` 验证 PASS |
| **Phase 4.2** | 零重启物化交付到 Profile | 齐活林（交付总监） | `npm run sync omnimux-analytics` |
