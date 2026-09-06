---
title: "云灵感过期封面修复"
id: "spec-inspiration-cover-repair-584"
type: "spec"
status: "superseded"
authority: "L2"
date: "2026-09-05"
updated: "2026-09-05"
authors: ["x", "codex"]
subsystem: "omnimux"
superseded_by: "spec-inspiration-existing-r2-references"
---

# 云灵感过期封面修复

本文方案已由[原 R2 引用恢复规格](2026-09-05-inspiration-existing-r2-references.md)取代。145–154 使用已存在的源对象，不能执行下述重新抓取和上传恢复流程。

Issue: [#584](https://github.com/omnimux-ai/omnimux-dsh/issues/584)。

## 已确认的故障

45120 内置浏览器中，云列表返回 HTTP 200、`success: true`、10 条记录，标题和详情文案正常。封面请求分别出现 5 个 HTTP 403 和 5 个 `ERR_BLOCKED_BY_ORB`。记录的 `cover_key` 保存了带到期签名的 TikTok CDN 外链。原视频的官方 oEmbed 可以返回当前有效的真实封面。

本次修复保留已有记录，只将失效封面转入现有云媒体存储。`media_keys` 全为空，不据此宣称视频已保存或可播放。筛选、配额、一键复刻和本地库不在本次改动范围。

## 修复流程

`scripts/repair-inspiration-covers.mjs` 使用明确的本机 Host 和记录 ID。云凭据仍由中枢处理；脚本不读取 token 文件，不直接调用云写接口。

1. `plan` 读取完整记录，保留原字段，从原视频官方 oEmbed 解析真实封面并验证图片响应；以私有文件保存备份与计划，不写云端。
2. `apply` 检查记录未被同时修改，刷新封面链接，经 Host `POST /omnimux/inspiration/media` 上传。校验持久 key 和保存后的图片，记录上传结果，再复查记录并仅 PATCH `cover_key`。
3. 逐条回读确认新 key 和所有非媒体字段；服务端 `updated_at` 可随更新变化。失败必须停止并保留进度，不能把部分完成报告为成功。
4. `rollback` 只在记录仍符合修复后状态时恢复原 `cover_key`，保留新媒体对象和其他字段。恢复旧值只恢复数据状态，不会使旧签名重新有效。

备份、完整源数据、签名 URL 和操作日志不入 Git。执行前必须具备针对目标记录的云写授权。现场限定为原 ID 145–154，只改 `cover_key`。

## 媒体契约与验收

现有 Host 上传传入 `{url, kind: "cover"}`；云端返回持久对象 `key`。Host 读取路径为 `/omnimux/inspiration/media/{key}`。云 sidecar 使用既有媒体存储保存真实图片；配置 R2 时需同步成功才返回结果。

回归测试覆盖只读计划、冲突拒绝、无效媒体拒绝、窄字段更新、部分失败记录与回滚。真实验收在 45120 内置浏览器重新读取云列表：10 条记录仍在，10 张封面成功解码，本地两条记录保持原内容。测试替身不能替代这一步。

本仓工具不会改变运行中的客户端或 Host，不需要为数据修复物化或重启 App。未来入库时保证封面持久化的约束属于独立 `omnimux-inspiration` 云服务，其代码与发布单独交付。
