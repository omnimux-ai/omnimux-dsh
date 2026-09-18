# Spec · 技能市场卡片全面升级为高饱和度炫彩渐变背景消除深黑底色

## 1. 业务背景与问题根因
用户明确反馈：“和原完成？我们的是深色 对标的是炫彩色啊”，并附上真实客户端实景截图。
在截图中：技能/专家市场中的所有技能卡片（如“UGC 告白”、“电影级”、“UGC 展示”等）呈现一片深灰黑色，没有任何彩色渐变效果。

### 根因深度定位：
1. **图片静态服务路径未连通**：`FeaturedCard.jsx` 中生成的封面地址为 `/omnimux/assets/skill-card-covers/skill-card-${coverIndex}.webp`，而后端 `omnimux-assets` 并未注册该目录，`curl` 实测直接返回 `404 Not Found`；
2. **本地 Icon 路由正则拦截**：即使走 `/omnimux-market/icon?url=catalog/covers/skills/skill-card-2.webp`，在 `local-api.ts` 中针对本地文件的正则为 `/^(?:home\/)?[a-z0-9][a-z0-9-]*\.(png|jpg|jpeg|webp)$/`，未包含 `skills/` 子目录，导致请求被误判拦截为 `400 Bad Request`；
3. **底色无彩色兜底**：`.omnimux-creatify-card` 的默认背景为 `background: var(--dsw-alias-bg-layer-1, #131414)`，当外部图片 404 加载失败后，直接裸露出了最底层的灰黑色死板背景，彻底失去了对标 Creatify 的“炫彩色”灵动质感。

## 2. 解决方案与重构目标
1. **注入 8 套高饱和度炫彩多色渐变底色（CSS Mesh Gradients）**：
   - 彻底摆脱对外部图片加载状态的脆弱依赖，在卡片层直接按 `coverIndex` 注入对应循环的炫彩多色渐变：
     - `1 / 2`: 极光翡翠炫彩（翠绿、薄荷绿与青光深绿多色径向混合）
     - `3`: 晨曦炽金炫彩（烈焰橙、金黄与焦糖红棕绚丽渐变）
     - `4`: 霓虹赛博紫炫彩（电光紫、深紫与洋红交织）
     - `5`: 暮色珊瑚粉炫彩（玫红、珊瑚粉与落日红）
     - `6`: 深海极光蓝炫彩（亮钴蓝、青空天蓝与夜空深蓝）
     - `7`: 梦幻粉紫炫彩（粉紫、薰衣草紫与天青）
     - `8 / 9`: 炽热阳光炫彩（太阳金、赤红与亮橙）
     - `10`: 冰晶薄荷炫彩（青翠绿、松石绿与冰蓝）
   - 卡片在任何网络状况、图片无论是否加载成功下，**首帧即直接绽放绚丽的炫彩质感**！
2. **叠加半透明细腻点阵网格（Dot Matrix Overlay）**：
   - 炫彩渐变上方覆盖经典点阵网格（8px 间距圆点叠加），居中呈现高对比度亮白标题与认证徽标。
3. **打通本地 Icon 图片静态服务路径**：
   - 在 `local-api.ts` 的 `resolveLocalCoverOrAvatar` 中支持 `(?:home\/|skills\/)?`，使 `catalog/covers/skills/*.webp` 能被标准 200 返回；
   - 在 `FeaturedCard.jsx` 中优化封面图地址解析，双轨支持 `/omnimux-market/icon?url=catalog/covers/skills/skill-card-${coverIndex}.webp`。

## 3. 验收标准与测试矩阵
- **AC-1 炫彩渐变背景 100% 呈现**：
  - 打开“技能/专家”市场，所有技能卡片呈现不同色系的绚烂彩色渐变（绿色系、橙色系、紫色系、蓝色系等循环交替）；
  - 彻底告别单调灰黑底色。
- **AC-2 点阵纹理与居中徽标清晰**：
  - 炫彩背景上清晰覆盖点阵颗粒，居中白色大标题与官方认证徽标对比鲜明。
- **AC-3 本地图片路由 200 通过**：
  - 请求 `/omnimux-market/icon?url=catalog/covers/skills/skill-card-2.webp` 返回 HTTP 200 与 `image/webp`。
- **AC-4 自动化测试与实机 CDP 验证**：
  - 单元测试与端到端测试 100% 通过；
  - CDP 直连运行中的开发客户端，实地截取真实炫彩卡片实况证据。
