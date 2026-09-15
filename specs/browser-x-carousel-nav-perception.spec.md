---
issue: 1832
status: approved-for-implementation
date: 2026-09-15
---

# 推文媒体轮播的骨架区域误判修复 · 规格

## 1. 问题与目标

### 1.1 现状与缺陷

`extension/src/content/media-hover/classifier.ts` 的骨架区域黑名单把「位于页面导航内的媒体」一律判为页面装饰。X（推特）把每条推文里的**媒体轮播容器**渲染为 `<nav role="navigation">`，于是推文内的全部图片与视频被该规则剔除，`sniffViewportMedia()` 恒定返回空列表。

| 现状缺陷 | 业务影响 |
| --- | --- |
| `<nav>` 包裹的推文媒体被判为页面装饰 | 页面悬浮采集入口不出现，侧边栏素材列表为空 |
| 黑名单在上下文准入之前返回 | X 专属的 `TWEET_MEDIA_SELECTOR` 准入规则永远没有执行机会 |
| 感知结果恒为空 | 用户无法从 X 采集任何参考素材，Discovery 环节整体失效 |

真实页面实测（`x.com/misamisa06120/status/2099476836766089238`）：4 个大尺寸媒体（1 视频 + 3 图）全部 `excluded=true`、`tweetMedia=true`、`postOrWork=false`，嗅探结果 **0 条**。

### 1.2 改造目标

为骨架区域判定引入**内容豁免**：骨架区域若自身位于内容根（`article` / `[role="article"]`）内，则它是内容自身的包装，不是页面骨架。

豁免范围严格限制在内容根内部，页面级 `<header>` / `<nav>` / `<footer>` 的排除行为保持不变。

---

## 2. 判定链设计

### 2.1 修复后的骨架判定

```
元素 → 沿 shadow host 链上溯
        ├─ 找到最近骨架区域（header / nav / footer / role=banner|navigation|contentinfo）
        │     ├─ 该骨架区域自身位于 article / [role=article] 内 → 豁免，继续上溯
        │     └─ 否则 → 判定为页面骨架，排除
        └─ 上溯结束仍未命中 → 非骨架区域
```

### 2.2 语义边界

- **豁免根只取 `article` / `[role="article"]`**，不取 `main`：`main` 覆盖面过宽，其中可能真实存在页面级导航。
- **不豁免 `[role="menu"]` / `[role="dialog"]` 等辅助区域**：那是另一条规则（`isInsideAuxiliaryRegion`），与本次缺陷无关。
- **不改动** `SKELETON_REGION_SELECTOR` 的构成、尺寸门槛 `MIN_POST_MEDIA_SIZE_PX`、以及 X 专属的 `TWEET_MEDIA_SELECTOR` 准入规则。

---

## 3. 验收标准（Acceptance Criteria）

- **AC-1（内容内导航豁免）**：`<article data-testid="tweet">` 内 `<nav role="navigation">` 包裹的 `[data-testid="tweetPhoto"]` / `[data-testid="videoComponent"]` / `[data-testid="videoPlayer"]` 媒体被准入，`isPostOrWorkMedia` 返回 `true`。
- **AC-2（页面骨架仍排除）**：不在 `article` 内的页面级 `<header>` / `<nav>` / `<footer>` / `role=banner|navigation|contentinfo` 仍被排除，含 26 层深度嵌套场景。
- **AC-3（真实页面感知非空）**：X 真实推文页面上 `sniffViewportMedia()` 返回 ≥1 条可下载媒体（修复前为 0），且每条 `attachable` 为 `true`、地址为 `https`。
- **AC-4（无回归）**：现有分类器、媒体检测、媒体动作测试全绿。

---

## 4. 验证方式

| 验收项 | 证据形式 |
| --- | --- |
| AC-1 / AC-2 | `extension/tests/media-post-classifier.spec.ts` 新增用例，红-绿两态 |
| AC-3 | ego-browser 注入修复后判定链，在真实推文页面输出嗅探条数与地址 |
| AC-4 | `pnpm --filter omnimux-browser test` 全量结果 |
