# Issue 3701 · ComfyUI 页面节点接托管后端状态机（M2c）

- 任务工作树：`.worktrees/comfy-backend-ui-m2c`（分支 `agent/comfy-backend-ui-m2c-issue-3701`，base `origin/main`）
- 依赖：#3681（M1 页面节点 + 全屏层，已合入）、#3690（M2a 托管后端安装器/启动器，已合入）
- 一句话：把「装 → 启 → 用」搬进画布——节点默认指向托管后端，全屏层按后端真实状态给唯一明确的下一步。

## 交付

| 层 | 改动 |
| --- | --- |
| 路径真源 | `src/shared/api.ts` 新增 `comfyBackendState/Install/Start/Stop/Log`（前端与宿主同一份） |
| 宿主 | `comfyBackend/routes.ts` 改从共享路径表取路径；新增 `GET .../log?lines=N`（默认 200、上限 2000、文件不存在给空数组）；`ComfyBackendStatus` 新增 `installRoot`（绝对安装路径） |
| 宿主（修缺陷） | `service.ts` 的 `status()` 让 `failed` **粘住**：安装失败/启动超时的原因不再被 `.ready` 缺失或进程不在跑洗成 `not-installed`/`installed`（否则界面会把「失败 + 重试」显示成「未安装 + 安装」） |
| 画布 | `comfyBackendClient.ts`（岛侧客户端 + 状态→界面纯映射）、`ComfyPageOverlay.tsx`（六态 + 1.5s 轮询 + 日志面板 + 就绪直接 iframe）、`comfyPage.css`、中英各 32 个文案键 |
| 默认地址 | `DEFAULT_COMFY_PAGE_URL` → `http://localhost:18188`（M2a 实测 `127.0.0.1` 会带宿主 `dsh-auth` cookie 撞 ComfyUI 8190 字节请求头上限），并断言与宿主 `COMFY_BACKEND_BASE_URL` 一致 |

## 真实浏览器验收（四态都有真证据）

装置：**真实宿主插件**（`mountWorkflowHost`）+ 同源伺服画布页面，`DSH_HOME` 分别指向临时目录与 `~/.omnimux-dev`；用 worktree 自己 `node scripts/build-canvas.mjs --harness` 的产物。

| 截图 | 状态 | 断言 |
| --- | --- | --- |
| `issue-3701-m2c-01-not-installed.png` | 未安装 | `panel[data-state]=not-installed`、「未安装」、四项事实（darwin/arm64、107 MB、安装位置 `/tmp/m2c-dsh-home/omnimux/workflow/comfyui-backend`、Python 3.12.15 · PyTorch 2.9.1 · ComfyUI v0.42.5），唯一主行动「安装后端」，无 iframe、无 M1 引导层 |
| `issue-3701-m2c-02-installing.png` | 安装中 | `data-state=installing`、进度条与百分比一致（截图瞬间 24%「安装 PyTorch」）、展开「查看日志」有 5 行真实日志（sha256 校验 / tar / venv / pip torch 完整 URL） |
| `issue-3701-m2c-03-ready.png` | 就绪 | 无 panel、无引导层，iframe `src=http://localhost:18188` 铺满 1728×837，里面是**真 ComfyUI 编辑器**（Load Diffusion Model → KSampler → VAE Decode 工作流、Run、FPS），旁证 `/system_stats` 200 |
| `issue-3701-m2c-04-failed.png` | 失败 | `data-state=failed`、「失败」、原因「安装失败（install-failed）」、主按钮「重试安装」；**轮询 5 秒后仍是 failed**（粘性修复生效） |

结构化报告：`issue-3701-m2c-step1.json`、`issue-3701-m2c-step2.json`（含选择器与代码行号）。

## 自动化检查（Lead 自己跑的最终值）

- `pnpm --filter omnimux-workflow test` → **tests 2997 / pass 2997 / fail 0**
- `pnpm --filter omnimux-workflow typecheck` → **EXIT 0**（canvas + host + director 三段）
- `node --test scripts/verify-anti-slop.test.mjs` → **3/3**
- `pnpm verify:stages` → **PASS**（14 个 Stage 组件 + 8 个 sidebar target 契约）
- 旧标准变更（`comfyPageUrl.test.mjs` 默认地址断言 + 用例名）已在 spec 的「## 旧标准变更」逐条声明

## 验收过程中的两个修正（如实记录）

1. **我误报过一个缺陷**：我曾把「状态读不到被显示成未安装」报给实现方，实际是我 ego 指错了端口（打到了验证装置的页），那张 `-05-state-unavailable.png` 与 `-01` 字节相同，已删除。用固定端口重测纯 harness 后确认：state 读失败会走 M1 探测路径（真后端在跑 → 直接 iframe）。这次撤回反而带出一个更好的行为：托管状态读不到时回落到 M1 路径，并在引导层里显示传输错误原因。
2. **`failed` 不可达是真缺陷**（验证方从源码 + 真机确认）：宿主 `status()` 把失败状态洗成 `not-installed`，界面因此给「安装后端」而不是「重试」。已在宿主侧修（`failed` 粘住直到下一次动作）+ 4 条单测（`comfyBackendStatus.test.mjs`）。

## 已知缺口

- 状态面板用宿主设计 token（`--dsw-alias-*` / `--wb-text-*`）；临时装置没有宿主样式表时文字对比度偏低（继承色）。Dev 应用里有 token，观感以 Dev 为准 —— 本轮**未在 Dev 应用里验收**（Dev 验收归人工）。
- 平台不支持（`unsupported-platform`）只显示原因、不给「重试」（重试无意义）。
- `stopComfyBackend` 客户端已实现并有测试，但六态清单里没有「停止」，界面未渲染停止按钮。
- 安装目录选择、磁盘/驱动/版本失败的完整矩阵是 **M3**；平台矩阵（win cuda12/13、amd、intel-xpu）是 **M4**。
- 模型权重用户自备；本轮验证到「编辑器能打开、能看到工作流」，未做真实出图。
