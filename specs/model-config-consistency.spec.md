# #3312 模型配置一致性修复

## Objective
用户已确认最小修复方案并于2026-10-14明确“执行修复”，授权代码、测试、Issue/PR、合入、Dev同步和任务清理，不授权真实模型请求、生产配置或发布。基线 origin/main 38d95d6a77920eb157c5546f8e961a59c1179bc4。正式聊天由宿主管理，本任务修中枢文字/素材理解/图像/视频和既有音频消费。

目标：停用/未知/越界线路零新请求；文字与媒体独立保存及选择；合法默认贯通新节点/无模型提交；保存、连接、能力接入与历史生成分开，相关配置变化使旧回执失效。旧来源不明局部待确认，不清空个人数据。用户方案详见主检出 .agent-reports/beeftv-model-config-20261014/minimal-repair-plan.md，正式执行以本规格替代其分析阶段的“禁止实现”措辞。

## New-user baseline
只有已安装中枢与官方登录能力可作默认；本机助手、用户API必须显式配置，不以开发机服务/端口/密钥作回退。新装无任何显式覆盖时官方路径可配置且按操作认证，缺凭据报中文错误不伪成功。本机文字不拥有图片/视频输入能力，素材理解独立判断。

## Structure and contracts
现有 plugins/omnimux/src/settings/{schema,runtime-mode}.js、text/{mount,execute}.js、media/{execution-plan,execute}.js、byok/http.js、agents/http.js 与 client/RuntimeModeSection/RuntimeGuideGate。工作流默认在 shared/generationPolicy.ts、validation/compatKernel.ts、graph/canvasSlotRecompute.ts。使用原中枢目录、提交门禁、凭据 seam、设置 revision 与UI控件；不新增通用注册架构。说明更新归 docs/contracts/hub.md、settings-ui.md 的受影响行为，不借机变更模型上架合同。

场景最小数据：settings.scenarioBindings={text,analysis,image,video,audio}，条目={channel:'official'|'agent'|'byok'|'pending',provider?:string}；模型复用现有字段，byokProviders 保存供应商元数据。原始用户字段有证据才读迁移，schema补默认不是用户选择。旧key含媒体provider/img模型时不推定文字API；旧agent及身份可认定文字；无自定义选择新用户官方默认。新的bindings存在时旧runtimeMode不再决定执行。公开元数据只存引用，不存密钥。

## Boundaries and exact behavior
- 路线限定当前模型行，启用、allowed均约束head/tail；group后缀和字段冲突拒绝；非空非法allowed拒绝；明确无池零候选；单显式group无allowed只单条；策略池保留排序；无意图官方未知不得裸逃逸，真实BYOK合法模型保留。已受理取回不重创建。
- 场景绑定解析由settings/runtime-mode既有位置统一持有，入口和执行不得重复按旧mode覆盖。文本有媒体引用选analysis，纯文字选text；显式模型/group与toolModel保留但冲突拒绝；本机仅纯文字。
- 保存媒体不写mode、不双写文字通用密钥；目标provider专属凭据。保存、测试、选择分开：测试不保存草稿/密钥/绑定。检查默认离线格式及能力覆盖，不暗发ping生成；可读取明确无生成目录检查仅标目录连接。
- 不透明凭据世代与服务端事件使验证失效，公开状态无秘密/哈希。能力状态不以GET models晋升所有能力。响应描述可配置/连接/支持/历史真生成分别表示。
- 同provider写入口串行、开始版本条件提交、先失效回执再写凭据/配置、最后读回确认。失败不报成功或用新revision重发旧快照；部分写入明确不可误用/可重试；删provider不清其它引用。旧异步检查成功/失败不能覆盖新版本。
- 端点来源变化不把旧key发给新来源，需明确确认或重新绑定；检查不缓存key跨操作。
- 默认投影继承合法目录默认再policy兜底，兼容选择先resolved defaults；operation推荐不冒充模型偏好。保留显式节点与最近手选，invalid已有节点不可执行不替换。
- 涉及选择UI不得用黑名单自动清持久配置；沿权威目录/本机发现结果。首次引导不全局二选一，账号操作仍需登录。

## Code style
沿具名导出、单引号/无分号JS与现有TS风格；边界精确JSDoc/TS；返回对象或有原因的错误。不吞错误，不新client provider。不引入依赖。现有返回形状例如 `return { candidates: [], unresolvedGroups }`，严格失败不会临场改成裸候选。

## Agreed test seams
用户方案已确认候选计划、目录→画布→新节点/提交、配置HTTP保存/检查、text/media公开execute、任务collect、真实设置UI与首启。测试在这些公共边界，替身限HTTP/credentials/settings外部边界，不私有实现自证。每slice先一个行为失败用例再最小实现，记录红绿。历史错误断言纠正不删除测试。

## Commands
最小路径相关node --test；集成后 pnpm --filter omnimux test、pnpm --filter omnimux-workflow test、pnpm check:boundaries、pnpm verify:product-baseline、pnpm verify:model-contracts、pnpm verify:cross-plugin-models、pnpm verify:stages、node --test scripts/verify-anti-slop.test.mjs。有注入改动加verify:plugin-load/test:plugin-load。构建两触及包。隔离worktree `pnpm verify:app -- --journey .workbuddy/qa-journeys/model-config-consistency.mjs` ui模式，ego-browser真实操作截图/结构化证据和清理。不用全仓verify:all，不模型调用。

## Testing strategy / success
覆盖停用/未知/越池/无池/冲突零HTTP；合法allowed备用受理后不再创建；本机文字保存图像不变、图像保存不改文字key、视频独立；analysis缺配置只影响analysis；允许默认Sonnet从目录投影到新节点、最近/已有节点保持；GET目录不能全能力就绪、草稿改变相关失效、迟到结果不写；失败保存与冲突保留草稿、重启bind保持且回执不会旧bool变绿；目标provider删除/换端点不串key；collect沿原任务无创建；新用户官方默认且缺key真实失败。离线真实测试数据不标live事实。UI先真实验证后写e2e回归，不能以首页打卡作证。

## Tasks / ownership
Lead 主worktree负责scenario/settings/byok/text/media/client/UI/contract/QA及Git集成；线路子worktree只channel-groups与路线相关tests；默认子worktree只三处workflow shared和对应tests。独立写树，Lead导入patch复核。切片max5生产/测试文件不足时再拆，不删消费方省数量。报告写主检出 .agent-reports/model-config-repair-20261014/。

## Non-goals
不改BeefTV/官方DSH/生产/开发机个人凭据，不新增模型/供应商/接口协议/调价、不激活generationProducts预览为执行、不全仓清理旧模式、不放宽CI。不重启有活跃用户/任务的桌面。跨界真实生成/生产发布需另授权。
