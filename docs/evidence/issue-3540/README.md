# Issue #3540 · AutoModelPicker effort 清空：证据

- 2026-10-21 14:05（Asia/Taipei），ego lite（Chromium 154）+ 本工作树 dist + x.com fixture。
- 海报链路回归 PASS（report.json）。
- 核心选择逻辑由 `tests/auto-model-picker.spec.ts` 覆盖：无 reasoning 行返回 undefined，App 清除 effort；有 reasoning 行返回 defaultEffort/首个。
