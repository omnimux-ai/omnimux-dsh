# OmniMux 出厂 Agent Presets

顶部会话模式下拉对齐出厂预设：

| id | 显示名（中 / 英） | order | 说明 |
|---|---|---|---|
| `standard` | OmniAgent / OmniAgent | 1 | 默认 Agent：挂载全部 10 位专家工具，覆盖 TikTok 营销全链路 |
| `cordis` | 组建团队 / Team Builder | 2 | 具备原生 cordis 运行时检查、插件实验与团队预设创作指导能力 |

## 产品化机制

1. 本目录是 **OmniMux 产品真源**（不是 DSH 上游 `config/agent-presets`）。
2. `scripts/sync-agent-presets.sh` 物化到：
   - `app.asar.unpacked/.../config/agent-presets/`（真实文件）
   - 同长度 patch `app.asar` header，把出厂目录保留为 `standard` 与 `cordis`（Electron 先读 asar 清单）
   - 可选清理 `~/.dsh/.agent-presets` 旧用户预设
3. Profile `cordis.patch.yml` 必须设置：

```yaml
- id: agent-presets
  config:
    default: standard
    includeUserRoot: false
```

这样顶部下拉保留标准出厂的两大预设，且前端通过 `agent-presets-i18n.js` 自适应注入中英双语展示名称与描述。

## 专家团与组建团队机制

- **默认预设 `standard`**：主会话定位为「OmniAgent」主理人，内置完整营销运营全流程能力，并挂载 10 个具名 expert_* 社媒专家工具。
- **组建团队 `cordis`**：用于自定义与探索 Agent、插件及预设配置。
- 专家 spawn 真源在 `presets/fragments/`，由 `scripts/build-agent-presets.mjs` 插入 `presets/standard/agent.cordis.yml`。
