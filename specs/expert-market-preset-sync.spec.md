# 专家市场「已入职」专家落盘同步与 Agent 预设列表热刷新规格

关联 Issue：#2476

## 1. 业务背景与问题
专家市场中 4 位专家（Shopee运营专家、YouTube创作者专家、亚马逊运营专家、TikTok Shop运营专家）卡片显示「已入职」，但输入框 Agent 预设下拉列表中不可选；「媒体创作者」安装成功后也不即时出现在列表，需重启应用。

已确诊双根因：
1. `plugins/omnimux-market/src/expert-market.ts` 的 `DEFAULT_MARKET_EXPERTS` 中 4 位专家硬编码 `initialStatus: 'enabled'`；`getMarketExpertStatus` 在 `<home>/.agent-presets/<id>/preset.yml` 不存在时回退该初值，UI 显示「已入职」，但 `installMarketExpertPreset` 从未被调用，预设目录从未落盘（真机 `~/.omnimux-dev/.agent-presets/` 无此 4 目录）。全仓库无启动同步逻辑。
2. 官方 `@deepseek-ai/dsh-client-ui-agent-preset` 的 seat 控制器只在新会话页挂载、或收到 `settings/document-updated`（命名空间 `agent-presets`）/`connection/reset` 事件时才重读预设列表；市场安装/禁用成功后无任何触发，已打开页面看不到变化。官方 settings 服务提交文档时会广播该事件。

## 2. 目标与范围
- **目标**：「已入职」状态与磁盘预设真实一致；安装/禁用后 Agent 预设列表即时刷新，无需重启。
- **范围**：
  - `plugins/omnimux-market/src/expert-market.ts`（新增启动物化函数）
  - `plugins/omnimux-market/src/host/apply.js` 或等价激活点（接入启动物化）
  - `plugins/omnimux-market/src/local-api.ts`（安装/禁用后触发预设列表刷新广播）
  - `plugins/omnimux-market/src/tests/experts-market.test.ts`（新增用例）
- **新用户基线**：全新用户首次启动即自动获得 4 位「已入职」专家的 Agent 预设；不依赖任何开发机私有路径；物化失败静默兜底、不阻塞插件激活。
- **边界**：严禁修改官方 DSH 源码；不改 `initialStatus` 语义与退休目录机制。

## 3. 验收标准
- **AC-1**：插件激活后，4 位 `initialStatus='enabled'` 且未被用户禁用的专家幂等写入 `$DSH_HOME/.agent-presets/<id>/`（含 `preset.yml` 与 `agent.cordis.yml`）；已存在时跳过不覆盖。
- **AC-2**：曾被用户禁用（`.retired` 中存在 `<id>` 或 `<id>-*` 标记）的专家不被启动物化复活，状态保持「已离职」。
- **AC-3**：市场安装/禁用专家成功后，通过对 settings `agent-presets` 命名空间的无害写回触发官方 `settings/document-updated` 广播，已打开的新会话页 Agent 预设菜单即时反映最新列表。
- **AC-4**：`pnpm --filter dsh-omnimux-market test`（或该包实际名称）全绿，新增用例覆盖 AC-1/AC-2/AC-3。
- **AC-5**：工作树内真实浏览器验证：启动物化后 Agent 预设下拉出现 4 位专家；市场页面对一位「可聘用」专家点安装后，不重启即可在下拉中看到。
