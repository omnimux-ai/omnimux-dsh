import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 内置 AI 应用与预设工作流 R2 持久化直链端到端验证', async (t) => {
  const PRESET_APP_IDS = [
    'app-creatify-app-demo',
    'app-creatify-chasing-product',
    'app-creatify-ugc-selfie',
    'app-creatify-3d-cute-vfx',
    'app-creatify-apparel-tryon',
    'app-creatify-product-spotlight',
    'app-creatify-fall-down-durability',
  ];

  await t.test('1. 内置应用目录 (builtin-apps.json) 必须绑定官方 R2 持久化直链', () => {
    const catalogPath = path.join(root, 'plugins/omnimux-apps/catalog/builtin-apps.json');
    assert.ok(fs.existsSync(catalogPath), 'builtin-apps.json 必须存在');
    const apps = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    for (const appId of PRESET_APP_IDS) {
      const app = apps.find((a) => a.appId === appId);
      assert.ok(app, `应用 ${appId} 必须录入目录`);

      const defaultImg = app.formSchema?.properties?.product_image?.default;
      assert.ok(defaultImg, `应用 ${appId} 必须具有默认商品图`);
      assert.ok(
        defaultImg.startsWith('https://files.omnimux.ai/templates/explore-v1/sha256/'),
        `应用 ${appId} 的商品图必须使用官方 files.omnimux.ai R2 直链，实际为: ${defaultImg}`
      );
      assert.ok(!defaultImg.includes('cdn.omnimux.ai'), `严禁包含未解析假域名 cdn.omnimux.ai`);
      assert.ok(!defaultImg.includes('creatify.ai'), `严禁包含外部外链 creatify.ai`);

      const showcase = app.showcase?.items?.[0];
      assert.ok(showcase, `应用 ${appId} 必须具有演示卡片`);
      assert.ok(
        showcase.posterUrl.startsWith('https://files.omnimux.ai/templates/explore-v1/sha256/'),
        `演示卡片封面必须使用 R2 直链`
      );
      assert.ok(
        showcase.mediaUrl.startsWith('https://files.omnimux.ai/templates/explore-v1/sha256/'),
        `演示卡片视频必须使用 R2 直链`
      );
    }
  });

  await t.test('2. 预设工作流拓扑 (catalog/presets/*.workflow.json) 必须绑定官方 R2 持久化直链', () => {
    for (const appId of PRESET_APP_IDS) {
      const workflowPath = path.join(root, `plugins/omnimux-apps/catalog/presets/${appId}.workflow.json`);
      assert.ok(fs.existsSync(workflowPath), `预设工作流 ${appId}.workflow.json 必须存在`);
      const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

      const slotNode = workflow.nodes.find((n) => n.id === 'node-slot-product-image');
      assert.ok(slotNode, `工作流必须包含商品主图槽位节点`);
      const mediaUrl = slotNode.data?.mediaUrl;
      assert.ok(mediaUrl, `主图槽位节点必须预置有效 mediaUrl`);
      assert.ok(
        mediaUrl.startsWith('https://files.omnimux.ai/templates/explore-v1/sha256/'),
        `主图槽位 mediaUrl 必须指向 files.omnimux.ai，实际为: ${mediaUrl}`
      );
      assert.ok(!mediaUrl.includes('cdn.omnimux.ai'), `严禁包含假域名 cdn.omnimux.ai`);
    }
  });

  await t.test('3. 客户端内置工作流定义 (presetWorkflows.js) 严禁残留 cdn.omnimux.ai 假域名', () => {
    const presetJsPath = path.join(root, 'plugins/omnimux-workflow/src/client/projects/presetWorkflows.js');
    const content = fs.readFileSync(presetJsPath, 'utf8');
    assert.ok(!content.includes('cdn.omnimux.ai'), 'presetWorkflows.js 严禁包含 cdn.omnimux.ai');
    assert.ok(
      content.includes('https://files.omnimux.ai/templates/explore-v1/sha256/'),
      'presetWorkflows.js 必须包含官方 files.omnimux.ai'
    );
  });
});
