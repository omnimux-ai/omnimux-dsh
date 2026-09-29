# 工作树完整 Dev 隔离测试与真实业务验收环境规格说明书

> 状态：Approved
> 日期：2026-09-29
> 适用范围：`scripts/test-env-credentials.mjs`、`scripts/test-env-bootstrap.mjs`、`scripts/worktree-app-qa.mjs` 及配套单测/验收测试

---

## 1. 背景与问题定义

当前工作树隔离测试环境（`scripts/test-env-bootstrap.mjs` 与 `scripts/worktree-app-qa.mjs`）存在 5 处断层，导致合并前无法在工作树内执行等同于完整开发版（Dev）的真实业务端到端验收：
1. **插件挂载与构建残缺**：`test-env-bootstrap.mjs` 仅硬编码挂载 `omnimux`、`omnimux-video`、`omnimux-clip` 3 个插件，其余 18 个插件未挂载工作树源码；且由于 `lib/client.js` / `dist/` 被 `.gitignore` 忽略，新建工作树未构建时软链会导致前端入口缺失，浏览器退化为裸底座界面（`Into the Unknown`）。
2. **多模态与渠道凭据断流**：`test-env-credentials.mjs` 在 `live` 模式下仅解析 `refs.DEEPSEEK_API_KEY`，漏读 `OMNIMUX_API_KEY` 与 `CPA_API_KEY`，也不在隔离 `DSH_HOME` 中写入 `.credentials.yaml`，导致生图（`/omnimux/api/media/generate`）、生视频等多模态真实请求在工作树环境中必然因缺少官方网关密钥而失败。
3. **运行时配置与工具链失真**：`test-env-bootstrap.mjs` 在 `settings.yaml` 中硬编码了未配置密钥的 `runtimeMediaProvider: 'fal'` 与 `runtimeKeyVerified: true`，并将子进程 `PATH` 截断为 `/usr/bin:/bin:/usr/sbin:/sbin`，导致生图误入无密钥 BYOK 分支报错 500，且 `ffmpeg`、`ffprobe`、`opencli` 等外部工具全部不可用。
4. **业务测试数据空白**：仅拷贝单个 `fixture-video.mp4`，未挂载 `~/.omnimux-dev/omnimux/` 下的灵感库、商品库、素材库、画布工程、发布记录及角色预设，导致依赖真实业务数据的功能无法在工作树内测试。
5. **缺少真实业务结果验收（如真实生图成功）**：现有 `worktree-app-qa.mjs` 仅检查首屏元素数与面板打开，未验证真实生图请求返回 200、图片文件落盘且前端渲染无裂图。

---

## 2. 新用户与环境基线声明（New-User & Environment Baseline）

- **新用户基线**：本功能为仓库开发/QA 基础设施（`scripts/`），不影响终端产品新用户首次打开应用时的默认引导与配置基线。
- **缺失配置报错行为**：当在无 `~/.omnimux-dev/.credentials.yaml` 或缺少必需凭据的机器上显式请求 `live` 真实业务验收模式时，启动器返回明确的脱敏错误码（`TEST_ENV_CREDENTIAL_MISSING` 或 `TEST_ENV_CREDENTIAL_INVALID`），不静默回退为假数据冒充真实测试通过。

---

## 3. 文档影响声明（Documentation Impact）

- 本次改造属于工作树测试启动器与验收驱动脚本能力升级，新增规格文件 `specs/full-dev-worktree-env.spec.md` 与验证证据报告，不改变对外公开插件架构合同。

---

## 4. 核心设计与验收标准（Acceptance Criteria）

### AC-1：全量 21 插件自动构建与工作树源码挂载
- 移除 `taskPlugins` 仅限 3 个插件的硬编码限制，扫描工作树 `plugins/*` 下的全部有效插件包（21 个）。
- 在挂载工作树插件到隔离 Profile 前，若发现工作树插件缺失声明的构建产物（如 `lib/client.js`、`dist/index.js`、`lib/index.js`、`lib/host.js`），优先从主仓或开发版已构建产物同步/编译补齐，确保前端 Bundle 100% 可被宿主加载，杜绝退化为裸底座界面。
- 同时在工作树插件解析链路上保持与 `~/.omnimux-dev/profiles/omnimux/node_modules` 的依赖可达性。

