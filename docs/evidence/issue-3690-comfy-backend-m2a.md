# Issue 3690 · ComfyUI 托管后端安装与启动（M2a）

- 任务工作树：`.worktrees/comfy-backend-install-m2`（分支 `agent/comfy-backend-install-m2-issue-3690`，base `origin/main`）
- 用户拍板：**从上游固定版本安装**（不自建 bundle、不自建 CDN）+ GPL 按合规做
- 本轮是**真机真装**：mac arm64 上完整走完下载 → 校验 → 解压 → venv → PyTorch → ComfyUI 固定 commit → 依赖 → `.ready` → 启动 → 就绪 → 浏览器里打开真编辑器

## 装了什么（全部固定版本 + sha256）

| 组件 | 固定版本 | 校验 |
| --- | --- | --- |
| Python 运行时 | python-build-standalone `20261021` / CPython 3.12.15（aarch64-apple-darwin） | sha256 `a18cc338…4584`（实测通过） |
| PyTorch | `2.9.1` cp312 mac arm64 wheel（PyPI 直链） | sha256 `c0d25d1d…ad7e`（pip `#sha256=` 校验通过） |
| ComfyUI | tag `v0.42.5` / commit `483dae4326356b81de05d27aca3f433dd323cc25` | tarball sha256 `e790b32b773c…`（本轮记录，M4 钉进目标表） |

安装根：`<DSH_HOME>/omnimux/workflow/comfyui-backend/`（Dev 上是 `~/.omnimux-dev/omnimux/workflow/comfyui-backend`）。`userdata/` 与源码目录分离，升级不碰用户数据。**仓库里没有 ComfyUI 代码**，我们不分发它（合规说明见 `THIRD-PARTY-NOTICES-comfyui.md`）。

## 实测结果

| 断言 | 实测 |
| --- | --- |
| 真实安装 | 走完全部 6 个阶段：`runtime 0→12%` → `extract` → `venv 18%` → `torch 24%` → `source` → `requirements 70%` → `done 100%`；venv 1.9GB，安装根 668MB（含下载缓存） |
| sha256 校验生效 | Python 运行时校验通过；PyTorch 由 pip 用 `#sha256=` 校验通过；源码 tarball 记录 sha256 `e790b32b773c…` |
| 假设「运行时 relocatable」 | `python/bin/python3 -c "import venv"` 通过，未依赖系统 Python |
| 状态机与进度 | `install-state.json` 逐阶段更新；`not-installed → installing → installed`，`percent` 从 0 走到 100 |
| 启动 | detached 子进程 `venv/bin/python ComfyUI/main.py --port 18188 --base-directory <root>/userdata --enable-cors-header "*"`；`GET /system_stats` → **200**；`lsof` 显示 `127.0.0.1:18188 (LISTEN)` |
| 停止 | `POST stop` 结束记录的 pid，端口释放 |
| **浏览器端到端** | 画布「ComfyUI 页面」节点 → 全屏层里是**真 ComfyUI 编辑器**（Templates / 节点图 / Run / FPS 全在）：`issue-3690-01-real-comfyui-localhost.png` |

## 真机踩到的三个坑（已修，写进规格）

1. **宿主 cookie 顶掉 ComfyUI 请求头上限**：DSH 的 `dsh-auth` cookie 是 host-only 绑在 `127.0.0.1` 的长字符串，画布 iframe 请求 `http://127.0.0.1:18188` 会带上它 → ComfyUI 的 aiohttp 8190 字节上限报 `Got more than 8190 bytes when reading: b'dsh-auth=…'`，编辑器打不开（截图 `issue-3690-00-real-comfyui-in-canvas.png` 就是这个现象）。改用 `http://localhost:18188`（不同 host、cookie 不带）后真编辑器正常渲染。托管地址因此定为 `localhost:18188`，后端仍只监听回环。
2. **`--base-directory` 子目录要先建**：ComfyUI 启动直接 `os.listdir(<base>/custom_nodes)`，缺目录即 `FileNotFoundError`。服务预建 `custom_nodes/models/input/output/temp`。
3. **宿主中途退出会留下 `installing` 假状态**：安装任务在宿主进程内。状态读取只在「本进程确实在装」时才相信文件里的 `installing`，否则降级为「上次安装未完成，可重试」；已下载/已建好的部分可复用（实测中断后重跑续上）。另：`stdio` 不能直接传 `WriteStream`（fd 未打开），改 `openSync` 传 fd。

## 自动化检查

- `node --test` 计划器 6/6 + 路由 3/3 = 9/9；`pnpm --filter omnimux-workflow typecheck` 三段绿
- 旧标准变更：`plan.test.mjs` 里托管地址断言由 `127.0.0.1` 改 `localhost`（理由见上，已在 spec 的「## 旧标准变更」逐条声明）

## 已知缺口

- 前端状态 UI（未安装 → 安装按钮 → 进度）是 **M2c**，本轮只到宿主路由 `GET/POST /omnimux-workflow/api/comfy-backend/{state,install,start,stop}`（未接 UI）。
- 失败态矩阵（磁盘不足 / 端口占用 / 驱动不满足 / 版本不符 / 目录选择）是 **M3**；平台矩阵（win cuda12/cuda13、amd、intel-xpu）是 **M4**，当前只有 mac arm64 目标，其他平台显式拒绝。
- `localhost` 若先解析到 `::1`，依赖浏览器回退 IPv4（Chromium 会，本轮实测可用）；M3 补「地址不可达」提示。
- 宿主退出时安装会中断（不是 detached worker）；M2b/M4 再考虑独立 worker。
- 模型权重未下载（用户自备）；本轮只验证到「编辑器能打开」，未做一次真实出图。
