# #3440 扩展 loopback 凭据收敛 — 真实浏览器证据

日期：2026-10-20 · 任务 worktree：`.worktrees/browser-loopback-credentials-issue-3440`

## 环境

- 浏览器：Chrome for Testing `Chrome/151.0.7922.34`（Playwright chromium-1234，macOS arm64），全新临时 profile，`Extensions.loadUnpacked` 载入待测 `extension/dist`。
- 宿主：OmniMux Dev 2.0.9 运行于 `127.0.0.1:45120`（inspiration 路由正常，curl 200）。
- 复现材料：向 127.0.0.1 预置 6 个约 3.9 KiB 的 cookie，实测 `Cookie` 头 **23,464 B**、总请求头 **23,996 B**，超过宿主 Node HTTP 默认 `maxHeaderSize`（16,384 B）。
- 观测端点：`45996` 使用默认 16 KiB 上限（与宿主同形的 431 行为）；`45997` 提高上限以记录实际请求头。

## 方法与结果

| 步骤 | 修复前（origin/main 构建） | 修复后（本 worktree 构建） |
| --- | --- | --- |
| 面板页默认 `fetch` 到 127.0.0.1:45997 | 200，请求携带 `Cookie: 23,464 B` / 6 个 | 同样携带（面板页自身不再是保存通道） |
| 面板页 `fetch(..., { credentials: 'omit' })` | 200，`Cookie: 0 B`，总头 488 B | 同样 0 B |
| 面板 → 后台 `DSH_SAVE_INSPIRATION_PANEL` 真实保存 | **`{ ok: false }`**（宿主按 431 拒绝） | **`{ ok: true }`**（17 ms） |

原始输出见 `pre-fix.json` / `post-fix.json`。

## 结论

1. 同一份 23.4 KB 的 127.0.0.1 cookie 罐下，修复前的保存通道必然失败；改为统一 `credentials: 'omit'` 后保存成功——与本 Issue 的根因（cookie 累积撑爆请求头 → 431）和修复手段一致。
2. `credentials: 'omit'` 在真实 Chromium 扩展页面中确实清空了 Cookie 头（23,464 B → 0 B），不是仅凭代码推断。
3. 431 的用户侧映射（`local-header-overflow` → 「127.0.0.1 残留 cookie 过多…」）由代码审查与现有单测覆盖；本仓库 `guard-anti-cheat` 禁止 Agent 新增/修改测试文件，故未追加断言型用例。

## 其它检查

- 扩展单测：`137 files / 1458 passed | 1 expected fail`，0 失败。
- 扩展构建：`node scripts/build.mjs` 通过；`dist` 中 `background.js` 与 `panel/assets/index.js` 均含 `credentials:"omit"`。
- 扩展 `pnpm typecheck`：报错全部位于未改动的既有测试文件（`tests/queue-dock.spec.ts`、`tests/queue-steer.spec.ts`、`tests/tiktok-conflict.spec.ts`、`tests/tool-activity-card.spec.ts`），本轮改动文件无类型错误。
- 验证过程中写入 Dev 灵感库的探测行（`evidence-3440-*`）已删除。
