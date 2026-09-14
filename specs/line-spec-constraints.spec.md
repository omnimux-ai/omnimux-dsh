# 线路档位完整规格 — Issue #1818

## 目标
让线路档位能声明该线路的完整可用规格（可用生成方式、参数选项集、输入能力上限），并在界面上如实生效：
选中某条线路时，卡槽、生成方式、参数选项全部收敛到该线路真正接受的范围；切回其他线路时恢复模型级完整选项。

## 背景与根因
消费方（画布）已完整适配契约：卡槽数量与类型、格式与体积与时长上限、参数选项、生成方式列表全部由契约推导。
但契约只有「模型级」声明，缺「线路级」规格。网关本有独立的按次条目（规格完整），产品侧有意把它折叠成同一款模型的
一条线路档位，折叠时只带走了计费与路由，没有带走规格。

## 设计
约束在**契约投影层**收窄，渲染层零改动：卡槽布局与生成方式列表都从「按模型标识取模型」计算，
故只要把收窄后的模型交给下游，卡槽数量、类型、参数选项、模式列表会自动正确。

档位表的约束结构统一为一段声明：

- `operations`：该线路可用的生成方式（缺省 = 全部已上架方式）
- `parameters.<字段>.fixed`：固定取值
- `parameters.<字段>.only`：限定选项集（可为模型级之外的取值）
- `inputs.<类型>.max`：该类型输入的上限（0 = 不支持，卡槽整块不渲染）

既有 `parameterConstraints` 迁移进 `parameters`，中枢与画布镜像同步。

生效规则（冲突时以契约为权威）：
- 固定值或限定集若被契约自身声明拒绝，则丢弃该约束而不是写入非法值
- 未声明的字段沿用模型级声明
- 未指定线路（自动路由）时不施加任何线路约束

## 验收标准
1. 选中特惠按次线时：
   - 参考图卡槽最多 9 个
   - 参考视频与参考音频卡槽**完全不出现**（无论是否已连接上游）
   - 生成方式列表只有「全能参考」
   - 时长固定 30 秒且不可修改
   - 清晰度只有 720p
   - 画幅只有 16:9 与 9:16
2. 切回标准版时恢复模型级完整选项（三档清晰度、七种画幅、全部已上架模式、时长 4~30 可调）。
3. 自动路由（未指定线路）时不施加线路约束，行为与现状一致。
4. 已保存了越界参数的旧节点打开时，按既有自愈规则收敛到合法值并给出提示，不静默改值。
5. 提交校验与界面使用同一套收窄结果；绕过界面构造的非法值仍被拦截。
6. 中枢档位表与画布镜像逐字一致，契约门禁通过。

## Commands
- `pnpm --filter omnimux-workflow test`
- `pnpm --filter omnimux-workflow build`
- `node --test plugins/omnimux/src/catalog/serving/channel-groups.test.js`
- `pnpm verify:model-contracts`
- `pnpm test:gates`
- `git diff --check`

## Project Structure
- 档位表：中枢 `plugins/omnimux/src/catalog/serving/channel-groups.js` 与画布镜像 `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts`
- 约束解析与模型收窄：画布 `ConfigPanel/channelGroups.ts` 内新增纯函数
- 卡槽：`plugins/omnimux-workflow/src/shared/graph/feedSlot/deriveSlotLayout.ts`
- 生成方式：`plugins/omnimux-workflow/src/shared/validation/operationUi.ts`
- 参数收敛：`ConfigPanel/videoParams/videoParameterSelection.ts`
- 提交校验：`plugins/omnimux-workflow/src/shared/validation/executionReadiness.ts`
- 证据：`.agent-reports/1818/` 与 `docs/evidence/`

## Testing Strategy
先写失败用例锁定「按线路收窄」的三项行为（卡槽、模式、参数），确认变红，再最小实现。
正例证明特惠线收敛正确；负例证明标准版与自动路由不受影响、越界值仍被拒。
界面行为变更需真实浏览器现场验证并留证，再固化正式端到端测试。

## Boundaries
总是：只写本任务隔离工作树；中枢与画布镜像逐字一致；契约始终优先于线路声明。
先问：新增能力、付费调用、生产发布或跨工作区写入。
绝不：凭空编造上游未公布的取值；为绕过门禁放宽校验；改动映射层出网结构；破坏自动路由的既有行为。
不删除其他线路与模型的既有约束声明。

## Plan
1. 档位表结构与迁移（中枢 + 镜像 + 两侧测试）。
2. 约束解析与模型收窄的失败用例，确认变红。
3. 最小实现：收窄函数 + 三个接入点（卡槽 / 模式 / 参数）+ 提交校验。
4. 全量测试、契约门禁、构建；真实浏览器验证并留证。
5. 独立评审、PR 必需检查与队列合入；仅清理任务资源。

## Design review
方案对比：(a) 在渲染层逐处判断线路约束 —— 改动面大、易漏、且渲染层本已正确；
(b) 在契约投影层收窄 —— 下游全部自动正确，渲染层零改动，且与「消费方已完整适配契约」的实证一致。
选 (b)。冲突语义沿用既有原则：契约权威，线路声明非法即丢弃。
