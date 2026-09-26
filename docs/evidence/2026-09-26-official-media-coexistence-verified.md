---
title: "Official Media Channel and BYOK Coexistence QA — 2026-09-26"
id: "evidence-official-media-coexistence"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-26"
updated: "2026-09-26"
authors: ["qi-huolin"]
subsystem: "omnimux"
related:
  - "specs/2685-official-and-byok-coexistence.spec.md"
---

# Official Media Channel & BYOK Coexistence QA — 2026-09-26

## 1. 验证目标
- **Issue**: #2685 官方媒体专线与用户自备渠道正交共存与独立放行
- **核心修复**:
  1. 彻底解耦 `mount.js` 中将官方媒体专线与全局 `runtime.mode === 'official'` 绑定的逻辑；
  2. 凡目标渠道为官方专线（如 `minimax-h3@video_fast` 经济版、`seedance-2-0@official` 官方版）的请求，只要具备官方 Token 或官方登录态，无条件直接放行执行，绝不在本地抛出 `尚未配置图片、视频和音频，当前运行方式不能使用这一项`；
  3. 自备渠道与官方专线天然共存，按节点独立调度。

## 2. 自动化测试实测结果
- `plugins/omnimux/src/media/multi-channel-runtime.test.js`: 54/54 PASS
- 核心多渠道测试集: 271/271 全部通过
- 工作流单元测试集: 2145/2145 全部通过
