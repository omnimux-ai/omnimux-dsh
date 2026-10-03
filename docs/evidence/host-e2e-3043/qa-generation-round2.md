# Issue #3043 generation 独立 QA（第 2 轮，只读复验）

## Conclusion｜结论

**generation 传输→真实查看器业务范围：PASS_SCOPED / NoOne；B1、B2 已修复并关闭。生产 UI / SaaS 文案合规：FAIL / Frontend，作为 Known Issues 保留，不签 PM_SIGN_OFF: PASS。**

这两项结论必须同时携带：真实运行通过，不等于界面合规；现有 UI 不合规，也不把真实 transport 成功运行改写为失败或伪造通过。本轮没有发现需要重新阻断 B1/B2 的反例。结论只覆盖 generation 四文件、相关公开装配与指定最新证据，不是 #3043 整体/native 环境验收。

本轮仅新增本报告；没有修改业务 UI、测试源码、native/helper，没有构建、启动服务/浏览器、重启应用、读用户 profile/凭据或调用生成服务。执行了只读 VM 反例与无构建定向回归，不用自然语言推断替代这些已执行验证；正式浏览器证据来自工程方既有同次运行，不冒称本轮重跑。

## Evidence｜范围、规格与版本

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-host-e2e-issue-3043`；HEAD：`d95764912e36da01d879ab65d6340469b48a4625`。
- 读取上轮 [qa-review.md:B1/B2](qa-review.md#L43-L69)。本轮审查 [generation E2E](../../../plugins/omnimux/src/client/media-viewer/generation-feedback.e2e.test.js)、[browser](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-browser.mjs)、[fixture](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-fixture.jsx)、[server](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-server.mjs) 的当前原文及完整 diff。
- 装配只读追踪：[viewer public export](../../../plugins/omnimux-viewer/package.json#L34-L43)、[正式 builder](../../../plugins/omnimux-viewer/scripts/build.mjs#L80-L93)、[public apply](../../../plugins/omnimux-viewer/src/client/index.ts#L134-L167)、[sidebar 注册](../../../plugins/omnimux-viewer/src/media-viewer/mount.js#L10-L42)、[真实 Tab 会话投影](../../../plugins/omnimux-viewer/src/media-viewer/MediaViewerTab.jsx#L109-L124)、[generationTasks 过滤](../../../plugins/omnimux-viewer/src/media-viewer/MediaViewerTab.jsx#L579-L585)。对 [共享 helper](../../../plugins/omnimux/test-support/comment-native-environment.mjs#L216-L305) 只核查 generation 使用的 stagePlugins/boundedCommand 接缝；其 native/host 全面审计与修复仍归工程 subagent-28，未改该文件。
- [环境规格](../../../specs/host-e2e-environment-3043.spec.md#L3-L24) 原句：“不得新增 skip 掩盖失败、削弱有效断言或用仿制组件冒充生产页面”；“驱动当前真实查看器组件；验证请求隔离、结果归属、媒体可读性与正常/异常生命周期”；“每轮仅操作任务私有测试目录、动态端口与测试进程，finally 必须清理”。
- 已读取主检出 [PM 契约核定](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-reports/issue-3043/pm-contract-audit.md#L28-L51>)。B1 对照原句：“拒绝路径确实被读取且失败、不产生可播放假结果、不自动重发”；B2 对照原句：“按 sessionId+requestId 读取 pending/running”。
- [design.md](../../../design.md#L1-L55) 存在；当前四文件不改生产组件/样式，fixture 消费真实 React/UI kit/生产 CSS。设计文件存在性及本次装配范围检查通过，不宣称完整主题、比例、动画和几何设计验收。

## 正式运行事实｜不属于本轮重跑

指定运行目录：[6f4ff6ba-6466-4459-9e8d-a49cb3c5a74e](../../../.agent-reports/canvas-generation-feedback/e2e-runs/6f4ff6ba-6466-4459-9e8d-a49cb3c5a74e/result.json)。

- [result.json](../../../.agent-reports/canvas-generation-feedback/e2e-runs/6f4ff6ba-6466-4459-9e8d-a49cb3c5a74e/result.json#L1-L183)：`status=PASS_SCOPED`，20 项业务检查、7 张截图，`errors=[]`，浏览器 `closed=true`、server `closed=true`、`changedSources=[]`。
- [ego-output.json](../../../.agent-reports/canvas-generation-feedback/e2e-runs/6f4ff6ba-6466-4459-9e8d-a49cb3c5a74e/ego-output.json#L1-L6)：`code=0`、`signal=null`；运行时间 2026-10-03T16:05:38.976Z 至 16:05:52.652Z，spaceId=77。
- 身份冲突真实执行记录：[qa-a request-1 success](../../../.agent-reports/canvas-generation-feedback/e2e-runs/6f4ff6ba-6466-4459-9e8d-a49cb3c5a74e/result.json#L28-L35) 与 [qa-b request-1 pending](../../../.agent-reports/canvas-generation-feedback/e2e-runs/6f4ff6ba-6466-4459-9e8d-a49cb3c5a74e/result.json#L79-L89) 共存；qa-b mediaCount/width/height 均为 0，且 sessionIsolation=true。
- 真实视频播放记录：`currentTime=0.003083`、`duration=1`、`videoWidth=160`、`controls=true`、正几何；browser 在 play 前取基线并等待 currentTime 前进，不只是 `<video>` 存在。
- 不可读视频工具任务仍为 success，但单独 `unreadableVideoRejected=true`；附件自然宽度、部分取消实图保留均有业务检查。工具成功没有被混写为预览成功。
- 工程方给定 generation runner 汇总为 **4/4、0 skip**；[diagnosis 当前状态](diagnosis.md#L22-L24) 也记载真实执行通过。本轮独立执行的是三个 bridge 回归而非完整四用例，因此不以 result.json 单独证明 Node TAP 全部四项，也不冒称重跑 4/4。
- 本轮逐项读取 manifest 对应文件并重算 SHA-256：**376 项匹配、0 项变化、1 项 ENOENT**。唯一已不存在项为私有 `.tmp/generation-feedback-ulMpRc/plugins/omnimux-viewer/lib/client.js`；只读 access 确认其 staging 目录也不存在，与清理事实一致。该已删除产物的记录 hash 为 `24f98fd02887f86e258eed228ccb7d8393866f0265654a8684d19f252301e8cc`，不能重算已删除字节；不是把缺失项说成 hash 匹配。

### 本轮四文件 SHA-256 快照

这些是本轮当前磁盘摘要，不是正式 manifest 未记录文件的运行时摘要。

| 文件 | SHA-256 |
| --- | --- |
| [generation-feedback.e2e.test.js](../../../plugins/omnimux/src/client/media-viewer/generation-feedback.e2e.test.js) | `90b2dcc7e9a9cc826ce3c7db37ab6ed6da77d07c7c836f978806ae455099fcce` |
| [generation-feedback-browser.mjs](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-browser.mjs) | `7b7f193b12f349b996521e1bcde6b13a8a3d424689d9653d6fb4e251895bfdf9` |
| [generation-feedback-fixture.jsx](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-fixture.jsx) | `eb2f31469e5e52aee78dda33bf8ff49b84ef7a200c560770c5f25ec2190ecab8` |
| [generation-feedback-server.mjs](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-server.mjs) | `97397b0242cd82e9f20bac77fe3062070415232d64c698b3d31d9369c25d6c82` |

## B1 回归｜PASS，关闭上轮 P1

[fixture:65–71](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-fixture.jsx#L65-L71) 的 `readComplete` 在实际 await 完成后写入 sessionId/path/ok，然后返回同一个 RpcResult。不可读路径为明确 `ok:false`。仅有读取开始记录不能满足条件。

[browser:145–153](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-browser.mjs#L145-L153) 等待 `workspaceFiles.readComplete + qa-a + /fixture/denied.mp4 + ok === false`，同时检查对应结果没有 video；之后经过双 requestAnimationFrame，再断言 request-10 不挂载 video。不等待已退役 alert 字符串，不将生产长错误恢复为白名单。

从当前源码抽出原 wait predicate、原 readFile 函数和双 rAF 表达式，用 Node `vm.runInNewContext` 执行。输入与断言均只存在内存中，未修改生产 state/文件，没有启动浏览器或服务。B1 **11 个检查全部通过**：

1. 已 readAll 但从不 readComplete：predicate=false（上轮永不 settle 假阳性被挡住）。
2. qa-b 的同 path 拒绝完成：false。
3. qa-a 的其他 path 拒绝完成：false。
4. qa-a 同 path 可读成功完成 ok=true：false。
5. qa-a 同 path 拒绝完成且无 video：true。
6. 同样拒绝记录但 video 已挂载：false。
7. 用原 readFile 的可控未完成 JSON Promise 验证，pending 时没有 readComplete。
8. JSON Promise settle 后才记录完成且 ok=true。
9. 原 readFile 拒绝分支确实记录 qa-a、denied path、ok=false。
10. 双 rAF 表达式第一帧后仍留第二帧回调。
11. 第二帧执行后 Promise 才完成。

**关闭范围**：已证明“读取开始但永不结束”不能绿，以及“可读成功字节”不能冒充拒绝。双 rAF 是本场景同步 Promise 拒绝/React 更新的收敛屏障，不是任意定时远程回退的通用证明；未在真实浏览器注入无限等待或任意延迟远程回退。此项边界不冒称已经测试。

## B2 回归｜PASS，关闭上轮 P1

[browser:34–53](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-browser.mjs#L34-L53) 的 wait 和 evaluate 两处 find 均匹配 sessionId+requestId，且返回值显式断言预期 sessionId。fixture 故意在 qa-b 复用 request-1；browser 在 qa-a 同 ID 已 success 后切换 qa-b 验 pending/no-media，再切回 qa-a 验图片恢复。

原 wait predicate 与 evaluate observer 的 VM 输入为按顺序 `[qa-a/request-1/success/media, qa-b/request-1/pending/no-media]`。B2 **4 个检查全部通过**：

1. 期待 qa-b/request-1 success：false，不借 qa-a 成功。
2. 期待 qa-b/request-1 pending：true。
3. observer 返回 qa-b/pending/mediaCount=0，而非第一行 qa-a。
4. 不存在的 qa-c/request-1 success：false。

DOM 仍用非视觉 request 属性定位，未给业务 UI 新增属性。真实 [Tab:585](../../../plugins/omnimux-viewer/src/media-viewer/MediaViewerTab.jsx#L579-L585) 只投影当前 session 的任务；qa-b 场景要求 main 中没有任务节点，切回 qa-a 才出现实图。联合身份观察加真实 session DOM 投影与实际同 ID 场景，已满足本轮 B2 关闭条件；不外推为所有双会话双成功媒体冲突均已做视觉故障注入。

## 公开装配与清理｜generation 范围通过

- fixture 不再跨插件私有导入 MediaViewerTab，而是 `import('omnimux-viewer/client')`；只接受 id=omnimux-viewer 的正式 factory，执行其 apply，通过 betterSidebar.registerTab 捕获生产注册的 component。缺未知 module 或未注册 Tab 会直接 throw，未 stub/仿制查看器。
- public export 指向 lib/client.js；正式 builder 按当前 package.name 产生 loader factory，正式 apply 调 mountMediaViewerTab，mount 的 component 包装仍把 host sessions/imageUrl/readFile 注入真实 Tab。fixture 从注册 seam 得到的是该包装器，不是手写替代组件。fixture 的 observable sessions/transport/remote 等属于显式测试 Host 接缝，不宣称完整 Cordis/桌面 Host 原生生命周期已验。
- server 在唯一 `.tmp/generation-feedback-*` 下 stage 正式源代码，复用正式 viewer build；构建路径相对 staging 写 lib，页面 esbuild 为 write:false。generation 不调用 helper 的 resolveHost/resolveSidebarBridge，不读共享 profile。
- E2E 用 Node runner 的 process.execPath 显式传 nodeExecutable，经 browser 传到 server；缺参数在任何 mkdir/stage 前失败。不从 ego 内部 process.execPath 猜 Node，不启动替代宿主。
- browser 正常/断言异常 finally 先执行 qa.dispose（bridge.dispose/root.unmount/插件 effect disposers），再 task.finish；finish/dispose 出错仍尝试 fixture.close。server listen 失败本地 close，assemble 失败删除 staging，正常 close 的 finally 删除 staging。本轮正常证据的双 closed 与 staging 不存在已核实；未执行异常故障注入，不把源码 finally 当作所有异常路径的运行证明。
- 已增 Node test 180s timeout、ego child 150s SIGTERM timeout、viewer build 60s boundedCommand；相较上轮无界等待有所改善，极端超时保证仍按下列 Known Issues 保留，不签“所有异常必无残留”。

## 本轮实际执行｜全部退出 0，不构建

所有 Bash 显式 workdir 为目标 worktree，Git 显式 `-C`；没有用管道尾部退出码代替测试结果。

| 验证 | 命令 / 方法 | 结果 |
| --- | --- | --- |
| B1/B2 原源码反例 | `node --input-type=module`，fs 只读抽取原谓词/readFile/rAF，`vm.runInNewContext` + assert | 15/15，exit 0 |
| bridge 回归 | `node --test --test-name-pattern='bridge regression' plugins/omnimux/src/client/media-viewer/generation-feedback.e2e.test.js` | 3/3，fail 0，skip 0 |
| store / intent | `node --test plugins/omnimux/src/client/media-viewer/media-viewer-store.test.js plugins/omnimux/src/client/media-viewer/generation-intent.test.js` | 54/54，fail 0，skip 0 |
| 四文件空白检查 | `git -C <worktree> diff --check -- <generation 四文件>` | exit 0 |
| 架构边界 | `node scripts/verify-plugin-boundaries.mjs` | 3869 文件，exit 0 |

退出摘要：`REAL_EXIT bridge=0 store_intent=0 diff_check=0`、`REAL_EXIT boundaries=0 head=0`。筛选三个 bridge 测试没有启动浏览器用例，不是新增 skip；不能用 3/3 冒称真实四项 E2E 重跑。

## UI 合规｜FAIL / Frontend，存量 Known Issues

[正式 productCompliance](../../../.agent-reports/canvas-generation-feedback/e2e-runs/6f4ff6ba-6466-4459-9e8d-a49cb3c5a74e/result.json#L572-L585) 记录 `status=FAIL`：期望 recoveryRows=[]、copyActions=0，实际恢复行 request-2/request-3/request-5，copyActions=3。transport report.status 没有被这个独立失败覆盖，这种分轨是正确的，不是 PM PASS。

本轮通过 display_file 查看 [terminal](../../../.agent-reports/canvas-generation-feedback/e2e-runs/6f4ff6ba-6466-4459-9e8d-a49cb3c5a74e/terminal.png) 和 [video-unreadable](../../../.agent-reports/canvas-generation-feedback/e2e-runs/6f4ff6ba-6466-4459-9e8d-a49cb3c5a74e/video-unreadable.png)。terminal 清楚显示三个无媒体异常大块、异常状态文案和“复制原请求”；不可读截图还包含前序正常视频，不能把该截图里的其他 video 当 request-10 可播放，也不能因 request-10 错误文字被底栏遮住而宣称文字不存在。

[生产 GenerationTasks:63–89](../../../plugins/omnimux-viewer/src/media-viewer/GenerationTasks.jsx#L63-L89) 仍有长 alert/读取说明、状态标签/task.message、copy 控件。主检出 [异常态白名单:65–72](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-reports/inplace-task-card/pm-preflight.md#L65-L72>) 原句：“三种异常均不挂载恢复行；不占宽高”“不创建复制按钮或复制成功/失败提示”“空字符串”。判定 **存量超范围 UI**，归 Frontend，另案授权，不在本任务改业务 UI。

当前 productCompliance 采样在 terminal 阶段，覆盖已明确失败的异常恢复行/copy；不是全部状态标签、不可读长 alert、部分取消标签/深浅主题的全量合规门禁。其 FAIL 结论可靠，其将来 PASS 分支不能单独充当 PM 全量签字。保留退役 UI 的负向要求，不恢复旧卡或长文字来获取绿灯。

## Known Issues｜二轮截断，不发起第三轮

1. **UI-1 / Frontend**：上述恢复块、状态/长错误与复制按钮仍违反白名单。业务传输 PASS 与 UI FAIL 并存，不替代产品 PM_SIGN_OFF。
2. **G-K1 / QA**：[E2E:31](../../../plugins/omnimux/src/client/media-viewer/generation-feedback.e2e.test.js#L28-L40) 既有缺 ego-browser 的 skip 仍在。此次没有新增 skip、给定正式运行 0skip，不指控假绿；干净环境显式验收仍可能跳过，是上轮已指出的 fail-closed 遗留。注释“fail rather than skip”与条件并不一致。
3. **G-K2 / Engineer + QA**：ego 外层 timeout 仅 SIGTERM，没有强制升级/外层私有目录清理；Node test timeout 不自动证明同一 ego invocation 的 finally 完成。helper boundedCommand 超时先 reject 再等待/升级终止，对极端 build 卡死的进程收敛时序未运行证明；helper 仍由工程方处理，本岗不改。正式正常运行清理已通过，不写成已发生泄漏。
4. **G-K3 / QA**：正式 manifest 没有 browser/server/Node runner/helper 的运行时 hash，也未保留 viewer 私有 source 输入 hash/已清理产物字节。376 可用输入匹配支持同版本证据，但不能追溯证明已删除正式客户端产物与当前所有 viewer 源逐字一致。本轮不重构建补证、不宣称全装配完整性已验。
5. **G-K4 / QA**：完整成功 path 的精确 reader session/path、attachment imageUrl 参数、unresolved 的 media=[]、普通问题后完整任务字段冻结、abort/Blob revoke 是否实际调用以及 arbitrary delayed fallback 无独立故障注入覆盖。保留上轮覆盖边界，不用检查计数或“source cleanup 存在”替代这些测试。

这些遗留不重新打开已实测修复的 B1/B2，不把 transport 已执行通过改写为失败；也不以 scoped PASS 隐藏它们。上轮 native B3/B4/B5 与 native 异常清理由另一个工程方向承担，本报告不判其修复通过或失败。

## Unknowns｜尚未证实

未独立重跑正式 browser 4/4；未运行 reader 永不完成/任意延迟回退的真实浏览器故障注入；已删除私有 client 只能读到历史摘要，不能重新校验字节。独立夹具没有正式主会话/通知渲染器，不能验证主会话异常出口可达或供应商真正生成。正常 cleanup true 不证明所有超时/异常路径。

## Not covered｜明确排除

native 评论/host helper 的全面二轮 QA、业务 UI 修复、真实供应商生成、专用 composer 生成、全仓 CI、构建/物化/并发压力、用户桌面应用/端口操作、凭据/profile、提交/推送/PR/合并/部署、审秋毫 OCR 与 PM_SIGN_OFF。本轮没有上述操作。

## 路由与下一步

- **NoOne / Pass**：generation B1/B2 的 transport 断言修复与当前公开注册装配范围。
- **Frontend / Known Issues**：存量越权 UI，留待独立授权，不让 QA 改业务。
- **QA / Engineer / Known Issues**：G-K1–G-K4 保留，至此停止二轮循环；不得给 #3043 全环境或产品合规签 PASS。主理人读取本报告后结合 subagent-28 的 native/helper 结果决定整体环境验收与交付。

## Confidence｜置信度

**高**：B1/B2 原源码 VM 反例、同 ID 正式浏览器记录、公开 export→factory→apply→sidebar 注册链、独立 productCompliance FAIL 与源码/截图一致。**有界**：本轮不构建不重跑 browser，正式私有客户端已被清理且 manifest 缺源输入链，因此不外推完整可复现构建/极端异常清理、全 UI 设计合规或 native 结论。
