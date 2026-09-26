# 规格：探索模板与会话引导 Tab 栏吸顶背景自适应优化与防穿透治理

## 1. 任务背景与问题诊断
- **现状缺陷**: 
  首页探索模板专区的分类 Tab 栏（`.omnimux-explore-filter-bar`）在界面呈现明显的生硬死黑色块（全屏横贯）。
- **根因分析**:
  此前为实现 Tab 栏吸顶固定（`position: sticky; top: 0`）与防止下方卡片向上滚动时文字从底部穿透重叠，设置了 `background: var(--dsw-alias-bg-layer-0, #0d0d0f);`。
  但 DSH 官方与 OmniMux 设计系统 Token 体系中根本不存在 `--dsw-alias-bg-layer-0`，导致浏览器直接退化为死黑硬编码值 `#0d0d0f`。这不仅在 Dark 模式下与页面底色脱节割裂，且在 Light 模式下会产生巨大的黑条故障。
- **用户要求**:
  优化背景颜色为现代 SaaS 级通透质感，融入页面背景；同时坚决保留固定栏的核心吸顶固定功能与防穿透能力，确保原有 Tab 切换、置顶滚动及状态机逻辑 100% 稳定正常。

## 2. 设计与架构方案（遵循 design.md）
- **色彩与材质**:
  - 彻底拔除未定义的 `--dsw-alias-bg-layer-0` 与死黑 `#0d0d0f`；
  - 严格消费官方原生根底色 Token `--dsw-alias-bg-base`（Dark 模式 `#111113` / `#141416`，Light 模式 `#ffffff`）；
  - 采用现代 SaaS（Linear / Apple HIG 规范）高质感高斯模糊磨砂玻璃方案：
    ```css
    background: color-mix(in srgb, var(--dsw-alias-bg-base, #111113) 90%, transparent);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    backdrop-filter: blur(16px) saturate(140%);
    ```
- **原逻辑零破坏保证**:
  1. 保持 `position: sticky; top: 0; z-index: 80;` 吸顶几何与层级不变；
  2. 90% 不透明度底色 + 16px 模糊深度提供充足遮光力，下方卡片向上滑行穿过时被彻底遮蔽，文字不透出；
  3. 静止未吸顶状态下，与页面底色浑然一体，绝无突兀黑带；
  4. 一级 Tab（精选、资产库、灵感库、商品库、爆款趋势、Skills）与二级细分下划线 Tab 的点击、状态与切换逻辑 100% 保持；
  5. 加号菜单发起的置顶滚动（`omnimux:explore:scroll-to-tab`）与输入框吸底状态机（`omnimux:composer:dock-intent`）保持不变。

## 3. 验收标准
- [x] 代码中无死黑 `#0d0d0f` 或不存在的 Token `--dsw-alias-bg-layer-0`；
- [x] 吸顶属性 `position: sticky; top: 0; z-index: 80;` 严格保留并通过契约测试；
- [x] 双主题（Dark / Light）无缝自适应；
- [x] 单元测试与 E2E 测试全部通过。
