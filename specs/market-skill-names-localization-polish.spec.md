# 规格 · 技能市场 Skill 中文名称与描述地道化清洗与防劣质机翻门禁 (Issue #2438)

## 1. 业务背景与用户目标
在技能市场与首页技能引导中，用户反馈在中文语言环境下，多款技能的卡片标题混杂了大量连写无空格、半生不熟的英文机翻半成品（如 `educationaldeficiency 轮播卡片`、`listing 电影级 silentspecreveal`、`gulfrecruitment 电影级 arc`、`motifmirror 商品 reel`、`奢华高端 brandphotoreel` 等）。

经排查，该问题源于历史批量多语言适配处理时遗留的缺陷：
1. 关键词粗暴局部替换（如仅替换 `carousel` 为 `轮播卡片`，`cinematic` 为 `电影级`）；
2. 未识别英文短语被暴力剔除连字符并直接拼结在一起（如 `educational-deficiency` 变成 `educationaldeficiency`）；
3. 描述文案机械套用统一模版（如 `专为...营销场景打造...`）；
4. 原有的测试门禁仅判定“是否包含任意汉字”，导致严重机翻粘连词堂而皇之漏过检测。

本期目标：
- 逐一清洗全部 23 款异常技能的中文名称（`titleZh`）与中文描述（`summaryZh`），采用地道、专业的中文短视频/出海营销业务表达；
- 规范行业通用专有名词缩写（如 UGC、SaaS、B2B、UI、DTC、App、IP、Vox）的使用，统一大小写与前后空格；
- 同步更新 `catalog/index.json`、`featured-skills.json` 与 `i18n.js`，保证在中文环境下呈现纯净地道的中文卡片；
- 升级 E2E 测试门禁（`market-all-skills-bilingual.spec.js`），除允许的专有缩写白名单外，严格断言中文标题不得含有任何小写英文字符或粘连字符串，从门禁上根绝劣质机翻。

## 2. 影响范围与改动文件
- `specs/market-skill-names-localization-polish.spec.md`：本规格说明；
- `plugins/omnimux-market/catalog/index.json`：技能市场全量数据字典中的中文标题、描述及搜索标签；
- `plugins/omnimux-market/src/client/i18n.js`：市场原生多语言国际化字典中的中文词条；
- `plugins/omnimux/src/client/session-guide/skills/featured-skills.json`：首页推荐技能池元数据；
- `plugins/omnimux-market/tests/e2e/market-all-skills-bilingual.spec.js`：多语言自动化测试与门禁规则。

## 3. 23 款异常技能地道化清洗清单

