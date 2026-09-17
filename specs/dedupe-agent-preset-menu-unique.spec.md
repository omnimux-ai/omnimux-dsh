# 规范：出厂 Agent 预设下拉菜单唯一性与去重隐藏保全契约

> 任务目标：彻底解决 Agent 预设下拉列表中重复显示两个「社媒专家」的问题，确保在任何环境下，同一预设身份在前端选择器中仅展示唯一的单选项，同时保障底层历史会话兼容别名（如 `tiktok-agent`）持续可用。

## 1. 问题复盘与根因分析

- **现象**：
  在主界面的 Agent 预设切换下拉菜单中，出现两个「社媒专家」（分别位于第 4 项和第 6 项），图标与中文名称完全相同。
- **根因**：
  1. 出厂预设与历史会话兼容别名同时物化到了运行时的预设目录中，底座（Host）向前端同时分发了 `omni-agent` 与 `tiktok-agent`，两者的中文名均为「社媒专家」；
  2. 前端装饰器 `agent-preset-enhancer.js` 虽有 `seenIds` 识别重复项的逻辑，但在重复时仅调用了 `item.style.display = 'none'`；
  3. 前端样式表规则 `[data-omnimux-preset-item]` 设置了 `display: flex !important;`。在 CSS 层叠优先级规则中，外部样式的 `!important` 声明绝对优先于无 `!important` 的内联样式，导致隐藏指令被强行覆盖击穿，重复项依然以 `flex` 布局强行渲染。

## 2. 解决方案与技术规范

### 2.1 强化去重属性标记与高优先级样式规则
- 在 `plugins/omnimux/src/client/agent-preset-enhancer.js` 中定义专用去重标记：
  `export const PRESET_DUPLICATE_ATTR = 'data-omnimux-preset-duplicate'`
- 在 `AGENT_PRESET_AVATAR_CSS` 样式规则中显式声明：
  ```css
  /* 重复预设项必须绝对隐藏，优先级高于行级 flex 布局 */
  [data-omnimux-preset-duplicate],
  [data-omnimux-preset-item][data-omnimux-preset-duplicate] {
    display: none !important;
  }
  ```
- 在 `syncMenuAvatars` 去重逻辑中：
  - 当 `seenIds.has(resolvedId)` 命中时：
    - 赋予属性 `item.setAttribute(PRESET_DUPLICATE_ATTR, 'true')`；
    - 执行双保险内联隐藏：`item.style.setProperty('display', 'none', 'important')`；
    - 跳过计数并继续；
  - 当未命中时（主选项）：
    - 确保移除可能残留的标记：`item.removeAttribute(PRESET_DUPLICATE_ATTR)`；
    - 若先前存在内联 display:none 则移除 `item.style.removeProperty('display')`；
    - 将 `resolvedId` 存入 `seenIds` 并累计计数。
- 在 `clearInjectedAvatars` 清理函数中，将 `PRESET_DUPLICATE_ATTR` 纳入清理属性列表中。

### 2.2 保护底层会话兼容机制
- 保持 `presets/tiktok-agent` 与出厂物化策略不变，确保底座 RPC lookup 时能够平滑恢复旧会话元数据，实现“底层兼顾老旧会话，上层呈现清爽单选”。

## 3. 验收标准与验证矩阵

1. **单元测试通过**：
   - 增加包含重复项（如多个同名「社媒专家」）的菜单单测；
   - 断言重复行被标记 `data-omnimux-preset-duplicate="true"` 且内联具有 `display: none !important`；
   - 断言 CSS 规则中包含 `[data-omnimux-preset-duplicate]` 与 `display: none !important`。
2. **端到端测试与真实渲染验证**：
   - 在真实浏览器 DOM 环境中，菜单项总数收敛为唯一的 5 个出厂预设（创建Agent、短剧专家、日常工作、社媒专家、营销专家），绝无第 6 个多余选项；
   - 历史会话切换恢复 100% 成功，无 `preset not found` 报错。
3. **新用户产品基线**：
   - 新用户首次打开应用，顶部下拉仅显示 5 个独立 Agent 预设。
