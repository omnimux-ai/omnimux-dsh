# 规范：历史会话兼容恢复与 Agent 预设平滑切换契约

> 任务目标：针对切换 Agent 时出现的 `RemoteError: agent-presets: preset "tiktok-agent" not found` 崩溃错误，彻底打通出厂预设物化、底座预设识别及前端别名映射容错链路，确保任何存量历史会话平滑恢复，新旧会话均可 100% 顺畅切换任意 Agent。

## 1. 缺陷场景与根因复盘
- **报错现象**：
  在输入框上方切换预设（如点击切换到「营销专家」）或恢复存量会话时，系统抛出：
  `无法切换到「营销专家」: resume failed for session "session-36740e37-7b38-4a46-b74f-2b34fc9b68ae": RemoteError: agent-presets: preset "tiktok-agent" not found (available: cordis, drama-agent, daily-work, omni-agent, marketing-agent)`
- **根因分析**：
  1. **底座预设缺失**：
     - `profile.ts` 注入的两个预设搜索根分别为：(1) `stagedPresetRoot()`（指向 `app.asar/preset/agent-presets`）；(2) `~/.omnimux-dev/.agent-presets`（或生产环境 `~/.omnimux/.agent-presets`）。
     - `scripts/sync-agent-presets.sh` 此前主动将 `~/.omnimux-dev/.agent-presets/tiktok-agent` 归档到 `.retired`，导致用户根目录丢失了 `tiktok-agent`。
     - 同时，`patch-asar-agent-presets.mjs` 仅支持 patch `dsh/config/agent-presets` 或 `dsh-agent-presets/presets`，不支持 `preset/agent-presets` 节点，导致 `app.asar` 内部的预设清单始终未包含兼容别名 `tiktok-agent`。
  2. **会话恢复阻断锁**：
     - 存量历史会话（或空白会话）持久化记录了 `agentPreset: "tiktok-agent"`。
     - 当前端发起 `agentPresets.select` 试图切换到其他 Agent 时，底座 RPC 在 lookup agent 阶段尝试恢复（resume）该会话，发现 `tiktok-agent` 不在可用预设列表中，直接抛出 `RemoteError`，导致切换被阻断。
  3. **前端展示与映射漏网**：
     - 若当前会话使用的是兼容别名，前端未对裸 ID 进行友好兜底翻译，且未建立前置预设纠偏映射。

## 2. 解决方案设计

### 2.1 出厂预设物化脚本维护兼容别名 (`scripts/sync-agent-presets.sh`)
- 停止将 `tiktok-agent` 移动到 `.retired`，将其作为永久向后兼容别名同步到 `$home_dir/.agent-presets/tiktok-agent` 以及 `$home_dir/agent-presets-shipped/tiktok-agent`。
- 将 `tiktok-agent` 加入物化与同步的系统兼容目录，确保无论通过开发版还是打包分发版，底座在扫描预设根时永远能够合法发现并挂载 `tiktok-agent`。

### 2.2 Asar Header Patch 增强 (`scripts/patch-asar-agent-presets.mjs`)
- 扩展 `patchAsarPresets` 函数，支持定位并替换 `preset/agent-presets` 节点（如果存在于 header 中）。
- 在 `scripts/sync-agent-presets.sh` 中增加对 `app.asar.unpacked/preset/agent-presets` 的 header 同步调用，确保物理 unpacked 目录中的所有出厂预设及兼容别名均能被 Electron asar 正确识别。

### 2.3 前端展示与映射自适应 (`plugins/omnimux/src/client/agent-preset-enhancer.js`)
- 确保在输入框上方气泡按钮中，`tiktok-agent` 自动映射显示为「社媒专家」（与 `omni-agent` 保持一致的友好中文名与图标）。
- 下拉选项列表中自动去重，隐藏重复的兼容别名，保持干练的 5 大出厂预设排布。

## 3. 验收标准
1. `presets/tiktok-agent` 结构完备，预设名称与社媒专家完全对齐；
2. `sync-agent-presets.sh` 执行后，`$home_dir/.agent-presets/tiktok-agent` 完备存在且绝不被移动到 `.retired`；
3. `patch-asar-agent-presets.mjs` 单元测试与端到端测试 100% 通过；
4. 带有 `agentPreset: "tiktok-agent"` 的历史会话能够无缝恢复，切换到「营销专家」或任意 Agent 顺畅完成，零报错弹窗；
5. 全量自动化测试通过，UI 规范零违规。
