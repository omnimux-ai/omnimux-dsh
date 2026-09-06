---
title: "Gxgen 灵感增量导入"
id: "spec-gxgen-incremental-import"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-09-06"
updated: "2026-09-06"
authors: ["x", "codex"]
subsystem: "omnimux"
---

# Gxgen 灵感增量导入

Issue #630，延续已验收的 #584；只读封面 CLI 子任务 laozhong86/omnimux-inspiration#7。

## 已确认的行为

只新增，已有云端记录、标签、ID、收藏和内容保持原样。按 TikTok 视频 ID 去重，包括历史 sync 查询参数和作者路径变化。异常源记录记录原因后继续寻找合格记录。第一版只有单 Agent、同目标串行执行，不支持跨机器并发或定时同步。首批验收新增二十条，并重复执行同一计划证明新增零条。

## 数据与入口

替换 scripts/seed-cloud-inspirations.mjs 为 scripts/import-gxgen-inspirations.mjs；统一 pnpm inspiration:import 的 plan/apply/verify 子命令。删除清空重建、固定十条截断、时间戳 URL、虚构热度、内置凭据和跨环境回退；同步更新测试及 CI。

plan 分页读取 Gxgen published_tasks 中 is_active=true、deleted_at=null 的记录，并完整扫描目标库。保留 TikTok 与五维拆解资格要求，源与已有记录的多个身份字段相互冲突时拒绝该候选。源内同视频相同内容只选一条，冲突内容跳过该组。limit 表示合格且尚未导入的数量，不限制扫描数量。源和目标地址、令牌均显式配置。

新记录沿用源标题、作者、标签、真实热度、五维分析与顶层 cover_r2_key；写入 cover_key: r2/<完整对象路径>，source_url 为去掉跟踪参数的真实 TikTok 链接。analysis 记录 Gxgen 源 ID 以便追溯。不调用 TikTok oEmbed，也不搬运图片或视频。

## 预检与写入

通用 Go covers inspect CLI 复用现有 CoverReader，以源 ID 和 R2 引用为输入，返回每条图片的 SHA-256、字节数、MIME 或异常原因。缺图/无效对象是行级异常；配置、鉴权、存储不可用、超时为系统错误。只读检查不需要数据库或线上 HTTP 路由变化。

plan 输出冻结计划：源记录 ID、TikTok ID、源与目标地址、写入内容、源内容摘要、封面哈希、已有记录快照与跳过原因；不含凭据。apply 校验计划、目标、源内容和图片是否变化，重新去重后仅使用 POST /inspirations?return_existing=true。同目标加本机互斥锁。

每次写入后按返回 ID 读取字段、标签和实际图片，校验映射及原图哈希。写入结果不明先查实再决定是否重试。凭据或目标系统错误停止执行，数据异常逐条跳过。回执区分 created、existing、source_duplicate、invalid_source、write_failed、verification_failed、unknown；失败或结果未确定不得 exit 0。重复同一计划恢复并复验，生成新计划才选下一批。

## 验收

测试分页、历史 URL/作者变化、重复/冲突身份、无效封面、源内容变化、互斥锁、超时后实际成功、部分失败、同计划重复及落盘 JSON 往返。断言不会发送 DELETE/PATCH。

生产首批写前保留已有记录/标签的完整只读快照，写后证明旧记录不变且新增二十条，原图与实际媒体响应哈希一致。Dev 45120 检查二十条卡片/详情及跨页加载，并回归原十条。重复同计划新增零条、ID 不变。合格数据不足二十条必须报告缺口，不伪造完成。

## CLI 执行合同

统一入口为 `pnpm inspiration:import <plan|apply|verify>`。三个子命令都要求 `--file <绝对计划路径>`、`--source-url`、`--target-url` 与 `--inspector <绝对可执行路径>`；源密钥和目标令牌分别只接受 `--source-key` / `GXGEN_SUPABASE_KEY` 与 `--target-token` / `OMNIMUX_ACCESS_TOKEN`，不查找 profile 或内置默认值。R2 配置由 inspector 进程环境继承；需要显式 env 文件时使用 `--inspector-env-file <绝对路径>`。

`plan` 额外接受 `--limit`（默认 20）和 `--page-size`（默认且最大 100），以游标分页扫描源、分页读取目标，并调用 `inspiration covers inspect --manifest <json> --out <json>`。`--file` 是不可覆盖的冻结计划；完整源扫描摘要仅用于审计，apply 重验计划中选中的源行、相关 TikTok 冲突组和封面，新增无关源行不阻断同计划恢复。

`apply` 与 `verify` 读取同一冻结计划，在 `<file>.receipts.json` 按行追加持久回执。重复 apply 复验原目标 ID 并报告本轮 `created=0`；verify 同时核对计划前已有记录未变化、计划记录的字段/标签及目标媒体响应 SHA-256。任一失败或未知结果退出非零，计划文件始终保持字节不变。

用户已明确要求实施本方案，包括相关 Issue/PR、合并和首批二十条真实导入验收。无 APP 新设置页面、数据库结构变化、权限扩大或生产读图服务重启需求。每个仓库独立 worktree/PR，完成验收后归档证据并清理任务资源。
