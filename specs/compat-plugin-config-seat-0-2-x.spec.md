# Spec: 插件配置卡双席位（0.1.5 `settings.plugin.item` + 0.2.x `plugins.bundle.config`）

- Issue: #3665（R1，跨插件 2 个：`omnimux-market`、`omnimux-social-harvest`）
- 来源：#3658 清点报告 §3.2/§3.3
- 依赖批次：#3652；本改动不依赖 pin 切换（两代席位并存，各自在缺失的宿主上惰性无效）

## 目标

DSH 0.1.5 用 `settings.plugin.item`（keyed/root，由 `client-ui-settings-plugins` 声明）承载插件设置命名空间的配置卡；`omnimux-market` 与 `omnimux-social-harvest` 各注册一张卡。0.2.1-rc.3 移除了该席位，插件配置迁到 `client-ui-plugin-manager`。本任务让两个插件同时注册旧新两个席位，使当前 0.1.5 宿主与未来的 rc.3 宿主都能显示配置卡。

## 目标席位的选择（对 #3665 正文的修正）

rc.3 的 `plugins.item`（`client-ui-plugin-manager/client/slot-contract.d.ts:141-147`）文档明确写着「**OCCUPIED by the official settings pages, one companion package per host-plane namespace**」，并指出 bundle 自己的配置应放 `plugins.bundle.config` 或 `plugins.row.config`。因此第三方 bundle 的正确目标席位是：

- `plugins.bundle.config`：keyed/root，key 为 **bundle 的 npm 包名**，渲染在 bundle 详情页描述与行之间（`view: 'page'`），owner props `PluginConfigViewProps = { view, form? }`（`:148-157`、`:23-28`）。

`plugins.item` 不采用（那是官方插件设置页的位置）。本仓 hub 现有的 `plugins.item` 注册针对 `omnimux` 自身，不在本任务范围。

## 范围

- `plugins/omnimux-market/src/client/apply.js`：在现有 `settings.plugin.item` 注册旁，新增 `plugins.bundle.config`（key `omnimux-market`）注册，复用同一 `ConfigCard`。
- `plugins/omnimux-social-harvest/src/client/index.js`：同样新增 `plugins.bundle.config`（key `omnimux-social-harvest`）注册，复用 `SettingsCard`。
- 新增两个测试文件断言双席位存在（不改既有断言）：`plugins/omnimux-market/src/tests/plugin-config-seat.test.ts`、`plugins/omnimux-social-harvest/src/client/plugin-config-seat.test.js`。
- `plugins/omnimux/README.md`：补一句 rc.3 的官方插件配置席位名（`plugins.item`），避免文档只描述 0.1.5。
- 不改卡片内部逻辑、不改 Host 侧配置读写、不改其他插件。

## 假设

1. 两个 bundle 的配置卡是自管理表单（market 走 `api('config')` HTTP，social-harvest 用自身 store），不依赖 Host 的 `ConfigPageForm`；因此 `PluginConfigViewProps.form` 可以不消费，卡片在 `view: 'page'` 下照常渲染。
2. key 用 bundle 包名（`omnimux-market` / `omnimux-social-harvest`）与旧席位用的设置命名空间同名，因此两代席位 key 一致，无需映射表。
3. 槽位不存在时 `slots.inject` 不会回调、`register` 也不会抛错，因此同时保留两个席位在任一宿主上都只有一个生效。
4. rc.3 的 Plugins 页认识这两个 bundle（它们由桌面壳通过 `dsh plugin add` 安装），所以 `plugins.bundle.config` 会渲染在它们的详情页上。

## 证伪方式

1. 若 `pnpm --filter omnimux-market test` / `pnpm --filter omnimux-social-harvest test` 失败，先区分是新增席位导致还是既有失败，逐条记录。
2. 若新增测试断言在未构建的 `src/client.js` 上失败，说明测试读取路径不对，按各包既有 client-bundle 测试的读取方式修正。
3. 若 0.1.5 宿主下卡片消失（工作树 Web 验收或截图证据显示设置页缺少卡片），说明双席位策略在旧宿主上有副作用，回退为只保留旧席位并把新席位登记为待 pin 切换后执行。
4. 若 rc.3 类型面显示 `plugins.bundle.config` 的 key 不是包名（例如需要 `packageName#rowId`），则改用 `plugins.row.config`，并在 spec 记录依据。

## 验收

1. 两个插件的客户端产物同时含 `settings.plugin.item` 与 `plugins.bundle.config` 两个席位名及各自 key；新增测试通过。
2. `pnpm --filter omnimux-market test`、`pnpm --filter omnimux-social-harvest test` 通过（失败项若为既有环境问题需给出对照证据）。
3. 工作树 Web 验收（`pnpm test:worktree-web`）通过，设置页卡片仍可见。
4. 不改 Host 配置读写与卡片内部逻辑；风险按实际 diff 复核。
5. rc.3 宿主上的真实渲染标注为未验证（本机无该宿主），作为残留。

## 风险

R1（跨插件、UI 席位）。同时注册两个席位不会互相干扰（槽位缺失即惰性）；主要风险是 rc.3 上 bundle 详情页的实际渲染未验证，以及旧宿主设置页布局受新增注册影响——后者由验收 3 的浏览器证据覆盖。
