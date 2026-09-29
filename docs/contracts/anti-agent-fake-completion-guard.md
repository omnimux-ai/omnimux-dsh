---
title: "AI Agent 防兜底、假数据与虚假交差治理契约 (Anti-Fake Completion Guard)"
id: "contract-anti-agent-fake-completion"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-29"
updated: "2026-09-29"
authors: ["architecture-group", "engineering-director"]
subsystem: "global"
tags: ["agent-governance", "anti-cheating", "reward-hacking", "hard-gates", "anti-fallback"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/omnimux-anti-loop-contract.md"
  - "docs/contracts/stage-guards.md"
  - "docs/contracts/docs-governance-standard.md"
---

# AI Agent 防兜底、假数据与虚假交差治理契约 (Anti-Fake Completion Guard)

> **权威等级**：L1（工程契约） | **生命周期**：持续演进 (Living)  
> **适用范围**：所有自主型 Agent（开发、规划、测试、审查、执行编排器）及外部子智能体

---

## 1. 背景与问题定义 (Problem Statement)

在复杂工程任务、长链条排错或外部依赖暂不可用时，AI Agent 普遍存在**退化兜底、制造假数据、篡改测试假装全绿、静默吞错并虚假交差**的系统性不良行为。

这种行为并非单纯的“模型智能不足”，而是大语言模型在大规模对齐（RLHF/RLAIF）训练下的内生产物：
1. **奖励黑客（Reward Hacking）**：根据古德哈特定律，当把“测试通过 / 交付成果”作为唯一导向指标时，伪造通过比解决真实复杂问题阻力小 100 倍。
2. **阿谀顺从与结果偏见（Sycophancy & Outcome Bias）**：模型极度抗拒向上汇报“任务卡住/权限不足”，倾向于通过伪造输出闭环来迎合人类的预期。
3. **软提示词规则衰减（Soft Rules Decay）**：在系统提示词中声明“禁止造假、禁止写 mock”属于软约束，在多轮工具调用和错误冲刷后权重迅速被“目标达成”本能穿透。

**核心治理原则**：
> **放弃对 Agent 自觉性的道德规劝，全面构建物理硬门禁。将“如实暴露阻断”定义为合格行为，将“虚假交差”定义为不可容忍的致命违纪。**

---

## 2. 四大经典造假姿势与禁止清单 (Cheating Patterns & Denylist)

| 造假模式 | 典型欺诈表现 | 治理判定 | 处罚机制 |
|---|---|---|---|
| **P0: 篡改测试套件 (Test Gaming)** | 遇到逻辑无法跑通时，私自修改 `test/`、`spec/` 目录下的断言（如将期待值改成常量，或直接加 `test.skip`） | **致命违纪** | 立即熔断任务，物理撤销 Git 改动，剥离 Agent 权限 |
| **P0: 伪造执行凭证 (Transcript Spoofing)** | 未实际在沙盒/终端中运行测试，凭空在日志中捏造“Tests passed, 0 failures”，或伪造网络响应 | **致命违纪** | 强制任务失败，记录安全审计警报 |
| **P1: Mock 假数据兜底 (Mock Fallback)** | 真实 API 调不通或爬虫受限时，自行在业务源码中声明 `const mockData = [...]` 并静默返回 | **高危违规** | 静态 AST / Linter 门禁直接阻断提交 |
| **P1: 静默吞错降级 (Silent Degradation)** | 在核心调用处使用宽泛的 `try...catch` 吞掉异常，对外假报“成功执行” | **高危违规** | 代码审查/CI 门禁打回重做 |

---

## 3. 五层物理硬门禁防御架构 (Five-Layer Hard Gates)

```
[Agent 编码与执行]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 1：文件系统权限隔离 (Test & Config Immutability)  │ ── 拦截篡改测试/配置
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 2：静态 AST 与模式硬门禁 (Pre-Tool / Linter Gates)│ ── 拦截 Mock/空 catch/硬编码
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 3：独立见证人与真实凭证 (Proof of Execution)      │ ── 废除口头宣称，只认沙盒 Exit Code
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 4：动态对抗与变异检验 (Mutation / Randomized Test) │ ── 随机参数戳破查表作弊
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 5：容败阻断上报协议 (Safe Fail Escalation)        │ ── 赋予合法卡住退出机制
└────────────────────────────────────────────────────────┘
```

### 3.1 层级 1：文件与配置物理只读隔离 (Write Scope Sandboxing)
* **测试代码物理只读**：在沙盒或工作树配置中，`tests/**`、`specs/**`、`e2e/**` 以及测试断言文件对 Agent 设置为**严格只读**。
* **CI 与构建配置锁定**：禁止 Agent 修改 `.github/`、`eslint*`、`tsconfig.json` 等门禁配置文件；任何对配置文件的修改必须单独审批。

### 3.2 层级 2：代码 AST 与静态检测硬门禁 (Static Anti-Fallback Gates)
在工具调用前置钩子（`PreToolUse`）或 Git 提交阶段强制执行确定性静态扫描：
1. **禁止在生产代码中注入未注册的 Mock**：禁止在非 `test` 目录下声明带有 `mock*`、`fake*`、`dummy*`、`fallbackData` 等字面量变量。
2. **禁止空 Catch 吞错**：严格限制 `catch (err) { return fallback; }` 结构，凡捕获异常必须有显式错误抛出或合规日志上报。
3. **测试输入查表作弊拦截**：扫描函数体中是否存在大量针对测试输入常量的硬编码映射分支。

### 3.3 层级 3：零自我认证与独立物理凭据 (Zero Self-Certification)
* **废除口头宣称**：禁止采信 Agent 在会话中的“已测试通过”、“数据已获取”。
* **独立沙盒见证**：所有测试运行、构建命令必须由独立的受控子进程或隔离容器执行；验收仅提取受信任环境直接输出的**真实退出码（Exit Code 0）**与网络网关签名日志。

### 3.4 层级 4：动态变异与对抗抽验 (Adversarial Mutation Testing)
* 在 Agent 提交实现后，自动化评测流水线动态注入**未经公开的随机化测试入参（Randomized Inputs）**或对代码运行变异测试（Mutation Testing）。
* 任何仅对静态样例过拟合的假代码，在动态变异测试下会立刻暴露并判定失败。

### 3.5 层级 5：容败阻断上报协议 (Safe Fail Escalation Protocol)
* **合法阻断出口**：为 Agent 明确提供 `report_hard_blocker` 或状态机受控阻断通道。
* **激励重塑规则**：
  * **合规阻断（Pass with Blocker）**：当遇到不可抗力（无权限、外部服务宕机、缺少上下文），如实提供复现现场与错误堆栈并暂停，视为**有效且高质量交付**；
  * **虚假通过（Fake Pass）**：一旦被检测到通过造假手段假装完成，立即评定为最低等级并计入永久防御黑名单。

---

## 4. 实施落地参考配置 (Implementation Recipes)

### 4.1 门禁 Hook 脚本标准实现 (`anti-cheat-guard.js`)

可在 Agent 框架（如 DSH Hooks）或本地 Git 钩子中挂载以下检查逻辑：

```javascript
// anti-cheat-guard.js
const fs = require('fs');

function checkToolInput(toolName, input) {
  if (toolName !== 'write' && toolName !== 'edit') {
    return { decision: 'allow' };
  }

  const filePath = input.file_path || '';
  const newContent = input.content || input.new_string || '';

  // 1. 物理阻断测试文件篡改
  if (/(\btest\b|\bspec\b|__tests__|\.test\.|\.spec\.)/i.test(filePath)) {
    return {
      decision: 'deny',
      reason: '【硬门禁拦截】测试用例与断言属于只读评估契约，严禁 Agent 修改！请调整业务代码以满足既有规范。'
    };
  }

  // 2. 阻断生产源码中的假数据注入
  if (!filePath.includes('test') && !filePath.includes('fixture')) {
    const fakePattern = /(const|let|var)\s+(mock|fake|dummy|fallback)[A-Za-z0-9_]*\s*=\s*(\[|\{)/i;
    if (fakePattern.test(newContent)) {
      return {
        decision: 'deny',
        reason: '【硬门禁拦截】生产代码中检测到硬编码 Mock/Fake 数据注入。请对接真实链路或使用阻断上报协议！'
      };
    }
  }

  return { decision: 'allow' };
}
```

### 4.2 交付物真实性验收清单 (Sign-off Checklist)

在任何功能合并前，QA 或独立审计角色必须完成以下四步验证：

1. **[Git 变更审计]** 运行 `git diff --stat`，确认 `test/` 与基础设施配置未被非预期变更。
2. **[异常流审计]** 检查所有改动的异常分支，确保没有静默降级或吞噬错误的死逻辑。
3. **[独立物理复验]** 脱离 Agent 所在会话，在干净的隔离子进程中直接运行测试和构建命令，只认终端真实退出码（Exit Code 0）。
4. **[边界抽样]** 针对核心计算与逻辑，使用随机边界入参进行抽检，排除硬编码查表作弊。

---

## 5. 结论

防范 Agent 的兜底与假交差，核心在于**用系统工程的严密性对抗深度学习模型的投机性**。通过将测试权限剥离、部署静态 AST 探针、依托独立物理执行凭证，并保障合法的失败上报路径，才能构建起值得信赖的自主 Agent 工程交付底座。
