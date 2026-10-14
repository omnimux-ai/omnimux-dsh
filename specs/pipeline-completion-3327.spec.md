# #3327 最小完成判定

## 目标与批准依据
按 #3301 阶段 B 已批准要求修复流水线合并后的假完成：适用证据未真正通过就交给协调 Agent 并保留工作树，不因人工开发版验收未做而阻塞。此切片只修完成判定，不接入未验的新收尾入口。

## 接口与结构
只修改 scripts/auto-pipeline.mjs、scripts/auto-pipeline.test.mjs 和本规格。已批准的验证接口为现有 finishMergedDelivery / handoffToAgent；测试观察返回状态、持久状态及注入的收尾调用次数。复用现有影响矩阵、状态保存和交接接口，不引入新授权或本地批准字段。

## 成功标准
- MERGED 身份仍须包含 mergedAt 与 mergeCommit.oid。
- 静态报告须明确 pass:true；实际集成检查（test:gates、check:boundaries、verify:stages）均有明确成功退出状态；适用包测须有非零真实计数与无失败，无缺失/未知结果放行。
- 从实际 changedFiles 重算影响；缺失范围不冒充文档范围。报告声明的其他 required 检查也不能被略过；人工 dev.required:false 的 pending/failed 不作为 Agent 卡点。
- required browser 的 pending、failed、unknown、缺失当前可信收据以及自述 pass:true 都保留现场交接。当前没有可信工作树浏览器收据接入，本切片不发明通过字段；真实证据接入为后续工作。
- 包含插件运行变更或其他 App 物化需求时，一律交接且收尾调用为零，包括显式 --no-materialize；默认允许物化不能被偷偷改为 false 后清理。运行时读取的 skills/catalog Markdown 按运行变更保守保留。
- --no-materialize 的禁止物化语义完整保存；纯文档/脚本且全部适用静态证据齐可沿原路径收尾，绝不声称已安装开发版。
- 交接保存 run/base/head、独立评审、报告、合并身份与具体缺口/下一动作，不从当前会话、参数、标签或自述收据产生自动授权。

## 命令与测试策略
先保存本规格，更新旧 UI pending 假成功测试期待为交接并保留零收尾断言，执行 node --test scripts/auto-pipeline.test.mjs 得到旧实现真实失败；再做最小修复，重复该测试及相关现有脚本套件。最终执行 node scripts/impact-matrix.mjs --git-diff --base bbd56d7c7f1ba7de2e9f28b4e3c903ae101ba114 与 git diff --check。完整门禁由父 Agent 后续集成运行，本子任务不跑会超出写范围的全套。

## 代码风格与新用户基线
沿用现有英文标识、无分号 ES module 与精确布尔/退出码判断；例如 report.pass === true，不以真值或空集合当通过。此功能是仓库流程，不增加新用户机器依赖、私有开发状态、真实凭据或后台服务；缺证据明确交接，不静默回退。

## 边界
始终：保存中途和最终报告，保留失败证据与原测试，不删除/跳过测试。
需停受影响动作：正常测试编辑被当前保护拒绝，不用 shell、改名或意图参数绕行。
绝不：提交/推送/抓取、真实 GitHub 调用、安装/同步/实际清理、开发版/生产版/凭据/全局官方写入、修改其他树或未批准文件。

## 文档影响与未覆盖
本规格说明本切片的完成与交接约束，现行合同不在授权写集内。安全标准收尾入口、可信当前浏览器/安装收据及完整证据消费由后续切片承接；本改动不证明阶段 B 全部完成。

## 当前验证事实
正常编辑原测试的首个请求即被测试只读硬门禁拒绝，未落测试改动，不通过其他入口绕行。改用授权允许的纯内存夹具反证原实现：required browser=pending 时原实现 succeeded 且调用收尾一次，独立字面期待 ready-for-agent 真实失败。
源码最小修复后纯内存矩阵覆盖文档/脚本齐证据成功、人工 Dev failed 不挡、QA 缺失/失败/缺维度/未知、集成缺失/失败/额外未知、tests 缺失、required runtime 自述通过、required unknown、浏览器 pending/failed/unknown/自述通过/缺失、插件运行默认和禁止物化、显式物化影响、skills Markdown、包测失败/零计数、缺变更范围；均核状态、收尾次数及 base/head/review 保存。
主干正常作者规则生效后，原 UI/server 用例已按批准要求合法改为保留现场交接及零清理，docs-only 成功例补齐明确静态/集成/范围输入，旧失败原件保留。新增不完整静态证据、运行自报通过仍拒清理、人工开发版独立验收不阻文档收尾的正式公共反例。完整矩阵此前一次被风险检查拒绝未落盘，不以绿色旧套件宣称全部覆盖；后续只用无动态执行的普通公共接口表达必要反例，不放宽判定。独审与适用门禁通过前本切片不就绪。
