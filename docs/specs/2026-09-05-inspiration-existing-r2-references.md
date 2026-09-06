---
title: "恢复灵感库原 R2 封面引用"
id: "spec-inspiration-existing-r2-references"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-09-05"
updated: "2026-09-05"
authors: ["x", "codex"]
subsystem: "omnimux"
supersedes: ["spec-inspiration-cover-repair-584"]
---

# 原 R2 封面恢复

Issue #584。源 Gxgen 记录的顶层 `cover_r2_key` 必须映射为 `cover_key: r2/<完整对象 key>`；不使用类别图片或临时 CDN 封面。已有样本 145–154 使用专用事务工具恢复，不重跑 seed、不复制对象，原作品 `source_url` 不变。

微服务对 R2 封面返回 `/media/inspiration-covers/<id>`，按记录 ID 鉴权读取原对象。云 API 与 Host 沿用媒体转发，Host 传递 Range / If-Range。前端继续使用现有 cover_key。只读 R2 配置与上传配置分离，不使用上传 prefix，不在失败时回落磁盘或抓取原平台。

微服务 CLI 提供 covers plan / verify / apply / status / rollback。正式计划保存完整数据库与标签关联快照，事务按 ID 锁定精确十行，仅改变 cover_key，并保留具有 ON UPDATE 行为的 updated_at。任一并发变化整批停止；提交结果未知通过 status 核实。R2 核验在事务锁外完成。

验收：顶层字段映射、If-Range 转发；微服务鉴权、真实图片/错误响应、真实 MySQL 提交/冲突/回滚；原 R2 与 Host 十张图片的哈希相等；45120 云列表与预览、重启后显示均通过。临时测试环境不替代真实 App 验收。

生产凭据配置、部署和十行回写须分别明确授权。主线发布包含外链下载功能时，独立 SSRF 修复必须通过；它不是原数据迁移缺失的原因。只有合并、部署、回写、真实 App 验收均完成才关闭任务。
