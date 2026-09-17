# 任务规格：会话栏模型名称缩小自适应与底栏防换行优化

- 关联 Issue: #2192
- 目标模块: `plugins/omnimux/src/client/composer-compact.js`

## 1. 业务目标与问题分析
在会话输入框底栏中，用户如果选择了较长的模型名称（如 `Gemini 3.8 Flash Max`、`Claude 3.7 Sonnet` 等），同时左侧存在建议词或扩展按钮时：
由于底栏未强制单行声明且模型文本没有设置最大宽度保护，会导致右侧模型切换按钮和发送按钮整体换行掉落到第二行，造成输入框卡片严重挤压变形。
通过给底栏行声明强单行约束、模型名称自适应限宽与省略截断，确保无论窗口如何缩窄、模型名称多长，底栏始终单行稳固排列。

## 2. 技术与样式规范
### 2.1 底栏行强制单行锁定
- 对底栏行 `[data-composer-card] > [class*="row"]:has(> [class*="tools"])` 与 `[data-composer-card] > [class*="row"]:has([class*="trailing"])`：
  - 声明 `flex-wrap: nowrap !important;` 与 `white-space: nowrap;`；
  - 彻底杜绝子元素掉落至第二行。

### 2.2 模型名称自适应缩短与省略截断
- 默认状态（卡片普通宽度）：
  - `[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']`: 声明 `min-width: 28px; flex-shrink: 1;`；
  - `[data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerLabel"]`:
    `max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle;`；
- 缩窄状态（`html[data-omnimux-composer-density='short']` 或媒体查询）：
  - `[data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerLabel"]`:
    `max-width: 88px;`；
  - `[class*="triggerEffort"]`: `display: none;`；
- 极窄状态（`html[data-omnimux-composer-density='icon']`）：
  - 收敛为 28px 图标。

### 2.3 左侧工具栏平滑收拢
- `[data-composer-card] [class*="tools"]`：
  - 声明 `min-width: 0; flex: 1 1 auto; overflow: hidden;`；
  - 确保空间不足时优先平滑收拢内部间距，不把右侧区域挤压变形。

## 3. 验收标准
1. 底栏行强制锁定单行，任何宽度下均不发生折行；
2. 长模型名称自动省略截断，不会顶破底栏；
3. 紧凑模式正常折叠为 28px 图标；
4. 自动化测试 100% 通过。
