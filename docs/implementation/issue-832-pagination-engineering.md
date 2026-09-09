# #832 QH1 分页返修工程报告

## 结论与范围

- 工程源码检查 **IS_PASS: YES，交第二轮独立 QA**；不代表独立 QA、L2 或整体任务放行。
- 修复基线：`c4418ef2ad5bee8d6356200094e1972d83a78087`；任务树 `.worktrees/skill-header-832`，分支 `agent/market-skill-header-issue-832`。仅本地提交，不 fetch/rebase/push/merge/部署。
- 2026-09-09 12:09 复现原始 QH1：160 个远端条目，第二页预期80、实际0；上游两次均 offset0/limit80，命令 exit1。原 `home-pagination.qa.test.js` 27行原样保留并纳入提交，Git blob `a987f446fa69d6a3da8a7da9d8ccb04be9be93b6`。
- 首页1 / 全局精选49不变；catalog、全部旧资源及 `skill-plaza.js` 对固定基线的 `git diff --exit-code` 无差异。旧310总catalog对象/48封面的第一轮QA核对结论未被本次改动影响，不将310误称为Skills数量。

## 最小机制

- 只改 `plugins/omnimux-market/src/skill-aggregate.ts` 和它的 tracked 构建产物 `lib/skill-aggregate.js`；不新增服务、游标协议、缓存或依赖，不改UI分页调用。
- 保留单次远端请求 limit≤80，批次大小为 max(limit,12)（上限80）。每次聚合请求重放所需有序前缀；offset 按实际收到的远端条数推进。按现有 slug 去重规则和 custom > workbuddy > skillhub 优先级累计。
- 达到 `offset + limit + 1` 个唯一条目即停止预取；额外一条用来判断下一页。未达到时只沿首次响应声明的 total 前进，不随变化的 total 扩大抓取边界。
- 空响应、hasMore=false、首次总量耗尽或fallback均终止；后续页popular fallback不混入原查询。远端失败沿用既有软失败/硬失败规则，不把半份远端前缀伪装成完整成功。
- 尚未遍历完的 total 仍明确 `totalApprox=true`；耗尽后由实际合并去重长度给出精确total和终止状态。
- 成本：无状态offset且要跨渠道去重，需要重放此前远端前缀；不宣称任意深页是常数开销。重复密集的尾部可能必须读完首次总量才能证明没有下一条；这是数据约束，不添加任意截断上限。依赖远端稳定有序、total/hasMore契约；远端数据并发变化不提供快照一致性保证。既有多查询聚合策略未扩展。

## 验证

| 检查 | 结果 |
|---|---|
| 原 QA 160条第二页反例 | 原文保留，全套内通过 |
| 第一次完整 `npm --prefix plugins/omnimux-market test`（含build） | exit0，681/681，无失败/取消/跳过 |
| 补齐2项边界后最终完整同命令 | exit0，**683/683**，8 suites，无失败/取消/跳过；约19.7秒 |
| Stage | exit0；10组件、8 sidebar targets |
| Slot | exit0；1670文件、0违规 |
| 插件依赖边界 | exit0；2215文件 |
| UI静态扫描 | exit0；279视图、0违规 |
| Registry | exit0；12插件一致 |
| `git diff --check` | 通过 |

新增 `src/client/home-pagination-regression.test.js` 17项：0/1/79/80/81/159/160/161边界及越界空页、三渠道优先级和跨页去重、全重复尾页、空页与过期hasMore、变化total有界终止、实际 `searchSkills` API adapter 分页、7条小页及非对齐聚合offset、10000条只读所需前缀、limit上下界和负/小数offset、后续页fallback、后续请求失败。所有测试离线，不请求真实远端。

最终日志：`.workbuddy/evidence/issue-832-qa/pagination-engineering-final.log`；第一轮日志同目录 `pagination-engineering-full.log`。覆盖率未测量。全局复核已检查原API接口、聚合返回字段、UI调用不变以及生成JS与TS的一致性。

## 提交资料与交接

- 原独立QA报告、失败反例、已批准名单与增量PRD均按任务授权原样本地纳入Git；这些历史文档保留当时结论，不改成当前已验收。
- 原构建归档对应旧源码，本轮不重打包、不安装；不可把旧归档当作本次分页修复产物。
- 未重启viewer/Host、未改seed/profile/官方包/外仓；既有受管viewer兼容阻塞未因离线修复解决，未重新检查或声称环境已变化。L2/ego-browser/verify:live维持 **BLOCKED**，没有替代浏览器证据。
- 下一Owner：独立QA在本次提交上重跑分页反例、去重/末页边界及完整包验证；正式依赖Owner提供受管兼容viewer后，运行QA按既有授权恢复L2。工程通过不授权关闭#832、qa:pass或合入。
