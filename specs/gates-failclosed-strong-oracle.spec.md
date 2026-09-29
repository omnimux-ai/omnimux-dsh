# 规格：质量门禁异常 Fail-Closed + 端到端强断言拦截

- Issue: #2838
- 工作树：`.worktrees/gates-failclosed-strong-oracle-issue-2838`
- 类型：纯脚本 / 门禁加固（无 UI）

## 1. 背景与问题

1. `scripts/guard-quality-loop.mjs` 的 `main()` 在解析/执行异常时向 stdout 输出 `permissionDecision: allow`（Fail-Open），与防造假门禁 Fail-Closed 不一致，异常时可放行本应拦截的写操作。
2. 写端到端测试时，门禁只检查「晚于规格的验证证据」，不检查断言强度；仅非空/布尔/无断言的测试剧场可在有证据后通过。

## 2. 目标行为

### G1 · 异常 Fail-Closed

- 当 `handle(raw)` 抛错（非法 JSON、内部断言失败等），stdout 必须输出 `permissionDecision: deny`，并带可读原因说明「门禁执行异常，安全阻断」。
- 不得再输出 `allow`。
- 与 `scripts/guard-anti-cheat.mjs` 的异常策略对齐。

### G2 · 端到端强断言信号

- 当工具为 `edit|write`，且目标路径判定为端到端测试文件（沿用现有 `isE2ETestFile`），在已有验证证据的前提下：
  - 若拟写入内容（`content` / `new_string`）**缺少强断言信号** → `deny`，原因码 `missing-strong-oracle-for-e2e`。
  - 若含至少一类强断言信号 → 放行（仍受既有证据门约束）。
- **强断言信号（命中任一即可）** 的保守正则集合：
  - `assert\.(equal|strictEqual|deepEqual|deepStrictEqual|match|rejects|throws)\b`
  - `\bexpect\([^)]+\)\.(toBe|toEqual|toStrictEqual|toMatch|toContain|toThrow)\b`
  - `\bt\.(equal|strictEqual|deepEqual|match|throws)\b`（node:test 风格）
  - `\bassert\.(ok|fail)\b` **不算**强断言（仅存在性/失败占位）。
- **弱/无断言示例（应 deny）**：无 assert/expect；仅 `assert.ok(x)` / `expect(x).toBeTruthy()` / 仅 mock `toHaveBeenCalled`；空测试体。
- **合法边界**：
  - 非端到端测试路径：本条不生效。
  - 无验证证据时：仍 deny `missing-verify-evidence-for-e2e`（最终仍不得放行）。

## 3. 非目标

- 不扩展 Verify 门到所有 `*.test.js`（Issue #1639 另议）。
- 不做截图语义/OCR 校验。
- 不改 anti-cheat 意图自证与豁免文件模型。
- 不改 UI / 浏览器验收流程。

## 4. 验收标准（可测）

| ID | 场景 | 期望 |
| --- | --- | --- |
| AC-1 | `handle`/`main` 路径喂入非法 JSON | stdout deny + Fail-Closed 文案 |
| AC-2 | 写 E2E 文件，有证据，内容无断言 | deny `missing-strong-oracle-for-e2e` |
| AC-3 | 写 E2E 文件，有证据，仅 `assert.ok` / `toBeTruthy` | deny |
| AC-4 | 写 E2E 文件，有证据，含 `assert.equal` 或 `expect(...).toEqual` | allow（其他门已满足时） |
| AC-5 | 写 E2E 文件，无证据 | 仍 deny `missing-verify-evidence-for-e2e`（证据门优先或并存，最终仍 deny） |
| AC-6 | 既有规格前置 / UI 交付同捆 / bash 写源码用例 | 回归绿 |
| AC-7 | `node --test scripts/guard-quality-loop.test.mjs` 全绿 | 必须 |

## 5. 实现落点

- `scripts/guard-quality-loop.mjs`：异常 Fail-Closed；新增 `hasStrongOracleSignal(content)`；E2E 写入路径串联强断言检查。
- `scripts/guard-quality-loop.test.mjs`：红黑样本。

## 6. 验证计划

- 纯脚本：`node --test scripts/guard-quality-loop.test.mjs`（及既有 gates 相关测试若适用）。
- 无浏览器 / 无 App 物化要求（变更面 = 纯脚本）。

## 7. 风险

- 强断言正则过严可能误伤合法 E2E：用白名单式「强模式」+ 红黑样本约束；发现误伤再扩模式，不先放宽为默许弱断言。
