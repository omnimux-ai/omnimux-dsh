# #832 分页修复最终第二轮独立 QA

## 结论

- **Routing Decision: NoOne；源码验收 PASS；整体运行验收 BLOCKED；整体 IS_PASS: NO。** 未发现本轮范围内新的源码 bug，QH1 已通过原反例验收。不得据此标记整体 qa:pass、关闭 #832、合入或部署。
- 固定 target：`1e86ec64e81332fa4aaaa022745dd2b6db724975`。返修比较 base：`c4418ef2ad5bee8d6356200094e1972d83a78087`；旧资源比较 base：`1e4510308a2d2bfd0c079bf25659efad10b62f9c`。
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-header-832`，开始时干净。2026-09-09 12:16–12:21 Asia/Shanghai。完整读取 pagination-engineering、home-recommendations-qa，另核对增量 PRD、推荐工程报告及实际源码/测试。
- 本轮为返修后的**最终第二轮 QA**，只执行一次完整 build/test；不再进入第三轮返修测试。覆盖率未测量，不报告估计百分比。

## 实测汇总

| 检查 | 结果 |
|---|---|
| `npm --prefix plugins/omnimux-market test` | exit0；687 tests / 687 pass / 0 fail / 0 cancelled / 0 skipped；8 suites，测试阶段约17.7秒 |
| 原始 QH1 160条第二页反例 | PASS；第二页80条、首slug remote-80、hasMore=false；原测试原文未改 |
| 工程新增17项 | 全部通过，包含0/1/79/80/81/159/160/161、跨页去重、全重复尾部、空页、变化total、小页真实adapter、仅前缀预取、参数边界、后页fallback与软失败 |
| 独立新增4项 | 全部通过，详见下节；纳入687总数，不重复相加 |
| 原反例 Git blob | `a987f446fa69d6a3da8a7da9d8ccb04be9be93b6`，与工程记录一致 |
| 返修对catalog及skill-plaza.js差异 | `git diff c4418ef2... HEAD --exit-code -- <两路径>` exit0，无差异 |
| 构建后业务/构建内容 | `git diff --exit-code -- plugins/omnimux-market/src/skill-aggregate.ts plugins/omnimux-market/lib` exit0；tracked文件无变化 |
| 空白检查 | `git diff --check` exit0 |

原始完整日志：`.workbuddy/evidence/issue-832-qa/pagination-independent-round2.log`。第572–593行为17工程回归、4独立测试及原反例全部成功；最终摘要687/687。工程683仅作输入，本报告687为本轮独立运行实绩。

## 独立边界与请求终止

新增 `plugins/omnimux-market/src/client/home-pagination-round2.qa.test.js`：

1. **独立稳定集合 oracle**：317条远端记录混合重复slug、空白/大小写同身份，以及custom/workbuddy同名项。以独立顺序集合计算预期，按1/7/13/79/80页宽遍历至越界；逐页及最终拼接无遗漏/重复，custom > workbuddy > skillhub，末页total精确且hasMore=false。每次聚合请求断言请求数不超过 `ceil(317 / max(12, limit))`，上游offset单调按实际批次前进。
2. **真实API adapter混合去重**：241条上游记录，每5条重复一个本地slug，经过实际searchSkills/pageFromOffset而非仅stub聚合结果。按80页宽逐页比对预期；每次聚合至多4次模拟HTTP请求，结果稳定无遗漏。
3. **不正常total / 重复短响应**：首total分别0/-1/NaN/Infinity/2.5/17，后续total膨胀到1e9，始终重复同一条；深offset1000仍按首次边界结束，空结果、精确total1、hasMore=false。断言请求数等于归一化首次total的向上取整上限。
4. **后页硬失败**：aggregateRemoteSoftFail=false时第二次请求失败必须reject，不能返回部分成功；恰好2次请求。

源码审查：`src/skill-aggregate.ts:98–130` 首次响应固定remoteEnd；每轮非空响应remoteOffset严格增加，空响应/hasMore=false/fallback直接break，后续total不能扩大边界；唯一条目前瞻达到offset+limit+1也停止。因此在远端契约正常、响应能够完成时，没有由重复项或变化total造成的无限请求循环。

**边界不是性能承诺**：无状态offset会重放前缀，重复密集时可能读完首次total。上限随首次声明total变化，不是固定请求预算，也不是任意深页O(1)。远端稳定排序/total/hasMore与多查询策略仍沿现有契约；本轮未验证真实远端数据稳定性、在线延迟或并发快照一致性。离线注入模拟HTTP不等于真实网络验活。

## 首页与旧资源

- 实际 `catalog/skill-recommendations.json`：homeRecommendations仅 `sk-bggg-data-amazon`；featuredSkills49，与catalog中49个recommended Skill的ID集合完全一致。
- 当前311总catalog对象 / 193 Skills；相对旧资源base，**310个旧catalog对象逐对象deepEqual**，旧48精选身份/资格保留；不把310称为Skills数。
- 通过git ls-tree枚举旧covers并用git show与当前文件逐字节比对：**48张旧封面全部相同**，包含此前三张图。
- 本轮资源核对的一次临时脚本把homeRecommendations误读为index.json字段，exit1 TypeError；正确真源为独立skill-recommendations.json。纠正QA脚本读取位置后完整资源核对exit0。没有改业务、改预期或隐藏源码失败；此错误不属于产品bug。

## 运行未验与交接

- **L2 / ego-browser / verify:live 未执行，运行验收仍BLOCKED。** 按本轮明确范围，不重复viewer哈希、不启动/重启Host，不检查新运行状态；依赖状态沿用上一轮已证实的受管viewer导出不兼容结论，而非声称本轮重新核验。
- 旧报告所列真实DOM/交互时序、宽屏/分屏/375px、中英/深浅、草稿附件保护、宿主Tab和实际图片路由等尚无运行签字；单测通过不能替代。
- 未重打包或安装；旧tgz不能代表本次分页修复。未改官方包/外仓/seed/profile；未commit、push、PR、merge、部署。
- 本轮只新增4项QA测试、此报告及任务内离线日志。完整测试自动重建lib但tracked产物无差异。无后台测试作业遗留。
- 下一Owner：主理人接收源码PASS；正式viewer依赖Owner提供受管兼容制品/receipt及实际任务依赖证据后，运行QA按既有授权执行正规L2 + ego-browser + verify:live。当前仅离线QA完成，整体不具备关闭/归档放行条件。
