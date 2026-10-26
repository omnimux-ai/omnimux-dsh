# 门禁风险身份改用「形状 + 绑定 + 可达性」：构造挪位置不再被当成新增风险（#3754 完成式）

## 问题

测试声明门禁的风险指纹原先包含**位置上下文**（祖先节点类型、回调/参数槽位、分支边——这是 #3754 修复「文本/数据/序号」后保留的结构位置）。结果：同一处既有构造只要在文件里挪个位置（参数位互换、函数嵌套、回调参数变化、import 加非风险 specifier、用例改名、`test(` → `check(`），指纹就变 → 被当成「新增风险」硬拒，且不可经 `## 旧标准变更` 声明放行。实测：PR #3762（画布）多个测试文件因此被拦——它们都是「既有构造挪了位置」而非新增。

## 方案

把风险身份从「构造 + 位置上下文」改为「**构造自身的规范化节点 + 引用的 import 绑定 + 可达性档位**」：

- 指纹 = `canonical({ reason, detail, bindings, reach })`，`detail = canonical(anchor)`（构造自身的规范化节点），不再拼 `contexts`。
- `bindings` 仍是引用标识符→import 的映射（`catch ({ local = safeApi })` 之类引用照样算进）。
- `reach` 只分三档，粗到不会因维护动作漂移，又足以拦住真升级：
  - `module` —— 用例之外（含普通函数里，仍是未证明被执行的代码）
  - `skipped-case` —— 跳过/聚焦用例的回调里（`test.skip` / `test.only` / `xit` / `{skip:true}` /
    `test.describe.skip` 等链式选择器 …），**外层跳过容器会向内层运行器继承**，内层不得升回活用例
  - `live-case` —— 正常用例的回调里
- 运行器/选择器识别扫**整条非计算成员链的根标识符**，覆盖 `test.describe.skip(...)` 这类链式写法。
- 多重集计数兜底净新增：同一档位内复制一份、或新增一处 `.skip`/`.only` 仍硬拒。
- 构造自身变了（别的对象/键/名字）仍被拒。
- **选择器类风险**（`test-execution-selector-needs-review` / `test-execution-option-needs-review`）锚定选择器本身，不再把整个用例回调正文吃进指纹——否则用例正文一动就被判成新增风险，而选择器语义根本没变。
- 顺带移除只剩注释的 `structural` / `projectContexts` / `controlFlowContexts`。

## 假设

- 风险身份的判据应当只认**构造本身 + 它跑不跑**（原因 + 规范化节点 + import 绑定 + 可达性档位），位置上下文不参与。
- 位置投影（`projectContexts` / `structural`）不再需要：删干净而非留着成死代码。
- 可达性只需三档粗粒度：再细分（参数序号、包裹层数、分支槽位）正是原误拦的来源。
- 既有测试里「构造挪位置就算新增」的断言属旧口径，必须按 `## 旧标准变更` 逐条声明并改成「挪位置放行 + 真正新增/升级/变形仍拒绝」的两侧断言，覆盖强度不下降。

## 证伪方式

- 若以下两侧不成立，说明位置仍参与身份或放行过度：①参数位互换 `consume(() => consume(...values), () => 1)` → `consume(() => 1, () => consume(...values))` 必须放行；②净新增 `consume(...values)` → `consume(...values); consume(...values)` 必须拒绝。
- 若「构造变了」也被放行（`data[key]` → `other[index]`、用例名被改、调用方名被改），说明身份被过度简化。
- **若可达性没进身份**，则「`eval`/`data[key]` 从死函数或 `test.skip` 搬进活用例」会被放行——这是必须拒绝的真升级（旧门禁能拦）。
- 若**容器式跳过**没继承（`test.skip('g', () => { test('a', () => { eval(code) }) })` 里的构造挪进顶层活用例）或 `test.describe.skip` 链没被识别为运行器，同样会被放行——也必须拒绝。
- 若同一档位内挪位置被拒（用例内套 `if`、跳过用例内套 `if`），说明位置又混进了身份。
- 若 `import { runInThisContext } from 'node:vm'` 加 specifier 被放行，说明绑定侧把关丢了。
- 若 skip/focus、eval、动态 import、动态成员、解析失败被放行，说明收紧范围被误伤。

## 旧标准变更

本节声明门禁自身测试里锁定「挪位置算新增」旧口径的断言改写（受保护路径 `scripts/test-authoring-inspection.test.mjs`），每条给出原断言、必须改的理由与新期望。

