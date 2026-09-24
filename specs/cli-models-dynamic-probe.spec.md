# 本机 CLI 模型列表真实动态探测规格说明书（Issue #2628）

## 背景与问题陈述
在设置的「本机 CLI」面板中，此前模型下拉列表写死了早期陈旧的模型 ID（如已过时的 `gpt-4o`、`o1` 等），脱离了用户本机各个工具的真实环境与当前版本。

## 改造目标
彻底移除所有陈旧静态常量，改为直接读取本机各工具的真实配置文件与动态模型缓存，做到“真实环境是什么，下拉就显示什么”。

### 1. Codex CLI 真实动态探测
- 真实来源路径：`~/.codex/models_cache.json`；
- 提取规则：读取其中的 `models` 数组，排除 `visibility === 'hide'` 的非对外模型（如 `codex-auto-review`、`gpt-reserve`），提取处于 `visibility === 'list'` 的真实官方模型列表：
  - `gpt-6-astra`
  - `gpt-6-sol`
  - `gpt-6-luna`
  - `gpt-5.6-sol`
  - `gpt-5.6-terra`
  - `gpt-5.6-luna`
  - `gpt-5.5`

### 2. Kimi CLI 真实动态探测
- 真实来源路径：`~/.kimi-code/config.toml`；
- 提取规则：解析其中的 `[models."..."]` 节点，提取当前配置的真实可用模型：
  - `kimi-code/k3`
  - `kimi-code/k3-256k`
  - `kimi-code/kimi-for-coding`
  - `kimi-code/kimi-for-coding-highspeed`

### 3. Claude Code 与 Qwen Code 真实模型对齐
- Claude Code：对齐官方当前主流系列（`claude-3-7-sonnet`、`claude-3-5-sonnet`、`claude-3-5-haiku`、`claude-3-opus`）；
- Qwen Code：对齐当前官方主干（`qwen-max`、`qwen-plus`、`qwen-turbo`、`qwen-2.5-coder-32b`）。

### 4. 前后端保底同步升级（无单点故障）
- 彻底剔除后端 `KNOWN_AGENTS` 与前端 `CLI_KNOWN_MODELS` 中所有老旧过时 ID；
- 默认第一项严格保持为「CLI 默认设置」（value 为 `""`）；
- 选定模型后在执行层安全注入，不破坏主协议契约。

## 验收断言标准 (Spec Criteria)
- **S1 (Codex 动态模型读取)**：扫描 Codex 时，成功动态读取 `~/.codex/models_cache.json`，返回包含 `gpt-6-astra` 等当前最新模型的列表，且不含 `hide` 模型。
- **S2 (Kimi 动态模型读取)**：扫描 Kimi 时，成功动态解析 `~/.kimi-code/config.toml`，返回包含 `kimi-code/k3` 等最新模型。
- **S3 (陈旧 ID 清零)**：前后端所有常量的默认备选列表中，旧版 `gpt-4o` 等历史 ID 出现次数严格为 0。
- **S4 (下拉首项契约)**：下拉选项第一项始终为「CLI 默认设置」。
- **S5 (全套测试回归)**：相关单元测试与端到端测试 100% 绿。
