# spec: 项目详情「新建创作页」主按钮双加号修复（Issue #3620）

- 状态：实施中
- 风险：R2（单插件非破坏性修复）
- 插件：`omnimux-workflow`
- 关联 Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3620

## 用户操作旅程

1. 用户打开 OmniMux（Web/桌面同源 Stage），从侧边栏进入「项目」。
2. 在项目库列表点开任一项目文件夹，进入项目详情（面包屑 `项目库 › <项目名>`）。
3. 停在默认的「创作页」选项卡，视线落在选项卡栏右侧主行动点。

期望界面反馈：该主按钮只出现 **一个** 矢量加号图标，随后是文案「新建创作页」；不再出现「＋ ＋ 新建创作页」。

## 期望行为与验收用例

| 用例 | 输入 | 期望 |
| --- | --- | --- |
| A1 渲染契约 | 静态读取 `ProjectLibraryPage.jsx` | 按钮同时具备 `leadingIcon={<IconPlusOutline16 />}` 与不含字符 `+` 的文案「新建创作页」 |
| A2 缺陷回归 | 对修复前源码执行同一断言 | 断言失败（证明该断言确实覆盖缺陷） |
| A3 同族无回归 | 扫描 `ProjectLibraryPage.jsx` 全文 | 页面内不再存在 `+ 新建` 形态的字符加号文案 |
| A4 视觉证据 | 隔离 worktree 内真实浏览器打开该页 | 截图中该按钮为单加号 |

## 假设

根因假设：`plugins/omnimux-workflow/src/client/projects/ProjectLibraryPage.jsx` 的该按钮同时提供了 `dsh-ui-kit Button` 的 `leadingIcon={<IconPlusOutline16 />}`（矢量加号）与字面量文案 `+ 新建创作页`（字符加号），二者叠加渲染为两个加号；`leadingIcon` 槽位带 `aria-hidden`，因此字符「+」还会被读屏念出。去掉文案中的字符「+」即可消除重复，且不需要改动图标、几何与配色。

次要假设：仓库 UI04 静态门禁的符号集不含 `+` 且跳过 `locales.*` 文件，所以该缺陷无法被现有 CI 拦截；同族插件（`omnimux-inspiration`、`omnimux-publish`）已有「CTA 文案不得以 `+` 开头」的专用断言，本插件缺失该断言是缺陷得以合入的原因。

## 证伪方式

若下列任一可观测结果出现，则上述假设不成立，需要重新定位根因：

1. 修复后对 `ProjectLibraryPage.jsx` 执行 `node --test plugins/omnimux-workflow/src/client/projects/projectLibraryPage.test.mjs` 仍失败 —— 说明断言或选择器未命中真实渲染契约。
2. 在隔离 worktree 的真实浏览器截图中，该按钮仍出现两个加号 —— 说明重复来源不止文案一处（例如按钮 CSS 伪元素、宿主主题注入或构建产物 `lib/client.js` 未随源码重建）。
3. `rg -n '\+ 新建创作页' plugins/omnimux-workflow/src` 在修复后仍命中源码 —— 说明存在第二处文案来源。

可执行验证命令（在任务 worktree 内）：

```bash
# 断言级：先对修复前源码失败、对修复后源码通过
node --test plugins/omnimux-workflow/src/client/projects/projectLibraryPage.test.mjs
# 全插件测试
pnpm --filter omnimux-workflow test
# UI 静态门禁
node scripts/scan-ui-gates.mjs
# 字符加号残留扫描
rg -n '\+ 新建创作页' plugins/omnimux-workflow/src
```

## 新用户基线

不引入新的运行依赖、配置或凭据：按钮文案为源码内静态字符串，新用户安装后即可看到修复效果；缺失任何 Dev 机器状态都不影响该修复的默认路径。

## 文档影响

无需更新契约或公开文档：本次只收敛既有按钮文案，未改变交互契约、接口、数据结构或 UI 规范条文（`design.md` §2.5 与 `docs/contracts/ui-copywriting-and-naming-standards.md` 的既有要求本就被违反，修复是向规范回归）。排查结论中列出的其它 ⚠ 项（`omnimux-inspiration` / `omnimux-market` / 扩展面板字符加号、`workflow.action.explore` 死键）不在本次范围，另案处理。

## 非目标

- 不改动图标几何、按钮高度/圆角/主色与 hover/active 态。
- 不新增或改动 i18n key（该页现有文案本为中文硬编码）。
- 不统一其它插件的字符加号，不扩展 `scripts/scan-ui-gates.mjs` 的 UI04 字符集。
