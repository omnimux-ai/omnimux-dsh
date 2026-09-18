# 快捷菜单面板去透明度纯色遮罩与宽度两侧对齐输入框

## 目标与验收
1. 用户明确需求：菜单面板（技能 Skills 菜单及视频广告、图片广告、竞争对手研究等子菜单面板）不要透明，同时菜单面板宽度左右两侧严格对齐上方输入框（如图 2 所示）。
2. 背景不透明度验收：面板背景采用纯深色实体底色（`#18191c`），完全不透底，彻底杜绝下层卡片内容及图片重叠透出；移除产生透底的模糊滤镜。
3. 宽度与几何对齐验收：面板宽度左右两侧与输入框边界完全重合（宽度 100% 对齐输入框，水平位移与输入框左右对齐），两端垂直无差。
4. 交付门禁：先高保真交互演示并实机测量几何数据，待用户确认后合入。

## 实施
1. 源码修改：`plugins/omnimux/src/client/session-guide/CreatifyPillsBar.jsx`。
2. 宽度与定位约束：
   - 外层容器 `.omnimux-creatify-pills-bar` 约束 `maxWidth: 'var(--dsh-composer-card-max-width, 952px)'`，并保持 `margin: '12px auto 16px'` 居中，与输入框卡片宽度及对齐锚点保持一致。
   - 弹窗面板 `.omnimux-skills-popover` 与 `.omnimux-subprompt-popover` 采用 `left: 0`、`right: 0`、`width: '100%'`、`maxWidth: '100%'`，左右两端撑满容器，与输入框左边、右边完全垂直对齐。
3. 背景与材质：
   - 面板背景使用完全不透明实色 `#18191c`，去除透光毛玻璃干扰，搭配精致描边与深色投影。
   - 技能弹窗列表支持空态提示，提升交互严谨度。

## 验证与测试
1. 单元测试回归：`plugins/omnimux/src/client/session-guide/creatify-pills-composer.test.js`。
2. 真实浏览器几何测量：测量输入框与菜单面板左右边缘坐标差（Delta ≤ 1px）并截取渲染证据。
