# Chrome 样式探针任务自有输出规格（#3354）

## 目标
在原同步公开 `runStyleDomProbe({ name, styles, html, measure })` 接缝内，将默认输出管道改为父进程创建并持有的普通文件描述符，移除等待未知后代关闭输出管道的完成条件。此修改验证一个生命周期假设，不宣称已证明或修复 #3347 CI Chrome 的实际根因。

## 范围及新用户基线
仅修改 `scripts/test-fixtures/style-dom-probe.mjs`、`scripts/style-dom-probe.test.mjs` 与本规格。仍依赖原 Chrome 发现机制和可写系统临时目录；缺少 Chrome、临时目录读写失败或输出不完整均硬失败，无开发机路径或环境兜底。文档影响仅本任务规格；旧 #3265 的隔离、返回值和诊断契约仍有效。

## 接口、代码风格及结构
保持同步调用、参数字段、measure 调用方式、完整 HTML/CSS 和 JSON 返回值。沿用原具名函数、单引号及无分号样式。内部普通文件与 fixture/profile 同属本次私有目录，不增加新 helper 进程、异步 API、进程管理器、模块或第二 runner。name 先以 `/^[a-z0-9_-]+$/i` 验证；当前静态调用方名称不变，未知非法名称现在明确拒绝，不让目录前缀逃逸。

## 输出及失败契约
- Chrome binary、原 argv、窗口尺寸、1500 虚拟时间预算和 30000ms timeout 原样保留；stdio 为 `['ignore', stdoutFd, stderrFd]`。
- canonical 系统临时目录内 mkdtemp 私有目录；输出以 wx/0600 创建，只传数字 FD。读前核对自有路径与 FD 的普通文件、单硬链接、设备/inode、当前用户所有权；不承诺防御整个系统同 UID 恶意进程。
- stdout 以 fstat 的有限尺寸快照读取，最大 8MiB；超限明确硬失败，不截断测量 JSON 或 DOM 后伪绿。stderr 只读取末尾有界字节窗口，再保持原末 2048 字符诊断。后代仍可写同一普通文件；快照不等待 EOF、不承诺直接子进程退出时后代都已完成。
- 原 error 优先：即使 status=0 且 RESULT 合法，ETIMEDOUT 仍抛原错误对象；非零退出、signal、无 RESULT、坏 JSON 均失败。诊断保留 name/timeoutMs/status/signal/stdoutTail/stderrTail/measurementPresent，来源为真实自有文件，不记录 profile 内容或输出路径。
- 所有已打开 FD 在 finally 尝试关闭；读取、校验、关闭、清理失败不得返回绿色。已有 spawn 错误优先保留并附加输出/清理错误，成功路径上的清理错误明确抛出。删除前重新校验 canonical 自有目录位于 canonical tmp 下、前缀匹配且目录身份不变；不删除其他任务目录。

## 测试策略及验收标准
复用原 registerHooks 测试接缝；受控 Chrome adapter 明确使用已有 realSpawnSync 启动真实 Node，通过 helper 提供的 FD 输出，再仅覆盖原受控退出字段。不是伪造 stdout 字符串返回来证明文件模式。

先取得公开接缝正式失败：直接 Node 写合法 RESULT 并 exit0，后代继承输出自行 <=400ms 退出；adapter 只将该受控 Node 的截止设为100ms，生产 helper 所见选项仍必须30000ms。管道基线真实 ETIMEDOUT/status0；文件模式直接退出即返回完整测量且仅一次调用。另一个直接子进程输出合法 RESULT 后仍存活的100ms真实超时必须失败。测试尾部留足有限400ms后代自退窗口，不宣称观察到整个 Chrome 后代清理。

保留原成功、独立/重叠目录、错误身份/cause、有/无RESULT、非零、坏JSON与两条新真实生命周期用例；断言真实FD普通文件在运行时存在、结束后fstat抛EBADF与本次目录删除，所有原flags保留。读取/关闭故障适配写被拒后停止，不补写或缩改重送；经独立恢复审查，仅撤回此前成功但依赖被拒扩展的新fs替换及孤立状态引用，恢复真实fs读/关闭，任何旧断言与新真实生命周期不得删除。读/关闭故障、signal独立控制、超限、非法name矩阵仍待合法独审与正式覆盖，不报完成。

初始目录身份读取也进入统一失败处理；未获得创建后身份时保留目录、带可得诊断硬失败，不猜删或事后再抓身份自我匹配。此错误处理是正常生产修正，不解除被拒测试适配的限制。

## 命令与门控
最小正式验证：`node --test scripts/style-dom-probe.test.mjs`、`git diff --check`。纯 Node 新公开测试全部绿色且普通工具允许后，最多一次执行原 `node --test plugins/omnimux/src/client/ModelsSettingsCard.e2e.test.js plugins/omnimux/src/client/components/inspiration-picker/picker-card.e2e.test.js`；如缺构建依赖，不安装，由父代理处理。全 gates、独立评审、真实 CI/MQ 由父代理后续执行，不以本地25结果替代CI24证据。

## 边界
总是：先规格后代码、真实公开 seam 红绿、原错误硬红、有限读取、自有资源 finally、保留真实证据。
先由父协调：依赖/构建、独立评审、全 gates、远端提交与PR/合入、新CI head。
绝不：自动重跑刷绿、增加截止、扩大flags、skip、吞error、换Node/Ubuntu、全机kill、共享profile/凭据、真实模型/媒体请求、DBus环境猜修、安装、提交/push/fetch、主仓三文件写入。正常工具风险拒绝即停止受影响步骤；不拆载荷、改别名/工具或搬迁实现重送。正式红未执行或被拒绝必须报告未就绪。
