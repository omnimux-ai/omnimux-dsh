# 门禁风险身份改用「形状 + 绑定」：构造挪位置不再被当成新增风险（#3754 完成式）

## 问题

测试声明门禁的风险指纹原先包含**位置上下文**（祖先节点类型、回调/参数槽位、分支边——
这是 #3754 修复「文本/数据/序号」后保留的结构位置）。结果：只要同一处既有构造在文件里
挪了位置（参数位互换、函数嵌套、回调参数变化、import 语句加了非风险 specifier、用例改名、
`test(` → `check(`），指纹就变 → 被当成「新增风险」硬拒，且**不可经 `## 旧标准变更` 声明放行**。

实测：PR #3762（画布）有 6 个测试文件因此被拦——它们都是「既有构造挪了位置」而非新增
（`channelGroups.test.mjs` / `comfyui-ops-filter.test.mjs` / `channel-group-naming.e2e.test.mjs` /
`verify-channel-group-naming.test.mjs` / `verify-channel-group-pricing.test.mjs` /
`verify-pricing-points-integrity.test.mjs`）。

## 方案

把风险身份收窄为「**构造自身的规范化节点 + 引用的 import 绑定**」——不含位置上下文：

- 指纹 = `canonical({ reason, detail, bindings })`，其中 `detail = canonical(anchor)`（构造
  自身的规范化节点），不再拼 `contexts`。
- `bindings` 仍是引用标识符→import 的映射（`catch ({ local = safeApi })` 之类引用照样被算进）。
- **多重集计数兜底净新增**：同一形状构造数量增长仍然被拒（在另一处复制一份、或新增一处
  `.skip`/`.only` 都照样硬拒）；构造自身变了（别的对象/键/名字）也仍然被拒。
- 位置不再影响身份：挪个位置的既有构造放行；位置变了但构造不同的仍拒绝。

顺带移除只剩注释的 `structural` / `projectContexts` / `controlFlowContexts`（#3754 的
位置投影机器，本改动不再需要）。

## 假设

- 风险身份的判据应当只认**构造本身**（原因 + 规范化节点 + import 绑定），位置上下文不参与。
- 位置投影（`projectContexts` / `structural`）不再需要：删干净而非留着成死代码。
- 既有测试里「构造挪位置就算新增」的断言属旧口径，必须按 `## 旧标准变更` 逐条声明并改成
  「挪位置放行 + 真正新增/变形仍拒绝」的两侧断言，覆盖强度不下降。

## 证伪方式

- 若以下两侧不成立，说明位置仍参与身份或放行过度：
  - 参数位互换：`consume(() => consume(...values), () => 1)` → `consume(() => 1, () => consume(...values))`
    必须**放行**；
  - 净新增：`consume(...values)` → `consume(...values); consume(...values)` 必须**拒绝**。
- 若「构造变了」也被放行（`data[key]` → `other[index]`、用例名被改、调用方名被改），说明
  身份被过度简化。
- 若 `import { runInThisContext } from 'node:vm'` 加 specifier 被放行，说明绑定侧把关丢了。
- 若 skip/focus、eval、动态 import、动态成员、解析失败被放行，说明收紧范围被误伤。

## 旧标准变更

本节声明**门禁自身测试**里锁定「挪位置算新增」旧口径的断言改写（受保护路径
`scripts/test-authoring-inspection.test.mjs`），每条给出原断言、必须改的理由与新期望。

- `scripts/test-authoring-inspection.test.mjs` :: `role filtering preserves context slots and multiset excess while enclosing renames stay allowed`
  - 原断言：`consume(() => consume(...values), () => 1)` 把展开挪到第二个参数位必须拒绝。
  - 理由：挪位置是维护动作，构造自身与绑定都没变；旧口径把「位置」算进身份。
  - 新期望：挪位置放行；净新增（同一处复制两份、新增 `eval`/`node:vm`）仍拒绝。
- `scripts/test-authoring-inspection.test.mjs` :: `parent domains preserve callback slots literal titles scope and risk bodies`
  - 原断言：构造挪到别的参数位 / 被包裹函数套住 / 回调参数变化 / 调用方名改变都必须拒绝。
  - 理由：这些只是位置/包裹变化，构造自身没变；`test('renamed'...)` 与 `check(` 属用例名或调用方变化，
    归 `test-case-removed-or-renamed`（该原因仍可声明），`other[index]` 是不同构造。
  - 新期望：挪位置（参数位、包裹函数、回调参数）放行；构造变了、用例名改了、调用方改了仍拒绝。
- `scripts/test-authoring-inspection.test.mjs` :: `import declaration risk bodies and contexts remain conservative when adding siblings`
  - 原断言：给有执行导入的语句加非风险 specifier（`safeApi`）必须拒绝。
  - 理由：加的 specifier 本身不是风险，构造没变；整句 import 自身就是风险（`node:vm`）时，
    语句变化仍拒绝。
  - 新期望：specifier 级风险 + 非风险兄弟放行；语句级风险（`node:vm`）+ 语句变化仍拒绝。

## 验收

- `node --test scripts/test-authoring-inspection.test.mjs scripts/guard-anti-cheat.test.mjs` 全绿。
- PR #3762 的 6 处「不可经声明放行」→ 0（实测）。
- 三反例实测：①挪位置 → 放行；②净新增 → 拒绝；③构造变形（`other[index]`、`node:vm` 加
  specifier、skip/focus、eval、动态成员、解析失败）→ 拒绝。

## 不做

- 不放松 `DECLARABLE_TEST_STANDARD_REASONS` 之外的拒绝通道（新增风险仍硬拒）。
- 不动 `assertSidebarSupportIdentity`、`guard-anti-cheat.mjs` 的路径/仓库身份判定。
