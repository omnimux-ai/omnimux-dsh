# 《Tab 栏滚动置顶与视口高度撑开规格设计书（PRD + UI 元素与文案字典 Spec Plan）》

- **文档编号**：`SPEC-OMNIMUX-TAB-STICKY-TOP-MIN-HEIGHT-001`
- **状态**：**已签发批准（Approved & Locked for Engineering Implementation）**
- **负责人**：
  - 产品经理：许清楚（Xu · Product Manager & UI/Copy Decision Authority）
  - 前端开发：裴像素（Pei · Frontend Engineer）
  - 架构师：高见远（Gao · Software Architect）
  - QA 负责人：严过关（Yan · QA Assurance Lead）
- **生效工作树路径**：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-tab-sticky-top-min-height`
- **生效分支**：`agent/omnimux-tab-sticky-top-min-height`
- **归档路径**：`specs/tab-sticky-top-min-height.spec.md`

---

## 一、产品概述与业务目标（PRD Overview & User Intent）

### 1.1 业务背景与用户痛点还原
在 OmniMux 全屏新会话（Explore 模式）场景下，用户通过顶部输入框的加号（`+`）菜单发起添加素材操作（如「从灵感库选择」、「从资产库选择」、「从商品库选择」）。
当前系统的预期行为是：将会话视口平滑/瞬间滚动对齐到下方的素材专区（`ExploreTemplatesSection`），切换到对应 Tab，同时输入框自动进入吸底（`docked`）形态。

**现场阻断与用户反馈缺陷根因**：
- **浏览器滚动截断陷阱**：在 Web 渲染机制中，浏览器原生可滚动最大距离受限于容器可滚动高度差：`maxScrollTop = scroller.scrollHeight - scroller.clientHeight`。
- **数据量不足引发的置顶失败**：当 Tab 栏下方的卡片数据较少（例如仅 5 张卡片）、为空（0 张无数据）、或处于网络加载中时，Tab 栏下方的内容区域高度严重不足。导致页面即使滚动触底（`scrollTop` 达到 `maxScrollTop`），Tab 栏依然悬浮在视口中部或偏下位置，**根本无法触达视口顶部（top: 0）**。
- **用户误解与诉求澄清**：用户反馈中提到的“tab 栏 要固定到顶部，可能是由于列表卡片数据不够导致没有被固定到底部（口误，实际指顶部）……我说的固定只是自动跳到固定顶部的位置，依然不影响用户上下滚动页面”。用户的本质意图是：**通过原子滚动将 Tab 栏对齐置顶，无论卡片多寡，Tab 栏都必须 100% 顶到视口最上沿，卡片不足时下方自然留白，且输入框牢牢吸附在视口最底部**。

### 1.2 用户核心意图解构
1. **置顶位置的一致性**：无论卡片是 0 张（空库）、5 张（少量推荐）、还是 50 张（多屏瀑布），点击添加素材跳转后，Tab 栏相对于可视视口的距离必须精确为 `top: 0`。
2. **滚动的非破坏性（Non-destructive Scroll）**：置顶是“滚动位置跳转（Scroll Anchor）”，绝非使用 `position: fixed` 将 Tab 栏硬锁死。用户后续向上滑动页面可自由回看上方的历史引导，向下滑动可浏览后续素材。
3. **极简开阔的留白体验**：卡片数据不够时，中间区域自然作为背景留白（Spacer），严禁堆砌无意义的占位插画或横幅来强行撑高。
4. **输入框的恒定吸底（Docked Composer）**：输入框在跳转后立即保持在视口底部浮动就绪，不因卡片少而悬在半空中。

### 1.3 核心业务目标
- **[Goal-1] 100% 确定性置顶**：无论卡片数量（0 / 1 / 5 / 50+），点击加号添加素材后，Tab 栏绝对位移瞬时对齐视口顶部（误差 $\le 1\text{px}$）。
- **[Goal-2] 0ms 原子跳转**：消灭异步平滑滚动的动画竞态，以 0ms 瞬间赋值完成视口位移与吸底状态机收敛。
- **[Goal-3] 全屏模式隔离**：全屏新会话下点击加号添加素材，严格保持在当前全屏页面内切换与置顶，**绝不唤起右侧 Split 素材工作台**。
- **[Goal-4] 现代 SaaS 留白美学**：遵循 Linear / Vercel 级设计标准，卡片少时极简留空，输入框常驻吸底。

### 1.4 不做事项与产品红线（Non-Goals & Anti-Overdesign Law）
- ❌ **严禁 `position: fixed` 静态锁死**：严禁将 Tab 栏改为脱离文档流的硬性固定定位，剥夺用户向上滚动回看的能力。
- ❌ **严禁过度设计占位元素**：严禁在卡片不足时添加“推荐素材”、“猜你喜欢”、“新手引导横幅”等冗余内容强凑高度。
- ❌ **严禁装饰性图标与冗余标签**：严禁在 Tab 标签或卡片上添加 `💎`、`🔥`、`✨`、`高画质`、`爆款` 等营销类副标题与同义词 Badge。
- ❌ **严禁括号解释废话**：Tab 名称与加号菜单严格使用 2~6 字纯粹实体名词与动作动词，严禁拖带括号解释（如 ❌ `从灵感库选择 (海量视频)`）。

---

## 二、信息架构与交互原型线框（Prototype Wireframe）

### 2.1 视口几何与页面结构原型（ASCII Wireframe）

#### 【状态 A：页面初始状态（顶部未滚动，输入框居中 Inline）】
```text
+-------------------------------------------------------------------------+
| [全屏会话栏 Header]                                                        |
+-------------------------------------------------------------------------+
|                                                                         |
|                       [OmniMux 欢迎标题与会话引导]                           |
|                                                                         |
|                +---------------------------------------+                |
|                | [+] 在此输入创作指令或上传素材...      | (Inline 输入框)   |
|                +---------------------------------------+                |
|                                                                         |
|   ~~~~~~~~~~~~~~~~~~~~~~~~ (视口折叠线下滚动区域) ~~~~~~~~~~~~~~~~~~~~~~  |
|                                                                         |
|   [探索模板 Title]                                                      |
|   [Tab 栏：精选 | 灵感库 | 资产库 | 商品库 | Skills]                       |
|   [二级分类：全部 | 爆款短剧 | 带货营销 | ...]                              |
|   [卡片列表网格...]                                                      |
+-------------------------------------------------------------------------+
```

#### 【状态 B：用户点击 [+] 菜单项（如「从灵感库选择」），0ms 原子置顶状态】
```text
+-------------------------------------------------------------------------+
| [全屏会话栏 Header]                                                        |
+-------------------------------------------------------------------------+
| [Tab 栏 吸顶 top: 0] (精选 | [灵感库*] | 资产库 | 商品库 | Skills)          |
| [二级分类 Underline] (全部* | 场景 | 人像 | 服装 | ...)                   |
+-------------------------------------------------------------------------+
|  [卡片 1]    [卡片 2]    [卡片 3]    [卡片 4]    [卡片 5]                  |
|                                                                         |
|                                                                         |
|                    <--- 中间纯净留白区域 (Spacer) --->                   |
|                  (min-height 撑开，保证 Tab 稳固吸顶)                    |
|                                                                         |
|                                                                         |
+-------------------------------------------------------------------------+
|                +---------------------------------------+                |
|                | [+] 已在灵感库中浏览... (Docked 吸底)  | (吸底输入框)     |
|                +---------------------------------------+                |
+-------------------------------------------------------------------------+
```

### 2.2 三种卡片数据量下的视口表现矩阵

| 数据量状态 | 卡片数量 | Tab 栏下方内容容器表现 | 视口撑开与留白机制 | 吸底输入框表现 |
|---|---|---|---|---|
| **空数据 / 加载态** | 0 张 | 仅显示“暂无对应素材”或“正在加载素材…”微文本 | 容器强制具备 `min-height`（填满一屏高），中间留空，Tab 牢牢吸附视口顶部 | 稳定浮动吸底在视口底端，与内容区保持 120px 安全避让间距 |
| **少量数据（本 Issue 核心场景）** | 1 ~ 5 张 | 卡片紧凑排列在顶部首行，网格高度约 200px~260px | 容器 `min-height` 生效，卡片下方自然大面积留白，滚动条可支撑 Tab 栏 100% 滚动置顶 | 稳定吸底，输入框不遮挡首行卡片，视觉通透干净 |
| **多量数据** | 10 ~ 50+ 张 | 呈现多行自适应网格（`repeat(auto-fill, minmax(180px, 1fr))`） | 真实内容高度超过视口 `min-height`，自然触发连续多屏垂直滚动 | 稳定吸底，滚动时内容从输入框下方穿行，底部预留 padding 确保最后一行完全露出 |

---

## 三、内容容器视口撑开与留白机制规范（Viewport Fill & Layout Architecture）

### 3.1 滚动置顶的几何数学模型与根因根除
为确保滚动操作 `scroller.scrollTop = targetScrollTop` 能够达到目标置顶位置，滚动容器的几何参数必须恒成立：

$$\text{scrollHeight} - \text{clientHeight} \ge \text{targetScrollTop}$$

其中：
- $\text{targetScrollTop}$ 为 Tab 栏（`.omnimux-explore-filter-bar`）在页面文档流中距离滚动容器顶部的距离（通常约为 $280\text{px} \sim 420\text{px}$）。
- $\text{clientHeight}$ 为当前会话滚动窗口的可视高度（$H_{viewport}$）。
- $\text{scrollHeight} = \text{TopSectionHeight} + \text{TabBarHeight} + \text{ContentHeight}$。

若 $\text{ContentHeight}$ 过矮，$\text{scrollHeight}$ 无法达到 $T_{target} + H_{viewport}$，浏览器会强制将 `scrollTop` 截断在 $\text{scrollHeight} - H_{viewport}$，造成 Tab 栏停留在视口半山腰。

**根除方案**：
必须在 CSS 规范中，对 Tab 栏下方的内容区域（`.omnimux-explore-grid-view-wrap` 及 `.omnimux-explore-shelves-view`）施加**强约束的最小视口高度（min-height）**！

### 3.2 最小高度（min-height）与间距规范定义

```css
/* ==========================================================================
   Tab 栏下方内容容器视口撑开规范（唯一真源）
   ========================================================================== */

