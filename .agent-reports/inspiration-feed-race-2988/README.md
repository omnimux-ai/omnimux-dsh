# Issue #2988 worktree browser evidence

Runner: `race-qa-runner.mjs` bundles the real `InspirationSection` into a page on an ephemeral port, delays `/omnimux/inspiration` by 1.5s, clicks 爆款趋势 → 灵感库 in headless Chrome, samples DOM, then screenshots.

| run | source | final grid on 灵感库 | first-page requests |
| --- | --- | --- | --- |
| before | origin/main checkout | 6 cloud / 0 local (overwritten at ~1.19s) | cloud 2, local 2 |
| after | this worktree | 0 cloud / 6 local | cloud 1, local 1 |

Screenshots: `before-2-after-cloud-landed.png` (TikTok cards under 灵感库), `after-2-after-cloud-landed.png` (本地 cards kept).
