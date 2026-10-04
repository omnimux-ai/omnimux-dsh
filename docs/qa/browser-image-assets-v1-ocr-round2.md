---
title: "V1 #3052 图片入库后端 · OCR 第二轮"
id: "ocr-browser-image-assets-v1-round2"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# #3052 V1 backend · OCR CLI 第二轮报告

## 结论

**路由：Engineer（寇豆码 / 后端工程师），非 Pass。** 本机 OCR CLI 实际退出码 **0**，`status=complete`、`manifest.terminal_state=complete`；八个指定 backend 源码全部完成。CLI 输出 **4 条 finding：严重 0 / 高 1 / 中 3 / 低 0**；保留全部四条，丢弃低档零条。

`status: accepted` 表示本报告作为 L3 审查证据落盘，不表示实现验收通过。问题、级别、行号与建议全部来自本轮 CLI 原始输出；本角色没有自行通读或自然语言补审代码，没有修改源码、测试、规则或 OCR 配置。

本轮是冻结 backend 工作树的源码 OCR 复审，不是前端 job32 审查、QA 或真实浏览器 E2E。四个 backend 测试继续被 CLI 默认排除，**未作为 OCR 审查目标涵盖**。

## 证据与运行身份

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets`。
- 分支：`agent/cross-browser-image-assets-issue-3051`。
- 起止 HEAD 与 CLI resolved_base 均为 `d95764912e36da01d879ab65d6340469b48a4625`。
- 模式：workspace，涵盖当前暂存、未暂存、未跟踪改动；未改用提交/分支范围以免漏掉冻结但未提交文件。
- CLI：`/Users/x/.nvm/versions/node/v25.8.0/bin/ocr`，`open-code-review v1.12.11 (a758d9cb)`。
- provider / model：`dsh-cpa` / `gpt-5.5`；configured_concurrency=8。
- session_id：`70b4c284-0aed-48f6-a9cc-166d3697f4da`。
- elapsed：`11m26s`，manifest.elapsed_ms=686490。
- coverage：selected=8、completed=8、failed=0、reused=0、waived=0；selected 与 completed 的完整条目及 fingerprint 完全一致，路径集合恰为用户指定八个文件。
- summary.files_reviewed=8、comments=4；tool_calls.total=57、failure=0。
- 预览真实退出码=0，正式审查真实退出码=0；未通过管道尾部退出码推断成功。
- stdout/stderr 合并日志只有结果落盘提示，没有 warning；完整原始 JSON 与日志均保留，没有裁剪。
- rule_config_sha256=`414d4d727dd60672664e81bce25a8f37801c2c2e123bfa96e46e1cb0ccf0658f`，与首轮原始 manifest 一致。
- runtime_config_sha256=`f9fe9c9667dda16ce8346b636caa4a7b90178e88d6a8f1b03dc8c86f878803d3`，与首轮一致。

## 冻结核对

启动前逐项核对[整改报告](../implementation/browser-image-assets-v1-backend-fixes.md#L42-L53)中十项 SHA-256，全部吻合。另记录八个审查目标的完整字节哈希，合计十三个不同文件（八个目标、范围外未变的 ingest.js、四个未覆盖测试）。审查结束十三个文件全部保持启动前字节，十项整改 freezehash 再次全部吻合；HEAD 与分支未变。

整改报告未列出 assets/index.js、browser/server.ts、browser/protocol.ts 的冻结哈希，因此不冒称其有整改 freezehash；这三个文件的本轮起止 SHA-256 都与[首轮输入清单](../evidence/browser-image-assets-v1/ocr-backend-input-manifest.json)相同。测试字节仅用于冻结核对，不代表测试得到 OCR 覆盖。完整起止字节、整改 hash、首轮 hash 与逐项核验结果见[复审核验结果](../evidence/browser-image-assets-v1/ocr-backend-round2-verification.json)。

## 实际命令与完整背景

所有 Bash 显式使用上述工作树 workdir；所有显式 Git 只读身份命令均带 `git -C` 该路径。没有 Git 暂存、提交、分支切换、push、merge、rebase 或清理操作。预览使用与正式命令相同背景和排除项，另加 `--preview` 并落盘 preview JSON/日志/exit。

正式命令的 `BACKGROUND` 值完整如下，未使用工程师报告替代审查：

> V1 #3052 图片入现有资产库 backend 修复后第二轮审查。仅审 plugins/omnimux-assets/src/{index.js,library.js,image-ingest.js} 与 plugins/omnimux-browser/src/{index.ts,server.ts,protocol.ts,image-assets.ts,media-fetch.ts} 的当前工作树未提交改动；backend 已冻结，extension 前端 job32 并行不审，测试保留 CLI 默认排除。业务要求：网页图片通过当前已配对 token 认证的唯一一个本机 host 写入现有资产库，绝不能多 host 探测/兜底或放宽 HTTP/CORS/权限；只用当前 host 活跃的同一 assetLibrary 实例，attachments/validateImage/媒体限制晚挂载或重挂载也应按调用动态解析；安全公网下载必须约束协议、DNS/SSRF、重定向、大小、超时，validateImage 必须实际解码，不接受空 result 假 success。saved 必须证明受管真实文件、资产账本与事件/preview/列表一致；临时 staging、library.add 与持久化作为事务，失败不能留下半文件/半账本，回滚只针对本次新提交条目，缺文件旧记录绝不删除。vault/.image-ingest 路径及 slice 不允许 symlink 越界写入或递归清理外部，拒绝不安全路径。sourceKey 规范化/去重、同源 in-flight、跨 source 同名并发唯一、40 字显示名加序号长度合法；取消需覆盖下载、校验、ingest settle，连接 generation abort 不回 saved/duplicate，已真实提交不因丢回执/取消被撤销，重试必须幂等 duplicate；external abort 与 timeout 首因区分。首轮6条保留finding：staging symlink高、40字重名中、sourceKey trim持久化中、attachments mount捕获中、ingest后abort中、external abort被timeout覆盖中；工程师报告已逐条修复，但报告与测试绿灯不是通过证据，请基于当前代码 independently 复核并继续检出真实问题。旧视频/复制/对话功能不改；backend测试默认未覆盖，QA/E2E与前端不属本轮，不能宣称完整需求通过。

```bash
ocr review --audience agent --format json --background "$BACKGROUND" \
  --exclude '*.md,docs/**,specs/**,plugins/omnimux-browser/extension/**' \
  --output docs/evidence/browser-image-assets-v1/ocr-backend-round2.json \
  > docs/evidence/browser-image-assets-v1/ocr-backend-round2.log 2>&1
