# Spec · 修复 Agent 预设缺失配置导致切换报错 (Issue #2500)

## 一、背景与问题
用户在 OmniMux 客户端切换到「媒体创作者」等通过 `omnimux-market` 落盘的专家 Agent 时，界面弹窗报错：
```
无法切换到「媒体创作者」: loader entries failed to apply - failed to apply loader entry tool-fs-search (@deepseek-ai/dsh-tool-fs-search): invalid config: - $.sampleOverCapGlobResults missing required value (at sampleOverCapGlobResults) - failed to apply loader entry tool-subagent (@deepseek-ai/dsh-tool-subagent): invalid config: - $.provider missing required value (at provider) (/Users/x/.omnimux-dev/.agent-presets/media-creator/agent.cordis.yml)
```

## 二、根因分析
1. `plugins/omnimux-market/src/expert-presets.ts` 中的 `agentPresetCordis` 生成模板未适配 DSH 最新工具 Schema 要求：
   - `@deepseek-ai/dsh-tool-fs-search` 的 `Config` 要求必填布尔字段 `sampleOverCapGlobResults`；
   - `@deepseek-ai/dsh-tool-subagent` 的 `Config` 要求必填字符串字段 `provider`（通常主委派工具为 `spawn`，fork 委派工具为 `fork`）。
2. 在 `agentPresetCordis` 中，`tool-fs-search` 与 `tool-subagent` 均未附带 `config` 对象。
3. 用户已安装或启动物化落盘的已有预设（如 `media-creator`、`amazon-ops-expert` 等）中存在旧配置，在预设未重新安装时无法自愈。

## 三、验收标准 (Acceptance Criteria)
- **AC-1 (模板修复)**：`agentPresetCordis` 生成的 `agent.cordis.yml` 中：
  - `tool-fs-search` 必须包含 `config: sampleOverCapGlobResults: false`；
  - `tool-subagent` 必须包含 `config: provider: spawn`、`toolName: subagent`、`modelSelectionSettings: true`、`backgroundMode: continuable`；
  - `tool-subagent-fork` 必须包含 `config: provider: fork`、`toolName: subagent_fork`、`backgroundMode: continuable`。
- **AC-2 (自愈更新)**：`materializeEnabledMarketExperts` 或预设自愈函数在扫描到旧预设缺少上述配置时，能自动升级修复该预设文件，防止存量文件持续报错。
- **AC-3 (单测与回归)**：
  - 增加专门测试验证 `agentPresetCordis` 的工具配置合规性；
  - 既有单元测试与预设校验脚本全部通过。
