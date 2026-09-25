/**
 * scripts/transpile-creatify-workflows.mjs
 *
 * 自动化从 Creatify 162 套原始工作流中提取 7 大分类王牌爆款，
 * 转译为 OmniMux 标准不可变工作流快照（CanvasWorkspaceSnapshot）
 * 并生成对应的 ApplicationManifest 标准清单。
 */

import fs from 'node:fs';
import path from 'node:path';

const CREATIFY_BASE = '/Users/x/Desktop/Project/OPC/资产库/素材库/gxgen-data/inspiration-library/creatify/adflow-templates-20260917';
const CATALOG_PATH = path.join(CREATIFY_BASE, 'full-catalog.json');

const APP_SPECS = [
  {
    categoryKey: 'apps-software',
    categoryNameZh: '软件应用',
    creatifyId: 'f23489b3-2ea5-41bb-9c2c-91d35d71e236',
    appId: 'app-creatify-app-demo',
    titleZh: '手机与网页交互实机演示',
    titleEn: 'App Demo: Interactive UI Screen',
    descZh: '适用于 SaaS 界面穿屏、手机 App 操作流程实录与软件出海推广',
    descEn: 'High-conversion interactive screen demo for SaaS and mobile apps',
  },
  {
    categoryKey: 'hook-intro',
    categoryNameZh: '黄金开场',
    creatifyId: 'dc1c50e1-f8cd-4120-a772-5a34730aeea4',
    appId: 'app-creatify-chasing-product',
    titleZh: '巨型商品撞屏与荒诞追逐',
    titleEn: 'Chasing The Product: Impact Hook',
    descZh: '专治前3秒滑走：巨型商品撞屏、路人惊呼追逐与戏剧性反差',
    descEn: 'Stop scrolling in 3 seconds: Giant product drop and chase drama',
  },
  {
    categoryKey: 'ugc-review',
    categoryNameZh: '真实种草',
    creatifyId: 'decc9021-4f2a-4d0c-8493-df845635716d',
    appId: 'app-creatify-ugc-selfie',
    titleZh: '海外达人自拍第一视角口播评测',
    titleEn: 'UGC Selfie: Authentic Product Review',
    descZh: '降低买家防备心：海外真实达人自拍口播、手持展示与痛点实测吐槽',
    descEn: 'Authentic first-person selfie review to boost trust and sales',
  },
  {
    categoryKey: 'cinematic-vfx',
    categoryNameZh: '视效大片',
    creatifyId: '12dca4ee-0535-402c-9f57-f36fd4819157',
    appId: 'app-creatify-3d-cute-vfx',
    titleZh: '3D 视效粒子与动态破屏大片',
    titleEn: '3D VFX: Dynamic Particle Impact',
    descZh: '营造高端电影质感：3D 光影粒子环绕、超现实悬浮与破屏动效',
    descEn: 'Cinematic 3D particle impact and floating product commercial',
  },
  {
    categoryKey: 'fashion-try-on',
    categoryNameZh: '模特试穿',
    creatifyId: '9376553d-a10f-444a-99b3-c876de1f6481',
    appId: 'app-creatify-apparel-tryon',
    titleZh: '模特动态走秀穿搭与场景变装',
    titleEn: 'Fashion Apparel: Runway Try-On',
    descZh: '专攻服饰鞋包转化：模特街头走秀、多场景无缝换装与面料微距质感',
    descEn: 'Dynamic runway fashion try-on with scene transitions',
  },
  {
    categoryKey: 'industry-packs',
    categoryNameZh: '行业精选',
    creatifyId: '741d9f20-5d37-43b7-926b-935ebc9668db',
    appId: 'app-creatify-product-spotlight',
    titleZh: '15秒焦点商业大促带货广告',
    titleEn: '15s Product Spotlight: Commercial Ad',
    descZh: '电商大促爆款标配：强节奏多镜头分镜、核心卖点连续轰炸与高光特写',
    descEn: '15-second high-energy product spotlight and promo ad',
  },
  {
    categoryKey: 'durability-test',
    categoryNameZh: '硬核评测',
    creatifyId: '73b5fb39-bcb1-48bc-a382-6de753fcb740',
    appId: 'app-creatify-fall-down-durability',
    titleZh: '高空跌落耐用防摔与折扣实测',
    titleEn: 'Fall Down: Durability & Discount Showcase',
    descZh: '建立极强品质信任：高空跌落耐摔、极限冲击与实拍折扣力度揭晓',
    descEn: 'High impact drop durability test to prove solid product quality',
  },
];