rc=$?
printf '%s\n' "$rc" > docs/evidence/browser-image-assets-v1/ocr-backend-round2.exit-code.txt
printf 'OCR_REAL_EXIT=%s\n' "$rc"
exit "$rc"
```

## 覆盖范围与默认排除

预览列出 total_files=43、reviewable_count=8、excluded_count=35；selected/completed 集合严格等于以下八个源码，未包含前端 extension。

| 文件 | 覆盖状态 |
| --- | --- |
| [assets/index.js](../../plugins/omnimux-assets/src/index.js) | selected / completed |
| [assets/library.js](../../plugins/omnimux-assets/src/library.js) | selected / completed |
| [assets/image-ingest.js](../../plugins/omnimux-assets/src/image-ingest.js) | selected / completed |
| [browser/index.ts](../../plugins/omnimux-browser/src/index.ts) | selected / completed |
| [browser/server.ts](../../plugins/omnimux-browser/src/server.ts) | selected / completed |
| [browser/protocol.ts](../../plugins/omnimux-browser/src/protocol.ts) | selected / completed |
| [browser/image-assets.ts](../../plugins/omnimux-browser/src/image-assets.ts) | selected / completed |
| [browser/media-fetch.ts](../../plugins/omnimux-browser/src/media-fetch.ts) | selected / completed |

以下四个 backend 测试均 `will_review=false`、`exclude_reason=default_path`，不在 manifest selected/completed 中：

| 文件 | OCR 边界 |
| --- | --- |
| [image-ingest-v1.test.js](../../plugins/omnimux-assets/src/image-ingest-v1.test.js) | 默认排除，未作为审查目标 |
| [library-image-transaction-v1.test.js](../../plugins/omnimux-assets/src/library-image-transaction-v1.test.js) | 默认排除，未作为审查目标 |
| [image-assets-rpc-v1.spec.ts](../../plugins/omnimux-browser/tests/image-assets-rpc-v1.spec.ts) | 默认排除，未作为审查目标 |
| [image-assets-v1.spec.ts](../../plugins/omnimux-browser/tests/image-assets-v1.spec.ts) | 默认排除，未作为审查目标 |

其他 Markdown、docs、specs 与前端 extension 为 `user_exclude`。本轮未修改规则扩大测试范围，也未绕过默认排除。

## 必须处理 · 本轮 CLI finding（按文件分组）

以下是 CLI `content` / `suggestion_code` 的中文转述，保留原级别和类别；行号直接使用本轮 start_line/end_line，均非零。本角色没有读源码作人工二次定位，建议代码没有应用或验证。原始英文及建议代码完整保存在[CLI 原始 JSON](../evidence/browser-image-assets-v1/ocr-backend-round2.json#L28-L68)。

### assets/image-ingest.js

**R2-1 · 高 · security · [image-ingest.js:197–204](../../plugins/omnimux-assets/src/image-ingest.js#L197-L204)**

CLI 指出：`runSave()` 先前已验证 staging root，但 `sweepStaleSlices()` 使用 root 读目录与删除时没有再次验证。如果 `.image-ingest` 在 `realStagingRoot()` 与清理之间被换成 symlink，`readdirSync(root)` 会跟随该链接，随后递归 `rmSync(join(root, entry.name))` 可能删除 vault 外目录。

CLI 建议：在 `sweepStaleSlices()` 内部、枚举/删除子目录前重新验证 root；若其不再是真实 vault staging 目录则跳过清理。CLI suggestion_code 在读目录前调用 `realStagingRoot()`，异常直接 return。这是 CLI 建议，不代表完整竞态防护已由本角色证明。

**R2-4 · 中 · security · [image-ingest.js:292–295](../../plugins/omnimux-assets/src/image-ingest.js#L292-L295)**

CLI 指出：递归 mkdir 前仍有 TOCTOU 窗口。`.image-ingest` 不存在时 `realStagingRoot()` 可返回 null；若在 `mkdirSync(slice)` 前被换为 symlink，递归 mkdir 会先在 vault 外创建 scope 目录，后续真实路径检查才抛错，违反不安全路径须在任何外部写入之前拒绝的约束。

CLI 建议：先建立并立即验证 staging root 为真实目录（或非递归建立 root 后 lstat/realpath 验证），验证后再建立子 scope。CLI suggestion_code 将 root 建立/`realStagingRoot()` 校验与非递归 child mkdir 分开。该建议未经本角色应用或验证。

### browser/image-assets.ts

**R2-2 · 中 · bug · [image-assets.ts:294–298](../../plugins/omnimux-browser/src/image-assets.ts#L294-L298)**

CLI 指出：`validateImage()` 在途期间不观察取消。如果慢或卡住的解码器执行时连接 generation abort，RPC 会一直等待校验最终 resolve/reject，不能在校验阶段及时返回 `cancelled`。

CLI 建议：让校验与 abort signal 竞速，连接死亡后及时回 cancelled；稍后校验结果作为后台收尾处理。suggestion_code 向 `runValidation` 传入 signal，并在 validation 为 aborted 或整体 aborted 时先返回 cancelled。此处签名与实现完整性需后端工程师处理，不是已验证补丁。

### browser/media-fetch.ts

**R2-3 · 中 · bug · [media-fetch.ts:179–182](../../plugins/omnimux-browser/src/media-fetch.ts#L179-L182)**

CLI 指出：模块 timeout 先发生时仍没有 first-wins 归因。timeout 将 `timedOut=true` 并 abort controller 后，若 fetch 尚未 reject、调用方随后 abort，会将 `externallyAborted=true`，使 catch 把原 timeout 报成 failed/调用方取消。

CLI 建议：外部处理器仅在模块 timeout 尚未发生时取得归因；suggestion_code 为 `if (!timedOut) externallyAborted = true`，随后 abort controller。

## 首轮整改的证据边界

首轮六条保留项已完整作为背景传给 CLI；第二轮最终输出不再列出原先 40 字重名、sourceKey trim、attachments mount 捕获、ingest settle 后取消等原文问题，但仍在 symlink 和 abort 归因方向检出上述问题。**“最终输出未重报”不是逐项修复被正式验收或安全竞态被穷尽证明**；本轮 CLI 没有提供首轮逐条 closure 标记，本角色不补造核销结论。

## 未知项、未覆盖与信心

CLI 完整完成与精确八文件覆盖有 exit、manifest、预览和起止 SHA-256 交叉证据，可信边界清楚；finding 是 AI CLI 的行级意见，不是本角色已执行的利用复现或修复验证。真实竞态复现、建议的完备性及修复回归由后端工程师和独立 QA 验证。

测试作为目标未覆盖，前端 job32 未审，真实浏览器保存/列表/preview 与配对运行未执行。本轮没有复跑工程师测试，也不能把[整改报告](../implementation/browser-image-assets-v1-backend-fixes.md)所载基线失败或测试绿灯改成独立 QA 结论。本轮不修改原测试、规则、源码；不重启、部署或生产操作。

## 证据索引与下一步路由

- [CLI 原始结果](../evidence/browser-image-assets-v1/ocr-backend-round2.json)
- [完整 stdout/stderr 合并日志](../evidence/browser-image-assets-v1/ocr-backend-round2.log)
- [实际退出码](../evidence/browser-image-assets-v1/ocr-backend-round2.exit-code.txt)
- [预览 JSON](../evidence/browser-image-assets-v1/ocr-backend-round2-preview.json)
- [预览日志](../evidence/browser-image-assets-v1/ocr-backend-round2-preview.log)
- [预览退出码](../evidence/browser-image-assets-v1/ocr-backend-round2-preview.exit-code.txt)
- [启动输入指纹](../evidence/browser-image-assets-v1/ocr-backend-round2-input-manifest.json)
- [结束覆盖与冻结核验](../evidence/browser-image-assets-v1/ocr-backend-round2-verification.json)

**Engineer：主理人应将 R2-1 / R2-4 交资产写入后端、R2-2 / R2-3 交 browser backend 工程师（寇豆码）处理，再安排冻结后的 OCR 复审与独立 QA。** 本角色不实施修复，不以 CLI exit0 或 evidence accepted 误报 Pass。
