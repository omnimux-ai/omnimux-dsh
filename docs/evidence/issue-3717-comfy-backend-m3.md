# Issue 3717 · 托管后端失败态矩阵 + 安装目录与模型目录选择（M3）

- 工作树：`.worktrees/comfy-backend-m3`（分支 `agent/comfy-backend-m3-issue-3717`）
- 依赖：#3690（M2a 安装器/启动器）、#3701（M2c 状态界面），均已合入
- 一句话：把「为什么装不上」在下载之前讲清楚，并把安装根与已有模型目录变成用户可选项。

## 交付

| 层 | 改动 |
| --- | --- |
| 预检（纯） | 需求体积估算（下载×3 + 2.5GB，实测安装根 ≈668MB + venv ≈1.9GB）；驱动判定（mac arm64 → `not-required`，其它平台 `unknown` 且不阻断）；四类失败码：平台不支持 / 目录不可写 / 磁盘不足 / 端口占用；失败码 → 文案键与下一步动作 |
| 设置（纯 + 落盘） | 安装根与模型目录；校验绝对路径 / 存在 / 是目录 / 可写 / 不与安装根重复；坏文件回落默认值；`--extra-model-paths-config` 用的 YAML 只指向用户目录 |
| 状态 | 新增 `failure` 码；已装 pin 与当前目标比对 → `version-mismatch`（需要更新） |
| 服务 | 安装根来自设置（改根就地重建骨架，用户数据目录不搬）；install 前预检（不通过不开始下载）、start 前查端口（区分「我们已在跑」与「别人占着」）；**start 也比对版本 pin**（验收发现：原来只看 `.ready` 存在，会把旧版拉起来冒充可用）；启动参数抽成纯函数 `launchArgs` 并单测「带/不带模型目录」 |
| 路由 | `state` 额外给 `settings`/`requiredBytes`/`driver`（纯计算，不在轮询里探磁盘端口）；新增 `GET/POST .../settings`（校验失败 400 + 原因）；`state` 只读一次状态 |
| 画布 | 失败面板（八类各给唯一主行动 + 磁盘需求行 + 驱动结论行）、设置区（安装目录 + 模型目录，默认值可见，复用原生目录选择器 + 手填兜底，宿主错误码原样显示）；顺带修「设置区被整屏面板撑开、按钮挤出可视区」 |

## 真实浏览器验收

装置：M3 worktree 的真实宿主 + 同源画布页，`DSH_HOME` 为临时目录（安装根随后被设置改成 `/tmp/m3-install-chosen`）。

| 截图 | 方式 | 断言 |
| --- | --- | --- |
| `issue-3717-m3-01-insufficient-disk.png` | 注入状态文件（UI 态） | `data-state=failed`、「磁盘空间不足（insufficient-disk）」、需要空间 **2.6 GB**、唯一主行动「更换安装目录」、「本机不需要额外驱动」 |
| `issue-3717-m3-02-port-occupied.png` | 注入状态文件（UI 态） | `data-state=failed`、「18188 端口被其它程序占用」、主行动「重试安装」 |
| `issue-3717-m3-03-version-mismatch.png` | 真方式（改 `.ready` 的 commit） | `data-state=failed`、「已装版本与当前目标不一致，需要更新」、主行动「更新」 |
| `issue-3717-m3-04-install-dir-changed.png` | 真方式（设置区填目录 + 保存） | 安装位置由默认根变为 `/tmp/m3-install-chosen`；磁盘上新根出现 `logs/`、`downloads/`、`userdata/{custom_nodes,models,input,output,temp}` |

宿主侧真机验证（`issue-3717-m3-step1.json`，10/12 pass）：`state` 新增字段齐（`requiredBytes` 与公式一致、`driver=not-required`）；`POST settings` 四类非法输入各自 400 且码正确（`not-absolute` / `not-found` / `not-writable` / `same-as-install-root`），可写目录 200 且安装根立刻跟随；改 `.ready` 后状态为 `version-mismatch`。

## 未覆盖（如实标注）

- **真机磁盘不足**、**真机端口冲突**：本机 18188 被真实 ComfyUI 占着且应答 200，`start()` 会先返回就绪，走不到端口分支；停那个后端属人工的 Dev 实例，未动。两条检测逻辑由宿主单测覆盖（`comfyBackendPreflight.test.mjs`），UI 态用注入方式验证并已在证据里标注。
- `unsupported-platform` 不渲染主行动：本机受支持，无真触发方式（单测覆盖）。
- 模型目录的 `--extra-model-paths-config` 只在真实 spawn 路径生成，本机被「后端已在跑」短路；参数拼装由 `launchArgs` 单测覆盖，真实 spawn 未验。
- 磁盘不足只显示「需要多少」，未显示「可用多少」：可用空间在宿主 message 里，界面为保持中英一致未采用该句。

## 自动化检查

- 整包 `pnpm --filter omnimux-workflow test` → **3019/3019**
- `typecheck` 三段绿；`verify-anti-slop` 3/3
- 旧标准变更：无（只新增用例）
