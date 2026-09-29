# 规格：CreateProductMenu 国际化字典容错与跨插件降级兜底

- **版本**：1.0.0
- **工作树**：`.worktrees/fix-create-product-menu-i18n-fallback`

## 1. 目标
解决在资产库等未注册 `kind.physical` / `kind.digital` 翻译字典的宿主环境中，悬停展开新建产品菜单时出现原始翻译 key（`kind.physical` / `add.menu.physicalDesc`）的破损体验。
通过安全回退：当 `t(key)` 返回 key 自身或空值时，自动平滑 fallback 到标准的中文/英文默认文本。

## 2. 验收用例
1. 当 `t('kind.physical')` 返回 `'kind.physical'` 时，菜单标题渲染为 `'实物产品'`；
2. 当 `t('add.menu.physicalDesc')` 返回 `'add.menu.physicalDesc'` 时，描述渲染为 `'电商、硬件、日用消费品，自动提取商品图与规格'`；
3. 当 `t('kind.digital')` 返回 `'kind.digital'` 时，菜单标题渲染为 `'数字产品'`；
4. 当 `t('add.menu.digitalDesc')` 返回 `'add.menu.digitalDesc'` 时，描述渲染为 `'SaaS、软件、数字资产，捕获双端首屏快照与品牌战略'`；
5. 原有商品库内的正常国际化翻译逻辑 100% 保持正常。
