# 规范：出厂预设历史兼容别名容错与会话恢复防崩溃契约

> 任务目标：针对切换会话时出现的 `preset "tiktok-agent" not found` 崩溃错误，建立向后兼容别名容错机制，确保任何存量历史会话平滑恢复，同时前端下拉菜单保持极简 5 大出厂预设排布且不产生重复选项。

## 1. 缺陷场景与根因复盘
- **报错现象**：
  `无法切换到「社媒专家」: resume failed for session "...": RemoteError: agent-presets: preset "tiktok-agent" not found (available: cordis, drama-agent, daily-work, omni-agent, marketing-agent)`
- **根因分析**：
  1. 历史会话的元数据持久化记录了旧标识符 `tiktok-agent`；
  2. 在完成预设精简后，系统只加载了新标识符 `omni-agent`，底座后端在查找 `tiktok-agent` 时抛出不存在异常，导致存量会话无法唤醒（resume 失败）；
  3. 缺乏底层的别名兼容映射或出厂兼容软链机制。

## 2. 解决方案设计

### 2.1 出厂预设兼容目录 (`presets/tiktok-agent`)
- 在 `presets/` 下维护 `tiktok-agent` 兼容目录（完全等价于 `omni-agent`，中文名亦为「社媒专家」）；
- 在 `scripts/sync-agent-presets.sh` 的 `KEEP` 名单中包含 `tiktok-agent`，使其同步进出厂物化目录，确保底座预设集合永远能找到 `tiktok-agent`。

### 2.2 前端菜单智能去重 (`agent-preset-enhancer.js`)
- 在前端下拉菜单装饰器中，对于已解析为相同核心身份（如 `tiktok-agent` 与 `omni-agent` 同属于社媒专家）的重复项：
  - 仅保留主选项 `omni-agent`（社媒专家）；
  - 自动对兼容项进行隐藏（`display: none`），确保用户在下拉菜单中始终只看到干练的 5 个选项。

## 3. 验收标准
1. `presets/tiktok-agent` 结构完备，通过 `node --test scripts/verify-agent-presets.test.mjs`。
2. 前端单测全部通过。
3. 历史会话恢复 100% 成功，切换社媒专家零报错，菜单保持 5 项字母序。
