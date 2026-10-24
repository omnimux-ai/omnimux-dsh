# 模板收尾清理：死文案 + 组入口悬空父引用（Issue 3662）

- 任务：`.worktrees/workflow-template-flat-snapshot-3662`（分支 `agent/workflow-template-flat-snapshot-3662-issue-3662`）
- 插件：`omnimux-workflow`；风险 R2（删一条死文案 + 落库前统一扁平化，不改 API/schema/存储）

## 目标

#3659 之后独立验收方复核出两处收尾项，用户确认一起清掉：

1. `template.missingGroup` 已成死文案（源码无引用，只剩两份字典与 `workflowTemplateScope.ts` 注释）。
2. 组入口保存的模板仍带 `parentId`/`extent`：组范围只放子节点、组容器不在模板内，于是 `parentId` 指向模板里不存在的组；`sanitizeNodes` 会保留字符串 `parentId` 与 `extent === 'parent'`。插入路径 `planInstantiateTemplate` 现在会剥掉两者（无功能影响），但模板 JSON 自相矛盾。画布范围在 #3659 已剥掉，两个范围应一致。

## 变更点

1. `dict.zh.ts` / `dict.en.ts` 删除 `template.missingGroup`（两份同步，保持 zh/en key 集合一致）。
2. `workflowTemplateScope.ts` 头部注释改为不引用已删 key 的说法，并新增导出
   `toFlatTemplateSnapshot(nodes)`：剥掉 `parentId`/`extent`，其余字段与顺序不变，幂等；
   注释说明「模板 = 扁平快照」这条不变量在这一个家。
3. `CanvasEditor` 的 `onConfirm` 在 `sanitizeNodes` 前统一调用它，两个范围共用。
4. 新增 `toFlatTemplateSnapshot.test.mjs`（新文件，纯函数用例，零风险构造）。

## 非目标

- 不改模板库 API、`templateSchema`、`TemplateStore`、存储结构。
- 不改 `planInstantiateTemplate` 插入路径。
- 不改范围解析语义（哪些节点/连线、画布范围坐标换算）与 #3659 已验收行为。

## 新用户基线

纯画布内行为：全新用户保存模板得到的 JSON 自身自洽（不含指向模板外组的父引用），不依赖本机状态、服务或凭据；文案删除只影响一条已不可达的错误分支。

## 假设

1. `template.missingGroup` 已无任何源码引用（`#3659` 之后不再抛），删掉不会改变任何可达行为；字典 key 集合一致性由 `w4-i18n.test.mjs` 机械保证。
2. 组范围节点坐标保持相对坐标不变即可：同一组内子节点共享同一个组容器偏移，`planInstantiateTemplate` 插入时按包围盒整体平移，所以剥掉 `parentId` 不影响插入结果。
3. `sanitizeNodes` 只在 `typeof raw.parentId === 'string'` / `raw.extent === 'parent'` 时保留这两个字段，因此把值置为 `undefined` 即可落库前剥掉，不必改动 `sanitizeNodes`（它是持久化共用路径，不能动）。

## 证伪方式

1. 若 `rg "missingGroup"` 在 `plugins/`、`scripts/` 还能命中非本次删除的文件，假设 1 被证伪，需要一并处理引用方。
2. 若真实浏览器里组入口保存的 payload 仍出现 `parentId`/`extent`（计数 > 0），假设 2/3 被证伪。
3. 若组入口 payload 的节点坐标相对画布发生了位移（不再等于组内相对坐标），说明扁平化顺手改了坐标，需回退坐标处理。
4. 若既有 `workflowTemplateScope.test.mjs` 4 个用例出现失败，说明改动越过了「范围解析」边界（该文件按门禁不可改写，必须靠设计回避）。
5. 若同一份 payload 两次调用 `toFlatTemplateSnapshot` 结果不同（非幂等），实现有误。

## 验收标准

1. `template.missingGroup` 从两份字典移除、源码无引用，zh/en key 集合仍一致。
2. 组范围与画布范围保存的 payload 都不含 `parentId`/`extent`；组范围坐标保持组内相对坐标，画布范围仍为绝对坐标。
3. `toFlatTemplateSnapshot` 幂等；既有 4 个范围用例不回归。
4. 真实浏览器：组入口（组浮动条「保存工作流」）与入口卡各保存一次，payload 的 `parentId`/`extent` 计数均为 0，画布入口形状与 #3659 一致（5 节点 / 2 连线）。
5. `pnpm --filter omnimux-workflow test`、`typecheck`、`pnpm verify:stages`、anti-slop 绿；`git diff --check` clean。

## 文档影响

无用户文档需要同步：删除的是一条不可达错误文案，落库扁平化不改变用户可见行为；`docs/evidence/issue-3662-*.md` 作为任务证据留存。
