# Spec · Hypit 封面改为官网首屏主视觉

- Date: 2026-09-17
- Baseline: brand-new user machine; no dev-only paths
- Related: #2165 精选置顶与封面路径保持不变

## Objective

将 `catalog/covers/hypit-setup.png` 从抽象引导图，替换为 [hypit.ai](https://hypit.ai/) 官网首屏「流水线 + 机械臂 + 手机 + 平台箱」主画面；去掉导航与营销文案，只保留主视觉，尺寸仍为 1280×720。

## Acceptance

| ID | Criterion |
| --- | --- |
| AC-1 | `plugins/omnimux-market/catalog/covers/hypit-setup.png` 为 1280×720 PNG |
| AC-2 | 图面可见传送带、机械臂、手机样片、平台箱；无官网导航、无大标题「Clone any…」、无安装按钮条 |
| AC-3 | 目录 `sk-omx-hypit-setup.cover.asset` 仍为 `catalog/covers/hypit-setup.png`；精选首位不变 |
| AC-4 | 相关单元 / e2e 封面路径断言通过；产品基线通过 |
| AC-5 | `docs/evidence/hypit-hero-cover-*` 保留源图与校验元数据 |

## Product baseline

- 新用户仅依赖已打包的 catalog 封面资源，不访问开发机本地截图路径。
- 封面加载失败时沿用既有占位/回退，不引入开发机绝对路径。

## Commands

```bash
file plugins/omnimux-market/catalog/covers/hypit-setup.png
sips -g pixelWidth -g pixelHeight plugins/omnimux-market/catalog/covers/hypit-setup.png
corepack pnpm --filter @omnimux/market exec node --test src/client/hypit-setup-guide.test.js
corepack pnpm --filter @omnimux/market exec node --test tests/e2e/hypit-featured-cover.spec.js
node scripts/verify-product-baseline.mjs
```

## Boundaries

- Always: 引导安装、不捆绑 Hypit 引擎；保留 Hypit 品牌在其官方主视觉中的呈现
- Never: 把可执行包打进产品；在封面上叠我方长文案
