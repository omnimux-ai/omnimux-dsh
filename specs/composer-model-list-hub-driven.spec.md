# 输入框文本模型清单 · 中枢驱动 + 用户可配（Issue #2258）

## 目标

OmniMux 桌面端会话输入框的文本模型清单，来源从「出厂静态清单」改为执行中枢「已上架 + 可用」文本模型；用户可在设置里配置哪些模型露脸；中枢下架即自动不可见。**官方模型按钮 / 面板的 UI 与交互零改动**。

## 产品基线

- 新用户机器（刚安装 + 登录）：无开发机私有服务、无私有模型别名、无本地 compat 代理。清单来自本机 Host 中枢已加载契约（`GET /omnimux/model-catalog` 的 `text` 桶）。
- 中枢未就绪：保留上一次有效清单；首次启动且中枢始终不可用时，清单为空且不写入任何开发机私有内容——**不得回退到任何开发机私有清单**。
- 出厂 `cordis.patch.yml` 仍是字段真源与出厂基线；移除 settings 用户层即回到出厂状态。

## 成功标准

1. 写入 `llm-pi-ai` 的 `providers.omnimux.models` 的 id 集合 ⊆ 中枢 `text` 桶 id 集合（含未上架 id 即失败）。
2. 中枢下架某模型后，下一次同步后清单不再含该 id。
3. 用户取消勾选后，清单不再含该 id；中枢下架的模型**不出现在可见性列表且不可勾选**。
4. 中枢不可用 / 写入被拒 / 目录为空时，保留上一次有效清单；**任何路径不得把清单写成空**。
5. 目标清单与当前清单一致时不写入（幂等，避免写抖动）。
6. 官方 `conversation.input.model` 席位的 DOM 与交互零改动。
7. 单测锁定：合成纯函数（含中枢新增 id、中枢下架、用户减法、中枢为空、隐藏项引用失效 id）、幂等比对、失败闭门。

## 范围

- 改：
  - `plugins/omnimux/src/catalog/composer-list.js`（新增，合成纯函数）
  - `plugins/omnimux/src/catalog/composer-list.test.js`（新增）
  - `plugins/omnimux/src/catalog/composer-sync.js`（新增，Host 写入器）
  - `plugins/omnimux/src/catalog/composer-sync.test.js`（新增）
  - `plugins/omnimux/src/settings/schema.js`（可见性字段）
  - `plugins/omnimux/src/client/ModelsSettingsCard.jsx`（可见性开关）
  - `plugins/omnimux/src/host/apply.js`（触发生命周期）
  - `docs/contracts/model-list-ownership.md`（所有权描述改写）
- 不改：官方模型按钮 / 面板、`conversation.input.model` 席位、中枢 listed 门禁、视频 / 图片 / 音频模型清单、DSH harness 源码。

## 边界

- 总是：清单真源 = 中枢 `text` 桶；写入前幂等比对；失败闭门保留上次值；中枢可见 > 用户配置（用户只能做减法）。
- 先问：改可见性配置的存储位置或默认值语义、改同步触发时机、扩大写入到其他 provider 或模态。
- 绝不：写入未上架模型；把清单写成空；修改官方 UI 或 DSH harness 源码；让用户把中枢未上架模型加进清单。
