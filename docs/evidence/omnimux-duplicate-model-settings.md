# omnimux 组合包详情页模型设置卡去重（Issue #4041）

## Before（Dev 0.1.7，修复前）

`omnimux` 组合包详情页存在两份完全相同的模型设置区，各自来自官方插件管理页的两个子 slot：

| 序号 | slot | 顶部坐标（Dev CDP，页面滚动容器） | 高度 |
| --- | --- | --- | --- |
| 1 | `plugins.bundle.config` | 263px | 3037px |
| 2 | `plugins.detail.section` | 3612px | 3037px |

证据：`before-duplicate-top.png`（首屏第一份）、`before-duplicate-second-copy.png`（滚动到 3600px 后看到的第二份）。

## After（隔离 worktree 真实应用旅程）

`node scripts/worktree-app-qa.mjs --journey plugins/omnimux/tests/e2e/model-settings.journey.mjs` 通过 23 项断言，其中：

- `journey:bundle-model-settings-single`：`.omnimux-settings-sections` 与 `[data-section="catalog-sync"]` 均恰好 1 份；
- `journey:bundle-config-owns-model-settings`：`plugins.bundle.config` 下 1 份，`plugins.detail.section` 下 0 份。

证据：`after-bundle-single-card.png`（旅程结束时的 `omnimux` 组合包详情页）。
