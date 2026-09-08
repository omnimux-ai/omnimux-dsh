# Issue #780 — 本地音频与公网 URL 转写修复

## 结论与交付范围

- IS_PASS: YES（后端实现与本任务指定的离线验证）。
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-fix-stt-local-audio-780`。
- 分支：`agent/workflow-fix-stt-local-audio-issue-780`。
- 本地基线、已 fetch 的 `origin/main`：`580234923268673562cacb5cd01aebdb780339e1`；目标为该基线上的未提交任务差异。
- 只改中枢 STT 传输、音频 URL 分类、相关测试和 Workflow 安全错误映射；未修改 catalog 上架状态、前端或官方 DSH。
- 本报告的协议依据为 [Issue #780](https://github.com/omnimux-ai/omnimux-dsh/issues/780) 所提供的 URL-first 网关约束与 Whisper 文件上传要求；未独立读取网关实现或发起真实模型请求。

## 请求行为

| 输入与模型 | 请求行为 |
| --- | --- |
| 公网 HTTP(S) + `doubao-asr-bigmodel` / `seedasr-auc` | multipart 透传 trim 后的 `url` 与 `audio_url`；不先下载，不附冗余 file；正常响应只提交一次 |
| 本地路径、data URI、回环或私网 HTTP + 上述模型 | 首次提交直接改用 `whisper-1`，发送按字节识别格式的 `file`；不向云端透传本地路径或 URL |
| 已提交的非 Whisper 请求收到 URL-required 错误 | 匹配 `audio url is required` / `URL-first mode`（忽略大小写），改用 Whisper 二进制表单重试一次 |
| 已是 Whisper 或回退仍失败 | 不再重试；报告最后一次请求的分类或详细错误 |
| 鉴权、额度、无可用渠道 | 保持专用错误分类，不进行跨模型重试 |
| 无 HTTP 响应的网络错误 | 不以异常文字猜测协议错误，不进行回退 |

- 回退复用同一端点、鉴权、语言、response_format 和 AbortSignal；已加载的音频字节只读取一次。
- 每次提交新建 FormData；回退表单只含二进制 file，不重复发送被拒绝的 URL-first 载荷。
- 返回 `model` 为实际执行模型，原输入 route 和画布保存的模型选择不变；SRT/VTT/文本内容与换行原样保留。
- 首次请求仍经过 SubmitGuard 与鉴权；本任务的 Whisper 传输适配不等于把 Whisper 上架。显式初次请求草案 Whisper 的准入测试仍通过。
- URL 分类不做 DNS 或网络探测；排除 localhost、127/8、IPv6 回环、私网/链路本地 IP、IPv4-mapped 本地地址、单标签主机、`.local`、带 userinfo URL 等。域名可解析性、私有 DNS、重定向、签名过期及上游能否访问不由这个分类器证明。

## 错误与安全

- 响应流读取一次；错误体即使声明 text/plain 也尝试 JSON 解析。
- 提取 error/message/detail/data 中的详细错误，保留 HTTP status；凭据脱敏、空白规整、诊断截断至 1024 字符，不附原始 envelope 或 stack。
- URL-required 匹配在错误展示截断之前完成，长诊断不会丢失重试条件。
- 取消在下载、提交、响应读取与回退边界检查，统一返回 `omnimux-aborted`。
- Workflow 新增 `CHANNEL_UNAVAILABLE -> HTTP 503` 安全映射，避免回退渠道不可用被归成内部未知错误。
- Workflow 继续遵守既有安全契约：浏览器使用稳定中文说明，不直接显示上游原始消息；详细脱敏诊断保留在中枢抛出的 Error 中。

## 验证证据（2026-09-08，Asia/Shanghai）

所有命令从任务工作树根执行；测试使用本地 fixtures/mock，不调用真实模型端点。

| 检查 | 最终结果 |
| --- | --- |
| `pnpm --filter omnimux test` | PASS：1355/1355，0 fail/cancel/skip；网络防护预检也通过 |
| `pnpm --filter omnimux-workflow test` | PASS：1264/1264，0 fail/cancel/skip |
| `node scripts/verify-model-contracts.mjs --strict` | PASS：errors=0、warnings=0、listedOperations=56、fingerprint=`4ab76ab12bd2e457` |
| `git diff --check` | PASS |
| STT 四文件定向测试 | PASS：102/102；包括 UTF-8 含空格路径、canonical/alias、公网零下载、私网、data URI、长错误、重试上限、取消、脱敏与原始 SRT |
| `node --check` STT 两个运行文件 | PASS |
| `pnpm --filter omnimux-workflow typecheck` | PASS：canvas 与 Host |
| `node scripts/verify-plugin-boundaries.mjs` | PASS：2120 个源码文件 |
| `node scripts/registry-tool.mjs verify` | PASS：12 个插件 |
| Workflow Host/client/canvas 构建脚本 | PASS：仅生成任务树内 ignored 产物，不纳入提交 |

依赖准备：任务树最初没有 node_modules；仅在任务树创建 root、Hub、Workflow 的 node_modules 链接，复用已安装依赖，未重装共享依赖。pnpm 命令使用 `pnpm_config_verify_deps_before_run=false` 防止依赖自动重装，未改变测试脚本或断言。

失败与修复记录：先写失败回归复现缺 URL、本地模型未切换和丢失错误；实现后定向全绿。Workflow 首次运行缺 `dist/index.js`，补建 Host 后出现 `canvasHash=missing`，补建 client/canvas 后完整套件通过；未通过削弱测试掩盖构建前置条件。最后补充渠道错误映射并重建 Host 后再次全量通过。

## 修改文件

1. `plugins/omnimux/src/media/stt.js`
2. `plugins/omnimux/src/media/stt-audio.js`
3. `plugins/omnimux/src/media/stt.test.js`
4. `plugins/omnimux/src/media/stt-audio.test.js`
5. `plugins/omnimux/src/media/stt-fallback.test.js`（新增）
6. `plugins/omnimux-workflow/src/workflow/speechToText/errors.ts`
7. `plugins/omnimux-workflow/src/workflow/routes/speechToTextRoutes.test.mjs`
8. `docs/implementation/issue-780-local-audio-stt.md`（本报告）

全部修改的运行时/测试文件均少于 300 行，最大 239 行。

## 验收限制与下一步

- 所有指定离线检查已通过；没有真实音频转写、SRT 质量、上游稳定性或「任意输入 100% 成功」的证据。音频损坏、额度不足、URL 不可达、模型不可用仍会正常失败，不生成伪造字幕。
- 未执行 L2 浏览器验收、远端 CI、commit/push/PR/merge、App 物化或重启；后端源码完成与运行环境交付状态分开。
- 无剩余的本次后端实现阻塞。交由主理人基于此工作树进行独立 QA 和适用的发布前验证；真实模型请求不属于离线验证授权。
