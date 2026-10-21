# Issue #3529 · 无 reasoning 模型 effort 归一化：证据

- 2026-10-21 13:37（Asia/Taipei），ego lite（Chromium 154）+ 本工作树 dist + x.com fixture。
- 海报入口/模态/主题/跳转/附图回归全部 PASS（report.json）。
- 本任务核心是面板模型选择逻辑，由 `tests/model-selector-catalog.spec.ts` 的 `resolveEffortForModel` 4 个用例覆盖：无 reasoning 模型返回空 effort，不继承 max；支持模型回退 defaultEffort。
- 真实面板 + Dev 的选中模型对话验证需人工在已安装扩展的 Dev 面板复核（本隔离 fixture 无 bridge）。
