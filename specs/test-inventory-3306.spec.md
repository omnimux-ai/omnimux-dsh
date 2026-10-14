# #3306 固定候选评估资产变更清单

## 目标与范围
Parent#3301，依赖bootstrap#3303已合入，PhaseA#3302尚未完成。仅交付只读库存，不解除测试保护、不证明独审来源、不接任何合入放行consumer、不新服务。新用户无运行依赖或产品能力变更。

## 实施
新增scripts/test-change-review.mjs：显式repo realroot、resolvedbase/head/comparisonbase，candidate必须干净，无Git折空；diff带D/R旧新原始blob模式sha256，包/脚本/工作流/hooks/lock/workspace与tests/fixtures/e2e/config路径有界纳入，非完整依赖图。使用Buffer与fatalUTF8path解码，无法解释模式/路径/多个mergebase明确失败；原blob不足不作为empty。报告stdout，不写磁盘，repeat不覆盖旧原件；输出schemaVersion、identity、boundedcoverage、files、risks、reportDigest；added也inspection，不根据skip拼写推安全。
不导出validator/check/approved。前#3302初稿自述review与错candidateconsumer撤回；此slice没有改变production/anti-cheat/quality-loop/auto-pipeline。governance登记新scanner与已存在恢复script/test为manual，恢复入口不执行、不冒CIrequired；真实执行闭包D另切片。

## 成功标准
删test/rename两端/模式变/二进制blob分开、嵌套package与file形式test-fixture纳入；同bytes模式不变无新增变化risk，正常docs不纳入评估domain；invalidstatus/path/mode/Gitroot/ref/dirty拒；扫描期间变化拒，sourcecontent从Git对象不跟symlink。支持UTF8paths空格中文，不支持invalidbytepaths显式failclosed。风险清单不是reviewaccepted，sha不是来源认证。

## 测试与命令
原anti14/quality27全部保持，node--check、diffcheck、governance定向；pureinline支持Buffer/empty/delete/rename/mode/falsepaths，对同blob改触发风险，故意UTF8转换碰撞break后明确失败。真实临时Gitfixture含A/M/D/R、raw bytes、symlink mode、nestedmanifest/dirty/badref（仅自有临时repo，finallycleanup，经既定测试操作非绕写受拒repo正式test）。正式*.test仍root旧hook锁，不改名或shell绕写；测试后继正常解锁后固化，不能说新suite已CI覆盖。
冻结candidate后readFixedTestChanges本树包含工具，原件及head绑定，独审实际diff/用法scope。必要gates按现policy跑，本地maingate存量inspiration背景失败如实保，登记缺以manual归类修不是执行恢复；不删失败/skip/改requiredcheck。

## 交付
R1协调Agent，Closes3306、independentreview固定head/base、requiredCI/MQ、MERGED真实后ship；script/docs无产品物化。原件清前保留。不生产/官方/跨仓/共享skill/凭据/真实媒体/付款/长期调度。