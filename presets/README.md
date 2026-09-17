# OmniMux 出厂 Agent Presets

顶部会话模式下拉对齐出厂预设：

| id | 显示名（中 / 英） | order | 说明 |
|---|---|---|---|
| `cordis` | 创建Agent / Create Agent | 1 | 插件实验开发、运行时检查与团队搭建。 |
| `drama-agent` | 短剧专家 / Short Drama Showrunner | 2 | 微短剧工业化编剧、分镜运镜、多角色配音、剪辑成片与出海译配。 |
| `daily-work` | 日常工作 / WorkAssistant | 3 | 日常办公协同、文档拟定与事务闭环。 |
| `omni-agent` | 社媒专家 / Social Media Lead | 4 | 全域社媒爆款创作与矩阵运营增长（默认值守主力 Agent）。 |
| `marketing-agent` | 营销专家 / Marketing Lead | 5 | 全域获客、创意策划、全渠道投放与ROI数据归因。 |
| `marketing-growth-team` | 增长专家团 / Growth Team Lead | 6 | 全栈营销增长操盘：转化率优化、搜索与内容、获客投放与 ROI 归因复盘。 |

## 产品化机制

1. 本目录是 **OmniMux 产品真源**（不是 DSH 上游 `config/agent-presets`）。
2. `scripts/sync-agent-presets.sh` 物化到：
   - `app.asar.unpacked/.../config/agent-presets/`（真实文件）
   - 同长度 patch `app.asar` header，把出厂目录保留为 `omni-agent`、`marketing-agent`、`drama-agent`、`standard`、`daily-work` 与 `cordis`（Electron 先读 asar 清单）
   - 可选清理 `~/.dsh/.agent-presets` 旧用户预设
3. Profile `cordis.patch.yml` 必须设置：

```yaml
- id: agent-presets
  config:
    default: omni-agent
    includeUserRoot: false
```

这样顶部下拉保留出厂的预设体系（按字母正序排布，且默认激活「社媒专家」），前端通过 `agent-presets-i18n.js` 自适应注入中英双语展示名称与描述。

## 专家团与组建团队机制

- **默认主力预设 `omni-agent`（社媒专家）**：主会话定位为「社媒专家」主理人，内置完整社媒全网爆款运营能力，并挂载 10 个具名 expert_* 社媒专家工具。
- **营销专家 `marketing-agent`**：营销战役全案总监，下辖 6 位营销增长专家。
- **增长专家团 `marketing-growth-team`**：首席营销策略师主理人，下辖 4 位增长专家（转化率优化、搜索与内容、获客、数据归因），面向 AARRR 全链路增长。
- **短剧专家 `drama-agent`**：微短剧工业化制作人，下辖 6 位短剧全流程专家。
- **代码开发预设 `standard`**：全功能代码开发与工程实现 Agent，面向技术架构、业务研发与测试闭环。
- **日常工作预设 `daily-work`**：通用日常办公与事务协同 Agent，面向规划跟踪、文档撰写、会议纪要与综合事务推进。
- **创建Agent `cordis`**：原生创造与组建团队模式，用于检查运行时、插件实验与创作自定义 Agent 预设配置。
- 专家 spawn 真源在 `presets/fragments/`，由 `scripts/build-agent-presets.mjs` 自动插桩合并。
