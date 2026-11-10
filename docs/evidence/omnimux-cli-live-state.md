# 本机 CLI 配置实时读取（Issue #4062）

## 结论

模型清单现在按各 CLI 自己的当前配置读取，并在接口与界面上标明来源：

| CLI | 模型来源 | 说明 |
| --- | --- | --- |
| Codex | `codex debug models`（用解析到的绝对路径与扩展 PATH）→ `~/.codex/models_cache.json` | 实时 |
| Kimi | `~/.kimi-code/config.toml` 的 `[models."..."]` | 实时 |
| Qwen | `~/.qwen/settings.json` 的 `modelProviders`（兜底 `model.name`） | 实时 |
| Claude | 内置预设 | 官方 CLI 没有列模型的命令，界面显式标注「预设」 |

Qwen 登录态改读 `security.auth.selectedType` 与可解析的 envKey：`modelProviders[].envKey` 优先，缺省按协议取 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY`。选中协议时只看该协议对应的 provider，不会借用其它 provider 的 key。只在 settings 的 `env` 层与进程环境里判断非空，不读取密钥值。已配置模型或协议但看不到 key 时记 `unknown`（GUI 进程可能没有 shell 变量）；什么都没配才记 `signed-out`，界面显示「未配置」而不是死胡同的「需要登录」。

## 探测与刷新

- 新增异步明细探测 `probeAgentModelsDetailed` 与 5 分钟缓存 `createAgentModelResolver`；页面、更新检查与手动扫描共用同一份缓存。
- `GET /omnimux/agents?refresh=1` 跨过缓存；手动「重新扫描」同时刷新版本检查。
- 切到 CLI 标签、窗口重新聚焦或页面重新可见时自动刷新，30 秒节流；未激活的标签与隐藏页都不触发。
- 计数改为「已安装 N / 已知 4」，取真实扫描结果。

## 真实应用证据

`node scripts/worktree-app-qa.mjs --journey plugins/omnimux/tests/e2e/agent-panel-live-state.journey.mjs`

通过 24 项断言，其中：

- `journey:installed-count-matches-cards`：计数与实际可用卡片数一致；
- `journey:count-line-names-both-totals`：状态行显示「已安装 N / 已知 4」；
- `journey:model-source-visible` / `journey:model-source-declared`：先选中一个已安装 CLI，再断言来源标签存在且取值为 `live` / `preset`；
- `journey:count-line-in-viewport` / `journey:model-source-in-viewport`：计数行与来源标签都在截图视口内；
- `journey:rescan-keeps-panel`：点击重新扫描后页面仍挂载。

截图 `cli-live-panel.png` 中可见「重新扫描 · 已安装 2 / 已知 4」与 CLI 卡片；本机探测阶段读数为 `probe-observed.json`（Codex、Kimi 实时，Qwen「未配置」，选中 CLI 来源 `live`）。

## 说明

`agent-models-live.journey.mjs` 是首版冒烟（来源断言允许 null），本任务新增的 `agent-panel-live-state.journey.mjs` 是权威版本，验收以上面的 24 项断言为准。