# 规范：Agent 预设名称精简与字母排序优化

> 任务目标：根据用户需求，对 OmniMux 出厂会话预设（Agent Presets）进行名称精简与排序优化：
> 1. 简化名称：
>    - 全能社媒操盘手 -> 社媒专家 (`omni-agent`)
>    - 全能营销操盘手 -> 营销专家 (`marketing-agent`)
>    - 全能短剧操盘手 -> 短剧专家 (`drama-agent`)
>    - 日常工作 -> 日常工作 (`daily-work`，保持不变)
>    - 创造模式 -> 创建Agent (`cordis`)
> 2. 排序优化：
>    - 按照名称拼音首字母正序（A-Z）排布：
>      1. **创建Agent** (`cordis`, 拼音 C) -> `order: 1`
>      2. **短剧专家** (`drama-agent`, 拼音 D) -> `order: 2`
>      3. **日常工作** (`daily-work`, 拼音 R) -> `order: 3`
>      4. **社媒专家** (`omni-agent`, 拼音 S) -> `order: 4`
>      5. **营销专家** (`marketing-agent`, 拼音 Y) -> `order: 5`
> 3. 默认值守：
>    - 系统底层与会话配置严格保持 **社媒专家** (`omni-agent`) 作为默认 Agent (`default: omni-agent`)，新建对话默认激活社媒专家。

## 1. 业务目标与需求对齐

### 1.1 背景
当前桌面与 Web 端的会话模式切换下拉菜单中，名称较长且包含历史开发名词（如“创造模式”、“全能社媒操盘手”等），同时顺序混乱，未遵循直观的字母字典序，影响视觉极简感与选择效率。

### 1.2 改造清单与映射契约
| Preset ID | 原中文名称 | 目标精简名称 | 拼音首字母 | 目标 order | 默认状态 |
|---|---|---|---|---|---|
| `cordis` | 创造模式 | **创建Agent** | C (chuàng) | 1 | 备选 |
| `drama-agent` | 全能短剧操盘手 | **短剧专家** | D (duǎn) | 2 | 备选 |
| `daily-work` | 日常工作 | **日常工作** | R (rì) | 3 | 备选 |
| `omni-agent` | 全能社媒操盘手 | **社媒专家** | S (shè) | 4 | **默认激活 (Default)** |
| `marketing-agent` | 全能营销操盘手 | **营销专家** | Y (yíng) | 5 | 备选 |

## 2. 核心架构与模块改动

### 2.1 预设真源配置 (`presets/`)
- 更新各预设的 `preset.yml`：
  - `presets/cordis/preset.yml`：`name: 创建Agent`，`order: 1`
  - `presets/drama-agent/preset.yml`：`name: 短剧专家`，`order: 2`
  - `presets/daily-work/preset.yml`：`name: 日常工作`，`order: 3`
  - `presets/omni-agent/preset.yml`：`name: 社媒专家`，`order: 4`
  - `presets/marketing-agent/preset.yml`：`name: 营销专家`，`order: 5`
- 更新各预设的 `skills.json`：展示名称同步对齐。
- 更新 `scripts/build-agent-presets.mjs` 中的 Persona 声明与主理人称谓，重新构建各 `agent.cordis.yml`。

### 2.2 前端多语言与增强器 (`plugins/omnimux/src/client/`)
- `agent-presets-i18n.js`：
  - `presetCordisName` 调整为 `创建Agent`；
  - `getPresetFallbackCopy` 中将 `omni-agent` 映射为 `社媒专家`，`marketing-agent` 映射为 `营销专家`，`drama-agent` 映射为 `短剧专家`，`cordis` 映射为 `创建Agent`；
  - 增强历史别名容错，兼容旧名称输入。
- `agent-preset-enhancer.js`：
  - `AGENT_PRESET_NAMES` 新增 `社媒专家`、`营销专家`、`短剧专家`、`创建Agent` 等键映射；
  - 保留旧名称别名映射，保障历史会话、旧缓存或特定测试场景的无缝平滑迁移。

### 2.3 物化与默认 Agent 契约 (`scripts/sync-agent-presets.sh`)
- 确保 `default: omni-agent` 规则持续生效，在任何环境下启动均默认指向「社媒专家」。

## 3. 验收标准
1. `node scripts/build-agent-presets.mjs` 执行成功，输出规范的 Persona 与结构。
2. `node --test scripts/verify-agent-presets.test.mjs` 100% 通过，断言更新后的名称与 order 契约。
3. `node --test plugins/omnimux/src/client/agent-presets-i18n.test.js` 与 `plugins/omnimux/src/client/agent-preset-enhancer.test.js` 100% 通过。
4. 全量契约与门禁检查无异常。
