# P1a 证据：网关目录接入运行时（不改行为）

- 日期：2026-10-24
- Issue：#3719（父任务：让云端成为模型清单唯一真源）
- 规格：`specs/catalog-cloud-truth-p1a.spec.md`
- 结论：网关快照已进入运行时（随包快照 + 磁盘缓存 + 刷新 + 只读诊断），**中枢目录输出与改动前逐字节一致**。

## 1. 随包快照

由 `pnpm catalog:snapshot` 从网关公开定价接口生成（只读目录接口，不调用任何模型、不发送凭据）：

| 项 | 值 |
| --- | --- |
| 文件 | `plugins/omnimux/src/catalog/cloud/bundled/pricing.json` |
| 模型数 | 11 |
| 分组倍率条目 | 18 |
| 内容摘要 | `b84ec130d9a9d11ae27a1967655755e984513510c4db54d3cd6953fcca255725` |
| 生成时间 | 2026-10-24T12:23:12.114Z |
| 校验 | `pnpm catalog:snapshot:check` 通过（schema 版本、模型数、非空成员信息） |

只保留归一化字段（id / 展示名 / 线路 / 端点类型 / 计费 / 网关 contract + 顶层分组倍率与可用分组），不含密钥、账号、厂商 id、owner、描述或标签。文件里确实保留网关自己的分组显示名（如「优选中转」「官转版」）与网关 contract 引用的渠道官方文档链接——这些是网关对匿名调用方公开的内容，不是密钥。

## 2. 接入不改行为（本步的核心承诺）

`plugins/omnimux/src/catalog/cloud/p1a-behavior-unchanged.test.js`：

- 同一进程内，先取一份 `buildModelCatalog()`，再让快照解析成功并进入进程内快照，再次取目录 → 两次输出深度相等（文本/图片/视频/音频四个列表的 id 序列逐项相同）。
- 诊断差异计算在目录对象上运行后，目录序列化结果不变（只读）。

## 3. 差异诊断（真实快照，离线）

`node plugins/omnimux/scripts/catalog-diff.mjs --gateway plugins/omnimux/src/catalog/cloud/bundled/pricing.json`：

| 指标 | 值 |
| --- | --- |
| 网关模型 | 11 |
| 中枢契约模型 | 44 |
| 中枢已上架 | 9 |
| 中枢有、网关不可达 | 4 |
| 网关在售、中枢未上架 | 6 |
| 网关分组、中枢未登记 | 3 |
| 中枢分组、网关未登记 | 0 |
| 积分与网关口径不一致 | 1（seedance-2-0 @ default：中枢 4.9，网关口径 4.86） |
| 无法比对（网关按 billing_expr 计费） | 3 |

诊断视图（`/omnimux/model-catalog?view=diagnostics`）报告的计数必须与上表逐项一致，尤其「网关分组、中枢未登记」= 3：它读的是差异文档自己的摘要，键名映射集中在 `diffSummaryCounts`，并由测试固定（`p1a-review-fixes.test.js`）。

这些数字就是 P1b 要消掉的对象：切到快照后，前六行里除「契约缺失」外都应由网关数据自动决定，不再需要本地提交。

## 4. 运行时保护（单测覆盖）

| 场景 | 行为 |
| --- | --- |
| 响应为空 / 无成员信息 | 不覆盖，标记过期，保留上一份 |
| 单次消失超过一半（≥4 个已知模型） | 拒绝覆盖，标记过期并报出 `missing/known` |
| 网络失败 / 非 2xx | 只标记过期，目录继续服务 |
| 内容未变（摘要相同） | 不写盘、不发事件 |
| 内容已变 | 写盘 + 进程内快照 + 发 `omnimux/model-catalog-updated` |
| 磁盘缓存比随包快照旧 | 丢弃磁盘那份，用随包快照 |
| 随包快照损坏/缺失 | 不抛错，回落到磁盘缓存并记录原因 |

## 5. 本步执行的检查

| 检查 | 结果 |
| --- | --- |
| `node --test plugins/omnimux/src/catalog/cloud/*.test.js` | 88/88 通过 |
| `pnpm --filter omnimux test` | 3621/3623（2 项为既有环境依赖失败：`src/agents/local.test.js` 的本机 CLI 探测，在未改动的检出上同样失败） |
| `pnpm check:boundaries` | 通过（4486 个源文件） |
| `pnpm verify:model-contracts` | ok=true；模态矩阵无新增缺口 |
| `pnpm verify:product-baseline` | 通过（1 项既有豁免） |
| `pnpm catalog:snapshot:check` | 通过 |

## 6. 独立评审后的修复（同分支）

| 评审发现 | 处理 |
| --- | --- |
| 分支落后主干，diff 里夹着对上一版「仓库身份加固」的回退 | 已 rebase 到当前主干；`git diff origin/main..HEAD -- scripts/` 为空 |
| 诊断的「网关分组未登记」恒为 0（读了不存在的键名，`?? []` 把错误吞成 0） | 计数改读差异文档自己的摘要，键名映射抽成可测函数；新增测试断言「计数 == 差异摘要」且该值 > 0 |
| 「内容未变」时不推进 TTL、也不清 stale：实际每小时拉一次、失败后永远显示过期 | 新增 `markFresh`：未变也记录尝试时间并清 stale；TTL 从「最近一次尝试」起算；两条各有一个测试 |
| 文档声称快照「不含中转站名称或 URL」与事实不符 | 三处措辞改为如实描述（含网关分组显示名与渠道官方文档链接，均为匿名公开数据，非密钥） |
| 诊断体会回显本机路径与上游原始错误文本 | 诊断只回稳定代码（`bundledIssueCode` / `errorCode`），明细只进日志 |
| spec 出现重复的 `## 旧标准变更` 标题 | 已合并为一节 |
| 失败后的非强制重试被 TTL 拉到 6 小时后 | TTL 只从「最近一次成功」起算：失败不推进时钟，下一个每小时 tick 就重试（stale 期间一直可见，强制刷新与重启立即重试） |
| 真诊断体只有临时脚本覆盖、没有自动化测试 | 诊断组装抽到 `cloud/diagnostics.js`，新增 3 个测试直接断言真 body：计数逐项等于差异摘要、无本机路径/上游原文、无快照时 `source=none`、失败后下一 tick 重试 |
| `markStale`/`markFresh` 的时间戳不可注入，测试不确定 | 两个方法都接受调用方时钟（刷新器传自己的尝试时间），stale 时间戳在测试中确定 |

## 7. 本步不做的事

- 不改 `buildModelCatalog` 的成员资格、线路或价格来源（P1b）。
- 不删本地成员状态表、手抄价格表（P1b）。
- 不改任何 L1 合同（P1c）。
- 诊断挂在既有目录路由的 `?view=diagnostics` 视图上，不新增路由、不改目录响应体。
