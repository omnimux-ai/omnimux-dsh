# 文本节点连入多模态素材自动装填与旧空绑定穿透

## Objective
解决文本节点在选有多模态模型且连入上游视频/图片等素材后，卡槽呈现空加号框但未能自动加载上游有效素材的问题。根除由于历史纯文本模式残留的空对象 `slotBindings: {}` 导致被判定为“用户故意清空”而阻断自动装填的缺陷，确保新建立的连线或上游就绪素材能顺利装填入对应卡槽。

## Acceptance
- **连入素材即时装填**：当文本节点选中支持多模态的模型（如 `gemini-3.8-flash`）且上游连入就绪的视频或图片素材时，卡槽自动装填该素材，展示缩略图与素材名。
- **尊重显式卸载意图**：若用户手动点击了卸载（X），该连线进入 `slotStandbyEdgeIds`，系统绝不强行自动填回。
- **纯文本兼容**：无媒体输入时，纯文本生成不受任何影响。
- **单测覆盖**：补充针对 `storedSlotBindings` 存在历史空对象 `{}` 时的自动装填回归用例，保证测试 100% 通过。

## Commands
- `node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/textSlotAcceptance.test.mjs`
- `git diff --check`
