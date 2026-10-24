# 规格：ComfyUI 页面节点接托管后端状态机（M2c / Issue #3701）

## 业务目标

M2a 把托管后端装得起来、起得来，但没有界面：用户在画布上打开 ComfyUI 页面节点，只能看到 M1 的「探测不到页面」。M2c 把「装 → 启 → 用」搬进画布：节点默认指向托管后端，全屏层按后端状态给出唯一明确的下一步，用户不用打路由、不用手填地址。

## 用户关键操作旅程

1. 用户在「添加节点」里建「ComfyUI 页面」节点（默认地址 `http://localhost:18188`），点「打开」。
2. 后端没装 → 全屏层显示：这台设备要装什么（平台/版本）、预计体积、装到哪、「安装后端」按钮。
3. 点安装 → 进度条按真实阶段前进（下载 Python 运行时 → 解压 → 建虚拟环境 → 安装 PyTorch → 下载 ComfyUI 源码 → 安装依赖），可展开「查看日志」看最后 200 行；安装期间可以关掉全屏层，安装继续。
4. 装完 → 显示「已安装，未启动」+「启动」。
5. 点启动 → 「正在启动…」→ 就绪后全屏层里直接是**真 ComfyUI 编辑器**（iframe），不再有引导。
6. 失败 → 显示原因（安装失败 / 启动超时 / 平台不支持）与「重试」；重试按失败类型走安装或启动。
7. 用户自己填了别的地址（比如自装的 8188）→ 那条路径保持 M1 行为：探测不通给引导，不被托管状态吞掉。

## 期望 UI 反馈

- 状态与按钮一一对应，同一时刻只有一个主行动（安装 / 启动 / 重试），不并列给多个选择。
- 安装中显示真实阶段文案与百分比；百分比来自后端 `install-state.json`，不由前端估算。
- 失败态给原因，不显示「安装中」这类会误导的状态。
- 文案遵循仓库文案规范；不额外加解释性副标题，层级交给布局。

## 变更点

1. `src/shared/api.ts`：新增 `WORKFLOW_API_ROUTES.comfyBackendState/Install/Start/Stop/Log`（前端与宿主共用同一份路径真源）。
2. 宿主 `src/workflow/comfyBackend/routes.ts`：改从共享路径表取路径；新增 `GET .../log?lines=N`（默认 200，上限 2000）返回 `{ lines: string[] }`，读 `<root>/logs/install.log` 的尾部；文件不存在返回空数组（不报错）。
3. `src/canvas/editor/utils/comfyBackendClient.ts`（新）：岛侧薄封装（`request` 同一套），`fetchComfyBackendState` / `fetchComfyBackendLog` / `installComfyBackend` / `startComfyBackend`，全部返回 `{ ok, status, body }` 风格，不抛。
4. `src/canvas/editor/utils/comfyPageUrl.ts`：`DEFAULT_COMFY_PAGE_URL` 改为 `http://localhost:18188`（托管后端；M2a 实测 `127.0.0.1` 会带上宿主 `dsh-auth` cookie 撞爆 ComfyUI 的 8190 字节请求头上限）。
5. `src/canvas/editor/components/ComfyPageOverlay.tsx`：托管状态机（未安装/安装中/已装未启动/启动中/就绪/失败）+ 轮询（安装中/启动中 1.5s，其余只在打开时取一次；关闭即停）+ 日志面板；就绪时直接渲染 iframe。M1 的手动地址探测路径保留。
6. `src/canvas/theme/comfyPage.css`：状态面板、进度条、日志面板样式（走既有单点样式注入）。
7. `src/canvas/i18n/dict.zh.ts` / `dict.en.ts`：新增状态与按钮文案键，双语齐备。
8. 单测：`comfyBackendClient`（fetch 桩：成功/失败/超时）、托管状态到界面的映射（纯函数）、宿主日志路由（有文件/无文件/行数上限）。

## 非目标

失败态矩阵全量（磁盘不足 / 驱动不满足 / 版本不符 / 安装目录选择 = M3）、平台矩阵（M4）、模型权重下载、真实出图验证、M1 页面节点机制与探测逻辑的改动。