### AC-2：完整 Dev 凭据安全解析与注入（Full-Dev Live Credentials）
- 扩展 `scripts/test-env-credentials.mjs`：
  - 保留原有 `parseDevDeepSeekCredential` 与 `readDevDeepSeekCredential` 向后兼容签名与全部安全校验（防符号链接、O_NOFOLLOW、64KB 大小限制、禁 YAML alias/tag、字节清零）；
  - 新增 `parseDevCredentialsBundle(text)` 与 `readDevCredentialsBundle(deps)`，安全提取 `~/.omnimux-dev/.credentials.yaml` 中的 `DEEPSEEK_API_KEY`、`OMNIMUX_API_KEY`、`CPA_API_KEY` 等全部非空标量 `refs` 键值。
- 在 `scripts/test-env-bootstrap.mjs` 的 `live` 模式下：
  - 将 `OMNIMUX_API_KEY`、`DEEPSEEK_API_KEY`、`CPA_API_KEY` 注入工作树宿主进程环境，并在隔离 `DSH_HOME/.credentials.yaml`（权限 `0600`，随 `cleanup()` 自动销毁）中写入 `refs` 映射，使 `direct-http.js` 与 `mount.js` 的多级凭据解析 100% 命中真实密钥。

### AC-3：真实运行时配置与完整系统工具链（Settings & PATH）
- 在 `test-env-bootstrap.mjs` 中：
  - 修正 `settings.yaml` 中的 `omnimux` 配置：不再写死无密钥的 `runtimeMediaProvider: 'fal'` 与 `runtimeKeyVerified: true`，保证官方生图/生视频模型自适应走官方专线；
  - 在 `live` 模式下，合并 `~/.omnimux-dev/settings.yaml` 中的 `llm-pi-ai`、`dsh-better-sidebar`、`agent-presets`、`agent-default-model` 等真实开发版配置；
  - 将 `/opt/homebrew/bin`、`/usr/local/bin`、`~/.local/bin` 及当前 Node 所在目录纳入子进程 `PATH`（剔除 DSH GUI shim），确保 `ffmpeg`、`ffprobe`、`opencli` 等工具在工作树宿主内正常可用。

### AC-4：全套业务测试数据隔离预置（Business Data Seeding）
- 当本机存在 `~/.omnimux-dev` 时，`test-env-bootstrap.mjs` 自动在隔离环境的 `HOME` 与 `DSH_HOME` 中为业务数据目录建立隔离快照/软链（包括 `omnimux/assets`、`omnimux/inspirations`、`omnimux/products`、`omnimux/workflow`、`omnimux/clip`、`omnimux/publish`、`omnimux/recipes`、`omnimux/forms`、`.agent-presets`、`agent-presets-shipped`、`skills`），并在 `QA Media` 测试工作区中预置真实测试素材。

### AC-5：真实业务结果导向验收（以真实生图成功为标准）
- `scripts/worktree-app-qa.mjs` 支持 `--mode=live`（以及 `--keep-alive` 供人工在 `ego-browser` 中复核确认）：
  - 在 `live` 模式下，除验证全套插件 UI、探索区、右侧素材工作台与业务数据非空外，必须在浏览器上下文中发起真实生图验收（通过图像生成界面或 `/omnimux/api/media/generate` 真实请求 `gpt-image-2.5`）；
  - 验收通过的硬标准：接口返回 HTTP 200（`ok: true, mode: 'live'`）、生成的图片文件在磁盘上真实存在且字节数 `> 0`、并在浏览器页面中验证生成的图片真实可解码加载（`naturalWidth > 0 && naturalHeight > 0`），留存真实生图成功截图证据。
