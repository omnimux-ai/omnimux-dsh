# Issue #760 PR 准备与一次性 L2 豁免

## 授权与证据边界

2026-09-09 用户明确授权原文：**「批准跳过 L2 测试，直接合并物化」**。本次委派进一步限定为：准备普通 PR，暂不 merge 或物化；由主理人安排最终 diff 独立 QA 后统一合并。

- 本任务 L2 状态为 **waived/user（一次性用户豁免）**，不是 PASS。此前正式 L2 启动因 viewer 的 `installSettingsSection` 导入不兼容失败，完整事实保留在 `../qa/issue-760-audit-fixes-l2-edward.md`。
- 未验证真实浏览器 strip 替换/撤销/重做/保存刷新、原生 selection/中文 IME、缩略图更新及音频文本提交专项；离线/JSDOM 不能替代这些 UI 证据。
- 不更改长期 L2 合同、CI、required checks、Merge Queue、`qa:pass` 标签或管理员 bypass；豁免不制造 CI 通过证据。若正常 required checks 阻挡，交回主理人处理，不绕过。
- 禁止本委派写共享 Dev/Prod、官方 DSH、外仓、managed-tarball/viewer；仅合并最新 main 的既有内容，不额外修改这些路径。

## 保存与整合

- 原 base：`867b192ecf6aa35be4e1639db7351a89bea782c7`；原 code：`2ca3e8286dda317be0a6cdf2d5aa6829f2d98450`；原 final：`915198ce7592b17511c2c8746bf95f1f980e17ef`。
- 本轮 fetch main：`f42a8336fd4d3094b7587b1313057cca1d621bb1`，相对原 base 前进 7 commits；incoming 路径不与 F1/F2/F3 源码重叠。
- 原独立 QA 两份报告与 9 项边界测试原样保存；15/120/9 是重叠集合，不求和。原完整包为 1374 pass /1 baseline fixture fail。
- 主树 `videoCompositionStatus.ts` 与 `.test.mjs` 他人修改不触碰，不 stash/reset，不同步主检出。
- 后续检查及最终提交身份由本报告追加实测记录与 PR head 标识；旧报告保持其原固定 SHA 的历史结论。