## 新用户基线

新用户机器上没有 ComfyUI、没有后端目录：打开节点看到的是「未安装 + 体积 + 安装位置 + 安装按钮」，不依赖开发机上的既有安装，也不依赖任何 dev 端口或绝对路径。

## 假设

1. 假设宿主路由与画布 island 同源（既有 `WORKFLOW_API_ROUTES` 全部这么用），因此 `fetch` 直接用相对路径、不需要 CORS 配置。
2. 假设安装/启动是长任务，前端只能靠轮询状态文件，而不是等一个长请求返回；轮询间隔 1.5s 足够。
3. 假设状态机取值就是 M2a 的六个（`not-installed/installing/installed/starting/ready/failed`），前端不再自造状态。
4. 假设「就绪」等价于 `/system_stats` 200（M2a 的就绪判据），前端不重复探测。
5. 假设日志文件是追加写的纯文本，取尾部 200 行足够排查（不要求分页）。

## 证伪方式

1. 若前端百分比与后端 `install-state.json` 不一致（前端自己估算或进度卡住），则不成立——安装期间同时读接口与状态文件比对。
2. 若关闭全屏层后轮询不停（内存/请求泄漏），则不成立——关闭后统计网络请求数与计时器。
3. 若失败态显示成「安装中」或空白，则不成立——用假状态（注入 failed）验证界面。
4. 若用户手填地址被托管状态吞掉（探测不通却显示托管引导），则不成立——填一个死端口验证仍走 M1 引导。
5. 若日志路由越权（能读到安装根以外的文件）或行数无上限，则不成立——用 `lines=999999` 与路径穿越参数验证。
6. 若「就绪」时仍渲染引导而不是 iframe，则不成立——真机后端在跑的场景验证。

## 验收标准

1. 节点默认地址是 `http://localhost:18188`，`comfyPageUrl` 单测同步。
2. 六个状态各自渲染正确的文案与主行动按钮；就绪时渲染 iframe（真编辑器）。
3. 安装中百分比与后端状态文件一致（误差 0，直接读同一个值）；日志面板显示真实尾部日志。
4. 关闭全屏层后轮询停止；再次打开重新取状态。
5. 用户手填地址仍走 M1 探测与引导。
6. 日志路由：默认 200 行、上限 2000 行、文件不存在返回空数组、只读安装根内的日志文件。
7. `pnpm --filter omnimux-workflow test` / typecheck / `pnpm verify:stages` / anti-slop 全绿；真实浏览器证据含「就绪→真编辑器」与「未安装/安装中/失败」三态。

## 旧标准变更

- `plugins/omnimux-workflow/src/canvas/editor/utils/comfyPageUrl.test.mjs` :: `默认地址就是 ComfyUI 官方默认端口`
  - 原断言：`assert.equal(DEFAULT_COMFY_PAGE_URL, 'http://127.0.0.1:8188')`。
  - 必须改的理由：M2c 把节点默认地址改成托管后端 `http://localhost:18188`（M2a 实测 127.0.0.1 会带宿主 cookie 撞 ComfyUI 8190 字节请求头上限；localhost 不带 cookie）。用户自装的 8188 仍可手填，能力不丢。
  - 新期望证据：`DEFAULT_COMFY_PAGE_URL === 'http://localhost:18188'`，并新增一条断言证明它与宿主 `COMFY_BACKEND_BASE_URL` 一致（避免两处默认值漂移）。
- 同文件 :: 用例名 `默认地址就是 ComfyUI 官方默认端口` **改名**为 `默认地址指向托管后端 localhost:18188`。
  - 理由：默认值语义已从「ComfyUI 官方端口」变为「托管后端」，旧名字会误导后来人；只改名字，断言集合不变（改名不算削弱）。
  - 附带：宿主 `ComfyBackendStatus` 新增 `installRoot`（绝对安装路径），未安装面板改为显示真实路径而不是 `targets/<id>`。

## 文档影响

本规格；证据 MD/JSON 记录三态界面截图与真编辑器截图；`THIRD-PARTY-NOTICES-comfyui.md` 不变（本轮不加新第三方组件）。
