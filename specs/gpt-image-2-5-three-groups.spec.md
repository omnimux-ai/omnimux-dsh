# 需求规格：GPT Image 2.5 接入完整三分组（标准版 / 经济版 / 旗舰版）与级联三级菜单激活

- 对应 Issue：#2832
- 日期：2026-09-29
- 架构角色：交付总监 齐活林 / 产品经理 许清楚 / 后端工程师 寇豆码 / 前端开发 裴像素 / QA 工程师 严过关

## 1. 业务目标与背景
上游网关 `https://api.omnimux.ai/api/pricing` 对 `gpt-image-2.5` 开放了三个真实存活线路分组：
1. `default`（标准版）：官方基准直签线路，基础估算 0.1 积分/张。
2. `gpt-image-2.5-economy`（经济版）：经济走量专线，基础估算 0.1 积分/张。
3. `gpt-image-2.5-pro`（旗舰版）：满血画质专线，基础估算 0.2 积分/张。

此前本地中枢目录仅登记了单个 `standard` 分组，导致三级菜单（选择渠道）根据设计契约（`channels.length <= 1`）被自动隐藏折叠。
本次将 `gpt-image-2.5` 完整补齐三个分组，不仅使真实上游路由契约完整对齐，而且满足 `channels.length > 1`，正式激活级联三级菜单展示！

## 2. 产品与设计文案白名单（PM 许清楚核定）
- 模型显示名：`GPT Image 2.5`
- 渠道三级菜单白名单（完全符合现代 SaaS 极简规范与白名单档位词）：
  - **旗舰版**：
    * `id`: `pro`
    * `label`: `旗舰版`
    * `badge`: `满血出片 · 极致画质`
    * `wireGroup`: `gpt-image-2.5-pro`
    * `pricing`: `pointsEstimate: 0.2, discountRate: 1.5, billingMode: 'per_task'`
  - **标准版**：
    * `id`: `standard`
    * `label`: `标准版`
    * `badge`: `官方直签 · 标配出片`
    * `wireGroup`: `default`
    * `default`: `true`
    * `pricing`: `pointsEstimate: 0.1, discountRate: 1, billingMode: 'per_task'`
  - **经济版**：
    * `id`: `economy`
    * `label`: `经济版`
    * `badge`: `经济走量 · 按次计费`
    * `wireGroup`: `gpt-image-2.5-economy`
    * `pricing`: `pointsEstimate: 0.1, discountRate: 0.8, billingMode: 'per_task'`

## 3. 验收标准（AC，可测试）
- **AC-1 (渠道定义对齐)**：`plugins/omnimux/src/catalog/serving/channel-groups.js` 与 `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts` 中的 `gpt-image-2.5` 包含 `pro`、`standard`、`economy` 3 个分组，`wireGroup` 与上游网关完全一致。
- **AC-2 (命名门禁通过)**：执行 `node scripts/verify-channel-group-naming.mjs` 退出码 0，无任何违规。
- **AC-3 (媒体查看器级联数据同步)**：`plugins/omnimux/src/client/media-viewer/MediaViewerComposerData.js` 的 `DEFAULT_FALLBACK_CATALOG.image` 完整包含 3 个渠道分组。
- **AC-4 (级联三级菜单激活)**：在媒体查看器 / 画布节点中选择或悬停 `GPT Image 2.5` 时，由于渠道数 = 3 > 1，第三列「渠道 / 版本」菜单自动展现，包含「旗舰版」、「标准版」、「经济版」，用户可自由切换选择。
- **AC-5 (请求头路由透传)**：在生图执行链路（`openai-media.js`）中：
  - 选择 `pro` 时：携带请求头 `X-Omnimux-Group: gpt-image-2.5-pro`；
  - 选择 `economy` 时：携带请求头 `X-Omnimux-Group: gpt-image-2.5-economy`；
  - 选择 `standard` 或默认时：`wireGroup` 为 `default`（或无显式意图走默认标准线路）。
- **AC-6 (真实请求闭环)**：在 Dev App 或真实测试环境中执行真实生图请求，上游返回成功。
