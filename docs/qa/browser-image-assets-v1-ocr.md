---
title: "V1 图片入库后端 · OCR 首轮"
id: "ocr-browser-image-assets-v1-first"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# #3052 V1 backend · OCR CLI 审查报告

## 结论与证据边界

**路由：Engineer（寇豆码 / 后端工程师），非 Pass。** 本机 OCR CLI 成功结束，实际退出码为 **0**，输出 `status=complete`。CLI 共输出 8 条 finding；按审秋毫规则保留 **严重 0 / 高 1 / 中 5**，丢弃 **低 2**。以下问题与建议均来自 OCR 原始输出的转述，没有自然语言自行审代码，也没有实施修复。

本轮完成的是后端源码 OCR 行级审查，不是 QA 或真实浏览器 E2E 验收。四个新增后端测试被 CLI 默认排除，未涵盖；不得据此声称完整需求范围审查通过或实现已完成。

## 运行身份与范围

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets`
- 分支：`agent/cross-browser-image-assets-issue-3051`
- HEAD / CLI resolved_base：`d95764912e36da01d879ab65d6340469b48a4625`
- 模式：workspace（暂存、未暂存和未跟踪改动）；HEAD 等于指定 base，未改用提交间比较以免遗漏冻结但未提交的后端。
- CLI：`/Users/x/.nvm/versions/node/v25.8.0/bin/ocr`，`open-code-review v1.12.11 (a758d9cb)`。
- CLI provider / model：`dsh-cpa` / `gpt-5.5`。
- session_id：`02fe3e49-bbd6-4d53-b853-1e783ef05480`。
- CLI elapsed：`6m4s`。
- CLI manifest：selected **8**，completed **8**，failed **0**，reused **0**，waived **0**；工具调用失败 **0**。
- 预览退出码：**0**；实际审查退出码：**0**。
- stdout/stderr 合并日志只有结果落盘提示，未出现 warning。
- 审查启动后记录的 12 个指定文件 SHA-256 与结束时一致；结束时 HEAD 仍等于指定 base。文件字节哈希仅用于冻结核对，不用于业务审查。

## 实际命令

预览命令与正式命令使用相同背景和排除项，另加 `--preview`，输出到预览 JSON。正式命令如下：

```bash
ocr review --audience agent --format json \
  --background '用户要求网页图片经当前已配对token认证本机宿主真实入现有资产库，复用公网安全下载、validateImage实际解码、同活跃library服务、受管文件/账本/事件/preview及来源去重；视频/复制/对话原行为不改，禁止多host兜底/HTTP权限放宽/空result假success。重点事务失败与symlink、服务真实注册、取消/丢回执和幂等。实现还未E2E验收，不能假报已完成。' \
  --exclude '*.md,docs/**,specs/**,plugins/omnimux-browser/extension/**' \
  --output docs/evidence/browser-image-assets-v1/ocr-backend.json \
  > docs/evidence/browser-image-assets-v1/ocr-backend.log 2>&1
