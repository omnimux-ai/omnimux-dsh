---
title: "Official Credentials Resolution Multi-Tier Fallback QA — 2026-09-27"
id: "evidence-credentials-resolution-fallback"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-27"
updated: "2026-09-27"
authors: ["qi-huolin"]
subsystem: "omnimux"
related:
  - "specs/2716-credentials-resolution-fallback.spec.md"
---

# Official Credentials Resolution Multi-Tier Fallback QA — 2026-09-27

## 1. 验证目标
- **Issue**: #2716 官方凭据解析兼容 credentials 存储与多层级回退，彻底消除运行态 Token 遗漏
- **核心修复**:
  1. 在 `media/mount.js`、`text/mount.js` 与 `text/execute.js` 中实装统一的 `resolveSyncOfficialToken`；
  2. 支持 process.env → input.credentials.resolve → ~/.omnimux-dev/.credentials.yaml → ~/.dsh/.credentials.yaml → ~/.config/omnimux/secrets.json 多层级权威官方凭据自动发现与回退；
  3. 当 process.env 为空但存储或配置文件存在合法官方 Token 时，精确识别 `hasOfficialToken = true` 并安全放行，彻底消除 400 失败及挂死。

## 2. 自动化测试实测结果
- `plugins/omnimux/src/text/text-channel-coexist.test.js`: 5/5 PASS
- 全套多渠道与运行时单测: 240/240 PASS
