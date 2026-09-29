# 规格：新会话输入框 680px 宽度防篡改 Hook 静态与运行期硬门禁 (Issue #2836)

## 一、背景与问题定义
此前新会话输入框宽度曾多次在无用户明确指令下被后续任务或并发 Agent 擅自拉宽至 952px 或 780px。为杜绝此类“底座教条主义”导致的反复篡改，必须通过 DSH 物理级 Hook（PreToolUse）建立不可绕过的硬性防线。

## 二、架构设计原则：UI11 输入框宽度防篡改守卫
1. **作用域（Scope）**：
   - 目标文件：`plugins/omnimux/src/client/session-guide/styles.js` 与 `useComposerDocking.js`；
2. **规则断言（UI11 违规判定）**：
   - 严禁声明非 680px 的卡片上限（如 `952px`、`780px`、`100%`、`none`）；
   - 严禁在 `useComposerDocking.js` 中将 `DOCK_MAX_WIDTH` 赋值为非 680 数值；
3. **拦截动作（Fail-Closed）**：
   - PreToolUse Hook 返回 `permissionDecision: "deny"`，阻断对上述文件的非法写操作，并在控制台高亮抛出告警。

## 三、用户旅程与验证规范
1. **正常修改放行**：合规的 680px 声明与普通业务代码正常放行；
2. **非法篡改拦截**：一旦检测到试图将输入框改宽为 780px 或 952px，当场硬拦截并输出错误。
