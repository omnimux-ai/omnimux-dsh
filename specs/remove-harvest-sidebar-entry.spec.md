# 从左侧导航栏下架社媒采集入口规格

- Issue: #2473
- 日期: 2026-09-20
- 目标: 根据用户指令收尾，从左侧侧边栏下架「社媒采集」导航入口。

## 1. 变更范围

1. 在 `plugins/omnimux-social-harvest/src/client/index.js` 中：
   - 移除 `mountSidebarEntry` 的导入与调用，使左侧导航栏不挂载该插件条目；
2. 保持底层 Agent 工具（`harvest_*`, `flow_*`）与工作台 Tab 注册能力正常，随时可通过命令或按需调用。

## 2. 验收标准

1. `plugins/omnimux-social-harvest/scripts/build-client.mjs` 重新打包成功。
2. 单元测试与端到端测试通过。
3. 物化到 Dev 后，左侧侧边栏不再展示「社媒采集」入口。
