# 悬浮胶囊视口裁切修复（Issue #3604）

## 现象

Dev 画布处于底部拆分面板（`.react-flow` 视口仅 185px 高、`overflow: hidden`）时，靠近视口上沿的视频节点，「深度视频」胶囊按 `30px / zoom` 上浮（23% 缩放约 130px），整块落到视口外被裁掉。CDP 在胶囊矩形内逐点 `elementFromPoint` 命中 `bottomResize / tabList / explore tabs`，无一命中胶囊；点击 0 请求、0 toast、0 异常，表现为「点击无响应」。

## 修复

- 新增纯函数 `computePillClampShift({ pillTop, boundaryTop, zoom, margin })`：胶囊顶部超出视口上沿时返回需下移的**本地像素**（屏幕溢出量 / zoom）。
- `FloatingTopPill` 布局后测量自身与最近 `.react-flow` 视口，按上式下移；zoom / actions / visible / 窗口尺寸变化时重算。
- 以「未加偏移的原始 top」计算，避免「测量→偏移→再测量为 0」的自激振荡。
- 正常位置胶囊不变；水平方向与其它节点装饰不在范围。

## 验收

- [ ] 单测：未溢出 → 0；溢出 → 溢出量/zoom；非法 zoom 兜底；已下移后再算幂等。
- [ ] 源码契约：组件测量 `.react-flow` 边界并应用 clamp；测量基于未偏移 top。
- [ ] 浏览器（画布 harness）：把节点放到视口上方并选中以显示胶囊 → 胶囊顶部落入视口、`elementFromPoint` 命中胶囊、点击触发 `/video-depth`。
- [ ] workflow 全量/tsc/stage/anti-slop 通过。

## 新用户基线

纯画布定位修复，不引入本机状态或服务依赖；任何缩放/面板高度下行为一致。

## 假设

- 胶囊被裁的判定边界是最近的 `.react-flow` 视口（React Flow 容器 `overflow: hidden`）；其它祖先不裁切。
- 下移量与 zoom 线性相关：`本地 top` 在 React Flow 视口缩放后作用于屏幕，因此 `本地偏移 = 屏幕溢出 / zoom`。

## 证伪方式

- 若 harness 中节点位于视口上方时，胶囊顶部仍未落入视口或 `elementFromPoint` 不命中胶囊，说明边界测量/偏移换算错误，需打印 rect 与 boundary 修正。
- 若正常位置的胶囊出现抖动或位置上移，说明测量包含了已加偏移，需改为基于未偏移 top 计算并验证幂等。
- 若 Dev CDP 点击后仍无 `/video-depth` 请求，说明点击链路另有问题，回到命中测试与事件捕获排查。

## 非目标

- 画布拆分面板/标签栏布局本身；水平方向裁切；角标、连线 handle 等其它节点装饰的裁切。
