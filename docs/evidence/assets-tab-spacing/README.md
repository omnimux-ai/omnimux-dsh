# 资产库二级分类导航栏上下呼吸留白实测证据

- 任务关联：Issue #1977
- 规格文档：`specs/assets-tab-spacing.spec.md`
- 关联分支：`fix/assets-tab-spacing-issue-1977`

## 1. 现象与根因

用户反馈截图显示：在「资产中心」公共分类下，二级分类胶囊行（全部、角色、场景...）上方紧贴一级 Tab 栏（本地/公共/产品库的白横线），下方直接紧贴卡片上沿，上下均无留白，挤压严重。

经查：
- `.omnimux-assets-cloud-nav` 原先声明 `padding: 0;`，当页面吸附置顶后，吸附栏 `top: 48px` 紧挨着一级栏底边，胶囊行内部高度 28px，下方的卡片滚动时直接抵着胶囊底边，上下间距均为 0px。
- `.omnimux-assets-local-nav` 原先为 `padding: 8px 24px 10px;`，间距偏紧。

## 2. 修复实施

- `.omnimux-assets-cloud-nav` 调整为 `padding: 12px 0 14px;`：
  - 上方保持 12px 呼吸留白，与一级栏白横线自然分离；
  - 下方保持 14px 标准间距，卡片在胶囊行下方有舒适缓冲。
- `.omnimux-assets-local-nav` 调整为 `padding: 12px 24px 14px;`，保持本地与公共两级导航上下节奏一致。

## 3. 实机测量数据

经由 Chromium CDP 实测：
- 未滚动状态：
  - 胶囊上方净空：12px
  - 胶囊下方净空：14px
- 滚动吸附状态（scrollTop >= 260px）：
  - 胶囊上方净空（相对一级吸附栏底边）：12px
  - 胶囊下方净空（相对进入遮挡区的卡片）：14px
- 判定：PASS（上下留白均匀舒适，彻底解决贴脸压迫感）。
