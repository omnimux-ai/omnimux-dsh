# 动态模型执行档案与中枢统一模型配置

## Objective

网关是模型上架、能力和推荐值的唯一动态来源。插件不能在模型清单、执行参数或默认模型上继续依赖人工维护的模型 ID；同时，官方 DSH Plugins 页需要成为 OmniMux bundle 的开关和配置入口。

本规格解决四件事：

1. 把网关 contract 中的执行档案（上下文上限、最大输出、输入模态、工具/流式/缓存、推理档位、未知项）带入 `/omnimux/model-catalog`。
2. 让聊天 composer 的 `llm-pi-ai` 模型行从目录执行档案生成，而不是只写 `id`/`name`。
3. 把默认模型从静态 ID 改为“用户显式选择 > 网关推荐 > 第一个可执行且文档完整的模型 > 空”的动态策略，并增加手动同步。
4. 在官方 Plugins 页的 OmniMux bundle 详情中提供统一的模型配置和继承摘要，所有写入共享一个 `omnimux` settings scope。

## New-user baseline

新用户只需要安装插件并登录；官方网关是默认渠道，不依赖开发机的本机 agent、代理端口或模型别名。首次启动若还没有可用的网关快照，界面显示“等待同步模型”，不伪造可用默认；同步成功后按网关目录选择默认。离线时只使用随包快照和 bootstrap 路由，不把离线兜底当作真实在售或真实执行证明。

## Structure and contracts

- Gateway contract v2 是网关公开模型的执行字段来源；本地 `cordis.patch.yml` 只保留 provider 传输壳和必要的 bootstrap 行，不再承担完整模型清单。
- `plugins/omnimux/src/catalog/list.js` 生成 `models[].executionProfile`、`defaultsMeta`，四个 bucket 继续按网关成员资格过滤。
- `plugins/omnimux/src/catalog/composer-list.js` / `composer-sync.js` 只消费目录中的动态档案；未知字段保持缺失，不能猜。
- `plugins/omnimux/src/settings/schema.js` 的默认模型字段改为空字符串；空字符串表示自动，不是用户显式选择。
- 客户端共享配置卡：`plugins.item`、`plugins.bundle.config`、`plugins.detail.section`；所有 OmniMux bundle 的模型摘要复用同一 `omnimux` scope。
- 公共 HTTP 新增 `POST /omnimux/model-catalog/refresh`，只调用现有 gateway snapshot refresher，不改变模型合同和计费。

## Data model

### `modelCatalog` additive DTO

```text
models[].executionProfile = {
  contextWindowTokens?: number,
  maxOutputTokens?: number,
  inputModalities: string[],
  outputModalities: string[],
  toolCalling?: boolean,
  streaming?: boolean,
  promptCaching?: boolean,
  reasoningEfforts?: Record<string, string>,
  unknowns: string[],
  source: 'gateway' | 'local' | 'custom'
}
defaultsMeta[kind] = {
  modelId: string,
  source: 'user' | 'gateway-recommended' | 'first-ready' | 'offline-floor' | 'none',
  needsConfirmation?: boolean
}
```

`executionStatus` remains `ready | unsupported | unverified`. `ready` means adapter and required execution fields are known; `unverified` means adapter exists but profile fields are incomplete; `unsupported` means no local adapter can execute it.

### Composer rows

