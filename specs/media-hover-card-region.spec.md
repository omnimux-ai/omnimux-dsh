---
issue: 2058
status: approved-for-implementation
date: 2026-09-16
---

# 素材卡片悬停锁定规格说明（视频播放态悬浮按钮消除闪烁）

## 1. 用户现场与缺陷

用户实测反馈（附视频播放器截图，箭头指向视频左下角胶囊圆钮）：

> “浏览器插件中的这个视频/图片悬浮按钮，在视频播放模式下，鼠标在视频卡片内移动，它会出现一会儿可见、一会儿不可见的问题……我认为应该优化：鼠标只要在素材卡片内悬停都始终显示，只有鼠标移除卡片外才隐藏，这样避免那个按钮抖动。”

## 2. 根因

现有实现里**不存在“素材卡片”这一概念**：可见性由多条各自为政的启发式决定，任何一条不满足就**零宽限期**立即隐藏。

1. **主因 · 侦测层把“指针压到播放器控件上”上报为 `detach`**
   `MediaDetector.handlePointerMove` 在指针下方解析不到媒体元素时，清空候选并上报 `onInvalidate('detach')`。而 `resolvePointerTarget` 对 control-sized 顶层元素**直接 return null**（`video-anchor.ts:isControlSizedElement`，匹配 `button` / `a[href]` / `[role="slider"]` / `[role="menuitem"]` 等）。因此指针一旦压到播放器自带的播放键、静音、进度条、字幕、设置按钮上，就被判为“媒体消失”；overlay 的 `handleInvalidate('detach')` → `hideNow(true)` 立即隐藏，指针挪回画面又按 `enterDebounce(150ms)` 重新浮现 → 用户看到反复闪烁。
2. **次因 · overlay 内多条隐藏路径同样无宽限期**：`onPointerOut` 在 `relatedTarget === null` 时直接 `hideNow(true)`（播放器控制栏自动显隐、宿主框架重渲染换掉指针下节点时都会触发）；`onPointerMoveTarget` 在 `distanceToAnchor > 24` 时立即隐藏（即锚框外 12px / 视频底部 48px 之外即判出局）。
3. **冗余启发式叠加**：`isPointNearAnchorOrCapsule` 内 12 / 8 / 48 px 三套 padding、`onPointerOut` 内 16 / 56px 矩形包含判定、`distanceToAnchor` 的 24px 阈值，各自近似同一件事，且都不等于“卡片”。

## 3. 修复设计（本规格的硬契约）

### 3.1 唯一权威：卡片区域

新增单一判定源（建议落在 `media-hover/` 内新模块，纯函数 + 缓存）：

```
resolveCardRegion(media, kind, rect) -> AnchorRect
  base = media 矩形外扩 HOVER_REGION.pad (12px)
  if kind === 'video':
      card = nearestCardAncestor(media, rect)     // 受限向上游走
      if card: base = union(base, cardRect)
  if capsule.visible: base = union(base, 胶囊矩形外扩 8px)
```

`nearestCardAncestor`：从媒体元素 `parentElement` 向上游走（≤6 层，可跨一层 shadow 根），逐层接受**第一个**满足下列全部条件的祖先，遇到第一个不满足即停止：

- 不是 `html` / `body` / `head`；
- 其矩形在容差内包含媒体矩形（每边 ≤32px）；
- 其宽 ≤ 媒体宽 × 1.5 + 64px 且高 ≤ 媒体高 × 1.5 + 64px（防止把整页滚动容器、全屏滑片容器当成卡片）。

判定结果按元素 + 矩形尺寸缓存（`WeakMap`），矩形变化即失效。

### 3.2 收敛规则

- **指针移动驱动**的隐藏动作（`onPointerOut` / `detach` 失效 / 距离超限 / idle）统一改为：**先判定 `isPointerInsideCard(lastPointerX, lastPointerY)`；在卡片内一律不隐藏**，仅在卡片外才走 `leaveGrace` 宽限期隐藏。
- 侦测层区分“媒体元素已从文档移除”（真 `detach`）与“指针不再压在媒体元素上但可能仍在卡片内”（新增失效原因，如 `leftmedia`）：前者维持立即隐藏，后者交由 overlay 的卡片区域判定接管，**不销毁胶囊**。
- `onPointerOut` 的 `relatedTarget === null`：不再立即隐藏；一律经卡片区域判定 + 宽限期。
- 隐藏路径不得再有“立即隐藏”的分支差异：卡片外 → 宽限期 → 隐藏。
- 真实销毁路径（面板开关关闭、`dispose`、窗口失焦、指针离开浏览器视口、媒体元素真被移除、视口外）保持立即隐藏，不得退化为“永不隐藏”。
- 卡片内静止（idle）不得隐藏胶囊；阶段二可收起回阶段一圆钮。

### 3.3 不变量

- 胶囊定位/避让（`resolveCapsuleAnchor`、`VideoAnchorProbe`）与三个动作语义不变。
- 侦测层仍遵守“悬停零 runtime 消息”，不新增权限与注入面。

## 4. 验收标准

- **AC-1**：视频（含播放中）指针在卡片内任意位置连续移动 ≥3s，胶囊 `is-visible` 全程保持，隐藏次数 = 0。覆盖：画面区、底部控制栏、进度条 `[role="slider"]`、播放/静音/设置按钮、卡片留白区。
- **AC-2**：指针移出卡片区域后 ≤300ms 胶囊隐藏；重新移入卡片后 ≤350ms 内重新出现。
- **AC-3**：指针在卡片内静止 5s，胶囊不消失。
- **AC-4**：控制栏自动显隐（指针下节点被增删、`relatedTarget === null`）不触发隐藏。
- **AC-5**：窗口失焦 / 指针离开视口 / 媒体元素真被移除 / 插件开关关闭，仍立即隐藏。
- **AC-6**：图片素材命中与显隐行为不回归。
- **AC-7**：胶囊交互（悬停展开、按钮提示气泡、三动作）不回归。

## 5. 非目标

- 不改变两段式胶囊形态与动作语义；
- 不调整锚点避让与定位算法；
- 不新增权限、不新增页面注入面、不引入新的 runtime 消息。
