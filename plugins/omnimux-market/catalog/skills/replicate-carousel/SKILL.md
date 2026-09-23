---
name: replicate-carousel
description: 基于参考图片、视频截图或商品案例，拆解视觉结构并为新商品生成原创电商图文轮播方案。
---

# 图文复刻 / 电商轮播复刻

## 随附资产

本技能自带以下文件，按需读取，不要凭记忆复述：

| 文件 | 何时读取 |
| --- | --- |
| `references/page-workbook.md` | 逐页拆解、商品迁移与生成检查；同一页号贯穿全流程 |
| `templates/reference-manifest.json` | 登记参考素材、页序与可用性 |
| `templates/page-plan.json` | 输出逐页方案时按此对齐字段 |
| `templates/generation-manifest.json` | 逐页生成时登记状态与结果 |
| `templates/delivery-manifest.json` | 交付前登记数量、命名与完整性 |
| `scripts/package_replicated_carousel.py` | 把通过检查的成图按序命名并打包 ZIP（`--manifest` / `--output-dir` / `--zip`） |

## 1. 目标

帮助用户借鉴参考案例的：

- 图片数量
- 页面顺序
- Hook 类型
- 信息层级
- 构图关系
- 场景氛围
- 卖点顺序
- 文案节奏

同时避免复制：

- 原图
- 原模特
- 品牌资产
- 完整原文案
- 专属商品设计
- 受保护的视觉识别元素

最终输出适用于用户商品的原创轮播方案、英文图内文案和图片生成 Prompt。

---

## 2. 支持的输入

- 参考图片
- 图片组或轮播图链接
- 商品详情页链接
- 商品图片
- 用户提供的商品说明
- TikTok、Instagram 或其他平台的图文案例
- 多个参考案例

---

## 3. 工作流程

### Step 1：收集并确认参考素材

记录：

- 参考案例名称
- 来源页面
- 参考图片数量
- 图片顺序
- 图片是否完整
- 是否存在重复页
- 是否存在无法访问或缺失页面

如果参考素材不完整：

- 明确指出缺失页
- 先分析已取得的页面
- 未获得对应参考时，不生成声称为“复刻”的页面
- 如用户明确接受替代方案，再标记为“延展设计”

---

### Step 2：逐页读取参考图

每页识别：

- 可见文字
- 商品外观
- 人物或手部动作
- 场景
- 镜头景别
- 拍摄角度
- 构图方式
- 色彩和光线
- 图内文案位置
- 页面销售作用

---

### Step 3：区分商品信息来源

将商品信息分成三类：

#### A. 图片直接可见

例如：

- 颜色
- 外轮廓
- 图案
- 按钮
- 拉链
- 包装外观
- 可见文字

#### B. 用户或可靠资料确认

例如：

- 材质
- 尺寸
- 容量
- 功能
- 配件
- 使用方式
- 适用人群

#### C. 未知信息

不能仅凭外观推断：

- 内部结构
- 隐藏功能
- 防水等级
- 具体成分
- 精确尺寸
- 赠品
- 检测结果
- 销量
- 评价
- 折扣
- 医疗或功效结论

---

### Step 4：建立参考结构映射

使用以下格式：

| 参考页 | 参考作用 | 保留的表现方式 | 新商品替换内容 | 替换原因 |
|---|---|---|---|---|
| Page 1 | Hook | 大字标题、近景构图 | 新商品真实痛点 | 避免复制原商品 |
| Page 2 | 卖点展示 | 手持或局部特写 | 新商品可见结构 | 只使用已确认信息 |
| Page 3 | 使用场景 | 生活化场景 | 新商品适用场景 | 保留节奏但更换内容 |
| Page 4 | 信任或收尾 | 产品与文案并置 | 真实规格或购买提示 | 不迁移原案例数据 |

---

### Step 5：制定逐页方案

每页至少包含：

- 页码
- 图片类型
- 销售作用
- 画面描述
- 景别和机位
- 人物或商品动作
- 背景与道具
- 光线
- 构图与版式
- 英文图内文案
- 文案位置
- 商品保真要求
- 禁止添加内容
- 图片生成 Prompt

---

### Step 6：生成前检查

确认：

- 商品图已提供
- 对应参考图已提供
- 商品图用于保持商品身份
- 参考图用于借鉴构图、机位和节奏
- 二者没有被混淆
- 每一页都有明确对应关系
- 未把原案例商品、品牌或文案带入新图
- 未生成未经确认的结构或功能
- 图内文案没有未经证实的营销承诺

---

### Step 7：图片生成

如果用户要求生成图片：

1. 逐页生成
2. 每张图对应一个独立任务
3. 记录商品图和参考图的对应关系
4. 生成前进行必要审批
5. 生成后逐张检查：
   - 商品外观
   - 颜色
   - 轮廓
   - 图案
   - 文字
   - 构图
   - 参考页对应关系
   - 是否出现额外未知结构

生成成功不代表最终合格，必须经过检查。

---

### Step 8：交付与整理

如果用户只要求生成图片：

- 先交付独立图片
- 再询问是否需要规范命名和打包

如果用户明确要求打包：

- 生成全部计划页
- 检查所有图片
- 统一命名
- 创建 ZIP
- 验证文件数量和顺序
- 交付 ZIP 和独立图片

---

## 4. 单页方案模板