For gateway-only models, `llm-pi-ai` rows map known execution profile fields to `contextWindow`, `maxTokens`, `input` (only pi-ai's `text` and `image`), and `reasoningEfforts`. Missing fields are omitted. A model with no profile may remain visible as id/label but cannot be selected as an automatic default.

## Default policy

`buildModelCatalog` resolves each kind in this order:

1. Explicit user value, only if still present and `ready`;
2. gateway recommended/default for the operation;
3. first `ready` row with `contract.status === 'documented'`;
4. first `ready` row if no documented row exists;
5. empty, with a visible "等待同步模型" state.

`catalog-defaults.json` is an offline floor only; it is never used when a live or bundled gateway snapshot provides membership. Explicit saved defaults that disappear remain in settings and show `needsConfirmation`; they are not silently rewritten. Execution must fail with a clear model/config error rather than silently substituting a different model for an explicit invalid choice.

## UI behavior

- `ModelsSettingsCard` (or its successor) shows: model sync status/source/generatedAt/stale/error, `立即同步` button, provider/runtime mode, text and analysis defaults, image/video/audio defaults, image/video operation mode, tool model, and reset-to-auto controls.
- `TaskModelsSection` gains an `auto` option and reset; analysis options read `inputCapability.modalities`, falling back to legacy `input`.
- All OmniMux bundle detail pages render a shared model summary. The hub bundle page renders the full editable card. Other bundles show inherited values and a link/summary; they must not create a second set of model defaults.
- `plugins.item`, `plugins.bundle.config`, and `plugins.detail.section` registrations must remain inert when the `omnimux` config namespace is not served.

## Gateway issue boundary

The plugin repository does not modify gateway source. The gateway repository issue requests:

- structured `reasoning_efforts` and `default_reasoning_effort`;
- top-level `defaults` map for primary operations, only referencing on-sale model IDs;
- public schema/source alignment for `tool_calling`, `streaming`, `prompt_caching`, and `unknowns`;
- no billing, routing, pricing, or on-sale changes.

The plugin P0 uses existing live fields and falls back deterministic if the gateway enhancement is not merged.

## Failure and compatibility

- Empty or membership-less refresh never replaces a usable snapshot; disappearance guard remains.
- Refresh failure marks the old snapshot stale and keeps serving it; UI shows an error code, not raw upstream detail.
- Manual refresh coalesces concurrent requests; repeated clicks do not create duplicate fetches.
- Settings writes keep revision conflict behavior; failed writes preserve drafts.
- Old `cordis.patch.yml`, `catalog-defaults.json`, `canvasHiddenModels`, and legacy BYOK records remain readable; no user data is cleared.
- A model whose `supportedEndpointTypes` cannot be served by the existing OpenAI-compatible route is `unsupported` for that route and is never shown as executable.

## Testing strategy

- Unit: gateway contract mapping, catalog projection, composer list composition, composer sync idempotence/conflict, default policy, settings section auto/reset, manual refresh route.
- Integration: bundled/live snapshot fixture with a new model, removed model, partial execution profile, empty snapshot, stale snapshot and disappearance guard.
- UI: worktree browser acceptance on official Plugins page for bundle toggle, hub bundle configuration, vertical bundle summary, catalog refresh success/failure.
- Contract: model-contract, cross-plugin model alignment, model list snapshot, product baseline, stage/slot checks, plugin-load checks.
- No real model API requests. Use bundled snapshots and local fixtures; live gateway inspection is a read-only catalog check only.

## Boundaries

- Always: keep gateway as membership authority; mark unknown execution fields; preserve explicit user values; record test evidence.
- Ask first: gateway source changes, production deployment, real model generation, pricing or provider changes.
- Never: hardcode gateway model IDs as the default for normal operation; modify official DSH source; delete user settings; write secrets into settings.

## Success criteria

- A fixture model added to the gateway snapshot appears in `/omnimux/model-catalog` and the composer after the next sync, with its execution fields intact.
- A fixture model removed from the snapshot disappears from all pickers/composer; a saved explicit default stays visible as `needsConfirmation`.
- A model with missing `context_window_tokens` or `max_output_tokens` is marked `unverified` and never selected as the automatic default.
- Official DSH Plugins page lists every OmniMux bundle with an independent switch; each cloud-model-consuming bundle detail shows the shared model summary/settings.
- `pnpm --filter omnimux test`, `pnpm --filter omnimux-workflow test`, `pnpm verify:model-contracts`, `pnpm catalog:snapshot:check`, `pnpm verify:models`, `pnpm verify:cross-plugin-models`, `pnpm verify:product-baseline`, stage/slot and plugin-load checks pass.

## 旧标准变更

- `plugins/omnimux/src/auth/http-routes.test.js` :: `apply mounts auth routes when webServer arrives through inject`
  - 原断言：完整路由清单不含 `/omnimux/model-catalog/refresh`。
  - 必须改：新增手动刷新路由；原快照会漏掉合法新增路由。
  - 新证据：清单包含 refresh 路由，其余顺序不变，`node --test plugins/omnimux/src/auth/http-routes.test.js` 通过。
- `plugins/omnimux/src/catalog/composer-list.test.js` :: `appends hub-only ids after shipped rows, carrying only id and label`
  - 原断言：网关独有模型只允许 `id`/`label`，不得带执行字段。
  - 必须改：执行档案现在由 gateway contract 的 `executionProfile` 动态提供，旧断言会把合法的 context/max/input 映射判成回归。
  - 新证据：新用例断言完整档案字段被映射，缺失字段仍不猜；`node --test plugins/omnimux/src/catalog/composer-list.test.js` 通过。
- `plugins/omnimux/src/catalog/http.test.js` :: `repair repeated mounted guarded labels yield fixed catalog unavailable on both new routes only`
  - 原断言：catalog 路由只有一条 registration。
  - 必须改：新增手动刷新路由后，注册表必须同时捕获两条 route，不能把 refresh 当成 catalog 路由。
  - 新证据：按路由 path 分派 catalog 与 refresh，两个响应均不泄漏；`node --test plugins/omnimux/src/catalog/http.test.js` 通过。
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `只放行「自动化任务」，官方「插件」被排除`
  - 原断言：白名单只包含 `schedules`。
  - 必须改：用户要求通过 DSH 官方插件管理开关和配置插件；官方 `plugins` 面板必须进入「更多」菜单，而不是被产品自研应用商店完全遮挡。
  - 新证据：白名单包含 `plugins` 与 `schedules`，过滤仍使用白名单；`node --test plugins/omnimux/src/client/explore-more-menu.test.js` 通过。
- `plugins/omnimux/src/client/settings-placement.test.js` :: `keeps only product chrome on the first-level Settings nav`
  - 原断言：源码不得出现 `ModelsSettingsCard` 或 `omnimux-model-settings`。
  - 必须改：模型设置卡已重新注册到官方 Plugins 页座位，旧断言相反。
  - 新证据：断言 `ModelsSettingsCard`、`omnimux-model-settings` 和 `plugins.bundle.config` 注册存在；`node --test plugins/omnimux/src/client/settings-placement.test.js` 通过。
- `plugins/omnimux/src/settings/omitted-model-defaults.test.js` :: `3312: invalid saved defaults fall back to legal fixed catalog models and all four public executors remain usable`
  - 原断言：没有显式分析默认时 `analysis` 必须为空。
  - 必须改：现在未显式选择时按网关目录自动解析，`gemini-3.8-flash` 可作为兼容的分析默认；空值不再是唯一合法状态。
  - 新证据：默认分析指向真实 ready 多模态模型，显式无效默认仍标记待确认；`node --test plugins/omnimux/src/settings/omitted-model-defaults.test.js` 通过。
- `plugins/omnimux/src/settings/omitted-model-defaults.test.js` :: `3312: saved defaults pointing at delisted models resolve only to the fixed real published catalog`
  - 原断言：分析默认必须为空。
  - 必须改：同上，未显式选择时的自动分析默认由目录解析。
  - 新证据：同上，`node --test plugins/omnimux/src/settings/omitted-model-defaults.test.js` 通过。
- `plugins/omnimux/src/text/catalog.test.js` :: `defaults to the single listed chat-directory model, all enabled`
  - 原断言：`parseTextConfig(undefined).defaultModel` 固定为 `gemini-3.8-flash`。
  - 必须改：`defaultModel` 改为空值表示自动；实际默认由目录/网关推荐解析，避免静态 ID 覆盖动态目录。
  - 新证据：断言空值，并验证命名缺省请求仍能解析到第一个 enabled 文本模型；`node --test plugins/omnimux/src/text/catalog.test.js` 通过。
- `plugins/omnimux/src/text/catalog.test.js` :: `keeps the default table frozen identity for omitted config`
  - 原断言：`DEFAULT_TEXT.defaultModel` 为静态 `gemini-3.8-flash`。
  - 必须改：删掉静态默认 ID，改为空值；这是模型目录动态化的核心修正。
  - 新证据：断言空值且模型表仍冻结；`node --test plugins/omnimux/src/text/catalog.test.js` 通过。

## 假设

- 网关线上 `/api/pricing` 已返回大部分执行档案字段，插件不需要等待网关 PR 才能读取现有 `context_window_tokens`、`max_output_tokens`、`input_modalities`、`tool_calling`、`streaming`、`prompt_caching` 和 `unknowns`。
- 官方 DSH Plugins 页按 bundle 列出所有 OmniMux 包；`omnimux` 是其他 OmniMux 包的运行时依赖，因此停用它会影响其他包。
- `llm-pi-ai` 的 `models` 列表必须保持非空才能挂载手写 provider 路由；因此保留一行仅用于启动的 bootstrap，不把它当作默认或权威目录。

## 证伪方式

- 用一个包含全新模型和缺失执行字段的 fixture snapshot 跑目录与 composer 测试；若模型没有出现在列表、字段丢失、被猜出默认上下文/输出值，或默认模型仍固定为旧 ID，则方案失败。
- 用一个删除模型的 fixture 跑刷新；若已保存的显式默认被静默改写、旧快照被空列表覆盖、或 composer 清空，则方案失败。
- 在官方 Plugins 页实际打开至少一个 hub bundle 和一个垂直 bundle；若看不到独立开关、看不到共享模型摘要/配置，或写入没有进入同一个 `omnimux` scope，则方案失败。
