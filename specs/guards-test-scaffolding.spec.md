# 门禁分类修复：测试脚手架不算界面源码（guards-test-scaffolding）

## 目标

修复 `guard-quality-loop` 的 `isUiSourcePath` 分类器：把测试脚手架（`/test-fixtures/`、`/tests/`、`*.test.*`、`*.spec.*`、`specs/`）统一判为非界面源码，与同一文件内 `isBusinessSourceFile` 的既有口径对齐。

背景：2026-10-21 的测试夹具内存安全任务中，`plugins/omnimux-inspiration/src/client/test-fixtures/collection-detail-render.mjs` 被当成界面源码，门禁要求变更集附带 e2e 测试；而 anti-cheat 门禁（RULE-01）又禁止新增测试用例/断言，形成互锁。该任务最终通过把夹具归位到 `tests/fixtures/` 绕行，本次修复从制度上消除同类互锁。

同时为门禁拒绝消息增加规则集版本，便于排查“worktree 内改了门禁却不生效”这类规则版本错位问题（hook 执行的是 session workspace 的规则副本）。

## 命令

```bash
node --test scripts/guard-quality-loop.test.mjs
pnpm test:gates
```

## 项目结构

- `scripts/guard-quality-loop.mjs`：分类器与门禁判定（本次主改动）。
- `scripts/guard-quality-loop.test.mjs`：分类器断言（在既有测试用例内追加断言）。
- `specs/guards-test-scaffolding.spec.md`：本规格。

## 代码风格

保持函数纯函数、无副作用；分类器之间共用同一个 `isTestScaffoldingPath`，避免两处口径再次漂移。

```js
export function isTestScaffoldingPath(rel) {
  return rel.includes('/tests/') || rel.includes('/test-fixtures/')
    || rel.includes('.test.') || rel.includes('.spec.') || rel.startsWith('specs/')
}
export function isUiSourcePath(rel) {
  if (isTestScaffoldingPath(rel)) return false
  // ...
}
```

## 测试策略

- 框架：`node --test`。
- 位置：复用 `scripts/guard-quality-loop.test.mjs` 的既有「path classifiers」用例，追加断言（不新增用例——仓库 anti-cheat 门禁把新增用例视为评估契约变更）。
- 覆盖点：`/test-fixtures/` 下的 `.mjs` 与 `.jsx` 均不被判为 UI 源码；既有正例（`src/client/a.js`、`style.css`）仍为 UI；`isBusinessSourceFile` 对测试脚手架的既有判定不回归。
- 覆盖率期望：不新增门槛。

## 边界

- 总是：只改分类器与消息版本；跑分类器测试；保持门禁对真实界面源码的拦截不变。
- 先问：修改 anti-cheat 的 RULE-01 语义（属于安全边界变更，单独立项评审）。
- 绝不：为了让某次提交通过而放宽对真实产品界面的 e2e 要求；绝不删除任何既有断言。

## 成功标准

1. `isUiSourcePath('plugins/a/src/client/test-fixtures/harness.mjs') === false`，同样路径下的 `.jsx` 也为 false。
2. `isUiSourcePath('plugins/omnimux/src/client/a.js') === true` 等既有正例不回归。
3. 门禁拒绝消息包含规则集版本，便于确认实际执行的规则副本。
4. `node --test scripts/guard-quality-loop.test.mjs` 的分类器用例通过；其余既有用例结果不变。

## 假设

1. 互锁的根因是分类器漏排 `/test-fixtures/`，而不是“UI 变更需要 e2e”这条要求本身有错；因此只修分类器，不放宽 e2e 要求。
2. 测试脚手架与产品界面源码可以在路径上机械区分（`tests/`、`test-fixtures/`、`*.test.*`、`*.spec.*`、`specs/`）。
3. 在拒绝消息中附加规则集版本不会破坏既有 hook 协议与测试断言。

## 证伪方式

1. 在修复前的分类器上运行新增断言，`isUiSourcePath('plugins/a/src/client/test-fixtures/harness.mjs')` 应为 true（即拦截）——修复后为 false；若修复前已为 false，说明假设 1 不成立。
2. 构造一个真实产品界面文件路径（如 `plugins/a/src/client/View.jsx`），修复后仍应判为 true；若变 false，说明分类器被放宽过头。
3. 若 `node --test scripts/guard-quality-loop.test.mjs` 的既有用例因消息追加规则集版本而失败，则假设 3 不成立，需要改为独立字段而非消息文本。

## 文档影响

仅门禁分类器与拒绝消息；不改产品行为、用户可见文案与既有契约文档。anti-cheat RULE-01 的收窄（允许新增用例、仅禁削弱）作为独立设计提案，不在本任务实施。
