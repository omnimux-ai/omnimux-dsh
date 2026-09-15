# 规范：出厂智能体预设物化路径修复与历史旧预设清理收敛

> 任务目标：修复出厂预设物化脚本 `scripts/sync-agent-presets.sh`，使其兼容写入桌面外壳重构后的真实路径 `app.asar.unpacked/preset/agent-presets`，并清理/归档历史残留的 `tiktok-agent`，确保名称精简与字典序排布在开发版应用中 100% 真实生效。

## 1. 业务背景与问题分析
在 PR #1905 中，系统对出厂 Agent 预设进行了名称简化（社媒专家、短剧专家、营销专家、创建Agent、日常工作）与首字母正序排布（C-D-R-S-Y）。
但在物化到开发版应用（OmniMux Dev.app）时发现界面未生效，依然显示“全能社媒操盘手”等旧名称，且重复出现了两个“全能社媒操盘手”。

**根因**：
1. 桌面外壳重构后，出厂预设实际加载路径变更为 `/Applications/OmniMux Dev.app/Contents/Resources/app.asar.unpacked/preset/agent-presets`（以及正式版对应路径）。
2. `scripts/sync-agent-presets.sh` 依然仅查找历史废弃路径 `node_modules/@deepseek-ai/dsh/config/agent-presets`，导致新预设写入被直接跳过。
3. `~/.omnimux-dev/.agent-presets` 遗留了历史 `tiktok-agent` 文件夹，与内置预设聚合后导致出现重复项。

## 2. 改动范围与实现方案

### 2.1 修改 `scripts/sync-agent-presets.sh`
1. 增加桌面应用新版实际路径的支持：
   - Dev App: `/Applications/OmniMux Dev.app/Contents/Resources/app.asar.unpacked/preset/agent-presets`
   - Prod App: `/Applications/OmniMux.app/Contents/Resources/app.asar.unpacked/preset/agent-presets`
2. 保留对旧路径的向下兼容，确保若存在则一并同步。
3. 清理/归档目标目录中不再保留的废弃出厂预设（如历史遗留的 `tiktok-agent`）：
   - 在 `materialize_into` 中，对于非 `KEEP` 列表内的过时官方预设，安全清理或归档，防止旧预设常驻。
   - 对本地环境 `~/.omnimux-dev/.agent-presets` 中的旧 `tiktok-agent` 进行安全归档。

### 2.2 自动化测试
1. 运行 `node --test scripts/verify-agent-presets.test.mjs`。
2. 运行 `node --test scripts/sync-targets.test.mjs`。
3. 验证新路径物化行为与旧目录清理机制。

## 3. 验收标准
1. `scripts/sync-agent-presets.sh` 运行无报错，输出成功同步到 `app.asar.unpacked/preset/agent-presets`。
2. 自动化测试 100% 通过。
3. 开发版应用重启后，预设下拉菜单展示「创建Agent、短剧专家、日常工作、社媒专家、营销专家」，无重复项。
