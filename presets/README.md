# OmniMux 出厂 Agent Presets

顶部会话模式下拉对齐出厂预设：

| id | 显示名（中 / 英） | order | 说明 |
|---|---|---|---|
| `tiktok-agent` | TikTokAgent / TikTokAgent | 1 | 出厂默认主力 Agent：专注 TikTok 营销内容自动化，整合账号运营、爆款文案、口播配音、视觉生图、视频分镜、BGM 配乐、剪辑成片与评论互动增长（挂载 10 位垂直专家） |
| `standard` | 通用Agent / GeneralAgent | 2 | DSH 原生默认 Agent：全功能通用编码与智能协作 Agent，支持文件编辑、Shell、检索、Skills、计划、目标、子代理与工作流 |
| `cordis` | 组建团队 / Team Builder | 3 | 原生创建模式 Agent：自主组建与配置自定义 Agent 专家团队，支持运行时检查、插件实验与团队创作指导 |

## 产品化机制

1. 本目录是 **OmniMux 产品真源**（不是 DSH 上游 `config/agent-presets`）。
2. `scripts/sync-agent-presets.sh` 物化到：
   - `app.asar.unpacked/.../config/agent-presets/`（真实文件）
   - 同长度 patch `app.asar` header，把出厂目录保留为 `tiktok-agent`、`standard` 与 `cordis`（Electron 先读 asar 清单）
   - 可选清理 `~/.dsh/.agent-presets` 旧用户预设
3. Profile `cordis.patch.yml` 必须设置：

```yaml
- id: agent-presets
  config:
    default: tiktok-agent
    includeUserRoot: false
```

这样顶部下拉保留出厂的三大预设体系，且前端通过 `agent-presets-i18n.js` 自适应注入中英双语展示名称与描述。

## 专家团与组建团队机制

- **默认主力预设 `tiktok-agent`**：主会话定位为「TikTokAgent」主理人，内置完整营销运营全流程能力，并挂载 10 个具名 expert_* 社媒专家工具。
- **通用编码预设 `standard`**：DSH 原生标准全功能编码 Agent，面向通用研发协作。
- **组建团队 `cordis`**：用于自定义与探索 Agent、插件及预设配置。
- 专家 spawn 真源在 `presets/fragments/`，由 `scripts/build-agent-presets.mjs` 插入 `presets/tiktok-agent/agent.cordis.yml`。
