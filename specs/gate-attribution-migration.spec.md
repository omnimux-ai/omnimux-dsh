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
- A 按**指纹补偿式**判定：对每个断言指纹 `fp`，要求 `unattributedDrop(fp) <= namedIncrease(fp)`，其中 `namedIncrease(fp) = max(0, afterAttributed(fp) - beforeAttributed(fp))`。负增量按 0 处理——具名侧本来就有的同指纹断言不算本次新增，否则「具名本来 3 条、本次新增 0 条」会被错算成 +3，把删无主断言的旁路放回来（review F1）。
- 归因迁移必须**一次交清**：`before` 存在无主断言时，`after` 不得残留任何无主断言（`sumCounts(afterFacts.unattributedAssertions) === 0`）。选归零而不是「减少且原形状仍在」，是因为 F1 修完后「残留无主 + 补偿成立」已无合法用途，归零语义最简单、最难点后被绕（review F3）。
- B 由 `isAttributionMigration` 判定，条件全部满足才算：总数不减、无主断言归零、迁移后的断言全部落在具名用例、每条原无主形状在 `after` 全局仍存在、且**每个新出现的具名用例都覆盖原无主形状的完整集合**（防止「a 用例放宽一条、b 用例补上一条」）。
- 补偿式只回答「无主减少是否由具名新增补上」，**不替代**原有的 per-case 检查（`removedCases` / `weakenedCases`）：具名用例内部的断言放宽仍走原路径，两条判定并行。
- `inspectTestStandardChange` 结果新增 `attributionMigration` 布尔字段；`attributionMigration: true` 只表示「可进入文件级声明通道」，不表示放行。

## 5. 证伪方式（验收，缺一条不合并）

1. 纯静态化、断言一字不改 → `allowed: true`（今天红，修完必须绿）。
2. 归因迁移 + 文件级 `:: *` 声明 → `allowed`；同一改动不写声明 → 仍违规、`missing: ['*']`、`declarable: true`。
3. 无主断言真实减少（3 条删成 2 条）→ 仍拒，且 `:: *` 声明也不能覆盖（`declarable: false`）。
4. 归因迁移同时顺便放宽一条断言（`assert.equal` → `assert.ok`）→ 仍拒（`attributionMigration: false`）。

5. **F1 旁路**：同一指纹既存在于无主断言、又存在于某个具名用例；迁移后删掉无主那条、具名那条原样保留 → **必须拒绝**（`allowed: false`、reason `test-assertion-removed-or-rewritten`、`attributionMigration: false`、`changedCases: []`），且文件级 `:: *` 声明也盖不住（`declarable: false`）。回退补偿逻辑（改回并集总量比较）时这条必须红。
6. **F3 残留**：`before` 有无主断言、`after` 迁移后又留下无主断言 → **必须拒绝**（同上四项断言）。回退「after 无主归零」判定时这条必须红。

**判定规则（不得被简化掉）**：只比较断言总数会被「a 用例放宽一条、b 用例补上一条」蒙过。因此 B 的成立条件必须包含：**每个新出现的具名用例都要覆盖原无主断言形状的完整集合**（`isAttributionMigration` 中的 `inheritedShapes` × `newCaseNames` 双重检查）。改动这段判定时，第 4 条证伪必须先红、改完再绿，否则视为放宽原意。

守卫修改反例（§3.4.1）：
- 临时移除 `attributionMigration` 分支 → 第 1、2 条必须变红；还原后全绿；
- 临时把补偿式改回并集总量比较 → 第 5 条必须变红；还原后全绿；
- 临时移除「after 无主归零」判定 → 第 6 条必须变红；还原后全绿。

已知边界（**F2，不在本 PR 范围**，已登记 follow-up）：结构化指纹把标量值归一，因此带 `:: *` 声明时「值级变化」（如 `assert.equal(..., 1)` → `assert.equal(..., 2)`）仍可通过，靠声明与评审兜底；follow-up 要求声明模板强制逐条列出值变化。

## 6. 不变量

- 真实削弱、删用例、skip/only、动态执行、公共绑定逃逸等风险判定不变。
- 不改变 `inspectTestAuthoring` 的 `allowed/reason/scope` 形状；`inspectTestAuthoringDelta` 仅保留三字段。
- 不涉及运行时产品行为，不触发 Dev 物化或浏览器验收。
