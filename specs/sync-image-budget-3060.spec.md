# #3060 同步生图提交预算补修（父任务 #3054）

## 目标与成功标准
用户授权全权修复直到开发版真实图片视频成功。PR3055已合入b706408dd且Dev合法物化安全重启；真实MiniMaxH3视频已通过正式画布接单并完成2677624字节MP4。真实gpt-image-2.5标准图仅一次提交，runtime-kit本地120秒默认期限提前截断，非认证失败，也不能仅据此称上游不可用。
1. 中枢openai-media同步image提交显式给真实client合法上限600000ms，不再由默认120000ms先于生成结果中止；视频/audio提交保留既有有界默认。
2. 预算仍有界且尊重用户取消，真实API上游错误保持cause，无自动重试新POST、不换模型/渠道。
3. 先执行协议走读，观察实际AbortSignal.timeout参数：image600000，video120000；fake fetch可非空返回URL；调用方取消保持生效。固化精准回归，媒体完整包/静态/独审通过，PR/MQ交付。
4. 合入后Dev仅中枢命名sync、核其他已接单任务终态后安全重启；真实新图片经正式业务页输出可解码，原成功视频实际播放取证，才完成父任务。不能以mock或加载状态取代。

## 命令
在plugins/omnimux目录执行node scripts/run-tests.mjs；根node scripts/verify-plugin-boundaries.mjs、verify-product-baseline.mjs、auto-qa-gate.mjs . --diff --base origin/main；node --test plugins/omnimux/src/media/sync-image-budget-3060.test.js。真实业务仍只Dev本轮明确授权。

## 结构
仅plugins/omnimux/src/media/protocols/openai-media.js client构造预算；新sync-image-budget-3060.test.js强协议回归；证据docs/evidence/sync-image-budget-3060，报告主仓.agent-reports/media-generation-repair-20261003。

## 风格
复用既有createOpenAICompatibleClient公开requestTimeoutMs，合法image条件显式值；不修改依赖node_modules、不复制HTTPclient、不改provider adapter，错误透传与当前ledger合同保持。好输出仍为现有{mode:'live',taskRef,url}，此补不新增字段或消费端状态。

## 测试
Spec→Code→生产协议fakefetch真实执行预算/取消走读→固化test→media全目录/完整Hub/独审。capture actual timer不是静态regex，fake媒体URL不冒称真实model。库normalizeTimeout上限600000已从当前0.2.0实装源码核实，不把21min外层直接传入宣称20min内层。

## 边界与新品基线
安装登录后当前合法mediaAPI凭据，凭据仍由中枢operation resolve，缺则真实报错。绝不Dev旁路未合并产物、改DSH/vendor、新凭据、Prod/付款、静默重提原timeout意图。同步图片120秒未taskid只保留unknown accepted风险，不清ledger强重试。本票无UI改动，已有父任务UI浏览器证据非本票新证据；真实Dev验收不用于能力探测。

## 文档影响
本规格记录已执行父任务现场与预算子任务；中枢原恢复合同无语义改动，仅修HTTPclient默认预算。用户当前授权覆盖普通技术选择，无需重复需求确认。
