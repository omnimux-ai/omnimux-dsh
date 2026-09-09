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
- 追加 fetch 后 main 又前进两次，最终整合 base：`c33a262c4ab0609973edf71adb43d28528a702b7`。两次 merge 均无冲突，整合提交：`a24e81eb503ad2a436ab3b89f6f48887425e4a04`；无 force push/rebase。

## 本轮真实检查

- `rootOwnership.test.mjs`：先复现 jsxs/Fragment 缺失；补齐导出后 VM 暴露 `process is not defined`。最终仅增加两个 JSX runtime 导出及 esbuild `process.env.NODE_ENV="test"` 常量；全部原断言原样保留，单项 1/1 通过。提交 `e6d302072`。
- 在首个整合 base f42a8336 上：构建 host/client/canvas 通过，canvas+host typecheck 通过，完整 workflow **1375 tests /1375 pass /0 fail**，日志 `pr-760-package-final.log`。
- 最终整合 a24e81eb 上：四文件任务回归 **24/24 通过**（原15+独立9），日志 `pr-760-core-latest.log`；完整 workflow **1375 tests /1373 pass /2 fail /0 skip**，日志 `pr-760-package-latest.log`。不报告最终全包 PASS。
- 两项最终失败均为 `executionReadiness.test.mjs:160,198` 的 H3 Max/Turbo 720p fixture；最新 main H3 模型合同已不接受 720p。主检出只读复现相同两项错误；fixture 和 video-models.yaml 对最终 base 均零 diff，日志 `pr-760-h3-main.log`。属于新合入 #838 基线问题，未擅改模型合同或扩修其他任务。
- 首次整合静态检查：Stages 10/8 PASS、plugin boundaries 2221 PASS、slot contracts 1676/0 PASS；最新 main 后这些计数可能变化，不冒称最终重新运行。
- UI 静态扫描 **FAIL：6 条 UI01**，均在 main 已有 `plugins/omnimux/src/client/session-guide/SessionGuide.jsx:165,166,172,176,177,183`。主树只读复现一致，相关源码和 scanner 对 fetched base 零 diff；未添加忽略或改其他任务控件。
- `git diff --check` PASS；全局源码 diff 已复核，接口转发及 standby 消费一致。工程一致性 IS_PASS: YES；整体验收 IS_PASS: NO（上述基线检查失败、真实 UI 未验证、最终独立 QA 待主理人安排）。
- 读取 GitHub main protection：required check 为 `Static L0 QA & Tests`，strict=true。仅查看，未改配置；远端 CI 结果须以 PR 实际运行状态为准。
- #760 在准备前已是 CLOSED；该历史状态不是本修复已验收证明。本 PR 仍关联 Closes #760，不额外改 Issue 状态。
