---
status: active
issue: 3426
type: fix
plugin: omnimux-inspiration
---

# 明确授权的单账号人工超额刷新

用户最新原话：「不要轮询了  批准你超过预算  尽快完成任务」。停止自然日预算等待和周期查询。用户已明确批准原TikTok本次额外刷新，原X已通过无需重复。基线d4b306714cdb938ffc594af44e81e7cf51ff8264，父事项3375；云端修复与受限渠道86已经真实交付。

## 方案与边界

仅单账号刷新POST新增严格布尔allow_budget_overrun；true必须同时显式manual:true。service/scheduler独立防御，自动和refresh-all不接受此授权。默认请求行为、每轮2、每账号日4、全局日50、10分钟手动冷却和排队/运行去重不变。

本次选项只略过该账号每日预留预算拒绝，不略过全局预算或每轮调用上限。仍经过原唯一入队/采集/存储链，原账本真实累加2，允许4→6，不清账本、不改时钟、不提高默认数值、不持久化放宽开关，不用manual:false或直接供应商采集旁路。缺省或false不放宽；非法类型、未显式manual:true、批量/自动带true出站/入队前拒绝。结果不明保留永久一次计划，不重发。

新用户安装并登录后采用同一默认预算；超额只由本次显式人工请求表达，缺登录/云通道按已有明确错误失败，无Dev端口或本地服务fallback。域插件继续通过Hub seam采集，不存provider凭据或HTTP客户端。

## 验证

有效回归：默认spent拒绝；true+manual:true单账号可越额且完整计数；false无效应；坏类型/非显式manual/自动/批量拒绝；全局仍拒绝；冷却/已有queued/running去重保持；失败不伪成功。执行相关纯后端全套与产品基线/边界/impact选择的最小检查，禁止Chrome/Chromium/IAB，仅Ego可用于必要浏览器验证。无前端/Stage/壳变化，不把Dev UI当验收。

固定提交独审、准确head required CI/MQ后正常合并，显式Dev物化+受控重启与实际文件hash/同源API校验，保持人工Dev UI边界。原TT正常manual:true+allow_budget_overrun:true只一次，实际新成功、资料/作品last_seen/全聚合、下次24h计划、原账本4→6及global18→20（若期间其他合法调用须单独对账）和原user1/token45/channel86/group日志/实际quota验收；202不算成功。X原PASS不重跑。

文档影响：更新已有账号监控设计中的预算/人工重试API说明；默认预算及失败预留语义保持。长期发布方案仍须主任务完整验收/收尾后实施，不在本改动开始。