- `scripts/test-authoring-inspection.test.mjs` :: `role filtering preserves context slots and multiset excess while enclosing renames stay allowed`
  - 原断言：`consume(() => consume(...values), () => 1)` 把展开挪到第二个参数位必须拒绝。
  - 理由：挪位置是维护动作，构造自身、绑定与可达性档位都没变；旧口径把「位置」算进身份。
  - 新期望：挪位置放行；净新增（同一处复制两份、新增 `eval`/`node:vm`）仍拒绝。
- `scripts/test-authoring-inspection.test.mjs` :: `parent domains preserve callback slots literal titles scope and risk bodies`
  - 原断言：构造挪到别的参数位 / 被包裹函数套住 / 回调参数变化 / 调用方名改变都必须拒绝。
  - 理由：这些只是位置/包裹变化，构造自身没变；`test('renamed'...)` 与 `check(` 属用例名或调用方变化，归 `test-case-removed-or-renamed`（该原因仍可声明），`other[index]` 是不同构造。
  - 新期望：挪位置（参数位、包裹函数、回调参数）放行；构造变了、用例名改了、调用方改了仍拒绝。
- `scripts/test-authoring-inspection.test.mjs` :: `import declaration risk bodies and contexts remain conservative when adding siblings`
  - 原断言：给有执行导入的语句加非风险 specifier（`safeApi`）必须拒绝。
  - 理由：加的 specifier 本身不是风险，构造没变；整句 import 自身就是风险（`node:vm`）时，语句变化仍拒绝。
  - 新期望：specifier 级风险 + 非风险兄弟放行；语句级风险（`node:vm`）+ 语句变化仍拒绝。

## 验收

- `node --test scripts/test-authoring-inspection.test.mjs scripts/guard-anti-cheat.test.mjs` 全绿（100 例）。
- 可达性升级实测拒绝：`eval`/`data[key]` 从死函数搬进活用例、从 `test.skip` 搬进活用例、
  从容器式 `test.skip` 内层用例搬进活用例、从 `test.describe.skip` 内层用例搬进活用例（5/5）。
- 同档位挪位置实测放行：用例内套 `if`、跳过用例内套 `if`。
- 净新增与同档位复制实测拒绝。
- **本 PR 对 #3762 的真实贡献是 2 处**：在 `05d9555a7` 时旧门禁剩 5 处不可声明、新门禁剩 3 处；`004144df7` 时 4 → 2；到 `8b7a27eb1` 双双归零。即本 PR 把 `channelGroups` 的 `test-execution-option-needs-review` 与 `comfyui-ops-filter` 的 `dynamic-test-execution-needs-review` 转为可声明的 `test-case-removed-or-renamed`；其余 3 处由 #3762 改写测试自行消除。当前 HEAD 上新旧门禁跑同一命令都是 0，因此「6 处→0」的归因只对中间提交成立。

## 不做

- 不放松 `DECLARABLE_TEST_STANDARD_REASONS` 之外的拒绝通道：新增风险、同档位复制、以及
  **可达性升级**（死代码/跳过用例 → 活用例，含容器式 `test.skip` 与 `test.describe.skip` 链）
  仍硬拒。
- 不动 `assertSidebarSupportIdentity`、`guard-anti-cheat.mjs` 的路径/仓库身份判定。
- **已知不堵、且有意不堵**：`module` 档内部的细分（模块顶层语句 ↔ 普通函数体）。两者都是
  「未证明被执行」的同一档。堵它需要再加一个 `inFunction` 布尔档（只分 `module` / `module-fn`，
  不含序号/槽位/层数，实测 56/56 通过且不破坏主目标），但会把「把顶层语句抽进 helper」这类
  常见重构判成风险，与「被包裹函数套住必须放行」直接冲突。取舍是保住主目标、接受这一档粗粒度。
- **已知不堵（P1，待评估）**：`bindings` 扫描会吃进祖先上下文的 callee，因此当 `describe`
  已被 import 时，「把用例包进 describe」仍会被判成新增风险（顶层 bindings=`test`，describe 内
  是 `describe|test`）。修它要动 bindings 的上下文扫描，牵动 2 个既有断言，留待单独评估。
- **已知不一致（P2）**：`xit` / `fit` 仍锚定整个 `CallExpression`（正文一动即拒），与已修的
  `test.skip` / `test.only` 不一致；`test.skip` → `test.only` 与新增跳过用例仍被拒。

