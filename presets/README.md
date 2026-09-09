# OmniMux 出厂 Agent Presets

顶部会话模式下拉对齐出厂预设：

| id | 显示名（中 / 英） | order | 说明 |
|---|---|---|---|
| `tiktok-agent` | TikTokAgent / TikTokAgent | 1 | 出厂默认主力 Agent：专注 TikTok 营销内容自动化，整合账号运营、爆款文案、口播配音、视觉生图、视频分镜、BGM 配乐、剪辑成片与评论互动增长（挂载 10 位垂直专家） |
| `standard` | 代码开发 / CodeDev | 2 | 全功能代码开发与工程实现 Agent：专注架构设计、代码编写、Shell 命令执行、代码审查、测试验证与工程闭环交付 |
| `daily-work` | 日常工作 / WorkAssistant | 3 | 通用日常办公与工作协同 Agent：专注待办排期、工作周报、文档与方案拟定、会议纪要提炼、信息搜集整理与综合事务闭环 |
| `cordis` | 创造模式 / Creator Mode | 4 | 原生创造模式 Agent：具备标准模式的全部能力，并提供运行时检查、插件实验与 Agent 预设创作指导 |

## 产品化机制

1. 本目录是 **OmniMux 产品真源**（不是 DSH 上游 `config/agent-presets`）。
2. `scripts/sync-agent-presets.sh` 物化到：
   - `app.asar.unpacked/.../config/agent-presets/`（真实文件）
   - 同长度 patch `app.asar` header，把出厂目录保留为 `tiktok-agent`、`standard`、`daily-work` 与 `cordis`（Electron 先读 asar 清单）
   - 可选清理 `~/.dsh/.agent-presets` 旧用户预设
3. Profile `cordis.patch.yml` 必须设置：

```yaml
- id: agent-presets
  config:
    default: tiktok-agent
    includeUserRoot: false
```

这样顶部下拉保留出厂的四大预设体系，且前端通过 `agent-presets-i18n.js` 自适应注入中英双语展示名称与描述。

## 专家团与组建团队机制

- **默认主力预设 `tiktok-agent`**：主会话定位为「TikTokAgent」主理人，内置完整营销运营全流程能力，并挂载 10 个具名 expert_* 社媒专家工具。
- **代码开发预设 `standard`**：全功能代码开发与工程实现 Agent，面向技术架构、业务研发与测试闭环。
- **日常工作预设 `daily-work`**：通用日常办公与事务协同 Agent，面向规划跟踪、文档撰写、会议纪要与综合事务推进。
- **创造模式 `cordis`**：原生创造模式，用于检查运行时、插件实验与创作自定义 Agent 预设配置。
- 专家 spawn 真源在 `presets/fragments/`，由 `scripts/build-agent-presets.mjs` 插入 `presets/tiktok-agent/agent.cordis.yml`。
