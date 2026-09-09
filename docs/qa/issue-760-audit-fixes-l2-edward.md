# Issue #760 授权隔离 L2 独立验收

## 结论

**BLOCKED / 不可关闭 #760；Route: Engineer（受管运行依赖治理），不是本次 F1/F2/F3 产品返修。**

2026-09-09 10:43–10:44 +08:00，经正式 `dev-env.sh` 创建任务并初始化私有凭据/settings、克隆受管 seed、安装私有依赖及链接本树 workflow。启动最终 exit 1：viewer 导入官方 settings 未提供的 `installSettingsSection`，Host 已退出。真实浏览器专项与共享探针均未执行；不存在浏览器 PASS、截图或有效 runtimeProof。

## 固定身份与授权

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audit-fixes-760`。
- Base：`867b192ecf6aa35be4e1639db7351a89bea782c7`；code：`2ca3e8286dda317be0a6cdf2d5aa6829f2d98450`；开始/结束 HEAD：`915198ce7592b17511c2c8746bf95f1f980e17ef`。
- 初始已有未跟踪文件 `docs/qa/issue-760-audit-fixes-edward.md`、`docs/qa/issue-760-edward-boundaries.test.mjs`；均未改动。本轮只新增本报告，日志为忽略文件。
- 用户授权仅任务隔离 L2 与必要凭据初始化、真实 ego 专项；无共享 Dev/Prod、官方 DSH/外仓修改、push/merge/部署共享环境、真实模型或付费调用。
- 仓库 workflow、ego-browser skill 及 plugin-qa/dev-pipeline/node-input-submission/plugin-git-pr 合同已读取。固定本地 SHA 范围，无 fetch/切分支；结束时 origin/main 引用由并行工作前进，HEAD 未变，不改此次固定 base。

## 实际执行

```sh
bash scripts/dev-env.sh start audit-fixes-760 omnimux-workflow \
  --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/audit-fixes-760
```

启动 stdout/stderr 经 token/API-key/authorization 脱敏管道记录到任务树 `qa-edward-760-l2-start.log`；`pipefail` 保留 exit 1。托管后台 job `bash-65` 已收集终态，无重复启动。

| 检查 | 实际结果 |
|---|---|
| 新任务与 legacy 同名目录预检 | 启动前均不存在；无任务覆盖 |
| 凭据/settings 初始化 | 正式脚本从 `~/.dsh-dev` 复制；任务文件均普通非 symlink、0600；未读取/打印内容 |
| 官方安装闭包预检 | PASS，DSH_SRC → web-app → ui-chat |
| Seed | `/Users/x/.omnimux-dev/profiles/omnimux`；正式受管预检通过 |
| 私有依赖安装 | pnpm 11.7.0，1822 packages，安装完成；node-pty 脚本正常结束 |
| 任务 profile | `/Users/x/.dsh-dev/tasks/audit-fixes-760/profiles/omnimux-dev-audit-fixes-760` |
| DSH_HOME | `/Users/x/.dsh-dev/tasks/audit-fixes-760` |
| SOURCE/link | `.../.worktrees/audit-fixes-760/plugins/omnimux-workflow`；唯一指向工作树的顶层在研插件 link |
| 分配端口 | `44201`，池内；不是已通过的可用 URL |
| Host | 启动记录 PID `66027`；10:44:22 +08:00 `ps -p 66027` exit 1，无进程 |
| TCP | 同时 `lsof -nP -iTCP:44201 -sTCP:LISTEN` exit 1，无监听 |
| watch | 未启动，无 watch.pid |
| `.l2-dev.env` | 启动失败，无成功绑定记录；未手工伪造 |
| ego | `listTaskSpaces()` 只读成功，仅返回其他任务73/76；未新建/claim/操作任何页面，无自己的空间需关闭 |
| Git | HEAD 不变；`git diff --check` exit 0；产品源码未修改 |

## 脱敏根因证据

启动脚本20秒窗口内未获得正式监听链接，输出 exit 1；随后一次只读诊断取得已落盘的5929字节日志和已退出进程状态。关键原文（无凭据）：

```text
[omnimux-workflow/gatewaySelection] gateway mode: auto {"seams":{"video":false,"image":false,"audio":false,"text":false},"backend":"mock"}
Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): failed to import loader entry viewer (@crosery/dsh-viewer): The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'installSettingsSection'
.../node_modules/@crosery/dsh-viewer/lib/index.js:3
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'installSettingsSection'
Node.js v25.8.0
```

任务与 Dev seed 已安装 viewer `lib/index.js` 的 SHA-256 均为：

`e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`

这证明本次任务复制并加载的 viewer 入口与 seed 一致，并非在本树引入的另一个入口。完整现场日志仍位于任务 profile `host.log`；不复制凭据或完整认证链接入仓。未改 viewer、官方 settings、受管 seed 或门禁，也未切换私有 harness 规避错误。

## 专项验收矩阵

以下全部 **BLOCKED / NOT RUN**，共同前置为合规 L2 Host 可启动并通过正式身份验证：

1. `openL2EgoPage` 正式登录及共享 `verify:live workflow`：无可用 Host，不创建 pending 请求冒充通过。
2. 多图 A/B strip 点击 A 替换 C：满槽、未满槽、新来源、待命 Feed；确认 `[C,B]` 和旧 A 仍在 Feed。
3. 顺序、独立撤销/重做、保存/刷新后待命与绑定持久化。
4. 引用缩略图随上游当前输出改变，保留 selection；真实中文 IME 合成期间上游变化。
5. 纯文本引用不重复朗读正文；真实本地“温柔一点”要求明确拒绝且零 submit；仅合成请求捕获，不真实生成。

没有注入 store 替代交互，没有 Stage 通过替代专项，没有浏览器截图可交付。既有独立离线15/15、120/120、9/9和全包1374 pass/1基线rootOwnership失败只引用先前报告，本轮未重跑，不计作本次 L2 结果。

## 资源与下一步

- Host 已自行退出、watch 未启动；后台 launcher job 已收集，无待等待任务。残留 `host.pid` 是失效记录，不作为运行身份；不盲杀/重启它。
- 任务根及私有依赖/凭据副本保留用于诊断；未删除环境，未动其他任务端口/空间。没有自己的 ego 空间需关闭。
- 主理人/受管依赖负责人需在另行授权范围内交付与当前官方 settings 兼容且正式纳管的 viewer/稳定 seed，并提供版本及依赖验收凭据。本任务不跨仓修复、不禁用 viewer、不升级 pin。
- 依赖实际改变后，从本树重新执行正式 start（已有授权保持，先核对同名任务 PID 所有权），成功后绑定真实 SOURCE/COMMIT/PROFILE、执行正式 ego 登录和共享探针，再完成上述专项。当前停在具体运行依赖阻断，无无限重试或假称后台继续。