| 技能标识 (Slug) | 原异常中文标题 | 规范地道中文标题 | 原英文标题 (保留) |
| --- | --- | --- | --- |
| `editorial-luxury-ig-carousel` | `editorial奢华高端ig轮播卡片` | `奢华高端杂志风轮播卡片` | `Editorial Luxury Ig Carousel` |
| `educational-deficiency-carousel` | `educationaldeficiency轮播卡片` | `认知差痛点科普轮播卡片` | `Educational Deficiency Carousel` |
| `fashion-silent-multishot-showcase` | `时尚穿搭silentmultishotshowcase` | `时尚穿搭多镜头卡点展示` | `Fashion Silent Multishot Showcase` |
| `gulf-recruitment-cinematic-arc` | `gulfrecruitment电影级arc` | `海外招聘电影级人物叙事` | `Gulf Recruitment Cinematic Arc` |
| `hinglish-before-after-saas-hook` | `hinglishbeforeafterSaaS软件黄金钩子` | `跨境印式英语前后对比黄金钩子` | `Hinglish Before After Saas Hook` |
| `latam-marketplace-mixed-ugc-skill` | `拉美电商混合UGC视频` | `拉美电商混合 UGC 种草短片` | `Marketplace Mixed UGC` |
| `listing-cinematic-silent-spec-reveal` | `listing电影级silentspecreveal` | `大牌单品静默微距解密大片` | `Listing Cinematic Silent Spec Reveal` |
| `luxury-brand-photo-reel` | `奢华高端brandphotoreel` | `奢华高端品牌图集短片` | `Luxury Brand Photo Reel` |
| `luxury-dark-carousel-5slide` | `奢华高端dark轮播卡片5slide` | `暗黑奢华风五页轮播卡片` | `Luxury Dark Carousel 5slide` |
| `luxury-editorial-app-reveal` | `奢华高端editorialappreveal` | `奢华杂志风应用揭秘短片` | `Luxury Editorial App Reveal` |
| `motif-mirror-product-reel` | `motifmirror商品reel` | `镜像图腾商品质感短片` | `Motif Mirror Product Reel` |
| `pedestal-product-hero` | `pedestal商品hero` | `展台C位产品高光特写` | `Pedestal Product Hero` |
| `playstore-ui-anchored-promo` | `playstoreuianchored宣传推广` | `应用商店界面锚定推广视频` | `Playstore Ui Anchored Promo` |
| `pregnancy-subscription-warmblush-static-ad` | `pregnancysubscriptionwarmblushstatic广告` | `孕期暖粉治愈风静态图广告` | `Pregnancy Subscription Warmblush Static Ad` |
| `real-estate-multiformat-static-ad` | `realestatemultiformatstatic广告` | `房产多版式静态营销广告` | `Real Estate Multiformat Static Ad` |
| `refurb-tech-product-reel` | `refurbtech商品reel` | `翻新数码好物特写短片` | `Refurb Tech Product Reel` |
| `regulated-claims-static-ad-matrix` | `regulatedclaimsstatic广告matrix` | `合规功效矩阵静态图广告` | `Regulated Claims Static Ad Matrix` |
| `retail-multi-variant-carousel-sale` | `retailmultivariant轮播卡片sale` | `多规格零售促销轮播卡片` | `Retail Multi Variant Carousel Sale` |
| `spanish-ugc-community-spokesperson-hook` | `spanishUGCcommunityspokesperson黄金钩子` | `西语 UGC 社区发言人黄金开头` | `Spanish UGC Community Spokesperson Hook` |
| `ugc-diaspora-direct-address-hook` | `UGCdiasporadirectaddress黄金钩子` | `海外同胞第一人称共情开头` | `UGC Diaspora Direct Address Hook` |
| `ugc-female-creator-product-confession-arc` | `UGCfemalecreator商品confessionarc` | `女性创作者真情倾诉种草短片` | `UGC Female Creator Product Confession Arc` |
| `ugc-homeowner-testimonial-problem-payoff` | `UGChomeowner用户好评problempayoff` | `真实屋主口碑痛点反转视频` | `UGC Homeowner Testimonial Problem Payoff` |
| `ugc-personal-reveal-ad` | `UGCpersonalreveal广告` | `个人自述蜕变揭秘视频广告` | `UGC Personal Reveal Ad` |
| `ugc-street-interview-nightlife-hook` | `UGCstreetinterviewnightlife黄金钩子` | `街头夜生活采访黄金开头` | `UGC Street Interview Nightlife Hook` |
| `wise-elder-ugc-kids-product` | `wiseelderUGCkids商品` | `长辈权威视角儿童好物种草` | `Wise Elder UGC Kids Product` |

## 4. 验收标准
- **AC-1 标题中无非法粘连英文**：中文标题（`titleZh`）中除允许的大写/标准缩写白名单（`UGC`、`SaaS`、`B2B`、`UI`、`DTC`、`App`、`IP`、`Vox`、`3D`、`C位`、`5slide`等受控词）外，严格不得包含连续的小写英文字母；
- **AC-2 描述地道专业**：对 23 款异常技能的中文描述（`summaryZh`）彻底重写，摒弃生硬模板，贴合电商、出海、广告创作与短视频实际业务场景；
- **AC-3 三处数据源 100% 同步**：`catalog/index.json`、`featured-skills.json`、`i18n.js` 三个文件中的标题与描述完全一致；
- **AC-4 E2E 门禁全绿**：升级测试规则后，全量 112 款技能的自动化测试 100% PASS。
