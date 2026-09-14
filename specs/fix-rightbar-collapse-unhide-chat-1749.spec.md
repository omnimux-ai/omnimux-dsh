# 规格说明：修复收起右侧边栏后中间会话栏未恢复全屏导致的黑屏死区缺陷

## 一、背景与问题定义

在项目画布全屏模式下，用户打开项目会默认以右侧边栏全屏铺满呈现（会话栏被设置为折叠隐藏 `data-omnimux-conversation-collapsed`）。当用户退出全屏显示会话栏后，或者在画布全屏状态下，用户点击右上角的「收起右侧边栏」按钮（`button[data-sidebar-right-toggle]`）时，右侧边栏被收起折叠（`data-rightbar-collapsed="true"`），但由于会话折叠状态未被解除，中间会话栏依然被锁死为 0 宽且内容被 `display: none` 隐藏，导致整个右侧工作区呈现完全空白黑屏。

用户期望：点击收起右侧边栏时，右侧边栏关闭收起，中间会话栏全屏展开显示，彻底消除黑屏死区。

## 二、验收标准（Acceptance Criteria）

1. **点击右上角收起右侧边栏联动恢复会话全屏**：
   - 当右侧边栏展开（无论全屏还是分栏）时，点击右上角收起右侧边栏按钮（`button[data-sidebar-right-toggle]`），右侧边栏关闭收起，中间会话栏立即解除折叠（清除 `data-omnimux-conversation-collapsed`），宽度占满剩余视口，会话消息与输入框正常可见。
2. **DOM / 状态变更双向自愈与联动**：
   - 当 `.dshDesktopFrame` 出现 `data-rightbar-collapsed="true"` 或 better-sidebar 状态报告 `panelOpen: false` 时，自动解除会话栏折叠（`setConversationCollapsed(false)`），确保无右栏时会话栏绝不隐形。
3. **CSS 强防御机制**：
   - 当外框带有 `[data-rightbar-collapsed="true"]` 时，网格布局规则中中间会话栏绝对不能为 0px，会话内容绝对不能被 `display: none` 隐藏。
4. **全屏/退出全屏按钮正确处理**：
   - 全屏按钮在退出全屏时准确切换至 `split` 模式，确保会话栏展开。
5. **回归无害**：
   - 现有一级全屏页、正常分栏拖拽、左右侧栏收起交互测试全量保持 Green。

## 三、关键交互旅程（User Journey）

1. 用户从项目库打开「测试 2」创作画布（全屏铺满状态）。
2. 用户点击「退出全屏」（右上角向内折角按钮），界面切换为分栏模式，中间正常显示会话栏。
3. 用户点击右上角「收起右侧边栏」按钮，右侧边栏关闭收起，中间会话栏全屏展开显示，不再出现任何空白黑屏。
