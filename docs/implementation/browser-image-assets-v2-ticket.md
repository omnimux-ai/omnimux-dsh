---
title: "V2 角标复用图片入库并验证语义一致"
id: "ticket-browser-image-assets-v2"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# V2：角标复用图片入库并验证两入口语义一致

## Parent

https://github.com/omnimux-ai/omnimux-dsh/issues/3051

## What to build

用户在作品角标第一动作保存图片到同一资产库；角标与胶囊共用同一可信保存能力和逐字文案。视频作品即使仅显示 img 封面也保留加入灵感库；未知类型不猜图片。两入口对同一图重复保存不重复建资产，旧回执不串新素材。

## Acceptance criteria

- 角标图片第一槽显示资产图形/准确文案，busy阻重复，真实成功才勾选，失败与结果未知可见。
- 视频作品链接、poster、当前帧不进图片资产；真正图片及明确 photo 作品保存当前单张。
- 显示与点击复核同一类型；懒加载/卡片复用和异步回执不串状态。
- 两入口各完成真实点击到可预览资产闭环，顺序交换不重复建资产。
- 中英文逐渠道符合产品白名单，恰好三个动作无多余元素；复制和对话地址/渠道保持原行为。
- 在实际扩展/宿主链路验证当前目标隔离和失败回执；记录截图、源码身份与真实文件/记录关联，不用DOM模拟冒充扩展端到端。
- PM_SIGN_OFF、独立双轴代码审查、OCR CLI审查与QA分别保留证据；没有环境不伪报成功。
- 展示后等待用户明确确认，不能擅自合入。

## Blocked by

https://github.com/omnimux-ai/omnimux-dsh/issues/3052：胶囊图片真实入库能力通过相关验证后才能开工。

## Status

blocked-by-v1。