rc=$?
printf '%s\n' "$rc" > docs/evidence/browser-image-assets-v1/ocr-backend.exit-code.txt
exit "$rc"
```

所有 Bash 调用均显式指定本任务 workdir，所有显式 Git 命令均使用 `git -C`。CLI 预览确认选中集合恰为指定的八个后端源码文件，没有 extension 或 docs；未修改 repo 配置或 OCR 规则以改变测试默认排除策略。

## 覆盖文件

以下八个源码文件均在 CLI manifest 的 selected 和 completed 中：

| 文件 | CLI 覆盖状态 |
| --- | --- |
| [assets/index.js](../../plugins/omnimux-assets/src/index.js) | completed |
| [assets/library.js](../../plugins/omnimux-assets/src/library.js) | completed |
| [assets/image-ingest.js](../../plugins/omnimux-assets/src/image-ingest.js) | completed |
| [browser/index.ts](../../plugins/omnimux-browser/src/index.ts) | completed |
| [browser/server.ts](../../plugins/omnimux-browser/src/server.ts) | completed |
| [browser/protocol.ts](../../plugins/omnimux-browser/src/protocol.ts) | completed |
| [browser/image-assets.ts](../../plugins/omnimux-browser/src/image-assets.ts) | completed |
| [browser/media-fetch.ts](../../plugins/omnimux-browser/src/media-fetch.ts) | completed |

以下四个新增后端测试均出现在预览中，但 `will_review=false`、`exclude_reason=default_path`，不在正式 manifest selected/completed 中。**四个测试未作为审查目标涵盖**：

| 文件 | CLI 排除原因 |
| --- | --- |
| [image-ingest-v1.test.js](../../plugins/omnimux-assets/src/image-ingest-v1.test.js) | default_path |
| [library-image-transaction-v1.test.js](../../plugins/omnimux-assets/src/library-image-transaction-v1.test.js) | default_path |
| [image-assets-rpc-v1.spec.ts](../../plugins/omnimux-browser/tests/image-assets-rpc-v1.spec.ts) | default_path |
| [image-assets-v1.spec.ts](../../plugins/omnimux-browser/tests/image-assets-v1.spec.ts) | default_path |

extension、CONTEXT、docs、specs 的改动由本次 `--exclude` 排除，预览理由为 `user_exclude`。预览 JSON 共列 40 个改动文件，其中 reviewable_count=8、excluded_count=32。

## 必须处理 · CLI finding（按文件分组）

行号原样使用 CLI 的 start_line/end_line，均非 0；本角色未通读目标源码或人工二次定位。中文说明是 CLI content 的转述，建议来自同一 finding 的 content/suggestion_code；原始英文与完整建议代码均保留在原始 JSON。

### assets/image-ingest.js

**高 · security · [image-ingest.js:218–221](../../plugins/omnimux-assets/src/image-ingest.js#L218-L221)**

CLI 指出：目录包含检查是字符串层面的检查，且执行时 `mkdirSync` 已跟随 `.image-ingest` 中可能存在的 symlink。若 `.image-ingest` 或其它路径分量指向 vault 外部，代码可在资产库外创建/写入 staging 文件，而字符串路径仍通过包含检查；后续清理也可能递归删除外部 staging 目录。

CLI 建议：写入前解析并验证 staging root/slice 的真实路径，或拒绝 symlink 路径分量。CLI 的 suggestion_code 使用 `realpathSync(vaultRoot)` 与 `realpathSync(slice)` 进行真实路径包含检查。该代码是 CLI 建议，不代表已经应用或验证。

**中 · bug · [image-ingest.js:184–192](../../plugins/omnimux-assets/src/image-ingest.js#L184-L192)**

CLI 指出：当 `baseName` 已有 40 个字符，首次重名后追加 ` (2)` 会超长，被 `library.add()` 以 `name-invalid` 拒绝。因此同名但不同图片不能创建唯一资产。

CLI 建议：构造重名候选值时先按后缀长度截短 base，给序号后缀保留长度；suggestion_code 按 `DISPLAY_NAME_MAX - suffixText.length` 截短。

**中 · bug · [image-ingest.js:292–295](../../plugins/omnimux-assets/src/image-ingest.js#L292-L295)**

CLI 指出：`sourceKey` 校验时调用 `trim()`，但规范化值没有传给 `runSave`。含前后空白的 key 会与规范化 key 共用 in-flight key，却把未规范化值持久化，后续规范化请求无法对已保存资产去重。

CLI 建议：启动保存时传入 `runSave({ ...input, sourceKey })`，使用已 trim 的 key。

### browser/index.ts

**中 · bug · [index.ts:294–306](../../plugins/omnimux-browser/src/index.ts#L294-L306)**

CLI 指出：注释称两项 host seam 每次调用解析，但 `attachments` 与 `imageLimits` 实际在 bridge mount 时捕获。若 attachments 晚于本插件挂载，图片保存将持续返回 `unavailable`，或持续使用过期媒体限制，直到重新挂载 bridge。

CLI 建议：保存路径中也动态解析 attachments 服务，使校验可用性与限制反映活跃 host 服务。原始 JSON 含 CLI suggestion_code，本角色未验证其正确性或完整性。

### browser/image-assets.ts

**中 · bug · [image-assets.ts:272–279](../../plugins/omnimux-browser/src/image-assets.ts#L272-L279)**

CLI 指出：取消检查在 persistence 开始前执行，`runIngest` 返回后没有再次检查。ingest API 不接受 signal，故资产写入期间若 connection-generation abort，仍可能在此生成 `saved`/`duplicate` 回执，与中途连接死亡应报告 `cancelled` 的方法约定不符。

CLI 建议：ingest settle 后、返回任何回执前立即执行 abort 检查：`if (aborted()) return { status: 'cancelled' }`。

### browser/media-fetch.ts

**中 · bug · [media-fetch.ts:171–178](../../plugins/omnimux-browser/src/media-fetch.ts#L171-L178)**

CLI 指出：若调用方先 abort，但底层 fetch/read 直到 timeout 回调执行后才 reject，`timedOut` 已为 true，`fetchFailureOutcome` 会报告 `timeout`，即使最初取消来自调用方。

CLI 建议：记录首次 abort 的来源（external / timeout），或在外部 signal abort 时清除/禁用 timeout，使延迟传播时仍能区分调用方取消。

## 低档过滤

CLI 的两条 low finding 未列入必须处理清单；原始输出完整保留，不裁剪或改写原始 JSON。未增加 CLI 之外的问题、评级、推断或审查通过评语。

## 证据索引与下一步

- [CLI 原始结果](../evidence/browser-image-assets-v1/ocr-backend.json)
- [CLI stdout/stderr 日志](../evidence/browser-image-assets-v1/ocr-backend.log)
- [实际退出码](../evidence/browser-image-assets-v1/ocr-backend.exit-code.txt)
- [CLI 范围预览](../evidence/browser-image-assets-v1/ocr-backend-preview.json)
- [预览日志](../evidence/browser-image-assets-v1/ocr-backend-preview.log)
- [冻结文件输入哈希](../evidence/browser-image-assets-v1/ocr-backend-input-manifest.json)

后端工程师处理六条保留 finding 后，由主理人安排 OCR 复审及后续 QA。四个测试的 OCR 未涵盖状态必须继续显式保留，不能以单测已绿替代 OCR 覆盖。真实浏览器 E2E 未由本角色执行。

本轮没有修改业务源码、测试、规则或配置；没有 Git 暂存/提交、push、merge、restart 或生产操作。仅写入请求的审查报告与审查证据。
