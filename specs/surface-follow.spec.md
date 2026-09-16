# 规格说明：工作面自动跟随（Surface Follow-Focus）

## 一、背景与问题
1. **切页目前由 Agent 自己决定**：Agent 必须显式调用 `workbench_open_tab(tabId, reason)` 才能把右侧工作台切到它正在处理的工作面。事故会话 session-afc2a612 中，Agent 在 turn2 step3 才手动调用切到创作画布，此前界面一直停在与该任务无关的「图像生成」页。
2. **为防打扰加了三道限制，说明该设计本身有风险**：理由必填（4–80 字）、用户开关 `allowAgentSwitchTab`、每会话切换次数配额。这些限制是必要的，因为「Agent 想切」并不等于「Agent 在干活」。
3. **连带的注入噪声**：视图块每轮上报当前页签。页签与任务不一致时（复刻任务却注入「图像生成操作约定」长文），属于与该任务无关的噪声。

## 二、验收标准与核心行为
1. **按正在处理的工作面自动跟随**（宿主决定，Agent 无需调用）：
   - 宿主在 `tools/execute` 中间件中解析正在执行的工具名，查「工具 → 工作面」映射表，命中且需要切换时，复用既有 `mailbox.sendRpc({ method: 'open' })` 通道完成切换（不新增客户端机制）。
2. **映射表（首期）**：
   - 创作画布 `omnimux-workflow:canvas`：`workflow_*`、`canvas_*`；
   - 图像生成 `omnimux:media-viewer`：`omnimux_image_*`、`image_generate`、`image_edit`；
   - 视频剪辑 `omnimux-clip:studio`：`clip_*`；
   - 灵感社区 `omnimux-inspiration:library`：`omnimux_inspiration_*`、`inspiration_*`；
   - 产品库 `omnimux-products:library`：`products_*`。
3. **防打扰策略（与主功能同批交付）**：
   - **用户优先**：若用户在本轮内手动切走（当前页签 ≠ 上次自动切到的页签），本轮内立即停用自动跟随；
   - **防抖动**：同一轮内同一工作面只自动切一次；同一轮内已跟随过的页签不重复切；
   - **收起不打扰**：右侧面板处于收起状态时不自动弹出；
   - **开关**：新增 `allowAutoSurfaceFollow`（默认开）；`allowAgentSwitchTab` 关闭时自动跟随同样关闭。
4. **不消耗 Agent 切换配额**：自动跟随使用独立计数，不影响 `workbench_open_tab` 的每会话配额。
5. **收敛注入噪声**：`contract.js` 中「图像生成操作约定」由整段长文收敛为一句话要点，保留行为约束、去掉冗余表述。

## 三、测试与验证计划
1. 单元测试 `surface-follow.test.js`：
   - 映射表命中/未命中；非工作台工具不触发；
   - 用户手动切走后本轮停用；同轮同页签只切一次；面板收起不切；开关关闭不切；
   - 通道调用使用既有 `mailbox.sendRpc` 且不递增 Agent 配额计数。
2. 回归：`node --test plugins/omnimux/src/workbench/*.test.js` 全绿；`contract.js` 相关断言同步更新。
3. 交付交互演示页（单文件），并在侧边栏打开供用户核验。