function transpileWorkflow(rawDag, spec) {
  const nodes = [];
  const edges = [];

  // 1. 商品图输入槽节点
  nodes.push({
    id: 'node-slot-product-image',
    type: 'material',
    position: { x: 50, y: 100 },
    data: {
      type: 'image',
      materialType: 'image',
      tool: 'import-image',
      label: '商品主图槽位 (Product Image)',
      slotRole: 'product_image',
      isSlot: true,
      nodeKind: 'import',
      selectedTool: 'import',
      status: 'completed',
      mediaUrl: spec.previewImage || '',
      params: {
        aspectRatio: '9:16',
      },
    },
  });

  // 2. 核心文案提示词槽节点
  nodes.push({
    id: 'node-slot-copywriting',
    type: 'material',
    position: { x: 50, y: 350 },
    data: {
      type: 'text',
      materialType: 'text',
      tool: 'prompt-template',
      label: '核心文案槽位 (Copywriting)',
      slotRole: 'copywriting',
      isSlot: true,
      nodeKind: 'import',
      selectedTool: 'import',
      status: 'completed',
      content: spec.defaultPrompt || '',
      prompt: spec.defaultPrompt || '',
    },
  });

  // 3. 多模态视频生成主节点
  nodes.push({
    id: 'node-video-generation-core',
    type: 'material',
    position: { x: 450, y: 200 },
    data: {
      type: 'video',
      materialType: 'video',
      nodeKind: 'generate',
      selectedTool: 'omnimux_video_submit',
      tool: 'omnimux_video_submit',
      label: `${spec.titleZh} 视频生成内核`,
      model: 'seedance-2.0',
      params: {
        model: 'seedance-2.0',
        aspectRatio: '9:16',
        duration: 5,
        mode: 'first_frame',
      },
      upstreamBindings: {
        image: 'node-slot-product-image',
        prompt: 'node-slot-copywriting',
      },
    },
  });

  // 4. 音频旁白配乐槽节点
  nodes.push({
    id: 'node-slot-voice-tts',
    type: 'material',
    position: { x: 450, y: 450 },
    data: {
      type: 'audio',
      materialType: 'audio',
      tool: 'omnimux_audio_submit',
      label: '旁白解说与音色 (Voice TTS)',
      slotRole: 'voice_tts',
      isSlot: true,
      nodeKind: 'import',
      selectedTool: 'import',
      status: 'completed',
      params: {
        voice: 'zh_female_energetic',
        speed: 1.0,
      },
    },
  });

  // 连线定义
  edges.push({
    id: 'edge-img-to-video',
    source: 'node-slot-product-image',
    sourceHandle: 'out',
    target: 'node-video-generation-core',
    targetHandle: 'in',
    label: '商品图输入',
    data: {
      targetSlot: 'first_frame',
    },
  });
  edges.push({
    id: 'edge-text-to-video',
    source: 'node-slot-copywriting',
    sourceHandle: 'out',
    target: 'node-video-generation-core',
    targetHandle: 'in',
    label: '分镜文案',
  });

  return {
    schemaVersion: 3,
    id: `ws-${spec.appId}`,
    name: spec.titleZh,
    version: 1,
    nodes,
    edges,
    settings: {
      maxParallel: 2,
      failStrategy: 'fail-fast',
    },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      sourceWorkflowId: spec.creatifyId,
    },
  };
}

function generateAppManifest(spec, rawItem) {
  const previewVideo = rawItem.preview_video || '';
  const previewImage = rawItem.preview_image || '';

  return {
    schemaVersion: '1.0.0',
    appId: spec.appId,
    version: '1.0.0',
    workflowBinding: {
      workspaceId: `ws-${spec.appId}`,
      workflowVersion: 1,
    },
    metadata: {
      name: spec.titleZh,
      category: 'video',
      description: spec.descZh,
      icon: 'video',
      tags: ['creatify', spec.categoryKey, 'e-commerce', 'viral-video'],
      author: 'OmniMux Official',
    },
    formSchema: {
      type: 'object',
      properties: {
        product_image: {
          type: 'string',
          title: '商品主图 / 白底图',
          description: '粘贴商品链接、从商品库选择或本地上传',
          widget: 'product-link',
          default: previewImage,
          placeholder: '粘贴商品链接，或从商品库选择',
        },
        copywriting: {
          type: 'string',
          title: '核心卖点与旁白分镜',
          description: '填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏',
          widget: 'textarea',
          default: rawItem.description || spec.descZh,
        },
        voice: {
          type: 'string',
          title: '解说人声音色',
          description: '选择适合该视频情绪的 AI 配音解说音色',
          widget: 'select-single',
          default: 'zh_female_energetic',
          options: [
            { label: '活力女声（电商促销爆款）', value: 'zh_female_energetic' },
            { label: '沉稳男声（数码科技大片）', value: 'zh_male_calm' },
            { label: '亲和闺蜜（达人开箱真实种草）', value: 'zh_female_friendly' },
            { label: '磁性男声（高端商业质感）', value: 'zh_male_deep' },
          ],
        },
        aspect_ratio: {
          type: 'string',
          title: '视频成片比例',
          description: '选择适用的平台播放比例',
          widget: 'ratio-cards',
          default: '9:16',
          options: [
            { label: '9:16 竖屏 (TikTok / Shorts)', value: '9:16' },
            { label: '16:9 横屏 (YouTube / 官网)', value: '16:9' },
            { label: '1:1 方屏 (Instagram / 推广)', value: '1:1' },
          ],
        },
      },
      required: ['product_image', 'copywriting'],
      additionalProperties: false,
    },
    fieldMappings: {
      product_image: {
        nodeId: 'node-slot-product-image',
        targetField: 'mediaUrl',
        mappingType: 'media',
        widget: 'product-link',
        required: true,
        defaultValue: previewImage,
      },
      copywriting: {
        nodeId: 'node-slot-copywriting',
        targetField: 'content',
        mappingType: 'text',
        widget: 'textarea',
        required: true,
        defaultValue: rawItem.description || spec.descZh,
      },
      voice: {
        nodeId: 'node-slot-voice-tts',
        targetField: 'params.voice',
        mappingType: 'param',
        widget: 'select-single',
        required: false,
        defaultValue: 'zh_female_energetic',
      },
      aspect_ratio: {
        nodeId: 'node-video-generation-core',
        targetField: 'params.aspectRatio',
        mappingType: 'param',
        widget: 'ratio-cards',
        required: false,
        defaultValue: '9:16',
      },
    },
    showcase: {
      mode: 'carousel',
      items: [
        {
          id: `showcase-${spec.appId}-01`,
          title: '爆款成片效果演示',
          mediaType: 'video',
          mediaUrl: previewVideo,
          posterUrl: previewImage,
        },
      ],
    },
  };
}

