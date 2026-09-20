# 社媒采集插件左侧侧边栏导航入口与同步物化规格

- Issue: #2451
- 日期: 2026-09-20
- 目标: 为 `omnimux-social-harvest` 补齐左侧侧边栏入口并纳入 `scripts/sync-to-app.sh` 与 `scripts/sync-stable.sh` 默认插件清单，实现 Dev 开发版左侧导航栏展示「社媒采集」按钮并可一键呼出工作台。

## 1. 痛点与根因分析

此前 `omnimux-social-harvest` 仅在 `client/index.js` 中向 `betterSidebar` 注册了工作台 Tab (`omnimux-social-harvest:library`)，但：
1. **漏接侧边栏入口**：未通过 `createSidebarEntry` / `mountSidebarEntry` 将条目注册到 `window.__omnimuxSidebar` 协调器，导致主界面左侧导航栏没有生成「社媒采集」按钮。
2. **构建同步名单遗漏**：`scripts/sync-to-app.sh` 的 `DEFAULT_PLUGINS` 与 `scripts/sync-stable.sh` 的 `ALL_PLUGINS` 未收录 `omnimux-social-harvest`，执行 `./scripts/sync-to-app.sh` 时未将该插件代码同步至 `~/.omnimux-dev`。

## 2. 详细改造方案

### 2.1 新增 `src/client/sidebar-entry.js`
- 遵循与 `omnimux-device` / `omnimux-assets` 100% 一致的标准侧边栏协调器接口规范；
- 排序设定：`rank: 3.8`（位于「资产库 (3.0)」与「手机管理 (3.5)」下方，紧随工作台常用工具阵列）；
- 图标：使用契合「采集/雷达/抓取」语义的极简纯净矢量 SVG（尺寸 14x14，符合 UI04 矢量规范与纯黑极光紫基调）；
- 状态同步：基于 `createWorkbenchStageStore(t, HARVEST_TAB_ID)` 实现双向激活态同步（点击调用 `stageStore.open()`，打开时按钮高亮，关闭时取消高亮）。

### 2.2 更新 `src/client/index.js`
- 引入 `mountSidebarEntry`，并在 `apply(ctx)` 中通过 `ctx.effect(() => mountSidebarEntry(null, t, ctx.locale), 'omnimux-social-harvest: sidebar entry')` 挂载。

### 2.3 更新同步构建名单
- `scripts/sync-to-app.sh`: `DEFAULT_PLUGINS` 追加 `omnimux-social-harvest`。
- `scripts/sync-stable.sh`: `ALL_PLUGINS` 追加 `omnimux-social-harvest`。

## 3. 验收标准

1. `plugins/omnimux-social-harvest/scripts/build-client.mjs` 构建正常，产出客户端 bundle。
2. 单元测试与端到端测试 100% 通过（新增侧边栏注册契约单测）。
3. 门禁检查：`pnpm verify:product-baseline` 零新增豁免，`pnpm test:agent-tools` 四层全绿。
4. 开发版（Dev App）实机验证：侧边栏成功挂载「社媒采集」按钮，点击激活并成功打开工作台。
