# 灵感社区吸附栏容器高度自适应与锁定 · 实测证据

- 任务关联：Issue #1977（灵感社区向上滚动吸附栏固定失效）
- 对应规格：`specs/inspiration-sticky-flex-fix.spec.md`
- 对应分支：`fix/inspiration-sticky-flex-fix-issue-1977`
- 关联契约：`docs/contracts/first-level-page-layout.md` §二·补

## 1. 现场复现与根因定位

在 Dev 环境实测发现：灵感社区整页向上滚动时，吸附栏在滚到一定距离后无法继续固定，直接被推移出屏幕上方。

通过实时检查 DOM 链与 CSS 计算属性，锁定根因：
- 外层滚动容器 `.omnimux-inspiration-stage` 为 `display: flex; flex-direction: column; height: 100%`。
- 其子容器 `.omnimux-inspiration-stage-body` 及孙容器 `.omnimux-inspiration-root` 为 Flex 子项，默认具有 `flex-shrink: 1`。在未声明 `flex: none` 时，两个容器高度被严格限制在视口净高度（882px）。
- 吸附栏 `.omx-stage-sticky` 位于 `.omnimux-inspiration-root` 内部。按照 W3C CSS Sticky 规范，吸附元素受限于包含块（Containing Block）边界。当滚动超过 882px 后，包含块触底，吸附栏被强行带离视口。

## 2. 修复代码

在 `plugins/omnimux-inspiration/src/client/styles.js` 中添加 `flex: none;`：
```css
.omnimux-inspiration-stage-body {
  flex: none;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.omnimux-inspiration-root {
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  padding: 0 20px 24px;
  gap: 12px;
  background: var(--dsw-alias-bg-primary, var(--dsw-bg, #111215));
  color: var(--dsw-alias-label-primary, inherit);
  font-family: inherit;
}
```

## 3. Chrome 内核实测结果

经过真实 Chrome CDP 在滚动至 1500px 深度的实测（`measurements.json`）：
- `scrollTop`: 1500px
- `bodyHeight`: 3641px（完整展开，不再被压扁在 882px）
- `rootHeight`: 3641px
- `stickyTop`: 0px
- `diff`: 0px
- `stuck`: true（全程牢牢吸附在视口顶部）
- 截图证据已持久化：`docs/evidence/inspiration-sticky-flex-fix/scrolled-1500px.png`
