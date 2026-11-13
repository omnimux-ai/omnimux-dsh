# 4113 — 跟进 #4109/#4111 复核：i18n 收尾与守卫打磨

## 背景

- #4109（生成模式英文 id）已合，但评审指出三处同源/相邻缺口：图片摘要没接 locale、
  ModelCascadeMenu 文案硬编码中文、`operation-label` 读盘失败会缓存空表不自愈。
- #4111（每轮对话失败）post-merge 复核指出守卫两处可打磨：docstring 过度宣称「拼变量也拦」；
  `missing-kind` 启发式对非消息对象误报；同一 source 块重复计数。

## 验收

- F1：英文界面图片节点「生成方式」与摘要条显示英文（`formatImageSummary(params, locale)`，
  `ImageTriggerBar` / `ImageParamPopover` 传 `getLocale()`）；中文界面不变。
- F2：模型菜单「暂不支持 / 未验证」徽标与 title 走 `t('modelMenu.*')`，en 界面不混中文，zh 不变。
- F3：`operation-label` 读盘失败不缓存空表，registry 恢复后同进程能重新解析。
- 守卫：docstring 准确（拦 kind 缺失 / 为空 / 'plugin' 字面量三类，不宣称拦变量间接值）；
  `missing-kind` 要求 `source:{}` 体内同时有 `plugin:`（4 类非消息对象不误报、2 个真消息源仍报）；
  输出按 source 块去重（每块 1 条，不同块各 1 条）；spread 写法不误判。
- 端到端：canvas harness 真实浏览器证据覆盖 en 图片模式名、en 菜单徽标、zh 回归。

## 旧标准变更

- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/operationUi.dom.test.mjs` :: `#4103 AC7 目录行置灰使用「暂不支持」而不是「不可执行」`
  - 原断言：直接匹配 `ModelCascadeMenu.tsx` 源码里的中文字面量 `暂不支持` 与 `本地暂无该模型的可执行适配`。
  - 必须改的理由：本任务把这两处文案搬进 i18n 字典（`t('modelMenu.unsupportedBadge')` /
    `t('modelMenu.unsupportedTitle')`），源码里不再有中文字面量；继续匹配字面量等于禁止本地化，
    断言必须改为「接线到 i18n + 字典条目存在」。
  - 新期望证据：断言菜单源码出现 `t('modelMenu.unsupportedBadge')`、`t('modelMenu.unsupportedTitle')`，
    且 `dict.zh.ts` 存在 `'modelMenu.unsupportedBadge': '暂不支持'` 与对应 title 文案；
    英文界面由 `modelCascadeMenu.test.mjs` 的 en 字典校验与浏览器证据覆盖。实跑该文件 21/21。
