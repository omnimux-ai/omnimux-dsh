# 规格：复制/粘贴保留 slotBindings 的 source/edge id 重映射（Issue #4039，#4032 后续）

## 一、目标 (Objective)
修复画布复制/粘贴、复制节点（⌘D）时，克隆出的生成节点仍携带**指向旧节点/边的 `slotBindings`** 的问题。
`pasteFromClipboard` 给节点/边换了新 uuid，却没重写绑定里的 `sourceNodeId` / `edgeId`；#4032 的存活校验会把这批「悬空」占用清理掉，导致「上游节点+生成节点+边」一起粘贴后，生成节点丢失本应保留的绑定。

## 二、命令 (Commands)
- 定向测试：`node --import ./test-setup.mjs --test src/canvas/editor/utils/clipboardUtils.test.mjs`
- 包级测试：`pnpm --filter omnimux-workflow test`
- 类型检查：`pnpm --filter omnimux-workflow typecheck`

## 三、项目结构与修改范围 (Project Structure & Scope)
- 源码：`plugins/omnimux-workflow/src/canvas/editor/utils/clipboardUtils.ts`（`pasteFromClipboard`）
- 测试：新增 `plugins/omnimux-workflow/src/canvas/editor/utils/clipboardUtils.test.mjs`
- 不改动：节点/边克隆的位置与选中逻辑、剪贴板复制范围（仍只复制选中节点及其间边）、重算内核。

## 四、技术方案 (Technical Design)
在 `pasteFromClipboard` 中：
1. 克隆节点时建立 `idMapping`（已有），克隆边时**新增** `edgeIdMapping`（旧边 id → 新边 id）。
2. 第二遍遍历克隆节点，重建 `data.slotBindings`：每个占位者 `sourceNodeId = idMapping.get(old)`、`edgeId = edgeIdMapping.get(old)`；任一缺失（源节点或边未被一起复制）则丢弃该占位者，保留空数组以维持「显示=提交」一致。
3. `slotStandbyEdgeIds` 用 `edgeIdMapping` 重映射并过滤；`slotConflicts` 置空（后续重算重新推导）。
4. 深拷贝绑定数组与占位者对象，避免浅拷贝 `{...node}` 导致篡改原节点数据。

## 五、验收标准 (Success Criteria)
1. 复制「上游源节点 + 生成节点 + 其间边」后粘贴：新生成节点 `slotBindings` 占位者的 `sourceNodeId`/`edgeId` 等于**新**节点/新边 id；对克隆图重算后该占位者仍存活、不被清理。
2. 只复制生成节点（无上游）后粘贴：对应槽位置空数组，不产生悬空引用。
3. 原节点的 `slotBindings` 不被改写（深拷贝）。
4. `slotStandbyEdgeIds` 按新边 id 重映射。
5. 定向测试 + 包级全量测试 + typecheck 全绿。

## 六、边界约束 (Boundaries)
- Always：独立 worktree；定向 + 包级测试与 typecheck 通过后走 PR / Merge Queue。
- Never：不扩大到系统剪贴板、不改变复制选择集语义、不放宽重算存活校验。

## 七、新用户基线 (Product Baseline)
本修复只依赖本地画布节点/边与客户端剪贴板 ref，不依赖任何 dev 机专属服务或凭据；新用户首次进入创作画布即可用。

## 假设
粘贴时被复制子图里的节点与边会各自获得全新的 uuid，而 `slotBindings` 占位者只要其 `edgeId` 与 `sourceNodeId` 能被映射到「同一次粘贴产生的新边/新节点」，就表示这条绑定在新的子图里仍然成立、应当保留；映射不到的说明源/边不在粘贴范围内，应作为悬空引用丢弃。

## 证伪方式
证伪方式：构造剪贴板含「源节点 + 生成节点 + 两者间的边」，`pasteFromClipboard` 后断言新生成节点占位者的 `sourceNodeId`/`edgeId` 等于新节点/新边 id，且原节点未被改写；再构造只含生成节点的剪贴板，断言其占位者被丢弃为空数组。若仍引用旧 id 或篡改原节点，则假设被推翻、用例变红。
