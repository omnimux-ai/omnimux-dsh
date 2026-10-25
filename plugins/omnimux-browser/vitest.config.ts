import { defineConfig } from 'vitest/config'

/** Standalone test runner against the published DeepSeek Harness packages. */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    // 默认套件不跑浏览器 e2e：`tests/e2e/bridge-extension.e2e.spec.ts` 需要
    // playwright 浏览器与已构建的未打包扩展（仓库契约里那类验收走
    // scripts/lib/extension-e2e.mjs）。它保留为显式入口 `pnpm test:e2e`，
    // 不是被静默跳过：它有自己的配置与入口（`pnpm test:e2e`）；注意那 5 个
    // 用例内部是 describe.skipIf，前置条件缺失时报 skip 而不是 fail。
    exclude: ['tests/e2e/**', '**/node_modules/**'],
  },
})
