# 实测证据：新会话输入框 680px 宽度防篡改 Hook 静态与运行期硬门禁 (Issue #2836)

## 一、验证环境
- 关联 Issue：#2836
- 关联规格：`specs/2836-guard-composer-680px-width.spec.md`
- 守卫脚本：`scripts/guard-ui-rules.mjs` (UI11)

## 二、守卫核心能力验证
1. **拦截试图将输入框样式改宽为 780px、952px 或 100% 的篡改操作**：
   - 触发规则：`UI11: 新会话输入框 680px 宽度铁律`
   - 阻断决策：`permissionDecision: "deny"`
2. **拦截试图修改 useComposerDocking 中 DOCK_MAX_WIDTH 为非 680 的操作**：
   - 触发规则：`UI11: 新会话输入框 680px 宽度铁律`
   - 阻断决策：`permissionDecision: "deny"`
3. **合规修改放行**：
   - 普通修改与合规 680px 声明放行，不影响正常开发。

## 三、测试结果
- `scripts/guard-ui11-composer-width.test.mjs`: 3/3 PASS
- `scripts/guard-ui-design.test.mjs`: 23/23 PASS
