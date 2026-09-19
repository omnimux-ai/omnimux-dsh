# fix(device): 客户端入口补齐标准 Cordis 插件形态（Issue #2427）

## 背景与根因
OmniMux Dev 启动被「Failed to load plugins」拦截：`failed to apply loader entry <hash> (omnimux-device): invalid plugin, expect function or object with an "apply" method, received object`。
根因：PR #2417 引入的 `plugins/omnimux-device/src/client/index.js` 仅做组件再导出，未导出 Web 运行时要求的 `name` / `inject` / `apply` 插件形态；Web 侧按 cordis.patch.yml 应用该插件时拿到无 `apply` 的对象，校验失败阻断启动。此前 5 个修复提交均只处理宿主链路，未触及 Web 侧根因。

## 修复内容
- `plugins/omnimux-device/src/client/index.js`：改为与 omnimux-assets / omnimux-accounts 一致的标准客户端插件：
  - `export const name = 'omnimux-device'`
  - `export const inject = ['locale']`
  - `export function apply(ctx)`：注册词典（zh/en 映射自现有 locales）并通过 `ctx.locale.bind` 取翻译函数，挂载侧边栏「手机管理」入口（`mountSidebarEntry(null, t, ctx.locale)`，包在 `ctx.effect` 中）
  - 保留原有再导出（DeviceStage / locales / createTranslate / mountSidebarEntry），不破坏既有消费方
- 重新执行 `pnpm --filter omnimux-device build` 生成自包含 `lib/client.js`（产物被 .gitignore 忽略，仅物化时使用）。

## 新用户基线
本修复不引入任何开发机私有路径或运行时依赖；插件在全新用户机器上按同一形态加载，缺失 locale 服务时 Cordis 注入机制本身会报显式依赖错误，不新增静默回退。

## 验收标准
1. `pnpm --filter omnimux-device test` 通过。
2. 重建后 `lib/client.js` 导出表包含 `apply`、`inject`、`name`。
3. 合入并物化到 Dev 后，OmniMux Dev 启动不再出现 Failed to load plugins 拦截屏，可进入主界面；左侧导航出现「手机管理」入口（CDP 截图证据）。

## 文档影响
纯缺陷修复，不改变任何契约与产品边界；无需更新文档。

## 风险
低：仅将一个从未成功加载的模块补齐为标准形态，无行为回退面。
