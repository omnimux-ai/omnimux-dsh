# 右键「添加节点」面板去搜索框 + 工作流入口改平铺（Issue 3651）

- 任务：`.worktrees/workflow-context-panel-3651`（分支 `agent/workflow-context-panel-3651-issue-3651`）
- 插件：`omnimux-workflow`
- 依赖：#3640（面板去分类平铺，已合入）、#3639（入口卡）、#3649（maxHeight 扣盒模型）
- 风险：R3（仅 UI 形态；不改数据源、不改节点创建、不改调度语义）

## 目标

右键空白/节点 → 「添加节点」钻取面板当前是 Dock 面板的同一组件（`AddNodeMenu`，`scope="context"`），因此继承了 Dock 的搜索框与「入口卡」形态。用户要求：

1. 右键浮层里不要搜索框（该场景不会输入检索词）。
2. 底部工作流入口参考对照截图改成**平铺行**：去掉上方分割线、去掉常态边框与常态底色（现状看起来像「默认选中」）。

## 变更点

1. `AddNodeMenu.tsx`
   - 搜索区只在 `scope === 'dock'` 渲染；`context` 下不渲染 `.wf-node-menu__search`，也不渲染搜索空态。
   - `context` 下列表直接按 `getAddNodePalette` 的声明顺序渲染全部条目（仍走 `matchAddNodePalette(items, '', t)`，空查询 = 全量且无命中区间），检索纯函数与 Dock 入口不变。
   - 底部入口在 `context` 下加 `wf-node-menu__entry--flat` 修饰类。
2. `theme/components.css`
   - `.wf-node-menu--context .wf-node-menu__header`：去 `border-bottom`（对齐对照图：标题下无线）。
   - `.wf-node-menu--context .wf-node-menu__footer`：去 `border-top` 与上下间距。
   - `.wf-node-menu--context .wf-node-menu__entry--flat`：去 border / 常态 background，行内边距与 `.wf-node-menu__item` 对齐（6px 8px / 8px 圆角）；hover 底色保留。
   - 零裸色：只用既有 token；注释不带 `#`（裸色门禁会把 `#3651` 当 hex）。
3. `ContextMenu.tsx`
   - `ADD_MENU_HEIGHT_ESTIMATE` 按实测的新面板高度校准（具名常量 + 注释说明来源）。

## 非目标

- Dock (+) 面板保持搜索框、命中高亮与入口卡形态。
- 不动右键主菜单项/快捷键、调色板数据源与分组元数据、节点创建与 Feed/Slot 语义。

## 新用户基线

纯前端形态调整，不引入任何本机状态：全新用户安装后打开画布即可看到与 Dock 一致的面板；`context` 少一个搜索框不需要任何服务、凭据或配置，缺失时也没有错误路径可触发（搜索框不是能力入口，移除它不改变任何节点创建路径）。

## 假设

1. `scope` 已经是「Dock 与右键」的唯一区分事实：`AddNodeMenu` 由 `Toolbar`（`scope="dock"`）与 `ContextMenu`（`scope="context"`）两处挂载，按 scope 分叉形态不会影响第三条调用路径。
2. 右键浮层里不存在键盘检索依赖：`context` 面板的搜索框没有自动聚焦、没有快捷键绑定（`N` kbd 只在 dock 渲染），移除后不会留下不可达的键盘入口。
3. 入口行去掉常态底色与边框后仍可被识别为可点项：它保留图标、标题、副标题与右侧箭头，且 hover 有底色。

## 证伪方式

1. 若 `AddNodeMenu` 还存在第三处调用（`rg "AddNodeMenu"` 只有 Toolbar / ContextMenu / 测试），则假设 1 被证伪。
2. 若 `context` 面板存在自动聚焦搜索框的代码（`autoFocus` / `useEffect` + `focus()`）或有指向搜索框的快捷键处理，则假设 2 被证伪；改为保留键盘可达的等价入口。
3. 真实浏览器里在 `context` 面板截图上量取入口行：若常态下出现边框或非透明底色（与相邻条目的常态底色不一致），或去掉后无法辨认/点击，则假设 3 被证伪，需回到「保留细分隔或弱底色」的方案。
4. 900×560 与 1280×720 实测入口 `entryInViewport=false` 或 `clippedPx>0`，则本任务的形态调整破坏了 #3649 的定位修复，必须回退定位相关改动。

## 验收标准

1. `context` 面板：无 `input`、无空态；7 个条目 + 底部入口平铺行。
2. `context` 面板内无分割线（header/footer 的 border 不生效）。
3. 底部入口常态无边框、无底色；hover 有底色；点击打开「创建可复用工作流模板」。
4. Dock 面板不回归：有搜索框、命中高亮、入口卡。
5. 900×560 / 1280×720：入口 `entryInViewport=true`、`clippedPx=0`、可点。
6. `pnpm --filter omnimux-workflow test`、`typecheck`、`pnpm verify:stages`、anti-slop 绿；真实浏览器截图 + 几何 JSON 留存。

## 文档影响

无用户文档需要同步：本次只改既有面板在右键入口下的形态，不改任何命令、配置或产品能力说明；`docs/evidence/issue-3651-*.json|md` 作为任务证据留存。
