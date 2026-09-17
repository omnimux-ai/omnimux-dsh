# 规格说明书：爆款对标地区与类目代码级中英文多语言适配 (Issue #2200)

## 一、 核心目标与业务背景
在会话引导页的「爆款对标」板块筛选工具栏中：
1. **地区（Region）代码裸露问题**：当前下拉菜单项仅显示 CA、DE、GB、LV、MD、SE、TH、US 等原始国家二字码，缺乏本地化转换；
2. **类目（Category/Industry）混杂问题**：上游灵感库中英文混杂（如 digital、Fitness、Food & Cooking 与 电脑和办公设备、家居装修 并存），前端直接作为 label 呈现；
3. **微文案定语冗余**：首项为「全部地区」「全部类目」，违背《OmniMux 全局 UI 命名与微文案规范》中的实体名词锚与状态正交分离律；
4. **双语实时适配**：代码层必须深度适配 DSH 宿主语言配置（zh / en），实现零重启热切换。

## 二、 新用户与产品基线 (Product Baseline)
- 新用户首次打开应用，爆款对标板块根据 DSH 语言配置初始化：
  - 中文模式下：地区呈现「美国、泰国、德国、英国」等，类目呈现「数码家电、电脑办公、家居生活」等；首项呈现「全部」；未选触发器呈现「地区 ▾」、「类目 ▾」；
  - 英文模式下：地区呈现「United States、Thailand、Germany」等，类目呈现「Consumer Electronics、Computers & Office、Home & Living」等；首项呈现「All」；未选触发器呈现「Region ▾」、「Category ▾」；
- 未收录的地区二字码或自定义类目平滑降级展示原值，绝不崩溃或显示为空。

## 三、 详细契约与设计

### 1. 地区本地化词典映射 (`trending-i18n.js`)
- `formatRegionLabel(code, t)`：
  - 建立标准国家/地区映射字典，覆盖出海高频国家：
    - US: zh: '美国', en: 'United States'
    - CA: zh: '加拿大', en: 'Canada'
    - GB: zh: '英国', en: 'United Kingdom'
    - DE: zh: '德国', en: 'Germany'
    - FR: zh: '法国', en: 'France'
    - JP: zh: '日本', en: 'Japan'
    - KR: zh: '韩国', en: 'South Korea'
    - TH: zh: '泰国', en: 'Thailand'
    - VN: zh: '越南', en: 'Vietnam'
    - ID: zh: '印度尼西亚', en: 'Indonesia'
    - MY: zh: '马来西亚', en: 'Malaysia'
    - PH: zh: '菲律宾', en: 'Philippines'
    - SG: zh: '新加坡', en: 'Singapore'
    - BR: zh: '巴西', en: 'Brazil'
    - MX: zh: '墨西哥', en: 'Mexico'
    - AU: zh: '澳大利亚', en: 'Australia'
    - ES: zh: '西班牙', en: 'Spain'
    - IT: zh: '意大利', en: 'Italy'
    - SE: zh: '瑞典', en: 'Sweden'
    - LV: zh: '拉脱维亚', en: 'Latvia'
    - MD: zh: '摩尔多瓦', en: 'Moldova'
    - NL: zh: '荷兰', en: 'Netherlands'
    - PL: zh: '波兰', en: 'Poland'
    - SA: zh: '沙特阿拉伯', en: 'Saudi Arabia'
    - AE: zh: '阿联酋', en: 'United Arab Emirates'
  - 若代码未在字典中，回退为原二字码。

### 2. 类目双向双语归一化词典 (`trending-i18n.js`)
- `formatIndustryLabel(category, t)`：
  - 支持中英文双向输入并归一化转换为当前语言的目标文案：
    - `digital` / `数码家电` / `3C数码` -> zh: '数码家电', en: 'Consumer Electronics'
    - `电脑和办公设备` / `Computers & Office` -> zh: '电脑办公', en: 'Computers & Office'
    - `Education & Knowledge` / `教育知识` / `教育培训` -> zh: '教育培训', en: 'Education & Learning'
    - `Fitness` / `运动健身` / `健身` -> zh: '运动健身', en: 'Sports & Fitness'
    - `Food & Cooking` / `美食餐饮` / `食品饮料` -> zh: '食品饮料', en: 'Food & Beverage'
    - `家居装修` / `Home & Living` / `Home Improvement` -> zh: '家居生活', en: 'Home & Living'
    - `健康` / `Health & Wellness` -> zh: '医疗健康', en: 'Health & Wellness'
    - `女装和内衣` / `Women's Apparel` -> zh: '女装内衣', en: 'Women\'s Apparel'
    - `beauty` / `美妆个护` -> zh: '美妆个护', en: 'Beauty & Personal Care'
    - `home` -> zh: '家居生活', en: 'Home & Living'
    - `apparel` / `clothing` / `服饰鞋包` -> zh: '服饰鞋包', en: 'Apparel & Accessories'
    - `pets` / `宠物用品` -> zh: '宠物用品', en: 'Pet Supplies'
    - `automotive` / `汽车用品` -> zh: '汽车用品', en: 'Automotive'
    - `baby` / `maternity` / `母婴用品` -> zh: '母婴用品', en: 'Baby & Maternity'
    - `sports` / `户外运动` -> zh: '户外运动', en: 'Sports & Outdoors'
    - `toys` / `玩具潮玩` -> zh: '玩具潮玩', en: 'Toys & Hobbies'
    - `gaming` / `游戏动漫` -> zh: '游戏动漫', en: 'Gaming & Anime'
    - `books` / `图书文娱` -> zh: '图书文娱', en: 'Books & Media'
    - `Personal Development` / `个人成长` -> zh: '个人成长', en: 'Personal Development'
  - 若未在字典中，平滑回退原字符串。

### 3. 微文案与下拉项契约
- 下拉首项（`value === ''`）：
  - 统一显示为 `t('common.all') || '全部'`（英文为 `All`）；
- 触发器（Trigger）：
  - 未选时（`value === ''`）：显示纯实体名词 `t('trending.filter.region')`（地区 / Region）或 `t('trending.filter.industry')`（类目 / Category）；
  - 选中项时（`value !== ''`）：展示经本地化映射后的标准名称；
- 下拉选项列表（Menu Options）：
  - 每一项的展示标签通过 `formatRegionLabel` / `formatIndustryLabel` 动态翻译；
  - 每一项的绑定值（`value`）严格保持原始国家代码与类目键，确保服务端过滤与参数兼容。

## 四、 验证与质量门禁 (Quality Gate)
1. 单元测试覆盖全部国家代码与类目在 zh 与 en 下的双向解析与降级表现；
2. 现有 125+ 项自动化测试（trending suite）修改对齐后 100% 通过；
3. 开源代码审查（审秋毫）零缺陷通过；
4. 独立单文件演示页面通过侧边栏浏览器验收。
