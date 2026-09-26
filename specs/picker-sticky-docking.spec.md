# 《全屏会话素材挑选联动、Tab栏吸顶接力与意图驱动吸底规格（Spec）》

- **状态**：**已批准签发（Approved for Engineering Implementation）**
- **负责人**：产品经理 许清楚、架构师 高见远、前端开发 裴像素、QA 严过关
- **生效工作树**：`omnimux-dsh-wt-picker-sticky-docking`
- **生效分支**：`agent/omnimux-picker-sticky-docking`
- **归档路径**：`specs/picker-sticky-docking.spec.md`

---

## 一、需求背景与目标（Objective）

用户在 OmniMux 会话工作台首页使用素材库与输入框时，提出了两项决定性的交互逻辑重构与体验优化要求：

1. **场景一：会话全屏状态加号选择素材（拦截 split 右栏，就地置顶与吸底）**：
   - 全屏状态下（右侧边栏未打开），点击输入框加号（`+`）菜单里的「从灵感库选择 / 从资产库选择 / 从商品库选择」，**绝对不唤起右侧边栏（拦截 openWorkbench split 模式）**；
   - 页面平滑滚动跳转到 Tab 栏置顶位置（刚好贴在页面顶部，图 1 效果），同时自动激活对应的 Tab；
   - 触发底部吸底输入框（Docked Mode），供用户即选即装配素材。

2. **细节一：Tab 栏吸顶固定与边界接力滚动（Sticky Header & Scroll Chaining）**：
   - Tab 栏（含一级 6 大库与二级分类流）到达页面顶部时，**必须吸顶固定（position: sticky; top: 0）**；
   - 列表可以在下方自由上下滚动，但 Tab 栏保持吸顶；
   - **滚动接力门禁**：在卡片列表内向上滚动时，优先消耗列表自身的向下滚动偏移量，**有且仅当页面滚动回到列表最顶部（即偏移归零）时**，继续向上滚动页面才会带着 Tab 栏脱离吸顶，自然向下拉出上方的 Hero 标语和居中大输入框。

3. **细节二：意图驱动输入框吸底（默认纯滚动不弹底，显式意图才吸底）**：
   - 废除旧有的 `scrollTop > leaveThreshold` 盲目自动吸底；
   - **没有通过主动交互触发输入框时（纯向下滚动浏览），页面往下滚动默认绝对不显示底部输入框**！输入框随 Hero 自然滚出视口顶部，底部 100% 保持纯净开阔；
   - 底部输入框只有在显式意图触发（点击加号选素材、点击卡片选用素材、点击复刻/快捷入口）时才吸底呈现；
   - 用户主动点击「收起」后，上下滚动绝对静默，严禁再次强行弹起。

---

## 二、命令（Commands）

```bash
# 运行相关单元测试与端到端回归
pnpm --filter omnimux test src/client/session-guide/composer-docking.test.js
pnpm --filter omnimux test src/client/shared/asset-hub-tabs/shared-tabs.test.js
pnpm --filter omnimux test src/client/composer-add/controller.test.js
```

---

## 三、涉及文件与架构结构（Project Structure）

1. `plugins/omnimux/src/client/session-guide/useComposerDocking.js`
   - 实现 `isIntentDrivenRef` 与 `isCollapsedRef` 显式意图状态机；
   - 默认纯向下滚动不吸底；显式意图触发才在视口底边吸底就位；
   - 监听 `omnimux:composer:dock-intent` 全局意图事件；
2. `plugins/omnimux/src/client/session-guide/styles.js`
   - `.omnimux-explore-filter-bar` 升级为 `position: sticky; top: 0; z-index: 80;` 并加上毛玻璃半透明底板，呈现图 1 置顶吸顶效果；
3. `plugins/omnimux/src/client/session-guide/templates/ExploreTemplatesSection.jsx`
   - 监听 `omnimux:explore:scroll-to-tab` 事件，自动切换对应 Tab 并平滑滚动使 Tab 栏精准吸顶；
   - 触发 `omnimux:composer:dock-intent` 激活输入框吸底；
   - 全局标记 `window.__omnimuxFullscreenExploreActive` 生命周期管理；
4. `plugins/omnimux/src/client/composer-add/controller.js`
   - 在 `openKind` 中检查全屏新会话状态，优先派发全屏置顶事件，拦截 `openWorkbench(split)`；
   - 会话进行中或右栏已开时保持原有工作台唤起逻辑。

---

## 四、测试策略与验收标准（Testing & Acceptance Criteria）

1. **测试用例 1（纯滚动静默）**：无意图触发时，页面向下滚动离开视口，`placement` 保持 `inline`，宿主不打上 `data-omnimux-dock-open`，底部不显示输入框；
2. **测试用例 2（意图触发吸底）**：点击加号选素材或调用 `dock(item)`，输入框立即进入 `docked` 态，宿主打上吸底标记，显示收起按钮；
3. **测试用例 3（主动收起后静默）**：点击收起后，页面在任何深度上下滚动均保持 `collapsed`，绝对不重新吸底；
4. **测试用例 4（全屏拦截 split）**：全屏新会话状态下调用 `openLibrary/openInspiration/openProduct`，拦截工作台 split 唤起，成功触发滚动置顶与 Tab 切换事件；
5. **测试用例 5（Tab 栏吸顶）**：Tab 栏样式具备 `position: sticky; top: 0`。
