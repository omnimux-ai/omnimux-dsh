# 数字人工作台分区布局与轻量交互重构

## 背景

`omnimux-avatar` 一级页（工作台 Tab `omnimux-avatar:studio`）当前继承「整页唯一滚动」骨架：
左右两栏随页面整体滚动，模型配置以三枚独立下拉常驻右侧栏页眉，形象名称只能经
「新建形象」内联表单创建，侧栏入口位于「新会话」下方列末（rank 8）。

用户要求按参考实现（OmniMux/web influencer 工作台）收敛为双面板分区布局。

## 目标（可测验收标准）

1. **分区独立滚动**
   - 页面根不再是滚动容器：根为 flex 列、占满工作台高度、自身 `overflow:hidden`。
   - 左栏三段式：形象行固定 → 设定块区 `overflow-y:auto` 独立滚动 → 「随机/生成」栏固定在左栏底部，任何分辨率下不被推离视口。
   - 右栏二段式：页眉（模型按钮 + 数据源/浏览方式工具行）固定 → 画廊 `overflow-y:auto` 独立滚动，卡片铺满面板高度，不出现底部黑边。
   - 页面不产生整页滚动条；`first-level-page-layout` 契约对本页登记双面板例外。

2. **模型配置收敛为一个按钮 + 浮层**
   - 右栏页眉只显示一颗按钮（当前模型名 + 渠道名）+ 设置图标。
   - 点击弹出浮层（自绘 popover，非原生 select），内含品牌/模型/分组三级下拉，数据仍来自 `GET /omnimux/model-catalog` 中枢目录。
   - Escape 与点击浮层外关闭。

3. **形象名称轻量编辑**
   - 形象行默认名「未命名」；双击名称进入编辑态，Enter 或失焦即保存，Escape 取消。
   - 移除「新建形象」三段表单；保留「+」快捷新建（自动命名「未命名」并直接进入编辑态）与多形象切换下拉。
   - 重名时给出统一错误提示且不覆盖原名称。

4. **文案与导航**
   - 全局「虚拟形象」→「数字人」（页面标题、侧栏入口、空态、多视角弹窗等所有可见文案）；标识符/路由 id 不变。
   - 侧栏入口 rank 8 → 4.05，落在「项目」（rank 4）之下、「专家·技能·连接器」（rank 4.1）之上。

## 影响面

- `plugins/omnimux-avatar/src/client/{AvatarStage.jsx,components/{ModelPicker,AvatarList}.jsx,styles.js,locales.js,index.js,workbench-seat.test.js}`
- `scripts/verify-stage-scroll-contract.mjs`（avatar 条目登记双面板例外）
- `docs/contracts/first-level-page-layout.md`（例外说明）、`docs/contracts/sidebar-extra-entries.md`（occupants 表 rank/名称）
- `scripts/qa/avatar-stage-acceptance.mjs`（选择器/文案若依赖旧结构则同步）

## 新用户基线

无需任何模型渠道即可打开页面：目录为空时模型按钮显示「选择模型」、生成按钮保持禁用；
形象列表为空时自动新建「未命名」。失败态沿用既有 toast，不静默吞错。

## 验收

- `pnpm --filter omnimux-avatar test`、`pnpm verify:stage-scroll`、`pnpm verify:stages`、`node --test scripts/verify-anti-slop.test.mjs`
- 工作树内真实浏览器验收：菜单选模型、双栏独立滚动、双击改名、入口位置截图。


## 追加：浮层透明底色治理（按类别设门禁）

**缺陷**：模型配置浮层写成 `background: var(--dsw-alias-bg-elevated)`，而该令牌在宿主主题中**不存在**；CSS 变量未定义时整条声明失效，`background` 退回初始值 `transparent`，浮层于是透出下层文字。

**为什么反复出现（根因，非猜测）**：仓库已有 `tests/e2e/guard-no-transparent-popover.test.mjs` 这道「防透底硬门禁」，但它虽然遍历所有插件文件，**唯一的判定逻辑写死在 `sidebar-coordinator.js` 的 `.omnimux-explore-menu` 上**；通用分支的类名正则只认 `^\.omnimux-.*(?:menu|popover-card)$`，既排除其它命名空间，也**没有「底色必须不透明」这条规则**。因此每个新插件的每个新浮层都在「零违规」下通过——门禁是定点补丁，不是类别约束。

**修法（按类别，而不是按选择器）**：
1. 容器判定改为「选择器首段是类选择器 + 去掉 BEM 修饰符后类名以浮层词结尾」，命名空间无关；
2. 同一基础类的全部变体（`[hidden]`、`--modifier`、`:hover`）聚合成一组，底色只要组内声明过一次即通过，避免逐个误判；
3. 致命规则只保留真缺陷类：`backdrop-filter` 毛玻璃、裸用**已知未定义**令牌、显式 `transparent`/`none`、`--dsw-alias-bg-overlay` 偏色；
4. 「每个浮层都必须自带底色」降为非阻断提示——本仓真实组合里宿主组件持有表面、遮罩与面板分离、只写修饰符都是合法写法，逐个要求会逼出无意义重构。

**未定义令牌真源**：`KNOWN_UNDEFINED_TOKENS = ['--dsw-alias-bg-elevated']`（在宿主应用资源里搜不到定义）。仓库内其它插件的既有写法是 `var(--dsw-alias-bg-elevated, <实体回退>)`，即已带兜底；本次把裸用点统一补上实体回退。

**验收**：静态门禁 0 违规；真机断言 `model-menu-surface-is-opaque` 读取浮层 `backgroundColor` 的 alpha ≥ 0.95。