/* 1. 网格与货架包裹层统一视口撑开：确保无论 0/5/50 卡片，都能滚动使 Tab 置顶 */
.omnimux-explore-grid-view-wrap,
.omnimux-explore-shelves-view {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  
  /* 核心撑开规则：至少占满全屏减去吸顶 Tab 栏高度（约 96px）及顶栏留白 */
  /* 使用 100vh 与 100% 双重保障，确保在容器为 100% 视口时能够撑开足够的滚动深度 */
  min-height: calc(100vh - 96px);
  
  /* 底部呼吸间距：为吸底输入框预留安全避让空间（输入框高约 64-80px + 间距 32px） */
  padding-bottom: 120px;
}

/* 2. 外部素材库网格布局自适应 */
.omnimux-library-stage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  align-items: start;
  align-content: start;
  width: 100%;
  /* 少量卡片时紧凑排列在顶部，不拉伸卡片自身高度 */
  flex: 0 0 auto;
}

/* 3. 状态与空数据提示（中间克制留白，文字居中） */
.omnimux-library-stage-status {
  margin: 40px auto 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  /* 确保空状态不会崩塌高度 */
  min-height: 120px;
}
```

### 3.3 中间留白机制（Middle Spacer Rules）
1. **背景继承律**：留白区域直接透出容器底色 `var(--dsw-alias-bg-base)`，不添加任何斑马纹、背景底纹或分割线。
2. **零拉伸律**：当卡片只有 5 张时，卡片保持标准尺寸（宽 $\ge 180\text{px}$，比例严格遵守各业务卡片标准），严禁为了“填满界面”而将 5 张卡片拉大成通栏卡片。
3. **输入框吸底守卫**：输入框通过 `position: fixed` + `bottom: 16px` 稳固吸附，不受上方内容高度长短影响。

---

## 四、添加素材原子置顶与立即吸底契约（Jump-to-Top & Docking Contract）

### 4.1 触发入口与参数契约
顶部输入框左侧加号（`+`）菜单中，以下动作严格绑定本置顶契约：
- `add-from-inspiration`：切换至一级 Tab `inspiration`（灵感库），二级分类设为 `all`；
- `add-from-assets`：切换至一级 Tab `assets`（资产库），二级分类设为 `all`；
- `add-from-products`：切换至一级 Tab `products`（商品库），二级分类设为 `all`。

### 4.2 0ms 原子瞬时跳转置顶算法
当接收到加号菜单选择事件时，执行严格的 0ms 原子跳转，彻底禁止异步平滑滚动的竞态：

```javascript
/**
 * 0ms 原子跳转置顶契约实现逻辑
 */
