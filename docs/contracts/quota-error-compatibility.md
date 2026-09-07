---
title: "网关额度错误兼容与源码补丁退役"
id: "contract-quota-error-compatibility"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-06"
authors: ["x", "codex"]
subsystem: "omnimux"
---

# 网关额度错误兼容与源码补丁退役

协调单：[omnimux-dsh #668](https://github.com/omnimux-ai/omnimux-dsh/issues/668)。本变更是待审退役交付；网关代码通过、仓库合并、部署和实际 App 验收分别记录，不能互相替代。

## 响应合同

OmniMux 网关的 OpenAI 文本接口（Completions、Chat Completions、Responses、Responses Compact）在本地账户余额或订阅额度不足时，输出 HTTP `402`，`error.type` 和 `error.code` 均为 `insufficient_quota`。消息提供稳定的中英文额度说明及请求 ID。零余额和正余额但预扣不足均走此合同。流式请求在建立 SSE 前仍返回 JSON 错误。

网关内部保留 `insufficient_user_quota`、403、skip-retry 和原有日志/扣费路径。认证 401、权限 403、token 额度/有效性错误、上游错误和其他协议不在该映射范围。普通 429 限流和 5xx 重试策略保持原状。

429 方案已否决：官方 SDK 默认重试两次，现有 CLI 也优先把 429 当限流。402 对已测客户端不触发重试；CLI 保持非重试 API 错误，尚不会从嵌套 OpenAI error 对象展示专用额度分类。

## 替代链路与交付顺序

1. 网关分支验证真实 Relay 的零余额/预扣不足、Chat/Responses、stream=false/true；记录实际响应。
2. 本地 HTTP fixture 回放经未修改的官方 DSH `0.1.2-rc.1` stream/error/retry 模块、pi-ai `0.84.2`、OpenAI SDK `6.40.0`。验证 QUOTA、一次请求、官方对话/轨迹投影保留额度说明，以及本插件 quota-classifier / quota-failure 仍挂载提示。
3. 经授权发布网关后，确认实际 App 使用未修改官方版本，验证零余额和正余额预扣不足的聊天、轨迹与插件钱包提示。网络中断、私有测试夹具和投影测试都不算实际 App 验收。
4. 网关及公共文档交付已核验后再合入本退役变更。无需通过源码补丁修复旧版本；保留插件提示。#668 只有所有适用层完成才关闭。

本地替代链路与现有插件 10 项额度测试已通过；生产部署、实际 App 和合入后 Dev 尚待验收。网关测试入口：`scripts/ops/quota-compat/README.md`（OmniMux 仓库）。

## 历史证据

补丁和 apply/reset 的历史内容保留在 Git 中，已从有效执行入口删除：

- [alpha.3 额度补丁](https://github.com/omnimux-ai/omnimux-dsh/blob/f87be54/patches/dsh-0.1.2-alpha.3/llm-quota-priority.patch)
- [0.1.1-rc.2 额度补丁](https://github.com/omnimux-ai/omnimux-dsh/blob/f87be54/patches/dsh-0.1.1-rc.2/quota-403-not-auth.patch)
- [0.1.0-rc.8 额度补丁](https://github.com/omnimux-ai/omnimux-dsh/blob/f87be54/patches/dsh-0.1.0-rc.8/quota-403-not-auth.patch)
- [apply 脚本](https://github.com/omnimux-ai/omnimux-dsh/blob/f87be54/scripts/apply-harness-overlay.sh)、[reset 脚本](https://github.com/omnimux-ai/omnimux-dsh/blob/f87be54/scripts/reset-harness-overlay.sh)

旧设计/验收记录中的补丁命令仅描述当时执行，不能恢复其现行效力。

## 共享官方 clone 的单独恢复方案

`/Users/x/Desktop/Project/Github/deepseek-harness` 目前仍有四个额度补丁修改（11 行新增、2 行删除）：

- `packages/llm/llm-pi-ai/src/stream.ts`
- `packages/llm/llm-pi-ai/tests/convert.spec.ts`
- `packages/llm/llm/src/error.ts`
- `packages/llm/llm/tests/service.spec.ts`

该 clone 还有其他未跟踪文件。此次没有 reset、还原、清理或写入官方树。

如需恢复，先单独取得覆盖上述四文件的授权，再核对当时 HEAD、index 与工作树差异；在官方树外保存这四文件的原始字节和 staged/unstaged diff，确认无其他会话依赖后，仅撤销经核验属于额度补丁的 hunks。若有混合修改或哈希变化，重新审查具体 hunk，不做整文件覆盖。保留所有其他文件和 staged 状态，最后比对官方 blob 并重跑替代链路。禁止重新启用旧 reset 脚本或执行全仓 reset/clean。
