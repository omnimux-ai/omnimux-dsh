# 图像生成模型胶囊只显示模型名称

## 背景

图像生成（omnimux-viewer）底部工具条的模型触发按钮 `#modelCascadeTriggerBtn` 当前同时渲染模型名与渠道分组名：

- 模型列：`Muse Image`
- 渠道列：`畅享版（自建账号池 / 随心用）`

两者拼在同一个胶囊里，长分组名把按钮撑得很宽，也把「模型」和「渠道策略」两个层级混在一处。用户选择模型后只需要确认模型本身，渠道分组属于第二级决策，打开级联菜单即可查看。

## 目标

1. 模型触发按钮只显示模型名称（如 `Muse Image`），不显示渠道分组名。
2. `title` / `aria-label` 同步只包含模型名称，不把分组名留在悬浮提示或读屏文案里。
3. 级联菜单第三列「选择版本」仍完整展示渠道分组名，选择和写入语义不变。

## 非目标

- 不修改模型目录、渠道分组数据、价格或路由字段。
- 不修改级联菜单的三列结构、选择逻辑和提交载荷。
- 不修改 `showModelSummary` 在快捷方式中的回执（本任务只处理图像生成底部模型按钮）。

## 研究依据

- `plugins/omnimux-viewer/src/media-viewer/MediaConfigControls.jsx`：`MediaModelCascade` 触发器同时渲染 `.omx-model-name-display` 与 `.omx-channel-name-display`；`title` / `aria-label` 也拼接 `channel.name`。
- 同文件第三列 `.omx-version-title` 已独立展示「选择版本」与每个渠道名，渠道信息不会丢失。
- `plugins/omnimux-viewer/src/media-viewer/media-config-controls.e2e.test.js`：已有针对 `MediaConfigControls.jsx` DOM 结构的源码契约测试，可在同一文件补充回归断言。

## 验收标准

- 渲染 `MediaConfigControls` 后，`#modelCascadeTriggerBtn` 的可见文本等于所选模型名称，不包含渠道分组名。
- `#modelCascadeTriggerBtn` 的 `title` 与 `aria-label` 不包含渠道分组名。
- 打开级联菜单后，第三列 `.omx-version-row` 仍显示并可选全部渠道分组。
- 离线组件测试通过；演示页覆盖修改前后对比、亮/暗主题与窄屏。

## 实施边界

只改 `plugins/omnimux-viewer/src/media-viewer/MediaConfigControls.jsx`、对应的 `media-config-controls.e2e.test.js` / `gpt-image-gateway-3071.e2e.test.js`、演示页 `docs/evidence/viewer-model-capsule-id-only-demo.html` 和对应的本地截图；不触碰模型目录、Hub、网关注入或渠道路由。

## 验证

- `node --test plugins/omnimux-viewer/src/media-viewer/media-config-controls.e2e.test.js`
- `node --test plugins/omnimux-viewer/src/media-viewer/gpt-image-gateway-3071.e2e.test.js`
- `node scripts/build.mjs`（plugins/omnimux-viewer）
- 静态演示页浏览器检查（亮/暗、窄屏）；本轮不发起真实模型请求。