function jumpToTabTop(targetEl, scroller) {
  if (!targetEl || !scroller) return;

  const elRect = targetEl.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  
  // 计算精确的相对位移差
  const targetOffset = scroller.scrollTop + (elRect.top - scrollerRect.top);
  
  // 核心：直接同步赋值 scrollTop，0ms 立即就位，杜绝 smooth 异步滚动动画导致的阈值判断错乱
  scroller.scrollTop = Math.max(0, targetOffset);
}
```

### 4.3 全屏模式互斥守卫规则（Fullscreen Exclusive Guard）
在全屏新会话场景下：
- **全局状态标记**：`window.__omnimuxFullscreenExploreActive === true`。
- **互斥红线**：点击「从灵感库选择」、「从资产库选择」、「从商品库选择」时，控制器内**严禁调用 `openWorkbench()` 开启右侧 Split 栏**！
- **行为收敛**：所有素材挑选直接在全屏当前页面的 `ExploreTemplatesSection` 对应 Tab 栏中完成。

### 4.4 输入框原子强制吸底契约（Force Docking Contract）
与跳转置顶同步（同一执行帧），必须触发输入框强制吸底：
1. **派发事件**：
   ```javascript
   window.dispatchEvent(new CustomEvent('omnimux:composer:dock-intent', {
     detail: { tab: targetTab, force: true },
   }));
   ```
2. **状态机响应**：
   - 当携带 `force: true` 时，`useComposerDocking` 必须突破 `isTopVisible` 的拦截；
   - 立即将 `placement` 置为 `'docked'`，并在宿主节点挂载 `data-omnimux-dock-open`；
   - 开启跳转保护锁（`isJumpingRef.current = true`，持续 300ms），防止高频原生 `scroll` 事件在滚动瞬间将状态反向回弹至 `inline`。

### 4.5 自由上下滚动无损保证（Bi-directional Scroll Freedom）
- 跳转置顶完成后，保护锁在 300ms 后释放；
- 用户此时向上滚动时，当滚动位置回退至顶部阈值内，输入框允许按照原有产品逻辑平滑回退为原位 `inline` 状态；
- 用户向下滚动时，Tab 栏依赖自身的 `position: sticky; top: 0; z-index: 80;` 继续保持在视口最顶部，背景 100% 实心遮挡下方穿行的卡片。

---

## 五、UI 元素与文案白名单规格表（UI & Copy Spec — 唯一真源）

### 5.1 核心区域元素与逐字文案锁定表

| 区域 / 组件 ID | 元素类型 | 精确显示文案（中 / 英） | 显隐 / 交互状态规则 | 严禁附加项（显式红线） |
|---|---|---|---|---|
| `explore.header.title` | 标题文本 | `探索模板` / `Explore templates` | 常驻显示在探索区顶端 | 严禁加副标题、严禁加图标、严禁写“发现灵感与精选创意” |
| `primaryTab.featured` | 一级 Tab 按钮 | `精选` / `Featured` | 点击切换至精选货架视图 | 严禁加 `🔥`、`HOT`、`推荐` 标签 |
| `primaryTab.inspiration` | 一级 Tab 按钮 | `灵感库` / `Inspiration` | 点击切换至灵感库卡片流 | 严禁加 `NEW`、`海量` 标签 |
| `primaryTab.assets` | 一级 Tab 按钮 | `资产库` / `Assets` | 点击切换至素材资产流 | 严禁加 `Pro` 徽标 |
| `primaryTab.products` | 一级 Tab 按钮 | `商品库` / `Products` | 点击切换至商品卡片流 | 严禁加 `电商` 角标 |
| `primaryTab.skills` | 一级 Tab 按钮 | `Skills` / `Skills` | 点击切换至技能网格视图 | 严禁翻译为“专业技能工具库”等长文本 |
| `composer.plus.menu.inspiration` | 下拉菜单项 | `从灵感库选择` / `Choose from inspiration library` | 点击触发 Tab 切换 + 0ms 置顶 + 吸底 | 严禁加 `(海量短剧)` 等括号解释废话 |
| `composer.plus.menu.assets` | 下拉菜单项 | `从资产库选择` / `Choose from asset library` | 点击触发 Tab 切换 + 0ms 置顶 + 吸底 | 严禁加括号副标题 |
| `composer.plus.menu.products` | 下拉菜单项 | `从商品库选择` / `Choose from product library` | 点击触发 Tab 切换 + 0ms 置顶 + 吸底 | 严禁加括号副标题 |
| `composer.plus.menu.upload` | 下拉菜单项 | `上传媒体或文件` / `Upload media or files` | 点击触发系统原生文件选择 | 严禁写“本地极速上传”等营销词 |
| `stage.status.loading` | 状态文本 | `正在加载素材…` / `Loading assets...` | 数据请求中显示，居中排布 | 严禁使用花哨旋转动画与营销文案 |
| `stage.status.empty` | 状态文本 | `暂无对应素材` / `No assets available` | 数据为空时显示，居中排布 | 严禁展示大幅哭脸插图或冗余外链 |
| `stage.status.retry` | 操作按钮 | `重试` / `Retry` | 加载失败时显示 | 严禁写“刷新重试试试看” |

### 5.2 严禁出现的过度设计负向清单（Red Line Ban List）
- **[No-1] 严禁同义词叠加**：不得在 Tab 栏内出现 `灵感库` 又附加 `灵感视频` 小标题；
- **[No-2] 严禁装饰性符号**：严禁在卡片标题、Tab 标题周围添加 emoji（💎、🔥、⚡️、✨、🎉）；
- **[No-3] 严禁冗余状态徽标**：卡片上只允许保留客观的类型拓展名（如 `MP4`、`PRD`、`TPL`）与时长，不得挂载主观品质标签（如 `高质量`、`爆款热卖`）；
- **[No-4] 严禁解释性副标题**：在加号菜单、分类 Tab 内部，严禁出现两行式排版（即一行标题 + 一行小字解释）。

---

## 六、前端开发实施指导与核心代码点位（Implementation Guide for Pei）

### 6.1 样式文件调整点位（`plugins/omnimux/src/client/session-guide/styles.js`）
1. 找到 `.omnimux-explore-grid-view-wrap` 与 `.omnimux-explore-shelves-view`；
2. 确保配置 `min-height: calc(100vh - 96px);`（或 `min-height: calc(100vh - 100px);`）；
3. 确保配置 `padding-bottom: 120px;` 为吸底输入框保留绝对安全的避让空间；
4. 确保 `.omnimux-explore-filter-bar` 保持 `position: sticky; top: 0; z-index: 80; background: var(--dsw-alias-bg-base);` 纯色实心防穿透。

### 6.2 模板大专区逻辑点位（`plugins/omnimux/src/client/session-guide/templates/ExploreTemplatesSection.jsx`）
1. 检查 `onScrollToTab` 事件监听回调：
   - 提取 `filterBarRef.current` 或 `sectionRootRef.current`；
   - 优先通过 `scroller.scrollTop = Math.max(0, targetOffset)` 实现 0ms 原子定位；
   - 必须先完成状态切换 `setActivePrimaryTab(targetTab)` 与 `setSelectedSubCategory('all')`，并在当前帧触发原子滚动；
2. 确保在网格包裹容器上渲染正确的类名 `.omnimux-explore-grid-view-wrap`，使其享受 `min-height` 视口撑开能力。

---

## 七、QA 验收标准与测试矩阵（Acceptance Criteria & Test Matrix）

### 7.1 量化验收标准（Acceptance Criteria）

- **AC-01（空数据置顶验收）**：
  - 构造素材库数据为空（`cards: []`）的场景；
  - 在全屏新会话顶部输入框点击加号中的「从灵感库选择」；
  - **判定标准**：页面 0ms 瞬间滚动到位，Tab 栏（`.omnimux-explore-filter-bar`）顶边缘精确贴合滚动容器顶部（`getBoundingClientRect().top === scroller.getBoundingClientRect().top`），下方展示“暂无对应素材”，中间留白，输入框处于视口最底部吸底。

- **AC-02（5 张少量数据置顶验收）**：
  - 构造素材库仅有 5 张卡片（不足一屏）的场景；
  - 点击加号中的「从资产库选择」；
  - **判定标准**：页面瞬时置顶，Tab 栏稳定吸顶 `top: 0`；5 张卡片以标准尺寸整齐排布在首行；卡片下方至输入框之间呈现纯净留白，无元素畸形拉伸。

- **AC-03（多量数据连续滚动验收）**：
  - 构造素材库有 40 张卡片的场景；
  - 点击加号置顶后，用户手动向下滑动；
  - **判定标准**：Tab 栏持续保持吸顶，底层卡片自 Tab 栏下方穿行；滑到底部时，最后一行卡片距离输入框顶边缘 $\ge 24\text{px}$，不被遮挡。

- **AC-04（自由反向滚动验收）**：
  - 在 Tab 置顶状态下，用户鼠标向上滚动页面；
  - **判定标准**：页面平滑向上滚动，露出上方的欢迎标题与引导区域，滚动无阻卡；当滚动至顶部时，输入框平稳解除吸底恢复为原位。

- **AC-05（全屏隔离与右栏互斥验收）**：
  - 在全屏状态下连续快速点击「从灵感库选择」、「从资产库选择」、「从商品库选择」；
  - **判定标准**：右侧栏（`__omnimuxWorkbench`）始终保持关闭（`panelOpen === false`），界面绝不跳变拆分。

- **AC-06（UI 文案与元素白名单验收）**：
  - 审查页面 DOM 结构；
  - **判定标准**：Tab 栏、加号菜单、状态提示中无任何未经白名单授权的副标题、标签、装饰性 Emoji 图标。

### 7.2 自动化测试用例矩阵（Automated Tests to Run）

```bash
# 工作树路径
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-tab-sticky-top-min-height

# 执行相关单元测试与 E2E 验证
node --test plugins/omnimux/src/client/session-guide/picker-sticky-docking.test.js
node --test plugins/omnimux/tests/e2e/picker-sticky-docking.e2e.test.mjs
node --test plugins/omnimux/tests/e2e/explore-templates-dashboard.e2e.test.mjs
```

---

## 八、产品经理签署与交付流转（PM Sign-off Status）

- **规格编制人**：产品经理 · 许清楚（Xu）
- **审核结论**：**APPROVED**（规格完全闭环，契约严密，已彻底消除过度设计与滚动截断风险）
- **后续流转**：
  1. 转交 **前端开发 · 裴像素**：严格按照本文档第四、六节完成 CSS `min-height` 撑开与 0ms 跳转代码落地，严禁自由发挥添加任何非白名单文案；
  2. 转交 **QA 负责人 · 严过关**：严格按照第七节执行 0 张、5 张卡片下的视口置顶自动化与手工断言。
