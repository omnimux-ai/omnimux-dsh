# 规格：多模板测试文件的归因声明（#4107）

关联：**#4107**（本单）、#4102（归因迁移通道）、阻塞 #4099。

## 1. 背景

#4102 给 `attributionMigration` 通道加的「整组复制」判定要求：**每个新出现的具名用例，覆盖 before 无主断言的完整形状集合**。这个规则在单模板文件里正确，但同一文件存在**多套模板循环**时不可满足：

`scripts/impact-matrix.test.mjs` 有两个模板循环：UI 组（实测 10 种结构形状 / 11 条断言）与非 UI 组（8 种形状 / 8 条断言）。静态化后非 UI 用例永远无法覆盖 UI 模板的全部形状 → `attributionMigration: false` → 文件被判「不可经声明放行」。

这是全仓声明匹配语义的变更，必须单独立 issue、单独 PR、单独评审，不能混在「恢复文案」的 PR 里——否则回滚时会连文案一起回滚。

## 2. 原规则（#4102）

```js
const inheritedShapes = [...beforeFacts.unattributedStructural.keys()]   // 并集
for (const name of newCaseNames) {
  for (const fingerprint of inheritedShapes) {
    if ((own.get(fingerprint) || 0) < 1) return false   // 每个新用例覆盖并集全部
  }
}
```

## 3. 新规则

无主断言按**模板分组**（顶层 `for` 循环内的断言各成一组），判定改为：

```js
const templateShapeSets = [...beforeFacts.unattributedTemplates.values()]
  .map(map => [...map.keys()].sort().join('\u0000'))
for (const name of newCaseNames) {
  if (!templateShapeSets.includes([...own.keys()].sort().join('\u0000'))) return false
}
```

## 4. 单模板等价性（硬要求，必须有测试）

在域「新用例形状 ⊆ before 无主形状集合」内，新判定与原判定**完全等价**：

- 新判定通过 ⇔ 每个新用例签名等于唯一模板集合 ⇔ 每个新用例形状集合 ⊆ S 且 ⊇ S ⇔ 原判定通过。

域外（新用例引入 S 外形状，如 `assert.equal` → `assert.ok`）新判定**更严**，属有意收紧，由第 2 条证伪覆盖。

测试实现：`collectAssertionFacts` 导出供测试对比；用同一输入分别跑新实现与测试内保留的 `legacyMigration`（原规则），逐条断言 `attributionMigration` 一致，并断言样本里至少一条 `true`、一条 `false`（证明有区分力）。

## 5. 必须仍然红的证伪（缺一条都不收）

1. **真实减少 3→2**：`attributionMigration: false`、`declarable: false`。
2. **夹带放宽**（`assert.equal` → `assert.ok`）：形状对不上任何模板 → 拒。
3. **F1 旁路**（同指纹同时在无主与具名，删无主留具名）：拒。
4. **F3 残留**（迁移后残留无主断言）：拒。
5. **只迁移一半**（某新用例被裁掉一条断言）：对不上任何模板 → 拒。

## 6. §3.4.1 反例

把「每个新用例等于某个模板」回退为「每个新用例覆盖全部形状」→ 多模板守卫必红；还原后全绿。

## 7. 不变量

- 不改变 `DECLARABLE_TEST_STANDARD_REASONS`、`test-execution-*`、`runtime-code-execution-*` 语义；
- 单模板文件行为不变（等价性测试锁定）；
- 不涉及运行时产品行为。

## 8. 已知边界

模板分组：循环外的无主断言归 `top` 组；嵌套循环按**最内层 `for`** 分组（实测：顶层断言 + 外层 for + 内层 for 得到三组）。若将来出现更复杂的模板形态，需要扩展分组规则并补等价性测试。
