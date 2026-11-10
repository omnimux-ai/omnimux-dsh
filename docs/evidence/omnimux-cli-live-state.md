# 本机 CLI 配置实时读取（Issue #4062）

## 结论

模型清单现在按各 CLI 自己的当前配置读取，并在接口与界面上标明来源：

| CLI | 模型来源 | 说明 |
| --- | --- | --- |
| Codex | `codex debug models` → `~/.codex/models_cache.json` | 实时 |
| Kimi | `~/.kimi-code/config.toml` 的 `[models."..."]` | 实时 |
| Qwen | `~/.qwen/settings.json` 的 `modelProviders`（兜底 `model.name`） | 实时；不再读已废弃的 `oauth_creds.json` 作为唯一判断 |
| Claude | 内置预设 | 官方 CLI 没有列模型的命令，界面显式标注「预设」 |

Qwen 登录态改读 `security.auth.selectedType` 与可解析的 envKey（`modelProviders[].envKey`，缺省按协议取 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY`）；只在 settings 的 `env` 层或进程环境里判断非空，不读取密钥值。只有协议、看不到 key 时记 `unknown`（GUI 进程可能没有 shell 变量），完全没配置才记 `signed-out`，界面显示「未配置」而不是死胡同的「需要登录」。

## 探测与刷新

- 新增异步明细探测 `probeAgentModelsDetailed` 与 5 分钟缓存 `createAgentModelResolver`；页面、更新检查与手动扫描共用同一份缓存。
- `GET /omnimux/agents?refresh=1` 跨过缓存；手动「重新扫描」同时刷新版本检查。
- 切到 CLI 标签、窗口重新聚焦或页面重新可见时自动刷新，30 秒节流；隐藏时不触发。
- 计数据改为「已安装 N / 已知 4」，取自真实扫描结果。

## 真实应用证据

`node scripts/worktree-app-qa.mjs --journey plugins/omnimux/tests/e2e/agent-models-live.journey.mjs`

通过 22 项断言，其中：

- `journey:installed-count-matches-cards`：计数与实际可用卡片数一致；
- `journey:count-line-names-both-totals`：状态行显示「已安装 N / 已知 4」；
- `journey:model-source-declared`：来源标签取值为 `live` / `preset`；
- `journey:rescan-keeps-panel`：点击重新扫描后页面仍挂载。

本机实测（合成 QA 环境）：状态行「已安装 2 / 已知 4」，Codex 卡片显示需要登录，Qwen 卡片显示未配置，选中 CLI 的模型标签为「实时」。

证据：`app-qa-report.json`、`cli-live-panel.png`、`probe-observed.json`（探测阶段的原始读数）。