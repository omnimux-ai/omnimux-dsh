---
title: Codex 内置浏览器验收适配
id: spec-builtin-browser-qa
type: spec
status: superseded
authority: L2
date: 2026-09-05
updated: 2026-09-05
authors: [agent]
subsystem: qa
---

# Codex 内置浏览器验收适配（#581）

已由 [ego-browser 共享验收执行链迁移](2026-09-07-ego-browser-qa.md) 取代。下文仅保留历史设计，不授予活跃 IAB 执行权限；历史证据不重标。

现有 live QA 将执行器固定为 ego，旧证据消费者还允许缺少当前运行身份的报告通过。此次只修复共享验收执行链；历史 CI 覆盖扩展另行处理。

## 实施

1. CLI 校验 Stage、工作树、L2 所有权和目标，创建唯一待执行请求；pending 不返回成功。
2. Codex 会话通过已选择的 IAB Tab 调用模块导出的执行函数。适配器使用内置 Tab locator 点击、CDP 读取真实工作台并调用已有公共恢复接口、同一 Tab 的 CDP PNG 截图字节。沿用 runStageProbe 的断言及恢复。无 ego 回退，无人工填写 PASS 入口。
3. 同一运行校验目标 URL、当前 SHA、请求一次性消费、截图实际图片数据与运行插件产物指纹；过期请求、空图、错环境、版本不一致均失败。
4. 共用严格报告消费者，直接旧路径不得绕过当前运行验证。顶部专门交互由顶部任务负责；以 assets/workflow 做共同 Stage 回归，不注册 topbar Stage。
5. 平衡模型实现；轻量模型执行针对性测试；独立旗舰审查固定 PR 提交。主代理负责真实 IAB L2 和合并后 Dev 验收。

## 交付

独立分支及 worktree，PR 向 main，审查与门禁通过后进入 Merge Queue。共享 Dev45120 物化前与协调任务预约；不动其他任务 L2，不操作生产。默认浏览器由用户明确指定为 Codex 内置，覆盖旧文档 ego 限制。若 IAB 导航自身被拒绝，记录为 browser-transport 失败，不冒充 Stage 断言失败或成功。
