# 复现证据：灵感库勾选后批量操作栏不出现

- 来源：用户在真实 App（灵感社区 → 灵感库）勾选两张卡片后的截图 `repro-before-local-tab-ticked-no-bar.webp`。
- 现象：两张卡片已勾选，筛选行下方没有「已选 2 项 / 全选本地 / 取消选择 / 删除 (2)」。
- 根因定位：`InspirationSection.jsx` 中批量操作栏位于 `tab === 'public'` 条件块内（#2560 引入），灵感库为 `local`。

# 修复后真实浏览器验证（ego-browser，工作树内）

- 页面：esbuild 打包真实 `InspirationSection.jsx` + 真实 `dsh-ui-kit`，宿主图标库用最小桩，灵感库数据为桩接口（`demo/`）。
- 步骤：点「灵感库」→ 勾选第 1、2 张卡片 → 操作栏出现 → 点「取消选择」。
- 结果：操作栏文本 `已选 2 项 / 全选本地 / 取消选择 / 删除 (2)`；点「取消选择」后操作栏消失，勾选数 0。
- 截图：`after-local-tab-ticked-bar-visible.png`、`after-clear-bar-gone.png`。
- 局限：桩页面没有宿主全局样式，按钮为未着色状态；只证明显示与交互，不证明最终配色。
