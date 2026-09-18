# 规格：默认锁定社媒专家并移除页面 Agent 切换按钮（其他专家下架保留）

## 1. 业务目标与背景
根据产品极简设计理念与用户聚焦诉求：
1. 将「社媒专家」（`omni-agent`）作为系统唯一默认的预设 Agent；
2. 彻底在页面上移除 Agent 预设切换选择按钮（`AgentPresetSeat`），不支持用户在界面上手动切换角色，统一专注由社媒专家主理人提供服务；
3. 其他专家暂时下架，在界面与选择器中不再暴露，但所有代码与配置文件全部保留在 `presets/` 目录下，不执行物理删除。

## 2. 界面行为与契约
1. **默认 Agent 锁定**：新会话与输入框默认绑定 `omni-agent`；
2. **页面切换按钮彻底移除**：在页面上将输入框及 Hero 区域的 `[data-composer-seat]`、`button.PnBhwW_seat`、`[data-omnimux-preset-seat]` 等所有切换选择按钮节点隐藏，不再占用界面位置；
3. **预设菜单下架防线**：若存在任何边缘弹出的预设选择菜单，仅保留 `omni-agent`，非 `omni-agent` 的其他专家选项标记隐藏（下架状态）；
4. **源码与预设保留不删除**：`presets/marketing-agent/`、`presets/drama-agent/`、`presets/standard/`、`presets/daily-work/`、`presets/marketing-growth-team/`、`presets/cordis/` 等全部目录与提示词源码完好保留。

## 3. 关键验收场景（Acceptance Criteria）
- **AC-1**：新会话界面及输入框中不再展示 AgentPresetSeat 切换按钮；
- **AC-2**：系统新会话默认启动即为社媒专家（`omni-agent`）；
- **AC-3**：各专家在代码库与预设真源中完整保留，出厂预设自动化验证测试（15项）100% 绿灯；
- **AC-4**：相关前端单测与 E2E 测试全部通过。
