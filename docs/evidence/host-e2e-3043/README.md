# #3043：真实浏览器测试环境恢复

## 交付范围

仅修改评论/生成反馈的测试与环境装配，未修改生产 UI、官方 DSH 源码或运行中的桌面应用。没有新增 skip，没有调用真实生成服务。合成历史与传输事件明确标记为测试数据。

## 已验证修复

评论私有宿主的客户端聚合请求原来返回 HTTP 431，单独提高任务进程的请求头上限后返回 200。Hub 与 viewer 真实源码通过原正式构建脚本在本轮 `.tmp/` staging 内构建并安装，修复 viewer 拆分后装配缺失。运行方式配置只写本轮私有 DSH_HOME，原生欢迎声明仍经正常按钮确认。页面已有 Exit fullscreen 操作恢复分栏，不点击隐藏按钮或覆盖样式。

生成反馈夹具通过正式 `omnimux-viewer/client` 公开 export 加载 factory、执行正式 apply 并消费 sidebar 注册的真实 Tab，避免跨插件私有组件导入。React/ReactDOM 保持单物理实例，读取由正式注册闭包注入。Node runner 显式传入 Node executable，不使用 ego 内部 Electron 代替构建进程。

有效验收包含原生空正文评论发送、坐标/评论全文精确展开、移除禁用发送、外层拒绝后无模型请求；生成反馈保留生命周期、晚到结果、同 requestId 跨会话隔离、真实视频播放、附件图片、不可读视频完成拒绝和取消后的部分结果。

## 运行前置

原生测试依赖正式桌面运行时和兼容侧栏桥接代码包。当前仓库声明的 dsh-better-sidebar 0.18 与本机宿主布局实测不兼容；本次成功运行显式使用 `OMNIMUX_E2E_SIDEBAR` 提供已验证正式桥接包。其版本与内容 hash 记在 native-final-result.json。路径不是产品默认值，测试不默认搜索或复制用户 profile/凭据。干净机器需要先物化正式依赖，必要时显式提供该输入；缺失或不兼容应失败，不静默新增跳过。

成功完整回归命令：`OMNIMUX_E2E_SIDEBAR=<已验证正式代码包> node plugins/omnimux/scripts/run-tests.mjs`。
生成反馈独立命令：`node --test plugins/omnimux/src/client/media-viewer/generation-feedback.e2e.test.js`。

## 真实结果与证据

- `full-tests-summary.txt`：完整 Hub 3057/3057，0 fail、0 skipped，REAL_EXIT=0；日志明确两个目标 E2E 实际执行。
- `native-final-result.json`、`native-ready.png`：真实原生功能路径、外层拒绝和任务进程清理。
- `generation-public-result.json`：20 项业务检查、7 张截图、真实媒体播放、浏览器/server 已释放、源文件未改变。
- `qa-review.md` 保留首轮发现，不重标历史 FAIL；`qa-generation-round2.md` 关闭 B1/B2，业务范围 PASS_SCOPED。
- `ocr-final.txt` 保留早期完整 CLI 结果及 require 解析缺陷；后续修复使用 createRequire(manifestPath)，`ocr-recheck.txt` 六文件覆盖、无必须处理意见。
- `qa-cleanup-deadline.md`：KI-N1 双阶段退出等待最终期限及严格失败回执单项独立验收 9/9 通过；正常原生流程再跑 1/1、无 skip。历史 QA 的无期限 FAIL 不重标，由此后继报告关闭具体缺口，其余極端回收覆盖限制保留。

## 未被本次测试环境修复消除的产品问题

当前消息入口 title 仍为“点击进入画布”，而规格要求“点击进入图像生成”；native 独立命名观察报告为不合规。生成反馈的异常恢复行、“复制原请求”和状态文案仍与既有 PM 白名单冲突，真实 productCompliance 为 FAIL。以上不改旧白名单、不恢复退役文案、不称 PM_SIGN_OFF PASS；应由前端按独立授权处理。

本交付证明隔离测试的真实业务接缝恢复，不证明付费供应商生成成功或完整生产主会话通知渲染通过。极端进程卡死、全部卸载/Blob 释放故障注入等未覆盖范围见二轮 QA Known Issues。测试/环境小缺陷采用快捷链路；未执行清窗跨模型 Matt 双轴⑤b，不以实施会话自审替代。⑤c 为真实本机 OCR CLI，⑤d 为独立 QA。首次系统专家启动失败后的部分诊断/实现由主理人降级执行；后续分工记录保留。
