# 中枢角色生成产品视图与完整候选匹配（#3250）

## 目标与授权
父#3247 2026-10-08用户批准实施。产品生图／生视频不让用户选后台模型/组；普通新视频只有全能参考／首尾帧；无新标记旧编辑、延长、digital_human用途保留。图片开放依赖#3244固定合入与产物证据；不抢改其工作树。

## 新用户操作旅程
选生图→输入提示词/可用参考素材→目录提供真实格式数量→全组合合法才允许提交；选生视频→全能参考空媒体为文生、有媒体匹配参考；首尾帧需用户选，角色不能按张数猜。用户不配置后台id和真实组，但执行快照必须绑定明确真实wireGroup。原任务已提交只恢复/收取不重新选用途。

## 总体验收（分子切片交付）
1. 在既有modelCatalog提供可选generationProducts version=1，不改变models[]/operation id旧语义。两个产品image/video内部候选由中枢原配置及真实契约构造，消费端无hardcoded模型表。
2. 同一模型+真实组+operation候选独立承接全部素材/参数；多图A与高清B、图A与音B不能虚构整体支持。禁用/未知/缺资格/冲突组失败；无符合候选时保留素材提示原因。
3. 准入规则与现有listed不同层时明确区分，当前未取证产品不新开放，不批量隐藏旧操作。legacy mode/modes不得复用为产品概念。
4. 共享纯包复用/抽取结构匹配和narrow逻辑，不新增HTTP客户端/凭据/第二套路由。依赖要打包物化、测试可解析、跨插件私有导入禁止。
5. 目录指纹必须包含inputGroups/implementation/routing/channelGroups及constraints/enabled/wireGroup/defaultOperations、新product/mapping/candidate顺序。无语义对象key顺序不换hash，语义数组顺序保留。不得使用一个不被consumer cache读取的孤立hash。
6. 旧用途明确operation不能由matcher候选默认替换，旧在途不回填产品标记；具体shared解析点与factory原子写标记归后续消费端子票。
7. 请求显式绑定组，系统auto策略不是group:auto替代真实组；按同组低价优先真实授权规则。不以对客积分伪称进货价；上游组内不可见排序只能引用真实上游声明，不声称本仓实现。
8. 最终执行前重核目录/候选，备用均接受完整快照；上游已accept不得盲目换线重投。normal文生/参考/帧prompt政策按最终operation复核。

## 第一子切片：指纹语义完整性
独立实现/评审load.js规范指纹及list.js对外指纹语义覆盖。新增generation-fingerprint.test.js覆盖inputGroups/implementation/routing/channelGroups constraints/enabled/wireGroup/pricing/sla/defaultOperations敏感性，对象键顺序不敏感。用临时完整合法契约fixture和正式loadAll/正常buildModelCatalog执行，而不是只测自己组的payload。保持现有public返回形状和schemaVersion1.1，允许fingerprint有意改变；不更新任何live状态、不改端点。不把该切片完成称产品视图已完成。目录hash变化后，已有官方声音预览衍生快照的catalog_fingerprint必须用正式exporter同步，逐字验证仅该字段变化、voice509及preview_fingerprint不变；不改声音数据、不删快照校验断言。

## 技术形状（后续共享与投影）
generationProducts为带version、product kind/label、intents及精确variants引用的可选目录视图。共享库packages/generation-capabilities/只解释DTO，不含厂商配置。编辑态可接收/未满足最低要求与提交ready分开。输出必须含决定operation、素材bySlot、参数集合及原因，服务器保留最终SubmitGuard。固定意图通过声明映射不靠本地operation枚举。

## 边界与产品基线
仅本仓任务树；无厂商付费探测、无真实生成/凭据读写、无Dev物化或重启/生产。新用户依赖正常目录和中枢配置，缺少则明确不可用，不能使用开发机服务/别名/绝对路径。定价改变、所有模型下架、全路由重写及旧项目强制迁移不做。

## 检查与风格
ESM+清晰JSDoc/TS类型，typed errors，no静默catch假成功；复用已有哈希/键排序，不另造散列实现。先红后绿的合法fixture反例；相关node --test、hub包测、check:boundaries、verify:model-contracts、product-baseline，若新增包跑该包独立test/build/type检查，选实际diff命令并集。不混入client UI而用截图冒称生成成功。

## 交付与回退
先基础切片后消费者，各子票明确范围和证据。新增字段可被旧消费者忽略；新消费者依赖后须先回消费者再撤中枢。所有PR遵循独立评审/required CI/Merge Queue，UI先演示确认。spec在本树，不复制主检出。
