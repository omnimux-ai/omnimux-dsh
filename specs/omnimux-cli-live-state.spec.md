# 本机 CLI 配置实时读取（Issue #4062）

## Objective

本机 CLI 面板显示的模型清单、登录态与计数来自各 CLI 自己的当前配置，读不到时明确标为预设，而不是把静态兜底当成实时。

## User journey

1. 用户打开官方「插件 → omnimux → 模型设置」，进入「本机 CLI」。
2. 面板显示「已安装 N / 已知 4」，每个已安装 CLI 的版本号来自现场 `--version`。
3. 选中某个 CLI，模型下拉列出它自己配置里的模型；标题旁标明「实时」或「预设」，预设时说明官方未提供模型列表。
4. Codex 与 Kimi 显示实时名单；Claude 显示预设名单；Qwen 若在 `~/.qwen/settings.json` 配了 `modelProviders` 与对应 key，显示实时名单并视为已配置，否则显示「未配置」。
5. 用户切到其他标签再切回、或离开窗口后重新聚焦，面板自动刷新（30 秒节流）；点「重新扫描」立即跨过缓存重读。

## Root cause

`probeAgentModels` 只对 Codex（`codex debug models` / `models_cache.json`）和 Kimi（`~/.kimi-code/config.toml`）做实时读取；Claude 与 Qwen 永远回落到 `KNOWN_AGENTS.models` 常量。Qwen 的登录态仍探测已废弃的 `~/.qwen/oauth_creds.json`，而当前 Qwen Code 的配置在 `~/.qwen/settings.json`（`modelProviders`、`security.auth.selectedType`、`env`）。此外模型探测是同步 `execFileSync`，每次扫描阻塞事件循环约 1-2 秒。

## Scope

- `plugins/omnimux/src/agents/local.js`
  - 新增异步 `probeAgentModelsDetailed(id, options) -> { models, source }`；Codex/Kimi/Qwen 有实时来源，Claude 固定 `preset`。
  - Qwen 从 `~/.qwen/settings.json` 的 `modelProviders`（每个 provider 为模型数组，取 `id`）读取，兜底 `model.name`。
  - 新增 `createAgentModelResolver({ ttlMs, now, cache })` 与模块级默认实例；`refresh` 跳过缓存。
  - `scanLocalAgents` 接受 `refresh` 与 `resolveModels`，每行新增 `modelsSource`。
  - 保留同步 `probeAgentModels` 不变（既有调用与测试）。
- `plugins/omnimux/src/agents/auth.js`
  - 新增通用 `kind: 'config'` 探测：按声明读取 `selectedType`、`modelProviders` 的 `envKey`、`env` 层与进程环境，只判断非空。
  - Qwen 能力表改为 `config` 规格 + 旧 `oauth_creds.json` 兼容；只有 `selectedType` 但凭据不可解析 → `unknown`；完全未配置 → `signed-out`。
- `plugins/omnimux/src/agents/http.js`：`GET /omnimux/agents?refresh=1` 透传；行携带 `modelsSource`。
- 客户端：计数文案、来源标签与预设提示、「未配置」文案、自动刷新（标签激活 / `focus` / `visibilitychange`，30 秒节流）；手动重扫对 agents 与 updates 都带 `refresh=1`。
- 测试与证据：新增单测、HTTP 测试、客户端渲染测试与真实应用旅程。

## Acceptance cases

1. Qwen fixture（`modelProviders` + `env` key）→ 返回 provider 里的模型且 `modelsSource === 'live'`，登录态 `signed-in`。
2. Qwen 无配置 → 预设模型、`modelsSource === 'preset'`、登录态 `signed-out`；只有 `selectedType` 没有 key → `unknown`。
3. Claude 任何情况下 `modelsSource === 'preset'`；Codex/Kimi fixture → `live`。
4. 解析器在 TTL 内命中缓存不重复探测，`refresh: true` 绕过。
5. `GET /omnimux/agents?refresh=1` 把 refresh 传给扫描，响应行含 `modelsSource`。
6. 客户端渲染「已安装 N / 已知 4」、显示「实时」「预设」标签；焦点事件触发第二次拉取，30 秒内不重复。
7. 真实应用旅程：打开 CLI 面板、断言计数与来源标签、点重新扫描后页面仍挂着。

## 假设

Qwen Code 0.26.x 把模型与鉴权声明在 `~/.qwen/settings.json` 的 `modelProviders`、`security.auth.selectedType`、`env` 中，且 `envKey` 缺省时按 auth 类型回退到 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY`；Codex 的 `debug models` 与 Kimi 的 `config.toml` 仍是各自可靠的实时来源；GUI 宿主进程可能缺少用户的 shell 环境变量，因此凭据不可解析时只能记 `unknown`。

## 证伪方式

在真实机器把 Qwen 配好 provider 与 key 后打开面板：若仍显示「未配置」或模型下拉没有这些模型，则实时读取不成立；若未配置任何东西的机器显示已登录，则登录态判定错误。另在面板首次打开计时：若仍出现超过 1 秒的同步阻塞（首屏无响应），或点「重新扫描」后模型列表不变，则缓存与刷新方案失败。