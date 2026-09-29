/**
 * verify-no-external-builtin-assets.mjs
 *
 * 工程防外联守卫门禁：
 * 扫描内置 App、预设工作流及项目模板，确保所有静态素材均走官方 R2 持久化存储 (files.omnimux.ai / assets.omnimux.ai / api.omnimux.ai)，
 * 严格禁止引入第三方不可控 CDN 链接（如 cdn.creatify.ai）或未分配 DNS 的虚假域名（如 cdn.omnimux.ai）。
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

export const SCANNED_FILES = [
  resolve(REPO_ROOT, 'plugins/omnimux-apps/catalog/builtin-apps.json'),
  resolve(REPO_ROOT, 'plugins/omnimux-apps/src/shared/builtinCatalogData.ts'),
  resolve(REPO_ROOT, 'plugins/omnimux-workflow/src/client/projects/presetWorkflows.js'),
  resolve(REPO_ROOT, 'plugins/omnimux-workflow/src/client/projects/AppTab.jsx'),
  resolve(REPO_ROOT, 'plugins/omnimux-apps/catalog/presets/app-creatify-3d-cute-vfx.workflow.json'),
  resolve(REPO_ROOT, 'plugins/omnimux-apps/catalog/presets/app-creatify-app-demo.workflow.json'),
  resolve(REPO_ROOT, 'plugins/omnimux-apps/catalog/presets/app-creatify-apparel-tryon.workflow.json'),
  resolve(REPO_ROOT, 'plugins/omnimux-apps/catalog/presets/app-creatify-chasing-product.workflow.json'),
  resolve(REPO_ROOT, 'plugins/omnimux-apps/catalog/presets/app-creatify-fall-down-durability.workflow.json'),
  resolve(REPO_ROOT, 'plugins/omnimux-apps/catalog/presets/app-creatify-product-spotlight.workflow.json'),
  resolve(REPO_ROOT, 'plugins/omnimux-apps/catalog/presets/app-creatify-ugc-selfie.workflow.json'),
];

export const FORBIDDEN_CDN_PATTERNS = [
  /https?:\/\/([a-zA-Z0-9-]+\.)?creatify\.ai[^\s"'`]*/gi,
  /https?:\/\/cdn\.omnimux\.ai[^\s"'`]*/gi,
];

export function auditBuiltinAssets() {
  const violations = [];

  for (const file of SCANNED_FILES) {
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch (err) {
      violations.push({
        file: basename(file),
        match: `无法读取待检查文件 (Fail-Closed): ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    for (const pattern of FORBIDDEN_CDN_PATTERNS) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        for (const match of matches) {
          violations.push({
            file: basename(file),
            match,
          });
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = auditBuiltinAssets();
  if (!result.passed) {
    console.error('❌ [Gate Violation] 检测到内置工程资产中包含未授权的第三方外部链接:');
    for (const v of result.violations) {
      console.error(`  - ${v.file}: ${v.match}`);
    }
    console.error('\n铁律要求：所有内置应用与工作流素材必须归档于官方 R2 存储桶持久化直链 (files.omnimux.ai / assets.omnimux.ai)。');
    process.exit(1);
  } else {
    console.log('✅ [Gate Pass] 内置工程资产防外联门禁检测通过，全部素材合规走官方 R2 持久化直链。');
  }
}