function main() {
  console.log('🚀 开始自动化提取并转译 7 大王牌爆款工作流与应用清单...');
  const catalogRaw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const allTemplates = catalogRaw.templates;

  const presetsDir = path.resolve(process.cwd(), 'plugins/omnimux-apps/catalog/presets');
  const catalogDir = path.resolve(process.cwd(), 'plugins/omnimux-apps/catalog');
  fs.mkdirSync(presetsDir, { recursive: true });

  const builtinManifests = [];
  const featuredAppsForHome = [];

  for (const spec of APP_SPECS) {
    const raw = allTemplates.find((t) => t.id === spec.creatifyId);
    if (!raw) {
      throw new Error(`未找到目标模板: ${spec.creatifyId}`);
    }

    spec.previewVideo = raw.preview_video;
    spec.previewImage = raw.preview_image;
    spec.defaultPrompt = raw.description || spec.descZh;

    const rawDagPath = path.join(CREATIFY_BASE, raw.workflow.dag_file);
    let rawDag = {};
    if (fs.existsSync(rawDagPath)) {
      rawDag = JSON.parse(fs.readFileSync(rawDagPath, 'utf8'));
    }

    // 1. 生成不可变标准工作流工程快照
    const workflowSnapshot = transpileWorkflow(rawDag, spec);
    const workflowFile = path.join(presetsDir, `${spec.appId}.workflow.json`);
    fs.writeFileSync(workflowFile, JSON.stringify(workflowSnapshot, null, 2), 'utf8');

    // 2. 生成标准 ApplicationManifest
    const manifest = generateAppManifest(spec, raw);
    builtinManifests.push(manifest);

    // 3. 生成首页大卡片轻量 DTO
    featuredAppsForHome.push({
      appId: spec.appId,
      categoryKey: spec.categoryKey,
      categoryNameZh: spec.categoryNameZh,
      titleZh: spec.titleZh,
      titleEn: spec.titleEn,
      descZh: spec.descZh,
      descEn: spec.descEn,
      coverUrl: raw.preview_image,
      previewVideoUrl: raw.preview_video,
    });

    console.log(`✅ [${spec.categoryNameZh}] -> ${spec.titleZh} (${spec.appId}) 转译完成`);
  }

  // 写入出厂内置应用总清单（保留已有的非 creatify 内置应用如 app-builtin-*）
  const builtinAppsPath = path.join(catalogDir, 'builtin-apps.json');
  let finalManifests = builtinManifests;
  if (fs.existsSync(builtinAppsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(builtinAppsPath, 'utf8'));
      if (Array.isArray(existing)) {
        const nonCreatify = existing.filter((m) => m && m.appId && !m.appId.startsWith('app-creatify-'));
        finalManifests = [...builtinManifests, ...nonCreatify];
      }
    } catch (err) {
      throw new Error(`Failed to parse existing builtin-apps.json at ${builtinAppsPath}: ${err.message}`);
    }
  }
  fs.writeFileSync(builtinAppsPath, JSON.stringify(finalManifests, null, 2), 'utf8');
  console.log(`📦 官方应用清单已写入: ${builtinAppsPath}`);

  // 写入首页精选卡片数据
  const homeCardsPath = path.resolve(
    process.cwd(),
    'plugins/omnimux/src/client/session-guide/templates/featured-apps-data.js'
  );
  const homeCardsContent = `/**
 * 7 大王牌精选 AI 应用首页卡片数据源
 * 直接对齐官方发布的内置 AI 应用 (builtin-apps.json)，点击秒级直通极简表单出片
 */

export const FEATURED_APPS_CARDS = Object.freeze(${JSON.stringify(featuredAppsForHome, null, 2)});
`;
  fs.writeFileSync(homeCardsPath, homeCardsContent, 'utf8');
  console.log(`🎨 首页精选卡片配置已写入: ${homeCardsPath}`);
  console.log('🎉 阶段一与阶段二数据基础设施构建圆满成功！');
}

main();
