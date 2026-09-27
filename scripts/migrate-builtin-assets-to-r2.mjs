/**
 * migrate-builtin-assets-to-r2.mjs
 *
 * 工具脚本：将工程内置的所有外部素材（如 cdn.creatify.ai）归档至本地，
 * 提取元数据（sizeBytes, mimeType, dimensions, duration），并替换为
 * 官方 OmniMux R2 存储桶直链（https://cdn.omnimux.ai/presets/builtin/...）。
 *
 * 模式：
 *   node scripts/migrate-builtin-assets-to-r2.mjs --download
 *   node scripts/migrate-builtin-assets-to-r2.mjs --manifest
 *   node scripts/migrate-builtin-assets-to-r2.mjs --replace
 *   node scripts/migrate-builtin-assets-to-r2.mjs --all
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const ASSETS_DIR = resolve(REPO_ROOT, 'assets/builtin-presets');

export const CDN_BASE = 'https://cdn.omnimux.ai/presets/builtin';

// 资产映射注册表：从原始 URL 映射到语义化规范命名及替代策略
export const ASSET_DEFINITIONS = [
  // 1. app-demo (手机与网页交互实机演示)
  {
    name: 'app-demo-poster.webp',
    type: 'image',
    mimeType: 'image/webp',
    originalUrl: 'https://cdn.creatify.ai/community_creation/f23489b3-2ea5-41bb-9c2c-91d35d71e236/preview_image_35c9be15.webp',
    aliases: [
      'https://cdn.creatify.ai/community_creation/preview_image_35c9be15.webp',
      'https://cdn.creatify.ai/preview.webp',
      // 坏链 403 修复映射
      'https://cdn.creatify.ai/community_creation/d4d983e2-108b-4b24-be0d-9fa6619eb608/preview_image_9ec543ab.webp',
    ],
  },
  {
    name: 'app-demo-preview.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    originalUrl: 'https://cdn.creatify.ai/community_creation/f23489b3-2ea5-41bb-9c2c-91d35d71e236/preview_video_fc46dffa_compressed_v2.mp4',
    aliases: [
      'https://cdn.creatify.ai/community_creation/f23489b3-2ea5-41bb-9c2c-91d35d71e236/preview_video.mp4',
    ],
  },

  // 2. 3d-cute-vfx (3D 萌系视觉特效)
  {
    name: '3d-cute-vfx-poster.webp',
    type: 'image',
    mimeType: 'image/webp',
    originalUrl: 'https://cdn.creatify.ai/community_creation/12dca4ee-0535-402c-9f57-f36fd4819157/preview_image_0b102b35.webp',
    aliases: [],
  },
  {
    name: '3d-cute-vfx-preview.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    originalUrl: 'https://cdn.creatify.ai/community_creation/12dca4ee-0535-402c-9f57-f36fd4819157/preview_video_e7e71f76_compressed_v2.mp4',
    aliases: [],
  },

  // 3. chasing-product (追击商品动效)
  {
    name: 'chasing-product-poster.webp',
    type: 'image',
    mimeType: 'image/webp',
    originalUrl: 'https://cdn.creatify.ai/community_creation/dc1c50e1-f8cd-4120-a772-5a34730aeea4/preview_image_e97194d0.webp',
    aliases: [
      // 坏链 403 修复映射
      'https://cdn.creatify.ai/community_creation/8ab931cd-711e-451e-92b1-127eec12822a/preview_image_c8c7f3b8.webp',
    ],
  },
  {
    name: 'chasing-product-preview.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    originalUrl: 'https://cdn.creatify.ai/community_creation/dc1c50e1-f8cd-4120-a772-5a34730aeea4/preview_video_f049866c_compressed_v2.mp4',
    aliases: [],
  },

  // 4. fall-down-durability (掉落摔打测试)
  {
    name: 'fall-down-durability-poster.webp',
    type: 'image',
    mimeType: 'image/webp',
    originalUrl: 'https://cdn.creatify.ai/community_creation/73b5fb39-bcb1-48bc-a382-6de753fcb740/preview_image_0b2932fe.webp',
    aliases: [],
  },
  {
    name: 'fall-down-durability-preview.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    originalUrl: 'https://cdn.creatify.ai/community_creation/73b5fb39-bcb1-48bc-a382-6de753fcb740/preview_video_14eb8331_compressed_v2.mp4',
    aliases: [],
  },

  // 5. apparel-tryon (服装实穿穿戴效果)
  {
    name: 'apparel-tryon-poster.webp',
    type: 'image',
    mimeType: 'image/webp',
    originalUrl: 'https://cdn.creatify.ai/community_creation/9376553d-a10f-444a-99b3-c876de1f6481/preview_image_e825b0ff.webp',
    aliases: [],
  },
  {
    name: 'apparel-tryon-preview.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    originalUrl: 'https://cdn.creatify.ai/community_creation/9376553d-a10f-444a-99b3-c876de1f6481/preview_video_083e3d55_compressed_v2.mp4',
    aliases: [],
  },

  // 6. ugc-selfie (达人自拍实穿种草)
  {
    name: 'ugc-selfie-poster.webp',
    type: 'image',
    mimeType: 'image/webp',
    originalUrl: 'https://cdn.creatify.ai/community_creation/decc9021-4f2a-4d0c-8493-df845635716d/preview_image_d7f74acc.webp',
    aliases: [],
  },
  {
    name: 'ugc-selfie-preview.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    originalUrl: 'https://cdn.creatify.ai/community_creation/decc9021-4f2a-4d0c-8493-df845635716d/preview_video_c2f93f97_compressed_v2.mp4',
    aliases: [],
  },

  // 7. product-spotlight (商品高光聚焦光影)
  {
    name: 'product-spotlight-poster.webp',
    type: 'image',
    mimeType: 'image/webp',
    originalUrl: 'https://cdn.creatify.ai/community_creation/741d9f20-5d37-43b7-926b-935ebc9668db/preview_image_3ac2faf7.webp',
    aliases: [],
  },
  {
    name: 'product-spotlight-preview.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    originalUrl: 'https://cdn.creatify.ai/community_creation/741d9f20-5d37-43b7-926b-935ebc9668db/preview_video_07f45334_compressed_v2.mp4',
    aliases: [],
  },
];

/**
 * 阶段 1：下载全部存活素材到本地
 */
