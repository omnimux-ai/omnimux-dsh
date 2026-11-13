# Spec: 修复右侧「开始」guide 列表在视口内无法滚动

- 类型: Bug 修复（UI · 官方 sidebar-right guide 滚动）
- 范围: `plugins/omnimux/src/client/sidebar-guide-scroll.js`（新增）、`sidebar-guide-scroll.test.js`（新增）、`index.js`（挂载）
- 风险: R2（单插件客户端小范围样式注入，不改官方产物）

## 1. 现象
右侧「开始 (Apps)」页 guide 入口列表超出可视高度后无法滚动，顶部/底部条目不可达。

## 2. 根因（Dev 宽 994 实机 CDP 复核）
- 可见页由**官方** `@deepseek-ai/dsh-client-ui-sidebar-right` GuideBody 渲染：`.L5GtOG_guide`（带 `data-sidebar-right-guide`）为 `display:flex; flex-direction:column; justify-content:center; min-height:100%; overflow-y:visible`，内容撑到 1276px。
- 裁切父级 `[data-sidebar-right-tab]` 为 `height:100%; overflow:hidden`，把 1276 就地裁到 954px；外层 dockkit `.paneBody{overflow:auto}` 因容器不增高不触发。
- 非 `dsh-better-sidebar`（仅贡献 4 个入口），非插件 `AppsStage`（挂载已注释下架）。

## 3. 修复
插件侧注入极小样式（`<style id="omnimux-sidebar-guide-scroll">`，`apply` 时 ensure、卸载 remove；仿 composer-compact 范式），只用官方稳定钩子：
```
[data-sidebar-right-tab] [data-sidebar-right-guide]:has([data-sidebar-right-guide-entry]) {
  overflow-y: auto !important;
  max-height: 100% !important;
  justify-content: safe center !important;
}
```
`justify-content: safe center` 必要：guide 居中列，overflow 时 unsafe 居中会钉住顶部遮住首条。

## 4. 验证
- Dev 实机只读注入同款 CSS：matchCount=1，注入后 overflow-y=auto、scrollH 1626 > clientH 954 可滚、首条 top 可达、末条 bottom ≤ 964（tabBody bottom）可达。
- `node --test src/client/sidebar-guide-scroll.test.js` 2/2 pass。
- `pnpm --filter omnimux test` 89 pass（exit 0）。
- 构建 `build-client.mjs` 通过，产物含 `data-sidebar-right-guide-entry` 规则。
- `auto-qa-gate --diff --base <merge>` L0：pass（syntax/lifecycle/security/tokens/guards 全绿）。
- `verify:stages` PASS；anti-slop 3/3；`check:boundaries` PASS；`test:ui` 无新增（新文件零命中）。

## 5. 证据
- Dev 探针测量见上；合入后物化 Dev 再复核 `#omnimux-sidebar-guide-scroll` 生效。