```markdown
## Page 01 — [页面作用]

### 图片类型
[例如：商品近景 / 手持展示 / 生活场景 / 细节特写]

### 销售作用
[例如：首图 Hook / 卖点证明 / 使用场景 / 收尾 CTA]

### 保留参考结构
- [构图关系]
- [景别]
- [文字位置]
- [视觉节奏]

### 新商品替换内容
- 商品：[新商品名称或描述]
- 场景：[新场景]
- 卖点：[仅填写已确认卖点]

### 画面描述
[描述主体、背景、动作、道具和视觉重点]

### 镜头与机位
- 景别：
- 机位：
- 视角：
- 镜头方向：
- 商品占画面比例：

### 版式
- 背景：
- 图片布局：
- 文案位置：
- 字体层级：
- 留白区域：

### 英文图内文案
主标题：
`[英文标题]`

辅助文案：
`[英文副标题或短句]`

### 商品保真要求
- 保持商品颜色：
- 保持商品轮廓：
- 保持商品材质表现：
- 保持可见结构：
- 不改变品牌元素：

### 禁止添加
- 未确认的内部结构
- 未确认的功能
- 未确认的配件
- 原参考案例品牌
- 原参考案例人物
- 原参考案例完整文案
- 未经证实的数据或承诺

### 图片生成 Prompt
```text
Create an original ecommerce carousel image for [product].
Use the reference image only for composition, camera angle,
visual hierarchy, lighting, and text placement.

Product appearance:
[描述商品真实外观]

Scene:
[描述场景]

Camera:
[景别、机位、角度]

Composition:
[版式和主体位置]

Lighting:
[光线和色彩]

On-image text:
"[准确英文文案]"

Place the headline at [位置].
Keep the product identity unchanged.
Do not copy the reference product, model, logo, brand assets,
or original wording.
Do not add unseen features, accessories, internal structures,
or unsupported claims.
```

```

---

## 五、参考清单模板

```json
{
  "project": "carousel-replication",
  "reference_set": "reference-name",
  "pages": [
    {
      "page_number": 1,
      "source_page": "来源页面描述",
      "source_media": "参考图片来源描述",
      "local_file": "ref-01.ext",
      "width": null,
      "height": null,
      "download_status": "success",
      "view_status": "reviewed",
      "notes": ""
    }
  ],
  "missing_pages": [],
  "assumptions": []
}
```

---

## 六、生成清单模板

```json
{
  "project": "carousel-replication",
  "planned_pages": 0,
  "pages": [
    {
      "page_number": 1,
      "reference_page": 1,
      "product_image": "product-reference.ext",
      "reference_image": "ref-01.ext",
      "generation_status": "pending",
      "inspection_status": "pending",
      "needs_revision": false,
      "notes": ""
    }
  ]
}
```

---

## 七、交付清单模板

```json
{
  "project": "carousel-replication",
  "delivery": {
    "planned_count": 0,
    "generated_count": 0,
    "approved_count": 0,
    "delivered_count": 0,
    "zip_status": "not_requested"
  },
  "files": [
    {
      "page_number": 1,
      "filename": "01_hook-problem.png",
      "image_type": "hook",
      "status": "approved"
    }
  ]
}
```

---

## 八、文件命名规范

```text
01_hook-problem.png
02_product-detail.png
03_lifestyle-use.png
04_feature-demo.png
05_trust-close.png
```

命名要求：

- 两位数字编号
- 按最终轮播顺序命名
- 使用英文小写
- 使用短横线
- 不使用中文
- 不使用随机 ID
- 不使用长 Prompt
- 保留真实文件扩展名
- 不把 PNG/WebP 直接改名为 JPG

---

## 九、质量检查清单

```markdown
### 参考完整性
- [ ] 每个计划页都有对应参考页
- [ ] 参考页顺序已确认
- [ ] 没有把重复素材误判为新页面
- [ ] 缺失页已单独记录

### 商品保真
- [ ] 商品颜色正确
- [ ] 商品轮廓正确
- [ ] 商品图案正确
- [ ] 商品结构没有被改造
- [ ] 没有添加未确认的功能或配件

### 视觉复刻边界
- [ ] 借鉴了构图和节奏
- [ ] 没有复制原图
- [ ] 没有复制原模特
- [ ] 没有复制原品牌
- [ ] 没有复制完整原文案

### 商业表达
- [ ] 首图 Hook 清晰
- [ ] 每页有不同的可见信息
- [ ] 文案与商品事实一致
- [ ] 未迁移原案例销量、评价、折扣或参数
- [ ] 未使用未经确认的功效或认证声明

### 交付完整性
- [ ] 计划页数与交付页数一致
- [ ] 每页都有独立文件
- [ ] 文件名连续且唯一
- [ ] 图片顺序正确
- [ ] ZIP 中无参考图、日志或临时文件
```

---

## 十、简化版执行逻辑

```text
输入参考素材
    ↓
收集并验证参考页
    ↓
逐页分析视觉结构
    ↓
确认新商品事实
    ↓
建立参考结构映射
    ↓
输出逐页轮播方案
    ↓
用户确认是否生成
    ↓
逐页生成图片
    ↓
逐页保真检查
    ↓
独立图片交付
    ↓
按需规范命名和打包
```

这个模板适用于服饰、美妆、家居、3C、收纳、宠物用品等电商图文轮播场景。
