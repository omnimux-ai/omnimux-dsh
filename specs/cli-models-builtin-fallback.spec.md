# 修复本机 CLI 下拉模型列表在后端未重启时为空的防御性兼容规格（Issue #2623）

## 背景与问题陈述
在设置界面中展开已安装的 Codex CLI（或其他 CLI），下拉菜单点开后仅显示单一选项「CLI 默认设置」，无法看到该 CLI 对应的可用模型 ID 列表。

## 根本原因
1. 宿主后台 Node.js 进程为常驻后台服务。使用 `sync-to-app.sh` 能够热重载前端 Client bundle，但后台常驻服务在未物理重启前依然运行旧版本，其响应的 `GET /omnimux/agents` 接口数据中未携带 `models` 字段（`agent.models` 为 `undefined`）。
2. 前端 `RuntimeModeSection.jsx` 仅读取 `agent.models`，未做前端内置预设映射表（`CLI_KNOWN_MODELS`）的防御性保底机制，导致 options 列表退化为仅含首项「CLI 默认设置」。

## 改造方案
1. **前端自包含官方主流模型映射表**：
   在 `RuntimeModeSection.jsx` 中声明已知四大 CLI 的官方主流模型列表常量 `CLI_KNOWN_MODELS`：
   - `claude`: `['claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus']`
   - `codex`: `['gpt-4o', 'o3-mini', 'o1', 'gpt-4.5-preview']`
   - `kimi`: `['kimi-latest', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k']`
   - `qwen`: `['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-2.5-coder-32b']`
2. **保底解析逻辑**：
   ```javascript
   const agentModels = (Array.isArray(agent.models) && agent.models.length > 0)
     ? agent.models
     : (CLI_KNOWN_MODELS[agent.id] || [])
   ```
   当后端未返回 `models`（如旧版常驻服务或网络波动）时，自动使用内置模型列表保底；当新版后端动态返回时，优先无缝采用后端数据。
3. **验证与交付**：
   - 端到端测试中模拟老版本接口（无 `models` 字段的 agent），断言前端依然能自动列出完整候选模型并正常选择与保存。

## 验收断言标准 (Spec Criteria)
- **S1 (旧后端兼容与保底)**：在 `agent.models` 未提供或为空数组时，Codex、Claude、Kimi、Qwen 的下拉列表依然拥有对应的官方主流模型选项。
- **S2 (首项默认设置)**：首项严格为「CLI 默认设置」（value 为 `""`）。
- **S3 (全套测试 100% 绿)**：端到端与单元测试全部通过。
