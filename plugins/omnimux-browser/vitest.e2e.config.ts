import { defineConfig } from 'vitest/config'

/**
 * 浏览器 e2e 专用配置（`pnpm test:e2e`）。
 *
 * 为什么不复用 `vitest.config.ts`：那份配置为了默认套件不跑浏览器用例，
 * 显式 `exclude: ['tests/e2e/**']`；而 vitest 的 CLI 位置参数挡不住 config 的
 * exclude（`--exclude` 只是"追加"），于是 `vitest run tests/e2e` 会变成
 * "No test files found" 的死入口。这里用独立配置把 include 指回 e2e。
 *
 * 前置条件（chromium 缓存、`extension/dist/manifest.json`）缺失时，这些用例
 * 内部是 `describe.skipIf(!runnable)`：会报 skip 而不是 fail，也就是**不会**
 * 替你发现环境没准备好。它是一次显式的手动验收入口，不是门禁。
 */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
})
