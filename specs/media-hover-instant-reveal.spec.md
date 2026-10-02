---
issue: 2963
status: approved-for-implementation
date: 2026-10-02
---

# 素材悬浮胶囊消除显示前人为等待（对标 YouMind 即时显示）

## 1. 用户现场与竞品差距

用户对比 YouMind 浏览器插件实测反馈：

> “它在检测到图片后会显示按钮图标，发现它的反应很快，只要鼠标放到素材卡片上，它立马就显示了，比我们浏览器插件的那个按钮显示得更快。”

竞品机制（拆包还原，YouMind 0.3.0.38）：MutationObserver 预注册所有 ≥100px img 的 `mouseenter` 直挂监听，指针进入图片的瞬间即渲染按钮，**无任何防抖/命中延迟**。

## 2. 根因

`MediaOverlay.handleCandidate` 在侦测层已确认候选元素之后，仍把显示动作放进 `enterDebounce = 150ms` 的 `setTimeout`：`pointermove` → `elementFromPoint` 命中 → 资格判定全链 → **等 150ms** → `showNow` 渲染。这 150ms 是纯人为等待，不是检测耗时，却直接决定体感快慢。

配套中间态 `phase: 'pending'` 只为这段防抖存在；`onPointerMoveTarget` 中 pending 分支、enterTimer/clearEnterTimer 管道、`TIMING.enterDebounce` 常量均随之失去存在意义。

## 3. 修复设计（本规格的硬契约）

- **候选命中即渲染**：`handleCandidate` 在同一事件回调内直接调用 `showNow(candidate)`，第一阶段品牌圆钮立即上屏；不再经过 `enterTimer`。
- **移除 pending 相位**：`OverlayPhase` 删除 `'pending'`；overlay 内 pending 分支、enterTimer 字段、`clearEnterTimer`、`TIMING.enterDebounce` 一并移除。
- **离开侧防抖完整保留**：`leaveGrace` / `collapseGrace` / `idleDismiss` 及卡片区域判定逻辑不变——移出卡片仍走宽限期，防闪烁由离开侧承担。
- **安全边界不变**：面板开关关闭时不挂监听；指针离开视口、元素移除、窗口失焦仍立即隐藏；胶囊定位/避让与三个动作语义不变。
- **侦测层不变**：本规格不改 `MediaDetector` 的命中与资格判定（elementFromPoint + isPostOrWorkMedia），只改 overlay 拿到候选后的等待行为。

## 4. 验收标准

1. 鼠标移入合格素材图/视频，胶囊圆钮在下一帧内可见（无 150ms 计时器路径）。
2. 指针在卡片区域内移动、滑上胶囊、回到媒体，胶囊保持可见不闪烁。
3. 指针离开卡片区域，经 leaveGrace 后隐藏；再次移入立即重现。
4. 指针快速扫过素材（不停留）允许短暂出现圆点——与 YouMind 行为对齐，由离开侧宽限期收回。
5. 全部既有 media-hover / surfaces 相关单测适配新时序并通过。

## 5. 测试策略

- 更新 `tests/media-hover-card-region.spec.ts`、`tests/media-overlay-integration.spec.ts` 中依赖 `enterDebounce` 的用例为即时显示断言。
- 「pending 阶段移出取消」用例改写为「立即显示后经宽限期隐藏」语义。
- 新增断言：`handleCandidate` 后**不推进任何计时器**胶囊即 `is-visible`。

## 5.5 尺寸对齐 YouMind（用户 2026-10-02 追加指令：「对齐 youmind 的图标大小和工具栏尺寸」）

对标拆包实测量化几何（YouMind 0.3.0.38 图片悬浮按钮）：

| 维度 | YouMind | 本插件（改后） |
| --- | --- | --- |
| 收起态（图标圆钮） | 24×24px 圆形、图标占满 | 24×24px 圆形、品牌幽灵 18px（ink 约 71%） |
| 展开态（工具栏） | 128×24px、radius 999、250ms ease-out-expo | 128×24px、radius 999、openMs 250 |
| 内部图标按钮 | 24×24 hitbox、14px 图形 | 24×24 hitbox、14px 图形 |
| 排布 | 3 按钮 + gap-4 + 左右各 24 内边距 | 3×24 + 2×4 + 2×24 = 128px |
| 停靠 | 图片左下内偏 14px | inset 8 → 14 |

- `CAPSULE_SPEC`：`width 64→128`、`paddingX 4→24`、`inset 8→14`、`iconSize 16→24`、`iconGlyphSize 11→14`、`brandSize 18→24`、`brandIconSize 13→18`、`borderRadius 12→999`、`openMs 220→250`。
- `styles.css`：同步硬编码像素值（`.is-expanded` width 128、icon 24px、svg 14px、brand 24px/svg 18px、radius 999px、width/height transition 250ms），并修正过期的 32px/92px 注释。
- 测试 `media-tooltip.spec.ts` 几何契约同步更新为新数值。
- 不引入额外阶段、不改变动作语义；视觉只动尺寸与停靠，配色/材质（磨砂深色 + 白色描边光晕）保持既有规范。

## 6. 边界

- 总是：只动 overlay 显示时序与胶囊几何尺寸；侦测层、动作层逻辑不动。
- 先问：任何改变胶囊配色/材质/动效曲线的提议。
- 绝不做：为对齐竞品削弱 postOrWork 分类精度；引入站点黑名单机制。

## 7. 新用户基线

本功能依赖面板内媒体悬停开关（默认开），无任何账号/渠道/本机服务依赖；开关关闭时不挂任何监听，页面零成本。
