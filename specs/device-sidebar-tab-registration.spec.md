# fix(device): 注册「手机管理」工作台标签，修复入口点击无响应（Issue #2429）

## 背景与根因
PR #2428 修复启动拦截后，侧边栏「手机管理」入口可见但点击无反应（无报错）。
根因：点击链路 entry click → stageStore.open() → `__omnimuxWorkbench.open({ tabId: 'omnimux-device:library' })` → `openWorkbench` 内 `waitForTab(service, tabId)` 等待标签注册；device 客户端 apply 从未调用 `betterSidebar.registerTab` 注册标签与内容组件，超时后静默放弃。已在 Dev 实机 CDP 复现（点击后无标签打开、无控制台报错）。

## 修复内容
- `plugins/omnimux-device/src/client/index.js`：对照 `omnimux-assets` 模式，apply 中经 `ctx.inject(['betterSidebar'])` 注册工作台标签：
  - `id = 'omnimux-device:library'`（与 stageStore 的 tabId 一致）
  - `title` 走 `t('nav')` 回退「手机管理」
  - `icon` 为手机轮廓矢量图标（React createElement，与入口 SVG 同形）
  - `component = (props) => createElement(DeviceStage, { ...props, t })`
  - 注册包在 `ctx.effect` 中保证卸载回收
- 扩充 `tests/e2e/client-plugin-boot.spec.js`：模拟点击入口 → stageStore.open → workbench.open → 标签命中注册的完整旅程。

## 新用户基线
不引入开发机私有路径/运行时依赖；betterSidebar 为宿主标准服务，经 cordis 可选注入获取，缺失时不注册（与资产库行为一致），无静默私有回退。

## 验收标准
1. `pnpm --filter omnimux-device test` 通过（含新 E2E 旅程）。
2. 真实浏览器（ego-browser）验证：apply 后标签完成注册，模拟点击入口触发 workbench.open 并命中该标签。
3. 合入物化后 Dev 实机：点击「手机管理」打开设备管理工作台（CDP 截图证据）。

## 文档影响
纯缺陷修复，不改变契约与产品边界；无需更新文档。

## 风险
低：新增一次标准标签注册，与资产库/账号同模式，无行为回退面。
