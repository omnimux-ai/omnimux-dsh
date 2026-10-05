# Issue #3107 验收证据 — 创作画布资产抽屉按媒体类型渲染缩略图

## 缺陷复现（修复前，Dev 真机 CDP 只读探针）

```
row "HTufQo8a4AA6tsR.jpeg"           <img class="wf-tree-file-thumb-compact" src=".../api/local-file?path=...jpeg"> naturalWidth=900 → 正常
row "music-colorful-...slide-1.mp4"  <img class="wf-tree-file-thumb-compact" src=".../api/local-file?path=...mp4">  naturalWidth=0   → 破图
同一 mp4 的画布节点: <video class="wf-media-preview__media--video"> videoWidth=720 videoHeight=1280 readyState=4 → 画布内正常
```

结论：缺陷只在抽屉渲染侧——导入的本地视频/音频与图片共用一个 `previewUrl`，渲染侧无条件交给 `<img>`。

## 修复后（隔离工作树真实浏览器验证）

- 运行器：`.workbuddy/qa/asset-thumb/run.mjs`（任务内临时验收脚本，随工作树清理；动态端口 + 无头 Google Chrome + CDP + 自清理）
- 被测对象：真实组件 `CanvasOutlineView` / `ProjectAssetsView` / `HoverInspector` + 真实 `extractCanvasAssets` / `buildImportedMediaData` + 真实主题样式 + 真实媒体字节（真实 `local-file` 路由，含 Range 206）
- 结果：**9/9 断言 PASS**

| 断言 | 结果 |
| --- | --- |
| 修复前对照：视频地址落进 `<img>` → `naturalWidth = 0` | PASS（缺陷复现） |
| 创作画布列表·视频行：`<video>` 首帧（videoWidth 320，readyState 4） | PASS |
| 创作画布列表·图片行：仍 `<img>` 且 `naturalWidth 320` | PASS |
| 创作画布列表·音频行：回退类型图标（无 img/video） | PASS |
| 创作画布网格·视频卡：`<video>` 首帧 | PASS |
| 资产页签列表：视频行 `<video>` 首帧 | PASS |
| 悬停预览卡：视频素材 `<video>` 首帧 | PASS |
| 修复后三处均无破图媒体节点（brokenMediaCount 0/0/0） | PASS |
| 真实 PNG 截图留存且可解码 | PASS |

- 截图：`asset-thumb-verified.png`（1500×1013，同屏并排「修复前对照 / 列表 / 网格 / 资产页签 / 悬停预览卡」）
- 结构化报告：`report.json`

## 自动化检查

| 检查 | 结果 |
| --- | --- |
| `node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"`（omnimux-workflow） | 2390 tests / 2390 pass / 0 fail，exit 0 |
| `node --test src/canvas/editor/components/assets/mediaThumbMode.test.mjs` | 17 tests / 17 pass |
| `node --test src/canvas/editor/components/assets/mediaThumbRendering.e2e.test.mjs` | 6 tests / 6 pass |
| `pnpm verify:stages` | PASS（14 Stage 组件、8 个侧栏注册目标） |
| `node --test scripts/verify-anti-slop.test.mjs` | 3 tests / 3 pass |
| `git diff --check` | clean |

## E2E 回归门禁的反向验证

`mediaThumbRendering.e2e.test.mjs` 的「裸 `<img>` 承接预览地址」断言在修复前必须变红。以 `git show origin/main:<文件>` 取修复前三份视图源码，用同一判定式复跑：

```
PRE-FIX HIT CanvasOutlineView.tsx  -> <img src={node.previewUrl}
PRE-FIX HIT ProjectAssetsView.tsx  -> <img src={item.previewUrl}
PRE-FIX HIT HoverInspector.tsx     -> <img src={item.previewUrl}
pre-fix violating render sites: 3 => 门禁在修复前必然失败（当前为 0）
```

跳过项与原因：`pnpm verify:product-baseline` 未跑——本改动不触及产品路径、模型路由或本地状态；`pnpm test:gates` 未跑——未修改 workflow 契约或门禁脚本。

