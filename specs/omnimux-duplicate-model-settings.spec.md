# 组合包详情页模型设置卡去重

## Objective

官方插件页的 `omnimux` 组合包详情页只渲染一份模型设置卡（模型目录同步、模型服务、创作画布模型）；滚动到组件列表与来源信息之后不再出现第二份相同内容。其他 `omnimux-*` 组合包详情页继续保留一份共享模型设置区。

## User journey

1. 用户打开「更多 → 插件」，在组合包列表中点击 `omnimux`。
2. 组合包详情页标题与描述下方出现唯一一份模型设置卡，位置在描述与「包含的组件」之间。
3. 用户继续向下滚动，经过「包含的组件」和「来源信息」后，页面不再重复同一份设置卡。
4. 用户返回插件列表，打开任一其他 `omnimux-*` 组合包详情页，仍能看到一份共享模型设置区，且不会出现两套相同的默认模型字段。

## Root cause

`plugins/omnimux/src/client/index.js` 在 `configForms` 服务可用时同时注册：

- `plugins.bundle.config`（key `omnimux`）——官方组合包详情页在描述与行之间渲染的配置区；
- `plugins.detail.section`（`omnimuxBundleSubject`）——官方组合包详情页在组件列表和来源信息之后渲染的详情扩展区，当前谓词也匹配 `pkg.name === 'omnimux'`。

官方 `PackageDetail` 在同一页面同时渲染这两个 slot，因此 `ModelsSettingsCard` 被挂载两次。该回归由 #4027 引入。

## Scope

- 调整 `plugins/omnimux/src/client/index.js` 的 `plugins.detail.section` 谓词：仅在 `omnimux-*` 兄弟组合包页面渲染共享模型设置区，排除主 `omnimux` 组合包（由 `plugins.bundle.config` 负责）。
- 增加可单测的谓词模块 `plugins/omnimux/src/client/model-settings-section.js` 及对应单元测试。
- 扩展 `plugins/omnimux/tests/e2e/model-settings.journey.mjs`：真实打开 `omnimux` 组合包详情页，断言模型设置区数量为 1，并确认 `plugins.detail.section` 下没有第二份。
- 不改变设置字段、模型目录或官方插件管理页行为。

## Acceptance cases

1. 单测：`isSharedModelSettingsDetailSubject({ kind: 'bundle', pkg: { name: 'omnimux' } }) === false`。
2. 单测：`omnimux-workflow` 等兄弟组合包返回 `true`；非 OmniMux 包、row/item subject 返回 `false`。
3. 真实应用旅程：`omnimux` 组合包详情页 `[data-section="catalog-sync"]` 恰好 1 个，`.omnimux-settings-sections` 恰好 1 个，且 `[data-slot="plugins.detail.section"] .omnimux-settings-sections` 为 0 个。
4. 真实应用旅程：`plugins.bundle.config` 内仍能看到完整模型设置卡（同步状态、模型服务、创作画布模型标题均可见）。

## 假设

官方插件管理页当前版本（DSH 0.2.1-rc.3）会同时渲染 `plugins.bundle.config` 与 `plugins.detail.section` 两个子 slot；从 Dev 实测 DOM 与官方 `dsh-client-ui-plugin-manager` README/源码一致，组合包详情页在描述与行之间渲染前者、在组件列表与来源信息之后渲染后者。主 `omnimux` 组合包只需要一个配置入口，交给 `plugins.bundle.config` 承载不会丢失任何字段。

## 证伪方式

在隔离工作树的真实应用中打开 `omnimux` 组合包详情页：若 `.omnimux-settings-sections` 仍出现两份、`[data-section="catalog-sync"]` 计数大于 1，或滚动到来源信息后还能看到第二份模型设置卡，则本次修复不成立。反之，若修复后兄弟 `omnimux-*` 组合包详情页不再出现共享模型设置区，或 `plugins.bundle.config` 内设置卡消失，也判定为失败。
