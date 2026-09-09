# Studio 审计整改交付记录

## 任务授权与限制

用户本次明确授权：「批准跳过 L2 测试，直接合并物化」。普通 Issue/PR、通过必需检查与 Merge Queue 后合并、已合并版本 Dev ~/.omnimux-dev 物化已授权，不再次索取常规批准。

L2：WAIVED BY USER / NOT RUN，绝非 PASS。该豁免不覆盖远端必需 CI、Merge Queue、生产、官方 DSH、外仓源码、真实模型调用或 credential bootstrap。历史两轮 QA 和失败日志原样保留；P2 后 40/40 Studio、25/25 probe 与构建属于工程证据，不是最终独立 QA。

## 基线与下游

- 输入 head：ab2cccea37f2a8549c3d98321485355d33f7d13b。
- fetch 后 base：f42a8336fd4d3094b7587b1313057cca1d621bb1（origin/main）。仅在任务树 merge 集成，未改主树。
- 远端 main protection：strict=true，required check `Static L0 QA & Tests`，app_id=15368，enforce_admins=true；branch rules API 返回空数组，未证明 Merge Queue 可用。不得以直接合并替代政策要求的 MQ。
- 当前唯一 .github/workflows/quality-gate.yml 响应 pull_request / push main / merge_group；检查内容为离线 QA、构建、报告与标签投影，无生产部署或包发布步骤。

## 修订规范可追溯

原规范位于主仓 ignored `deliverables/conversational-generation-studio/`。精确归档 PRD.md、system_design.md、class-diagram.mermaid、sequence-diagram.mermaid 到本目录 `spec/`，原文件字节不变。原型 index.html 与 architecture-audit.md 不复制、不修改，身份保留在 input-hashes.json。归档内指向未归档原型/审计的相对链接是原始设计上下文，读取原始精确路径，不声称 Git 内链接闭合。

## 本次集成验证

Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/860 。沿用既有任务树/分支，编号写入交付提交与 PR，不改写前序历史。

集成最新 base 后实际执行：Studio 40/40、probe 25/25，npm 包原始 build 成功（81,221 bytes），Stage 11/原8 targets、plugin boundaries 2250 sources 通过。日志 integration-studio.log、integration-probe.log。这是交付工程复跑，不是最终独立 QA。四份归档 SHA256 与原 input-hashes.json 完全相同。

## 剩余运行风险

尚未验证真实 scope 切换/关闭清空与重开、十轮依赖卸载、亮暗宿主样式不变、320/768/1200 布局、CJK IME/粘贴/选区、dock/焦点恢复、媒体错误和下载。L2 豁免不证明这些行为正常。Dev 物化与浏览器验收必须分别报告；未合入禁止物化。