export async function downloadAssets() {
  if (!existsSync(ASSETS_DIR)) {
    mkdirSync(ASSETS_DIR, { recursive: true });
  }

  console.log(`[Phase 1] 开始拉取存量有效素材至 ${ASSETS_DIR}...`);
  for (const item of ASSET_DEFINITIONS) {
    const dest = resolve(ASSETS_DIR, item.name);
    if (existsSync(dest)) {
      console.log(`- 已存在: ${item.name}`);
      continue;
    }

    console.log(`- 正在拉取: ${item.name} <- ${item.originalUrl}`);
    const res = await fetch(item.originalUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      throw new Error(`拉取失败: ${item.originalUrl} HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    console.log(`  成功保存: ${item.name} (${buf.byteLength} bytes)`);
  }
  console.log(`[Phase 1] 素材本地归档完成！\n`);
}

/**
 * 阶段 2：生成包含物理尺寸与元数据的 Manifest
 */
export function generateManifest() {
  console.log(`[Phase 2] 生成资产元数据清单 (manifest.json)...`);
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    cdnBase: CDN_BASE,
    assets: {},
    urlMapping: {},
  };

  for (const item of ASSET_DEFINITIONS) {
    const filePath = resolve(ASSETS_DIR, item.name);
    let sizeBytes = 0;
    if (existsSync(filePath)) {
      const stat = readFileSync(filePath);
      sizeBytes = stat.byteLength;
    }

    const cdnUrl = `${CDN_BASE}/${item.name}`;
    manifest.assets[item.name] = {
      type: item.type,
      mimeType: item.mimeType,
      sizeBytes,
      cdnUrl,
      originalUrl: item.originalUrl,
    };

    // 映射表
    manifest.urlMapping[item.originalUrl] = {
      targetUrl: cdnUrl,
      sizeBytes,
      mimeType: item.mimeType,
    };
    for (const alias of item.aliases) {
      manifest.urlMapping[alias] = {
        targetUrl: cdnUrl,
        sizeBytes,
        mimeType: item.mimeType,
      };
    }
  }

  const manifestPath = resolve(ASSETS_DIR, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`- 清单已写入: ${manifestPath}\n`);
  return manifest;
}

/**
 * 阶段 3：替换工程内置文件中的外部链接，并注入真实元数据
 */
export function replaceProjectAssets(manifest) {
  console.log(`[Phase 3] 开始替换工程文件中的外部外链并预置元数据...`);

  const TARGET_FILES = [
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

  let totalReplacements = 0;
  for (const file of TARGET_FILES) {
    if (!existsSync(file)) {
      console.warn(`! 文件未找到: ${file}`);
      continue;
    }

    let content = readFileSync(file, 'utf-8');
    let fileChanged = false;

    for (const [oldUrl, info] of Object.entries(manifest.urlMapping)) {
      const occurrences = content.split(oldUrl).length - 1;
      if (occurrences > 0) {
        content = content.replaceAll(oldUrl, info.targetUrl);
        fileChanged = true;
        totalReplacements += occurrences;
      }
    }

    if (fileChanged) {
      writeFileSync(file, content, 'utf-8');
      console.log(`- 已替换: ${basename(file)}`);
    } else {
      console.log(`- 无需替换: ${basename(file)}`);
    }
  }

  console.log(`[Phase 3] 替换完成，共替换 ${totalReplacements} 处外部外链！\n`);
}

async function main() {
  const arg = process.argv[2] || '--all';
  if (arg === '--download' || arg === '--all') {
    await downloadAssets();
  }
  let manifest;
  if (arg === '--manifest' || arg === '--all') {
    manifest = generateManifest();
  } else if (arg === '--replace') {
    manifest = JSON.parse(readFileSync(resolve(ASSETS_DIR, 'manifest.json'), 'utf-8'));
  }
  if (arg === '--replace' || arg === '--all') {
    replaceProjectAssets(manifest);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
