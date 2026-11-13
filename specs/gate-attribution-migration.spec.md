# 规格：解除两条测试门禁互斥（归因迁移可审查）

关联 issue：**#4100**（阻塞 #4099）。授权：X 在 OmniMux 开发组明确要求，范围收紧为 A、B 两类，不得扩大。

## 1. 背景与证据

`scripts/impact-matrix.test.mjs` 的两处用例名是模板字面量（`it(\`requires ego-browser for ${file}\`)`）。两条门禁因此互斥：

- `dynamic-test-options-needs-review`（`test-authoring-inspection.mjs:172`）把模板用例名判为风险，**不可声明放行**，只接受消除；
- 消除（静态化为字面量用例名）后，那些断言从 `unattributedAssertions` 桶迁入 `caseAssertions`，`inspectTestStandardChange` 按「无主桶逐条比数量」判 `test-assertion-removed-or-rewritten`，且 `changedCases: []` 使所有声明都无法匹配（`verify-test-standard-declarations.mjs:122-124` 判 `declarable: false`）。

实证（base `93f317453`）：仅把用例名静态化、断言文本全部保持旧口径，`node scripts/verify-test-standard-declarations.mjs . 93f31745` 仍报 `- [M] scripts/impact-matrix.test.mjs（test-assertion-removed-or-rewritten）该原因不可经声明放行，必须撤回改动`。⇒ 任何「动态用例名 + 断言」的测试文件在结构上无法修改。

## 2. 允许的两类（边界，不得越界）

- **A · 跨桶多重集比较**：同一断言指纹在 `after` 的「有主 ∪ 无主」总量 ≥ `before` 的「有主 ∪ 无主」总量 → 不算删除。效果：纯静态化、断言一字不改可直接放行。
- **B · 归因迁移的文件级声明**：`before` 存在无主断言、`after` 把它们全部归入具名用例时，允许 `- \`<path>\` :: \`*\`` 文件级声明（此前只在 `after === ''` 整文件删除时开放）。声明必须带四段式：原断言 / 必须改的理由 / 新期望证据（评审要求），且**只覆盖归因迁移这一类**。

## 3. 不允许的（原意必须守住）

- 断言**真实减少**（`before` 总数 > `after` 总数，且无法用归因解释）→ 照旧硬拒。
- `:: *` 声明不能用来盖「删用例」「放宽断言」「加 skip/only」。
- 不得把 `DECLARABLE_TEST_STANDARD_REASONS` 整个放开；`test-execution-*`、`runtime-code-execution-*` 等原因码语义不变。
- hook 侧（`decideOldStandardDeclaration`）与 CI 侧必须同口径，否则会出现「本地可提交、CI 红」漂移。

## 4. 实现要点

- `collectAssertionFacts` 新增结构化指纹（`structuralAssertions` / `caseStructural` / `unattributedStructural`）：标量（字面量、正则、模板、标识符）统一归一为 `Scalar`，成员调用的属性名保留（`assert.equal` ≠ `assert.ok`）。
- A 在 `inspectTestStandardChange` 中按跨桶合并计数判定。
- B 由 `isAttributionMigration` 判定，条件全部满足才算：总数不减、无主桶确实减少、迁移后的断言全部落在具名用例、每条原无主形状在 `after` 全局仍存在、且**每个新出现的具名用例都覆盖原无主形状的完整集合**（防止「a 用例放宽一条、b 用例补上一条」）。
- `inspectTestStandardChange` 结果新增 `attributionMigration` 布尔字段；`attributionMigration: true` 只表示「可进入文件级声明通道」，不表示放行。

## 5. 证伪方式（验收，缺一条不合并）

1. 纯静态化、断言一字不改 → `allowed: true`（今天红，修完必须绿）。
2. 归因迁移 + 文件级 `:: *` 声明 → `allowed`；同一改动不写声明 → 仍违规、`missing: ['*']`、`declarable: true`。
3. 无主断言真实减少（3 条删成 2 条）→ 仍拒，且 `:: *` 声明也不能覆盖（`declarable: false`）。
4. 归因迁移同时顺便放宽一条断言（`assert.equal` → `assert.ok`）→ 仍拒（`attributionMigration: false`）。

守卫修改反例（§3.4.1）：临时移除 `attributionMigration` 分支后，第 1、2 条必须变红；还原后全绿。

## 6. 不变量

- 真实削弱、删用例、skip/only、动态执行、公共绑定逃逸等风险判定不变。
- 不改变 `inspectTestAuthoring` 的 `allowed/reason/scope` 形状；`inspectTestAuthoringDelta` 仅保留三字段。
- 不涉及运行时产品行为，不触发 Dev 物化或浏览器验收。
