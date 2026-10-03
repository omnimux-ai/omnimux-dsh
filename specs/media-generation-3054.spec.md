# 图片视频生成全链路修复（Issue #3054）

## Objective / 目标
用户明确授权全权排查、修复、PR合并、开发版物化、安全核对后的Dev重启及真实图片和视频生成验收；普通技术选择无需二次决策。执行中枢是模型、路由、凭证、提交、轮询、下载和任务事实唯一拥有者，画布与查看器只消费接缝并适配。

## Success criteria / 可测验收
1. 保留现场失败证据，追踪画布/查看器→中枢→素材上传→上游提交→任务查询→产物下载→消费端展示，区分认证、业务拒绝、网络与状态恢复。
2. 图片和视频在同一合法凭证策略下完成提交、查询与下载，不因用户已登录而发送不兼容凭证；不新增秘钥、不读生产凭据、不将开发机配置变成默认。
3. 上游已接单后，暂时认证、网络、下载中断不得写为上游终态失败或自动重提收费；上游明确失败正确写回；恢复保持原任务与实际路由。
4. 并发相同意图不得重复提交；真实提交后刷新或重启能按原任务收取；产物必须非空且媒体类型正确。
5. 隔离工作树功能验证、精准回归和独立审查通过，经正常PR/Merge Queue交付；不改门禁掩盖失败。
6. 合入并物化后安全重启Dev，在业务页面真实提交一张图片、一个短视频，保留请求/任务状态/媒体解码播放证据；仅网关确有不可用证据可以例外报告，不以模拟绿灯宣称完成。

## Commands / 命令
选择实际触及面的并集：`node plugins/omnimux/scripts/run-tests.mjs`；`node scripts/verify-plugin-boundaries.mjs`；`node scripts/verify-product-baseline.mjs`；路由触及加 `node scripts/verify-model-contracts.mjs --strict`。消费端触及加对应包测及 `node scripts/verify-stage-contracts.mjs`、`node --test scripts/verify-anti-slop.test.mjs` 与工作树功能路径真实浏览器验收。执行日志保留真实退出码，不让管道掩盖失败。

## Project structure / 范围
中枢：plugins/omnimux/src/media、auth、对应测试；消费端仅在已证实需要时修改plugins/omnimux-workflow或plugins/omnimux-viewer的适配。报告在.agent-reports/media-generation-repair-20261003；验证证据按本任务隔离工作树保存并在清理前保留。

## Code style / 风格
复用已有解析与错误分类，关键接缝使用精确JSDoc/类型；不得复制路由器、提供方客户端或凭证存储；错误不空吞，业务原因保持可见。示例契约：`{ mode: 'submitted', taskId, taskRef }`不等于真实完成，只有下载验证后可为`mode: 'live'`。

## Testing strategy / 验证顺序
Spec→Code→隔离环境执行前置走读Verify→固化精准回归Test→Green。重点覆盖请求凭证来源、收取暂时失败与终态失败、实际候选路由持久化、恢复幂等、同步图片/异步视频、媒体类型验证；浏览器导航点击基于实时DOM，不用首页截图充数。真实请求用于用户明确要求的业务可用性验收，不用于猜模型参数支持。

## Boundaries / 硬边界
总是：保护用户已有工作与他人工作树；遵循执行中枢唯一真源；新品基线是安装登录后的新机器，缺少必需提供方配置时准确失败；核对加载产物身份。
需停受影响动作：真实付款/订阅、生产发布、其他仓库修改、凭据创建、无法安全恢复的并发占用。
绝不：改官方DSH源码、直推main、本地合并绕PR、未合入进入共享Dev、记录密钥、把上游拒绝解释为未登录、虚构成功。

## Documentation impact / 文档影响
本规格与执行证据记录本次授权、链路事实和回归；若任务状态或凭证契约改变，更新对应中枢契约，不新增平行规则来源。
