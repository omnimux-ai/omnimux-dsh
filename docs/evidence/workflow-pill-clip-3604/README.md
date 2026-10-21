# 悬浮胶囊视口裁切修复 — 验收证据（Issue #3604）

## 现象（Dev CDP 实测）

画布位于底部拆分面板时，`.react-flow` 视口仅 185px 高且 `overflow: hidden`。靠近视口上沿的视频节点，「深度视频」胶囊按 `30px / zoom` 上浮（23% 缩放约 130px），整块落到视口外被裁掉：

- 胶囊 rect `[1069, 822, 82, 26]`，视口从 `y=865` 开始；
- 在胶囊矩形内每 4px 逐点 `elementFromPoint`，命中 `bottomResize / tabList / explore tabs`，**无一命中胶囊**；
- 点击后 0 个 `/video-depth` 请求、0 toast、0 异常 → 用户看到「点了没反应」。删除旧节点不会改变这一点。

## 修复

`FloatingTopPill` 布局后测量自身与最近 `.react-flow` 视口，按 `computePillClampShift`（屏幕溢出 / zoom）向下平移；以「未加偏移的原始 top」计算，避免自激；zoom / actions / 窗口尺寸变化时重算。正常位置胶囊位置不变。

## 证据

| 文件 | 证明 |
| --- | --- |
| `01-top-edge-clamped.png` | 节点贴视口上沿时，胶囊自动下移到视口内（`clampAttr=263.43`，pill top=44 ≥ 视口 top=37） |
| `browser-evidence.json` → `topEdge` | `pillInsideViewport: true`、`hitTestPill: true`；随后点击产生 **1 次 `/video-depth`**，派生节点 `completed` |
| `02-normal-position.png` / `03-normal-position.png` / `normal-position.json` | 正常位置节点：`clampAttr: null`（未下移）、`elementFromPoint` 命中胶囊（SPAN 深度视频） |
| `browser-evidence.json` → `clicked` | `calls: 1`、`derived: [{ status: "completed" }]` |

复现命令（worktree 内）：

```sh
cd plugins/omnimux-workflow && node scripts/canvas-harness.mjs --port 4935
# ego-browser 脚本把 n-video 移到视口上沿并 hover，读取胶囊 rect / clampAttr / elementFromPoint
node --test src/canvas/editor/utils/pillClamp.test.mjs tests/e2e/pill-clip-clamp.e2e.test.mjs
```

## 边界与限制

- 只处理**上沿**裁切；水平方向与角标/handle 等其它节点装饰不在范围。
- 修复后胶囊在视口上沿会向下覆盖节点头部一小段（视觉上仍悬浮，交互优先）。
- 真实 Dev App 的最终点击验证在物化后由 CDP 复核（见交付报告）。
