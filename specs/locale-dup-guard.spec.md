# Spec: locale namespace 重复注册防回归门禁（Issue #2970）

## 背景

QA 环境曾报 `Failed to load plugins — locale namespace "omnimux-session-guide" already has locale "zh"`。
调查结论：主干源码无 bug——#2954 已把 `omnimux-session-guide` 注册迁入 `plugins/omnimux-inspiration` 并从 hub 删除，全仓仅一处注册。崩溃根因是任务工作树里残留的 **#2954 合入之前构建的陈旧 hub 打包产物**（`plugins/omnimux/lib/client.js`，lib/ 不受 Git 跟踪、rebase 不重建），旧注册与新 inspiration 注册并存 → cordis locale 注册器对同一 namespace+locale 二次注册抛错，整个插件加载面崩溃。

真实缺口：`scripts/verify-plugin-load.mjs` 逐包隔离检查，每个包拿到的 locale 服务桩无条件接受 register——**同侧运行时（host 或 client）同一 namespace 被多处注册**这个崩溃类别没有任何门禁拦截。这类回归会在「同一 namespace 被迁出/复制到两个插件」或「陈旧构建产物混入加载集」时直接炸掉整个产品加载页。

## 验收标准（AC）

- AC-1：`verify-plugin-load.mjs` 在全部包检查完后聚合 `locale.register(ns, dict)` 记录；同侧（host / client）同一 namespace 出现 ≥2 次注册时，所有涉及的包追加失败行并导致退出码 1。同 namespace 被同一包重复注册同样失败（cordis 同样抛错）。
- AC-2：host 侧与 client 侧分别统计——hub host apply 注册 `X` 与某插件 client apply 注册 `X` 不冲突（两个运行时各有 locale 服务）。
- AC-3：现有合法用法零误报：`omnimux-video` 的 `if/else` 互斥双调用（运行时只执行一次）不计重复。
- AC-4：fixture 自测：同包双注册 fixture 失败；两包同 ns 跨包 fixture 经共享 registry 断言两组包名都出现在失败列表。
- AC-5：`--json` 报告附带 `duplicates` 段（side、namespace、registrants、locales）。

## 非目标

- 不改 cordis locale 服务本身；不改任何产品插件源码。
- 不做 namespace 命名规范 lint（不在本 issue 范围）。

## 关键实现点

- `stubFor('locale', ctx)` 的 `register(ns, dict)` 把 `{label, locales}` 追加到 `localeRegistry`（按 side 分 Map）。
- `checkPlugin` 接受可选 `localeRegistry`；`checkPackage` 接受 `opts.localeRegistry` 向 host/client 两侧透传。
- `main()` 建共享 registry，循环后按 `{side}:{ns}` 聚合 `entries.length > 1` 的组，为涉及的每个包追加失败并计入 `failed`。
- 导出 `collectLocaleDuplicates(registry)` 纯函数供 main 与测试共用。
