# 修复旧后台进程残留模型拦截：前端彻底过滤历史旧 ID 并强制对齐最新真实模型规格（Issue #2632）

## 背景与问题陈述
在设置的「本机 CLI」面板中，用户展开 Codex CLI 后，下拉菜单中依然显示 `gpt-4o`、`o3-mini`、`o1`、`gpt-4.5-preview` 等已被废弃的历史模型，未能立即呈现 `gpt-6-astra` 等最新模型。

## 根因剖析
1. 宿主后台 Node.js 进程为常驻后台服务。使用 `sync-to-app.sh` 能够热重载前端 Client bundle，但后台常驻服务在未物理重启前依然运行前序版本内存，其响应的 `GET /omnimux/agents` 接口数据中返回了旧版本 `KNOWN_AGENTS` 写入内存的 `models: ['gpt-4o', 'o3-mini', ...]`。
2. 前端 `RuntimeModeSection.jsx` 原判断逻辑为：
   ```javascript
   const dynamicModels = Array.isArray(agent.models) && agent.models.length > 0 ? agent.models : null
   const agentModels = dynamicModels || CLI_KNOWN_MODELS[agent.id] || []
   ```
   因为旧常驻服务返回的 `agent.models` 非空且包含 `gpt-4o`，前端直接信任并采纳了后端旧数据，导致前端内置的最新模型矩阵被阻断覆盖。

## 改造方案
1. **建立历史废弃模型黑名单或陈旧数据探针拦截**：
   声明常驻旧进程特征黑名单：`const LEGACY_OBSOLETE_MODELS = new Set(['gpt-4o', 'o1', 'o3-mini', 'kimi-latest', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'])`；
2. **严格过滤清洗策略**：
   - 当 `agent.models` 包含旧模型 ID（如 `gpt-4o`）且未包含最新首发模型（如 `gpt-6-astra`）时，判定为旧常驻后台进程残留，前端直接强制使用前端最新内置模型列表（`CLI_KNOWN_MODELS[agent.id]`）；
   - 对后端返回的任何 models 数组，过滤剔除所有包含在 `LEGACY_OBSOLETE_MODELS` 中的过时项；如果过滤后为空，自动降级为 `CLI_KNOWN_MODELS[agent.id]`；
3. **持久化存储自愈清理机制**：
   若用户本地存储中已存有历史废弃模型（`runtimeAgentModel` 为 `gpt-4o`、`o1` 等），在组件挂载初始化或变更时，自动检测并主动触发自愈清除（`setAgentModel('')` 并通过 `scope.set('runtimeAgentModel', '')` 同步清理底层持久化存储），确保历史脏数据彻底消除，前端界面与底层数据完全对齐。
4. **保证效果**：
   用户端无需物理重启底座后台常驻服务，在浏览器中刷新（Cmd+R）后，100% 立即看到 `gpt-6-astra`、`gpt-6-sol`、`gpt-5.6-sol` 等当前最新可用模型；本地旧存储中的过时废弃模型自动完成静默自愈消除！

## 验收断言标准 (Spec Criteria)
- **S1 (旧模型拦截与过滤)**：即便接口返回包含了 `['gpt-4o', 'o3-mini', 'o1', 'gpt-4.5-preview']`，前端下拉菜单中也绝对不出现这些旧模型。
- **S2 (强制对齐最新模型)**：前端下拉菜单稳定展示包含 `gpt-6-astra`、`gpt-6-sol`、`gpt-5.6-sol` 等最新模型。
- **S3 (持久化废弃模型自愈清除)**：若底层持久化存储中存在废弃模型（如 `gpt-4o`, `o1`），组件挂载或模型变化时自动重置为 `''` 并同步清空底层 scope 中的 `runtimeAgentModel`。
- **S4 (全套测试回归)**：端到端与单元测试 100% 绿灯。
