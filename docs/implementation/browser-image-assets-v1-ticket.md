---
title: "V1 悬浮胶囊图片真实入资产库"
id: "ticket-browser-image-assets-v1"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# V1：悬浮胶囊图片真实入资产库

## Parent

https://github.com/omnimux-ai/omnimux-dsh/issues/3051

## What to build

用户从现有悬浮胶囊点击图片的加入资产库，经过当前明确配对的宿主安全下载与实际图像校验，真实图片登记至现有资产库；可以从资产列表找到并预览。保持视频灵感、复制与加入对话行为。无宿主、拒绝下载、非图片及保存失败不能显示成功。

## Acceptance criteria

- 当前本机 token 已验证的连接是唯一写入目标；未配对、旧能力或资产服务缺失明确失败，不轮询其他宿主写入。
- 真实图片物化、单实例账本/文件/revision/event 一致，可经列表和预览读取，重建库仍存在。
- 公网下载复用现有防私网、DNS绑定、逐跳、安全尺寸/MIME/实际解码、8 MiB/9秒预算。
- 同一来源串行/并发重复不建重复资产；同名不同图不覆盖，持久化失败不残留假资产。
- 图片文案/图标/busy/done/失败遵循产品四件套；视频灯泡/复制/对话原行为不变。
- 红绿测试证据及当前分支提交；截图与独立验收未完成不得称交付。先演示后合入。

## Blocked by

None；规格、用户验收范围及产品预检已确认。

## Status

ready-for-agent（远端标签映射为已有 status:ready-to-work）。

## Evidence requirements

先失败行为测试再最小实现；真实资产列表/预览、失败一致性及连接认证验证；功能路径浏览器截图不可用时如实缺项。实施者不得关闭票，不得合入或发布。
