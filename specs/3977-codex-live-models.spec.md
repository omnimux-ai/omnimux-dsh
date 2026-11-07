# Codex 模型列表实时化（Issue #3977）

## 背景

用户模型下拉只看到 `gpt-6-luna / gpt-5.6-terra / gpt-5.6-luna`。实际 `codex debug models` 返回 12 个模型，包含 `gpt-6.1-sol / gpt-6.1-terra` 等；插件只读 `~/.codex/models_cache.json`，该缓存 `visibility=list` 仅 3 项，因此不是实时目录。

## 目标

- `probeAgentModels('codex')` 优先执行 `codex debug models`（5s 超时），解析 JSON `models[].slug`，过滤 `visibility==='list'` 与安全 ID。
- 命令失败/超时/JSON 不合法时回退 `models_cache.json`，再回退静态 `KNOWN_AGENTS` 模型表。
- 同步函数签名不变；测试注入 `runCodexModels` 避免依赖真实 CLI。

## 非目标

- 不改其它 CLI 模型发现；不持久化 catalog。

## 假设

- Codex CLI 0.167+ 的 `debug models` 输出 `{models:[{slug,visibility}]}`，是当前可用的实时目录来源。
- 实时命令失败不应清空已有模型，必须回退缓存/静态表。

## 证伪方式

- 注入 `runCodexModels` 返回含 `gpt-6.1-sol` 与 hidden `codex-auto-review` 的 JSON：若结果不含前者或含后者，实时优先/过滤不成立。
- 注入 `runCodexModels` 抛错并给临时 `codexPath` 缓存：若结果不是缓存 list，回退不成立。

## 验收

- 模型下拉包含实时 `codex debug models` 的 9 个可见模型（本机实测），缓存仅 3 个时也能看到 gpt-6.1-sol。
- 命令不可用环境仍回退缓存/静态表，不崩溃。
