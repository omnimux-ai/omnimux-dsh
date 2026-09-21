# 规格：首页移除热门入门方式，探索模板标题对齐原字号

## 1. 目标
- 去掉新会话首页「热门入门方式」整块（标题 + 四张入门卡片），减少与「探索模板」的层级重复。
- 将「探索模板」标题字号与字重对齐到原「热门入门方式」标题：`16px` / `600`。
- 顶部胶囊入口与仍被使用的弹窗能力保留；不改模型、发布、凭据链路。

## 2. 新用户基线
- 依赖：全新安装并登录后的空白会话首页即可看到探索模板专区。
- 缺失时：无热门入门卡片不影响首页可用；探索模板仍可浏览与打开应用。

## 3. 成功标准
1. 非紧凑首页 DOM/可见文案中不再出现「热门入门方式」标题，也不再渲染四张 `data-popular-starter-id` 入门卡片。
2. 「探索模板」标题计算样式为 `font-size: 16px`、`font-weight: 600`（与原 `.omnimux-popular-title` 一致）。
3. 顶部 Creatify 胶囊栏仍可正常展示与使用。
4. 依赖热门入门卡片点击的单元测试改为不再要求首页渲染该区块；相关端到端契约同步更新并通过。
5. 先演示、用户确认后再合入；开发版真机验收由人工执行。

## 4. 改动边界
- **总是做**：隔离工作区改码；补齐/调整受影响测试；保留探索模板与胶囊入口。
- **先问**：是否连四张卡片对应的独立弹窗入口一并下线（本次默认仅去首页入口，不删弹窗组件本体）。
- **绝不做**：直推 main；未经确认合入；改 Dev/Prod 凭据或发布通道。

## 5. 主要触点
- `plugins/omnimux/src/client/session-guide/SessionGuide.jsx`
- `plugins/omnimux/src/client/session-guide/styles.js`
- `plugins/omnimux/src/client/session-guide/templates/ExploreTemplatesSection.jsx`（必要时补齐标题 class）
- `plugins/omnimux/src/client/session-guide/component.test.js` 及相关 e2e

## 6. 验证命令
- 单元：`pnpm --filter @omnimux/omnimux exec node --test src/client/session-guide/component.test.js`
- 相关 e2e：按改动触及的 explore / cleanup 用例执行
- 演示：侧边栏打开对照页，用户确认后再合入
