# #3054 生图生视频修复执行证据

## 环境与范围
- Task worktree: cross-media-generation-issue-3054，初始base 90cd8db5baafca9edeb7980fdc8ffaac16e1f2b7，spec commit 091cd74729795171b15b5deed6835d4f395c5124；当次源改动未提交，最终以同捆diff为准。远端当前main 0deb18ee3f6e6f0448db874d05872238a273c73e，合入前会rebase并保留其首尾帧改动。
- Scope: 中枢凭据/路由/任务收取、画布与查看器恢复适配；不改上游DSH、生产profile、网关仓库或真实凭据。
- 用户明确要求合并后Dev重启与真实图/视频，属于本任务额外业务验收，尚未执行，不把离线PASS替代。

## 已观察根因
1. 中枢规划层同步搜索其他profile或登录secrets，把PAT伪写OMNIMUX_API_KEY，遮蔽当前credentials合法sk。
2. 原任务收取先走当前BYOK配置，可能复用错误凭据；收取异常不分终态写failed，HTTP永久拒收，查看器新key重交有重复生成风险。
3. ready缓存裸路径直接入src；刷新旧fetch取消先持久failed而挂载只恢复generating。真实浏览器held失败时序已经保留，owner修复后真实held通过。
4. 最近PR3048放大任务终态与恢复分叉，错误旧断言也固定该行为；旧日志不覆盖、不skip、不删除有效失败路径。

## 已执行回归
- 中枢media全目录最新509 tests/pass509/fail0/skipped0，exit0。包含合法凭据current resolve、三入口/同任务恢复、实际路由绑定、同步URL download401恢复零新POST、终态单调、wrong-kind key拒绝、inline custom恢复和安全下载origin。
- 画布完整2334 tests/pass2334/fail0/skipped0，exit0；原地字节改变、目录等待并发固定恢复ref、无法收取禁止未准备新投、上游绑定、新/旧输入等覆盖。host tsc当前exit0。
- 查看器完整310 tests/pass308/fail0/skipped2，exit0。两项为既有LibreOffice缺失（未改其跳过）；恢复精准全执行无skip，原有效21项保留并扩成26。
- 真实功能浏览器正式1/1 pass/fail0/skip0 exit0，e2e-1791044945821及最新e2e-1791045521543，同run sourceHashes/changedSources核验。七场景：可恢复原task重试submit1、data素材held取回刷新submit1、图片naturalWidth>0、视频metadata+play currentTime>0、FileReader+同源503零生成提交保草稿/槽位/可见原因、生产local-file真实字节。模型目录与中枢响应为显式合成fixture，不证明真实上游。
- 架构boundaries3884文件、产品基线（仅既有1历史provenance例外）、strict model contracts全部exit0；stages14组件+8侧栏targets PASS，anti-slop3/3；plugin-load scoped3/3与selftests8/8，允许真实stub warning但无加载FAIL。
- agent-tools71工具schema/内存边界检查exit0，不能等于安装后真实生成。

## 独立复查
主仓.agent-reports/media-generation-repair-20261003/目录保留hub-audit、consumer-history-audit、hub-independent-review、consumer-independent-review原始问题及后继closure报告。初次审查不通过的P1真实修复并固化，不用旧绿灯覆盖未测边界。当前独立再复验报告仍待最终收齐，尚不宣称独审通过。

## 尚未完成
最终Hub完整旧浏览器环境两项修复验证正在执行；PR/MQ与Dev物化、安全重启、真实图片和视频业务请求均待完成。上游安全拒绝不能由客户端静默换线或假结果掩盖。清任务树前保留本证据与七场景PNG、独立报告。
