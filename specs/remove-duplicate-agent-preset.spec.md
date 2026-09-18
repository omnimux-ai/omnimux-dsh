# 规范：出厂 Agent 预设去重与彻底移除冗余 tiktok-agent 契约

> 任务目标：根据用户提供的界面截图与明确指示，从出厂预设和运行时物化目录中彻底移除重复的「社媒专家」（`tiktok-agent` 兼容别名），消除设置与管理面板中卡片重复显示的视觉缺陷，确保系统中社媒专家（`omni-agent`）为唯一真源。

## 1. 现象复盘与根因分析

- **现象**：
  在 DSH 设置的 Agent 列表中，同时显示了两个「社媒专家」卡片：
  1. `omni-agent`（名称：社媒专家，描述：全域社媒爆款创作与矩阵运营增长。）
  2. `tiktok-agent`（名称：社媒专家，描述：全域社媒爆款创作与矩阵运营增长（兼容别名）。）
- **根因分析**：
  1. 此前为了兼容旧会话，在 `presets/` 下保留了 `tiktok-agent/` 目录；
  2. `scripts/sync-agent-presets.sh` 每次物化时，都会将 `tiktok-agent` 同步至用户运行时预设目录及打包资源目录中；
  3. DSH 原生设置界面的 Agent 管理网格遍历了所有的物理预设目录，并将每个含有 `preset.yml` 的目录均作为一个独立卡片渲染出来，造成视觉重复。

## 2. 改造方案与技术契约

### 2.1 彻底移除物理冗余预设
- 从代码库根目录的 `presets/` 中彻底删除 `tiktok-agent/` 物理目录；
- 出厂预设仅保留核心 7 项标准预设：
  `cordis`, `daily-work`, `drama-agent`, `marketing-agent`, `marketing-growth-team`, `omni-agent`, `standard`。

### 2.2 强化物化脚本清理与防复发契约
- 在 `scripts/sync-agent-presets.sh` 中：
  - 彻底移除对 `tiktok-agent` 的物化与拷贝操作；
  - 增加对历史残留 `tiktok-agent` 的自动清理机制（扫描并移除目标目录及用户目录下的 `tiktok-agent`，归档至 `.retired/` 或安全删除）；
  - 确保全新安装与存量升级环境下，均不会残留物理 `tiktok-agent` 目录。

### 2.3 资产与提示词单一真源迁移
- 在 `plugins/omnimux-intercept/src/comment/prompt-templates.js` 中：
  - 将 `SOPILOT_SKILL_ROOT` 的单一真源路径由 `presets/tiktok-agent/...` 更新为 `presets/omni-agent/...`；
  - 保留回退机制，确保路径解析稳健。

### 2.4 保留纯逻辑别名映射
- 前端与逻辑层继续保留字符与 ID 级别的映射（如 `AGENT_PRESET_NAMES['tiktok-agent'] = 'omni-agent'`），确保历史会话若携带旧 ID 仍能被平滑重定向至 `omni-agent`，实现纯逻辑兼容而无需物理重复。

## 3. 验收标准与验证矩阵

1. **预设目录纯净度**：
   - `presets/` 目录下不存在 `tiktok-agent/`，仅有标准 7 项出厂预设；
   - `pnpm presets:verify` 100% 绿灯。
2. **同步脚本幂等与清理**：
   - 运行 `bash scripts/sync-agent-presets.sh` 后，目标路径下无 `tiktok-agent`，且历史残留项被自动清理；
   - E2E 测试断言通过。
3. **回归与基线**：
   - 全量预设测试 `node --test tests/e2e/agent-presets-naming-order.e2e.test.mjs` 绿灯通过；
   - `pnpm verify:product-baseline` 绿灯通过。
