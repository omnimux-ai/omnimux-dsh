# 规格说明：创作画布资产抽屉按媒体类型渲染缩略图与悬停预览（Issue #3107）

## 一、背景与问题

1. 导入本地素材时，`shared/localMedia.ts` 的 `buildImportedMediaData()` 对图片、视频、音频一律写入同一个本地文件预览地址（`/omnimux-workflow/api/local-file?path=<绝对路径>`），`extractCanvasAssets.ts` 的 `collectPreviewUrl()` 也不区分媒体类型，统一产出 `previewUrl`。
2. 抽屉渲染侧有 5 处**无条件**把 `previewUrl` 交给 `<img>`：`CanvasOutlineView`（列表行 / 网格卡）、`ProjectAssetsView`（列表行 / 网格卡）、`HoverInspector`（悬停预览卡）。
3. `<img>` 无法解码 mp4 / 音频字节，浏览器渲染为「破图」占位符（实测 `naturalWidth = 0`）。同一素材在画布节点内走 `<video>`，因此画布内正常、抽屉内破图 —— 缺陷只在抽屉渲染侧。

## 二、验收标准与核心行为

1. **按媒体类型分派渲染**：新增单一归属的纯函数 `resolveThumbMode(kind, url)`，返回 `'image' | 'video' | 'none'`：
   - 显式 `kind === 'video'`（或 `kind` 缺省但 url 扩展名属于视频集合）→ `'video'`；
   - 显式 `kind === 'image'`（或 url 扩展名属于图片集合）→ `'image'`；
   - 其余（audio / doc / 空 url / 未知）→ `'none'`。
2. **视频渲染可见首帧**：`'video'` 分支渲染 `<video muted playsInline preload="metadata">`，在元数据就绪后把播放头定位到首帧，缩略图呈现真实画面而不是黑块或破图。
3. **图片行为不变**：`'image'` 分支仍渲染 `<img>`，宽高、圆角、`object-fit` 与既有样式一致。
4. **音频与未知类型回退类型图标**：`'none'` 分支沿用调用方原有的类型图标（`getNodeIcon` / `getAssetIcon` / `Sparkles` 占位），不再出现破图。
5. **五处渲染点统一**：`CanvasOutlineView` 列表与网格、`ProjectAssetsView` 列表与网格、`HoverInspector` 预览卡全部改用共享组件，删除各自重复的 `<img>` 分支。
6. **样式不新增视觉语言**：仅把既有 `img` 尺寸规则扩展到同容器的 `video`，不引入新配色、新间距或新动效。

## 三、用户操作旅程

1. 用户打开创作画布，右侧抽屉停在「创作画布」页签。
2. 用户点底部「导入文件」，导入一个本地 `.mp4` 与一个本地 `.jpg`。
3. 抽屉列表出现两行：`.jpg` 行显示图片缩略图；`.mp4` 行显示该视频的真实首帧缩略图（不再破图）。
4. 用户切到网格视图：两张卡片缩略图同上，不出现破图。
5. 用户切到「资产」页签（列表与网格）：行为一致。
6. 用户把鼠标悬停到 `.mp4` 行：悬停预览卡显示视频首帧大图与时长角标。
7. 用户导入一个本地 `.mp3`：行首显示音频类型图标，不是破图。

## 四、测试与验证计划

1. **单元测试**（`mediaThumbMode.test.mjs`）：覆盖显式 kind 优先、扩展名兜底（含带 query 的本地文件地址、大写扩展名）、audio/doc/空 url/未知扩展名回退、以及 kind 与扩展名冲突时以显式 kind 为准。
2. **隔离工作树真实浏览器验证**：用真实组件（`CanvasOutlineView` / `ProjectAssetsView` / `HoverInspector` + 真实主题样式 + 真实 `extractCanvasAssets`）在动态端口的无头 Chromium 中渲染真实媒体文件，断言视频行产出 `video` 且 `videoWidth > 0`、图片行产出 `img` 且 `naturalWidth > 0`、音频行产出类型图标，并留存 PNG 截图与结构化报告。
3. **Dev 真机只读复检**（人工验收辅助）：物化后用 CDP 只读探针在同一素材行断言不再出现 `naturalWidth === 0` 的媒体节点。

## 五、非目标

- 不做服务端 ffmpeg 抽帧、不新增 `poster` 字段、不改导入链路与存储结构。
- 不改画布节点内部的媒体渲染（该路径本来就正确）。
- 不做无关重构、不统一 5 处之外的其他缩略图渲染点。

## 六、产品基线与文档影响

- **新产品基线**：本改动只依赖随包代码与用户自己导入的本地文件，在全新用户机器上（无任何导入素材时）抽屉照常显示空态；不依赖开发机路径、本地模型服务或任何凭据。
- **文档影响**：无契约/文档需要同步更新。缺陷与修复边界记录在 Issue #3107 与本规格；不新增公开接口，不改变 `AssetItem` / `CanvasNodeItem` 数据形状。
