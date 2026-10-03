# Spec: 公共资产库声音卡片点击播放/暂停修复（Issue #2989）

## 背景与问题

公共资产库「声音」行卡片在 OmniMux Dev 实机复现「点击播放没有响应」。

根因：`plugins/omnimux-assets/src/client/CloudAssetsView.jsx` 中悬停自动播放副作用
与点击/键盘 toggle 共用同一个 `onTogglePlay`：

1. `mouseenter` → hover 副作用调 `onTogglePlay` → 播放开始（`playing=true`）；
2. 用户点击缩略图 → `handlePlayClick` 调 `onTogglePlay` → 暂停（`playing=false`）；
3. 副作用依赖 `[hovering, canPlay, playing, asset, onTogglePlay]` 变化，而 `hovering`
   仍为 `true` → 副作用立刻再次调 `onTogglePlay` → 重新播放。

点击暂停被悬停副作用瞬时覆盖：图标恒定播放态、音频不停，外观等同「没响应」，
且每次冲突泄漏一个新 `Audio` 实例（实机实测一次点击产生第二个 Audio）。

## 范围

- 仅 `plugins/omnimux-assets/src/client/CloudAssetsView.jsx` 一张卡的播放协调逻辑。
- 不改任何可见文案、样式、组件结构；不新增 locale 键。
- `useCloudAudition`（全局试听管理）不变。

## 预期行为

1. 悬停进入可播放音频卡：自动试听开始（现状保留）。
2. 悬停中点击（或键盘激活）暂停：音频停、`aria-pressed=false`；**同一次悬停内**
   副作用不得把播放自动恢复。
3. 鼠标移出再移入：自动试听恢复。
4. 悬停中点击（或键盘）从暂停恢复播放：该次播放归用户所有，**鼠标移出不再**被
   副作用强制停止——用户显式启动的播放应持续到播完或再次显式停止。
5. 无悬停能力的场景（键盘 focus）不受影响。

## 实现约束

- 用一个 per-card ref 记录「本次悬停内播放归属」：点击/键盘 toggle 时标记为
  用户已显式接管；`mouseenter`/`mouseleave` 重置标记，副作用见到标记则跳过
  自动启动与自动停止。
- 最小改动，不重构组件。

## 验收

- 源码断言测试：`CloudAssetsView.test.js` 新增用例，断言显式接管标记的存在与
  `mouseenter`/`mouseleave` 重置、副作用跳过条件。
- 真机复测（Dev 45120 CDP）：悬停→点击→音频保持暂停、aria-pressed=false、
  不新增 Audio 实例。
- 回归：`pnpm --filter omnimux-assets test`（或该插件单测最小集）。

## 新用户基线

不引入新的依赖路径；该卡片对无目录（catalog 未构建）环境本来就是空态，无变化。
