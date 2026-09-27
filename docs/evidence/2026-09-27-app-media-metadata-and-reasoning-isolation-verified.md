---
title: "App Media Metadata Passthrough and Text Reasoning Channel Isolation QA — 2026-09-27"
id: "evidence-app-media-metadata-reasoning-isolation"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-27"
updated: "2026-09-27"
authors: ["qi-huolin"]
subsystem: "omnimux"
related:
  - "specs/2722-app-media-metadata-and-reasoning-isolation.spec.md"
---

# App Media Metadata Passthrough and Text Reasoning Channel Isolation QA — 2026-09-27

## 1. 验证目标
- **Issue**:
  - #2722 fix(apps): App 注入的远程素材缺失元数据，导致视频首帧槽位永久不可提交
  - #2723 fix(text): 思考语句被当作正文业务结果，且缺少正文实质性闸门
- **核心修复**:
  1. 在 `plugins/omnimux-apps/src/host/executionBridge.ts` 中透传 picked card 的 `mimeType` 和 `sizeBytes` 到 `targetNode.data.mediaAssets`、`feedAsset` 以及虚拟 import 源节点，解决远程素材因缺乏本地 statSync 而无法通过 `maxSizeMb` / `allowedMimes` 校验的结构性阻断；
  2. 在 `plugins/omnimux/src/text/execute.js` 中分离 `reasoning-delta` / `thinking-delta` 等思考事件流，支持 `block-end` 文本覆盖，并在仅包含思考过程无有效正文时抛出明确异常，杜绝思考前缀伪装成业务结果完成。

## 2. 自动化测试实测结果
- `plugins/omnimux-apps/src/host/executionBridge.test.mjs`: 13/13 PASS（包含 T05.15 媒体元数据透传用例）
- `plugins/omnimux/src/text/reasoning-isolation.test.js`: 5/5 PASS（包含 #2722 首帧校验放行/拦截与 #2723 思考流隔离/拦截用例）
- `plugins/omnimux/src/text/gemini38.test.js`: 3/3 PASS
- `plugins/omnimux/src/text/text-channel-coexist.test.js`: 5/5 PASS
- 综合聚焦测试: 26/26 PASS
