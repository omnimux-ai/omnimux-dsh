# Issue #3480 · 观点生成回退与模型列表实时读取：浏览器验收证据

- 运行日期：2026-10-21 10:18（Asia/Taipei）
- 方式：Chromium 154（`ego lite` 二进制）`--load-extension` 加载本工作树 `dist`，CDP 驱动；HTTPS fixture 以 `--host-resolver-rules=MAP x.com 127.0.0.1:<port>` + `--no-proxy-server` 映射。
- 源码：worktree `browser-text-fallback-issue-3480`，base `origin/main`；运行前重新构建。

## 覆盖

| 检查 | 结果 |
| --- | --- |
| 海报入口/模态/主题/跳转/附图/预填/清理 | PASS（report.json） |
| 观点失败原因透传 | 代码路径 `generateOpinionResult` 带 error；隔离环境无 bridge 时按原设计为空 |

## 限制

- 本证据环境没有给扩展注入 Dev bridge token，因此观点生成走离线降级，不证明 hub fallback 的在线结果。
- hub fallback 由 `plugins/omnimux/src/text/tool-model-fallback.test.js` 单测覆盖（2 用例通过）；合入并物化 Dev 后，用 bridge 探针在真实 Dev 上复核 `bridge.completeText` 成功返回正文。
- 设置页模型列表的实时目录由 `tests/model-selector-catalog.spec.ts` 单测 + Dev `/ext/bridge-config`/`session.modelCatalog` 探针覆盖；面板视觉由 Dev 人工复核。
