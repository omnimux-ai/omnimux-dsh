# Issue #3002 证据：用户显式开始的播放在移出时不再被强停

- 来源：#2989 合入后 `ocr review --commit f052d90dd` 发现（CloudAssetsView.jsx:295-298，bug · medium）。
- 复现序列（JSDOM 行为级 e2e，真实组件 + React.act）：悬停自动试听 → 点击暂停 → 再点击播放 → mouseout。
- 修复前：`user-started playback must survive mouseout (#3002)` 失败，`4 !== 3`（移出多触发一次 toggle 把播放停掉）。
- 修复后：e2e 1/1 通过；`pnpm --filter omnimux-assets test` 653 pass / 0 fail；`ocr review` 0 finding。
- 修复：`onMouseLeave` 只置 hovering=false，不再重置 userControlledRef；标记仅在 mouseenter 重置。
