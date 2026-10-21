# 视频节点工具栏胶囊溢出修复 — 验收证据（Issue #3563）

## 现象（修复前）

4 个主胶囊（内容拆解 / 分镜表 / 提取音频 / 深度视频）后，圆角容器边框在「深度视频」处被截断，分割线与「⋯ 更多」溢出到容器外。

根因：`pillMaxWidthForNode(350)` 只给到 280；`partitionToolbarActions` 规定主区不折；可见组又被 inline `maxWidth: 280px` 夹住（CSS `width: max-content` + 子项 `flex-shrink: 0`），于是盒子被裁、内容溢出。

## 修复后

| 文件 | 证明什么 |
| --- | --- |
| `01-video-350.png` | 350px 视频节点：4 个主胶囊 + 分割线 + 次区图标全部在同一个圆角容器内，无截断、无悬空 |
| `02-video-200.png` | 200px 窄节点：容器完整包住可见内容；「提取音频/深度视频/聊天」折进「⋯ 更多」 |
| `browser-evidence.json` | 结构化矩形断言：每个按钮 `left/right` 都在容器矩形内（`allInside: true`）；350 节点容器宽 362、200 节点容器宽 227；可见组不再带 inline max-width |

## 命令

```sh
# 画布 harness（真实 CanvasEditor + mock catalog）
cd plugins/omnimux-workflow && node scripts/canvas-harness.mjs --port 4932

# 真实浏览器（ego-browser）读取胶囊容器与每个按钮的 getBoundingClientRect
# 单测
node --test src/canvas/editor/utils/nodeToolbarLogic.test.mjs
node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"
```

## 边界与限制

- 350 节点下 4 个主胶囊可见，次区聊天图标（icon-only，约 29px）也放得下，因此不再渲染「更多」；这是分区算法按实际宽度得出的结果，不是隐藏了「更多」。
- 窄节点折叠顺序为从右到左（深度视频最先进入「更多」），保证至少 1 个主胶囊可见。
- 仅调整宽度预算与分区/容器策略，未改任何胶囊行为、节点默认宽度与其他节点类型的信息架构。
